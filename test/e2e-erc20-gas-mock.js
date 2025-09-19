const { expect } = require("chai");
const { ethers } = require("hardhat");

const eth  = (n) => ethers.utils.parseEther(n.toString());
const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);
const abi  = () => ethers.utils.defaultAbiCoder;

describe("E2E (mocks): ERC-20 gas prepay", () => {
  let deployer, user, alice;
  let aUSDC, gw, gasV2, sender, receiver;

  beforeEach(async () => {
    [deployer, user, alice] = await ethers.getSigners();

    const MockAUSDC  = await ethers.getContractFactory("MockAUSDC");
    const MockGateway= await ethers.getContractFactory("MockGateway");
    const GasV2      = await ethers.getContractFactory("MockGasServiceV2");
    const Sender     = await ethers.getContractFactory("USDCSender");
    const Receiver   = await ethers.getContractFactory("USDCReceiver");

    aUSDC = await MockAUSDC.deploy(); await aUSDC.deployed();
    gw    = await MockGateway.deploy(); await gw.deployed();
    gasV2 = await GasV2.deploy();       await gasV2.deployed();

    sender = await Sender.deploy(gw.address, gasV2.address, aUSDC.address);
    await sender.deployed();

    // Receiver expects lowercased sender + hyphenated chain
    receiver = await Receiver.deploy(
      gw.address,
      "ethereum-sepolia",
      sender.address.toLowerCase()
    );
    await receiver.deployed();

    await gw.setTokenAddress("aUSDC", aUSDC.address);

    // fund + approve user
    await aUSDC.mint(user.address, usdc(1_000_000));
    await aUSDC.connect(user).approve(sender.address, usdc(1_000_000));
  });

  it("bridges with ERC-20 gas and delivers to recipient", async () => {
    const amount = usdc(123);
    const gasFee = usdc(5);
    const dest   = receiver.address.toLowerCase();

    // call ERC-20 gas path (no msg.value)
    await sender.connect(user).bridgeWithERC20Gas(
      "Avalanche",
      dest,
      alice.address,
      amount,
      gasFee,
      user.address
    );

    // gas payment record (ERC-20)
    const erc = await gasV2.lastERC20();
    expect(erc.destChain).to.equal("Avalanche");
    expect(erc.symbol).to.equal("aUSDC");
    expect(erc.amount).to.equal(amount);
    expect(erc.gasToken).to.equal(aUSDC.address);
    expect(erc.gasFeeInToken).to.equal(gasFee);
    expect(erc.refund).to.equal(user.address);

    // gateway call
    const g = await gw.lastCall();
    expect(g.destAddr.toLowerCase()).to.equal(dest);
    expect(g.amount).to.equal(amount);
    const [decoded] = abi().decode(["address"], g.payload);
    expect(decoded).to.equal(alice.address);

    // simulate Axelar mint + delivery
    await aUSDC.mint(receiver.address, amount);
    await gw.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("cmd-erc20"),
      "ethereum-sepolia",
      sender.address.toLowerCase(),
      abi().encode(["address"], [alice.address]),
      "aUSDC",
      amount
    );

    expect(await aUSDC.balanceOf(alice.address)).to.equal(amount);
  });

  it("rejects msg.value on ERC-20 gas path (non-payable)", async () => {
    const amount = usdc(10);
    const gasFee = usdc(2);
    await sender.connect(user).bridgeWithERC20Gas(
      "Avalanche",
      receiver.address.toLowerCase(),
      alice.address,
      amount,
      gasFee,
      user.address
    );

    let threw = false;
    try {
      await sender.connect(user).bridgeWithERC20Gas(
        "Avalanche",
        receiver.address.toLowerCase(),
        alice.address,
        amount,
        gasFee,
        user.address,
        { value: eth(0.001) } // not allowed
      );
    } catch (e) {
      threw = true;
      expect(String(e.message)).to.match(/non-payable method/i);
    }
    expect(threw).to.equal(true);
  });
});
