const { expect } = require('chai');
const { ethers } = require('hardhat');
require("dotenv").config();

const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);

describe('USDCReceiver', () => {
  let accounts, deployer, user
  let mockAUSDC, mockGateway, receiver
  let expectedSourceChain;
  let expectedSourceAddr;

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

    // map symbol -> token address on this (dest) chain
    await mockGateway.setTokenAddress("aUSDC", mockAUSDC.address)

    // set expected source (assign BEFORE using)
    expectedSourceChain = "Ethereum Sepolia";
    // use your real sender addr from .env (or a fixed dummy)
    expectedSourceAddr  = (process.env.SEPOLIA_SENDER_ADDR || "0x1111111111111111111111111111111111111111").toLowerCase();

    // deploy receiver (with gateway + expected source strings)
    receiver = await (await ethers.getContractFactory("USDCReceiver")).deploy(
      mockGateway.address,
      expectedSourceChain,
      expectedSourceAddr
    );
    await receiver.deployed();

    // pre-fund receiver (simulate Axelar depositing tokens before calling)
    await mockAUSDC.mint(receiver.address, usdc(1_000))
  })

  it("accepts from expected source and transfers aUSDC to recipient", async () => {
    const recipient = user.address;
    const amount = usdc(1_000);

    // payload encodes recipient
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient])
    
    // simulate Axelar delivery
    const cmdId = ethers.utils.formatBytes32String("cmd1")
    await mockGateway.mockExecuteWithToken(
      receiver.address,
      cmdId,
      expectedSourceChain,     // must match constructor
      expectedSourceAddr,      // must match constructor
      payload,
      "aUSDC",
      amount
    );

    expect(await mockAUSDC.balanceOf(recipient)).to.equal(amount)
  });

  it("reverts on wrong token symbol", async () => {
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [user.address])
    const cmdId   = ethers.utils.formatBytes32String("cmd_bad")


    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        payload,
        "NOTUSDC",
        usdc(1)
      )
    ).to.be.revertedWith("wrong token")

  })

})
