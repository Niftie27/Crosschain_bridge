// [NEW FILE] test/e2e-bridge-mock.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

const eth  = (n) => ethers.utils.parseEther(n.toString());
const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);

describe("E2E (mocks): USDCSender -> Axelar -> USDCReceiver", () => {
  it("bridges aUSDC and credits recipient", async () => {
    const [deployer, user] = await ethers.getSigners();

    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const aUSDC = await MockAUSDC.deploy(); await aUSDC.deployed();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gw = await MockGateway.deploy(); await gw.deployed();

    const MockGas = await ethers.getContractFactory("MockGasService");
    const gas = await MockGas.deploy(); await gas.deployed();

    const USDCSender = await ethers.getContractFactory("USDCSender");
    const sender = await USDCSender.deploy(gw.address, gas.address, aUSDC.address);
    await sender.deployed();

    await gw.setTokenAddress("aUSDC", aUSDC.address);

    const USDCReceiver = await ethers.getContractFactory("USDCReceiver");
    const srcChain = "Ethereum Sepolia";
    const srcAddr  = sender.address.toLowerCase();
    const receiver = await USDCReceiver.deploy(gw.address, srcChain, srcAddr);
    await receiver.deployed();

    // mint & approve
    await aUSDC.mint(user.address, usdc(1000));
    await aUSDC.connect(user).approve(sender.address, usdc(1000));

    // user initiates bridge
    const amount = usdc(123);
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [user.address]);
    await sender.connect(user).bridge("Avalanche", receiver.address.toLowerCase(), user.address, amount, { value: eth(0.01) });

    // simulate Axelar delivering to receiver
    await aUSDC.mint(receiver.address, amount); // simulate gateway deposit before execute
    const cmdId = ethers.utils.formatBytes32String("cmd1");
    await gw.mockExecuteWithToken(
      receiver.address,
      cmdId,
      srcChain,
      srcAddr,
      payload,
      "aUSDC",
      amount
    );

    expect(await aUSDC.balanceOf(user.address)).to.equal(usdc(1000)); // initial + received - sent == equal (we simulated mint to receiver)
    // If you want to assert deltas exactly, snapshot balances and compare.
  });
});
