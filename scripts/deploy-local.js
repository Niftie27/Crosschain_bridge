// scripts/deploy-local.js
// ✅ Local-only: deploy mocks, then wire USDCSender/USDCReceiver to mocks.
// ✅ Writes deployments/local.json for your UI/interactions to read.

const fs = require('fs');
const { ethers } = require('hardhat');

async function main() {

  const MockAUSDC = await ethers.getContractFactory("MockAUSDC")  // ✅ mock aUSDC
  mockAUSDC = await MockAUSDC.deploy()
  await mockAUSDC.deployed()

  const MockGateway = await ethers.getContractFactory("MockGateway")  // ✅ mock Gateway
  mockGateway = await MockGateway.deploy()
  await mockGateway.deployed()

  const MockGasService = await ethers.getContractFactory("MockGasService")  // ✅ mock GasService
  mockGasService = await MockGasService.deploy()
  await mockGasService.deployed()

  // Let the mock gateway resolve "aUSDC" -> token address (receiver uses this)
  await mockGateway.setTokenAddress("aUSDC", mockAUSDC.address)

  // 2) Deploy sender (points to mocks) (needs real addresses)
    const USDCSender = await ethers.getContractFactory("USDCSender")
    sender = await USDCSender.deploy(
      mockGateway.address,
      mockGasService.address,
      mockAUSDC.address
    );
    await sender.deployed()

  // 3) Deploy your receiver (source = local sender address as origin; chain name is arbitrary in mocks)
  const USDCReceiver = await ethers.getContractFactory('USDCReceiver');
  const SRC_CHAIN = 'Ethereum-Sepolia';                  // ✅ same string you’ll use on testnet
  const SRC_ADDR  = sender.address.toLowerCase();        // ✅ store lowercased
  const receiver  = await USDCReceiver.deploy(
    mockGateway.address, // << was gateway.address (undefined) — fixed
    SRC_CHAIN,
    SRC_ADDR
  );
  await receiver.deployed();

  // 4) Save addresses for frontend/scripts
  const addresses = {
    network: 'local',
    mockGateway: mockGateway.address,           // 🟩 mock
    mockGasService: mockGasService.address,     // 🟩 mock
    mockAUSDC: mockAUSDC.address,               // 🟩 mock
    sender: sender.address,             // 🟦 my contract
    receiver: receiver.address          // 🟦 my contract
  };

  fs.mkdirSync('deployments', { recursive: true });
  fs.writeFileSync('deployments/local.json', JSON.stringify(addresses, null, 2));
  console.log('✅ Local deployed:\n', addresses);
}

main().catch((e) => { console.error(e); process.exit(1); });
