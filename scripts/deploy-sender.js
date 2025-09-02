const { ethers } = require("hardhat");

async function main() {
  const GATEWAY_SEPOLIA   = process.env.SEPOLIA_GATEWAY;        // Axelar Gateway (Sepolia)
  const GAS_SERVICE       = process.env.SEPOLIA_GAS_SERVICE;    // Axelar Gas Service (Sepolia)
  const A_USDC_SEPOLIA    = process.env.SEPOLIA_AUSDC;          // aUSDC on Sepolia

  const USDCSender = await ethers.getContractFactory("USDCSender");
  const sender = await USDCSender.deploy(GATEWAY_SEPOLIA, GAS_SERVICE, A_USDC_SEPOLIA);
  await sender.deployed();
  console.log("USDCSender (Sepolia):", sender.address);
}

main().catch((e) => { console.error(e); process.exit(1); });
