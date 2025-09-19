require('dotenv').config({ override: true }); // ✅ ADDED: load .env
const filesystem = require('fs'); // ✅ ADDED: to write deployments file
const { ethers, network } = require('hardhat'); // ✅ CHANGED: import network for safety check

async function main() {
  const GATEWAY_SEPOLIA   = process.env.SEPOLIA_GATEWAY;        // Axelar Gateway (Sepolia)
  const GAS_SERVICE       = process.env.SEPOLIA_GAS_SERVICE;    // Axelar Gas Service (Sepolia)
  const A_USDC_SEPOLIA    = process.env.SEPOLIA_AUSDC;          // aUSDC on Sepolia

  const USDCSender = await ethers.getContractFactory("USDCSender");

  // Optional: EIP-1559 overrides if mempool is sluggish
  // const fee = await ethers.provider.getFeeData();
  // const overrides = { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas };

  console.log("Sending deploy tx...");
  const sender = await USDCSender.deploy(GATEWAY_SEPOLIA, GAS_SERVICE, A_USDC_SEPOLIA /*, overrides*/);

  console.log("USDCSender target address:", sender.address);      // <- shows right away
  console.log("Deploy tx hash:", sender.deployTransaction.hash);

  // Don’t wait indefinitely; just wait 1 confirmation, then print the address.
  await sender.deployTransaction.wait(1);

  console.log("Mined at:", sender.address);

  // ✅ ADDED: write deployments/sepolia.json (consumed by other scripts/UI)
  const out = {
    network: 'sepolia',
    gateway: GATEWAY_SEPOLIA,
    gasService: GAS_SERVICE,
    aUSDC: A_USDC_SEPOLIA,
    sender: sender.address,
  };
  filesystem.mkdirSync('deployments', { recursive: true });
  filesystem.writeFileSync('deployments/sepolia.json', JSON.stringify(out, null, 2));
  console.log('▶ wrote deployments/sepolia.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
