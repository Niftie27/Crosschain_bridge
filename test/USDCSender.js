const { expect } = require('chai');
const { ethers } = require('hardhat');

const eth  = (n) => ethers.utils.parseEther(n.toString());     // 18 dp
const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);  // 6 dp

describe("USDCSender (unit, mocks)", () => {
  let accounts, deployer, user
  let mockAUSDC, mockGateway, mockGasService, sender

  beforeEach(async () => {
    accounts = await ethers.getSigners()
    deployer = accounts[0]
    user = accounts[1]

    // Deploy mocks
    const MockAUSDC = await ethers.getContractFactory("MockAUSDC")
    mockAUSDC = await MockAUSDC.deploy()
    await mockAUSDC.deployed()

    const MockGateway = await ethers.getContractFactory("MockGateway")
    mockGateway = await MockGateway.deploy()
    await mockGateway.deployed()

    const MockGasService = await ethers.getContractFactory("MockGasService")
    mockGasService = await MockGasService.deploy()
    await mockGasService.deployed()

    // Deploy sender (needs real addresses)
    const USDCSender = await ethers.getContractFactory("USDCSender")
    sender = await USDCSender.deploy(
      mockGateway.address,
      mockGasService.address,
      mockAUSDC.address
    );
    await sender.deployed()

    //////////////////////////////////////////////
    // BALANCES
    //

    // mint balances (mock token)
    await mockAUSDC.mint(deployer.address, usdc(1_000_000))   // 1,000,000 aUSDC
    await mockAUSDC.mint(user.address, usdc(1_000_000))

    // deployer sends HALF to user
    await mockAUSDC.connect(deployer).transfer(user.address, usdc(500_000)) // half

    // User approves sender to pull HALF
    await mockAUSDC.connect(user).approve(sender.address, usdc(500_000))
  })

  it("pulls aUSDC, pays gas, and calls gateway with payload", async () => {
    const amount    = usdc(1_000)
    const destChain = "Avalanche" // Fuji’s Axelar name
    const destAddr  = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" // string form
    const recipient = user.address

    const tx = await sender.connect(user).bridge(
      destChain, destAddr, recipient, amount, { value: eth(0.01) }
    )
    await tx.wait()

    // aUSDC pulled into sender
    expect(await mockAUSDC.balanceOf(sender.address)).to.equal(amount)

    // allowance to gateway == amount
    expect(await mockAUSDC.allowance(sender.address, mockGateway.address)).to.equal(amount)

    // gas service saw correct args (recorded args)
    const gs = await mockGasService.last()
    expect(gs.destChain).to.equal(destChain)
    expect(gs.destAddr.toLowerCase()).to.equal(destAddr.toLowerCase());
    expect(gs.symbol).to.equal("aUSDC")
    expect(gs.amount).to.equal(amount)
    expect(gs.value).to.equal(eth(0.01));

    // gateway recorded call + payload decodes to recipient
    const g = await mockGateway.lastCall()
    expect(g.destChain).to.equal(destChain)
    expect(g.destAddr.toLowerCase()).to.equal(destAddr.toLowerCase())
    expect(g.symbol).to.equal("aUSDC")
    expect(g.amount).to.equal(amount)

    const [decodedRecipient] = ethers.utils.defaultAbiCoder.decode(["address"], g.payload);
    expect(decodedRecipient).to.equal(recipient);
  });

    it("reverts if amount = 0", async () => {
    await expect(
      sender.connect(user).bridge(
        "Avalanche",
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        user.address,
        0,
        { value: eth(0.01) }
      )
    ).to.be.revertedWith("amount=0");
  });

  it("reverts if destContract is empty", async () => {
    await expect(
      sender.connect(user).bridge(
        "Avalanche",
        "", // empty
        user.address,
        usdc(1),
        { value: eth(0.01) }
      )
    ).to.be.revertedWith("destContract required");
  });

  it("emits Bridging with correct args", async () => {
    const amount    = usdc(1);
    const destChain = "Avalanche";
    const destAddr  = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

    await mockAUSDC.connect(user).approve(sender.address, amount);

    await expect(
      sender.connect(user).bridge(destChain, destAddr, user.address, amount, { value: eth(0.01) })
    )
      .to.emit(sender, "Bridging")
      .withArgs(user.address, user.address, amount, destChain, destAddr);
  });
});

