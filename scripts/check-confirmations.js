// scripts/check-confirmations.js
// Usage:
//   npx hardhat run scripts/check-confirmations.js --network sepolia --tx 0xYOUR_TX_HASH
// Optional:
//   --threshold 100   # default 100 (Axelar confirm threshold on Sepolia)
//   --watch           # keep polling until threshold reached
require('dotenv').config({ override: true });
const { ethers, network } = require('hardhat');

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

async function main() {
  const transactionHash = getArg('--tx', process.env.TX_HASH);
  if (!transactionHash) throw new Error('Provide --tx 0xHASH or set TX_HASH in .env');

  const thresholdStr = getArg('--threshold', process.env.AXELAR_CONFIRMATIONS || '100');
  const threshold = parseInt(thresholdStr, 10) || 100;
  const watch = process.argv.includes('--watch');

  if (network.name !== 'sepolia') {
    console.warn(`[warn] You are on "${network.name}". This script is intended for --network sepolia.`);
  }

  const provider = ethers.provider;

  async function printStatus() {
    const latestBlockNumber = await provider.getBlockNumber();

    const receipt = await provider.getTransactionReceipt(transactionHash).catch(() => null);
    if (!receipt) {
      console.log(`tx: ${transactionHash}`);
      console.log(`status: pending (not mined yet)`);
      console.log(`latest block: ${latestBlockNumber}`);
      console.log(`confirmations: 0 / ${threshold}`);
      return { confirmations: 0, done: false };
    }

    const success = receipt.status === 1;
    const receiptBlockNumber = receipt.blockNumber;
    const confirmations = Math.max(0, latestBlockNumber - receiptBlockNumber + 1);
    const remaining = Math.max(0, threshold - confirmations);

    const block = await provider.getBlock(receiptBlockNumber).catch(() => null);
    const minedAt = block ? new Date(block.timestamp * 1000).toISOString() : 'unknown';

    console.log(`tx: ${transactionHash}`);
    console.log(`status: mined (${success ? 'success' : 'failed'})`);
    console.log(`mined at block: ${receiptBlockNumber} (${minedAt})`);
    console.log(`latest block: ${latestBlockNumber}`);
    console.log(`confirmations: ${confirmations} / ${threshold}${remaining > 0 ? `  (remaining: ${remaining})` : ''}`);

    return { confirmations, done: confirmations >= threshold };
  }

  const first = await printStatus();

  if (watch && !first.done) {
    const intervalMs = 12000; // ~Sepolia block time; adjust if needed
    const id = setInterval(async () => {
      const { done } = await printStatus().catch((e) => {
        console.error(e);
        return { done: true };
      });
      if (done) {
        clearInterval(id);
        process.exit(0);
      }
    }, intervalMs);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
