const { ethers } = require("hardhat");
require("dotenv").config({ override: true }); // make sure .env wins

async function main() {
  const GATEWAY_FUJI = process.env.FUJI_GATEWAY;
  const SRC_CHAIN    = "ethereum-sepolia"; // <- space, not hyphen
  const SRC_ADDR     = process.env.SEPOLIA_SENDER_ADDR.toLowerCase(); // <- checksum, no toLowerCase

  console.log("Deploying USDCReceiver with:", { GATEWAY_FUJI, SRC_CHAIN, SRC_ADDR });

  const USDCReceiver = await ethers.getContractFactory("USDCReceiver");
  const receiver = await USDCReceiver.deploy(GATEWAY_FUJI, SRC_CHAIN, SRC_ADDR);
  await receiver.deployed();

  console.log("USDCReceiver (Fuji):", receiver.address);
  console.log("Deploy tx:", receiver.deployTransaction.hash);
  console.log(`IMPORTANT: Update FUJI_RECEIVER_ADDR in .env with: ${receiver.address}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
