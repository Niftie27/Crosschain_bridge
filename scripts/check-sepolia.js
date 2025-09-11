// scripts/check-sepolia.js
// Checks aUSDC on Sepolia: user balance, allowance to USDCSender, and Bridging events.
const { ethers } = require("hardhat");
require("dotenv").config();

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const SENDER_ABI = [
  "event Bridging(address indexed sender, address indexed recipient, uint256 amount, string destChain, string destContract)"
];

async function main() {
  const cfg = require("../src/config.json");
  const sepolia = cfg["11155111"] || {};
  const bridge = cfg["bridge"] || {};

  if (!sepolia.ausdcSepolia)  throw new Error("Missing ausdcSepolia in src/config.json");
  if (!sepolia.senderSepolia) throw new Error("Missing senderSepolia in src/config.json");

  const [signer] = await ethers.getSigners();
  const me = signer.address;

  // aUSDC balance + decimals/symbol
  const token = await ethers.getContractAt(ERC20_ABI, sepolia.ausdcSepolia);
  const [bal, dec, sym] = await Promise.all([
    token.balanceOf(me),
    token.decimals(),
    token.symbol().catch(() => "aUSDC"),
  ]);
  console.log(`Account: ${me}`);
  console.log(`aUSDC balance: ${ethers.utils.formatUnits(bal, dec)} ${sym}`);

  // Allowance to USDCSender (spender)
  const allowance = await token.allowance(me, sepolia.senderSepolia);
  console.log(`Allowance to USDCSender(${sepolia.senderSepolia}): ${ethers.utils.formatUnits(allowance, dec)} ${sym}`);

  // Bridging events you initiated recently (sender indexed = me)
  const sender = await ethers.getContractAt(SENDER_ABI, sepolia.senderSepolia);
  const latest = await ethers.provider.getBlockNumber();
  const lookback = Number(process.env.LOOKBACK_BLOCKS || 5000);
  const step = 500;
  const fromStart = Math.max(0, latest - lookback);

  let events = [];
  for (let from = fromStart; from <= latest; from += step) {
    const to = Math.min(from + step - 1, latest);
    const part = await sender.queryFilter(sender.filters.Bridging(me), from, to);
    events.push(...part);
  }

  if (events.length === 0) {
    console.log(`No Bridging(sender=${me}) events in last ${lookback} blocks.`);
  } else {
    console.log(`Bridging events (last ${lookback} blocks):`);
    for (const e of events) {
      const { recipient, amount, destChain, destContract } = e.args;
      console.log({
        tx: e.transactionHash,
        block: e.blockNumber,
        amount: ethers.utils.formatUnits(amount, 6),
        destChain,
        destContract,
        recipient,
      });
    }
  }

  // Optional: quick sanity that your configured destChain matches
  if (bridge.destChain) {
    const distinctDestChains = [...new Set(events.map(e => e.args.destChain))];
    if (distinctDestChains.length) {
      console.log("Dest chains seen in events:", distinctDestChains);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
