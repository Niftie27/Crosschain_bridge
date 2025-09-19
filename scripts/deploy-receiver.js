require('dotenv').config({ override: true }); // make sure .env wins
const filesystem = require('fs');
const { ethers, network } = require('hardhat');

async function main() {
  const GATEWAY_FUJI = process.env.FUJI_GATEWAY;
  const SRC_CHAIN    = "Ethereum-Sepolia"; // <- hyphen, not space
  const SRC_ADDR     = process.env.SEPOLIA_SENDER_ADDR.toLowerCase(); // <- checksum, no toLowerCase

  console.log("Deploying USDCReceiver with:", { GATEWAY_FUJI, SRC_CHAIN, SRC_ADDR });

  const USDCReceiver = await ethers.getContractFactory("USDCReceiver");
  const receiver = await USDCReceiver.deploy(GATEWAY_FUJI, SRC_CHAIN, SRC_ADDR);
  await receiver.deployed();

  console.log("USDCReceiver (Fuji):", receiver.address);
  console.log("Deploy tx:", receiver.deployTransaction.hash);

  // ✅ ADDED: write deployments/fuji.json (consumed by other scripts/UI)
  const out = {
    network: 'fuji',
    gateway: GATEWAY_FUJI,
    receiver: receiver.address,
    trustedSender: SRC_ADDR,
    trustedSourceChain: SRC_CHAIN,
  };
  filesystem.mkdirSync('deployments', { recursive: true });
  filesystem.writeFileSync('deployments/fuji.json', JSON.stringify(out, null, 2));
  console.log('▶ wrote deployments/fuji.json');

  console.log(`IMPORTANT: Update FUJI_RECEIVER_ADDR in .env with: ${receiver.address}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
