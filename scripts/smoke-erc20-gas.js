// scripts/smoke-erc20-gas.js
const { ethers } = require("hardhat");

const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);

async function main() {
  const [deployer, user, recipient] = await ethers.getSigners();

  const MockAUSDC  = await ethers.getContractFactory("MockAUSDC");
  const MockGateway= await ethers.getContractFactory("MockGateway");
  const GasAUSDC   = await ethers.getContractFactory("MockGasServiceAUSDC");
  const Sender     = await ethers.getContractFactory("USDCSender");
  const Receiver   = await ethers.getContractFactory("USDCReceiver");

  const aUSDC = await MockAUSDC.deploy(); await aUSDC.deployed();
  const gw    = await MockGateway.deploy(); await gw.deployed();
  const gas   = await GasAUSDC.deploy();   await gas.deployed();

  const sender = await Sender.deploy(gw.address, gas.address, aUSDC.address); await sender.deployed();
  const receiver = await Receiver.deploy(gw.address, "ethereum-sepolia", sender.address.toLowerCase()); await receiver.deployed();

  await gw.setTokenAddress("aUSDC", aUSDC.address);

  // fund user & approve sender
  await aUSDC.mint(user.address, usdc(10_000));
  await aUSDC.connect(user).approve(sender.address, usdc(10_000));

  const amount = usdc(123);
  const fee    = usdc(5);

  // --- before balances
  const b0 = {
    user:     await aUSDC.balanceOf(user.address),
    sender:   await aUSDC.balanceOf(sender.address),
    gas:      await aUSDC.balanceOf(gas.address),
    receiver: await aUSDC.balanceOf(receiver.address),
    recip:    await aUSDC.balanceOf(recipient.address),
  };

  // bridge with ERC-20 gas (no msg.value)
  await sender.connect(user).bridgeWithERC20Gas(
    "Avalanche",
    receiver.address.toLowerCase(),
    recipient.address,
    amount,
    fee,
    user.address
  );

  // gas mock should have pulled `fee` from sender (USDCSender)
  // and USDCSender should be holding `amount`
  const b1 = {
    user:     await aUSDC.balanceOf(user.address),
    sender:   await aUSDC.balanceOf(sender.address),
    gas:      await aUSDC.balanceOf(gas.address),
    receiver: await aUSDC.balanceOf(receiver.address),
    recip:    await aUSDC.balanceOf(recipient.address),
  };

  console.log("Δ after bridgeWithERC20Gas:",
    "user",  b0.user.sub(b1.user).toString(), // == amount+fee
    "sender", b1.sender.sub(b0.sender).toString(), // == amount
    "gas",    b1.gas.sub(b0.gas).toString(), // == fee
  );

  // simulate Axelar mint+delivery
  await aUSDC.mint(receiver.address, amount);
  await gw.mockExecuteWithToken(
    receiver.address,
    ethers.utils.formatBytes32String("erc20-gas"),
    "ethereum-sepolia",
    sender.address.toLowerCase(),
    ethers.utils.defaultAbiCoder.encode(["address"], [recipient.address]),
    "aUSDC",
    amount
  );

  const b2 = {
    user:     await aUSDC.balanceOf(user.address),
    sender:   await aUSDC.balanceOf(sender.address),
    gas:      await aUSDC.balanceOf(gas.address),
    receiver: await aUSDC.balanceOf(receiver.address),
    recip:    await aUSDC.balanceOf(recipient.address),
  };

  console.log("Final:",
    "sender",  b2.sender.toString(),      // typically still = amount (held) unless you also simulate gateway pull
    "gas",     b2.gas.toString(),         // == fee
    "receiver",b2.receiver.toString(),    // 0 after transfer to recip
    "recip",   b2.recip.toString(),       // +amount
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
