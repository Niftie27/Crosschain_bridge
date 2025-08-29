require("dotenv").config();
require("dotenv").config({ override: true });
const { ethers } = require("hardhat");

async function main() {
  const senderAddr   = process.env.SEPOLIA_SENDER_ADDR;   // USDCSender on Sepolia
  const aUSDCAddr    = process.env.SEPOLIA_AUSDC;         // aUSDC on Sepolia
  const destContract = process.env.FUJI_RECEIVER_ADDR;    // USDCReceiver on Fuji (as "0x..." string)
  const recipient    = process.env.RECIPIENT || (await ethers.getSigners())[0].address;

  const amount  = ethers.utils.parseUnits(process.env.AMOUNT_USDC || "10", 6);   // aUSDC (6 dp)
  const gasEth  = ethers.utils.parseEther(process.env.GAS_ETH || "0.01");        // native gas prepay

  console.log("Params:", {
    senderAddr,
    aUSDCAddr,
    destContract,
    recipient,
    amountUSDC: process.env.AMOUNT_USDC,
    gasEth: process.env.GAS_ETH,
  });

  const usdc   = await ethers.getContractAt("IERC20", aUSDCAddr);
  const sender = await ethers.getContractAt("USDCSender", senderAddr);

  // 1) approve USDCSender to pull your aUSDC
  console.log("Approving aUSDC...");
  await (await usdc.approve(sender.address, amount)).wait();

  // 2) bridge: Sepolia -> Fuji ("Avalanche" is the Axelar chain name for Fuji)
  console.log("Bridging...");

  // This is where we pinpointed the error (gas, or the way we bridging, destcontract string or string literal)
  
  const tx = await sender.bridge("Avalanche", destContract, recipient, amount, { value: gasEth });
  console.log("Bridge tx:", tx.hash);
}

main().catch((e) => { console.error(e); process.exit(1); });
