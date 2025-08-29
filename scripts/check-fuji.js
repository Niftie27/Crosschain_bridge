require("dotenv").config({ override: true });
const { ethers } = require("hardhat");

async function main() {
  // Resolve aUSDC on Fuji via the Axelar Gateway
  const gw = await ethers.getContractAt(
    ["function tokenAddresses(string) view returns (address)"],
    process.env.FUJI_GATEWAY
  );
  const token = await gw.tokenAddresses("aUSDC");

  // Balances
  const erc20 = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    token
  );
  const [bal, dec] = await Promise.all([
    erc20.balanceOf(process.env.RECIPIENT),
    erc20.decimals(),
  ]);

  console.log("Fuji aUSDC token:", token);
  console.log("Recipient balance:", ethers.utils.formatUnits(bal, dec), "aUSDC");

  // Recent Received events (chunked to satisfy RPC 500-block limit)
  const receiver = await ethers.getContractAt(
    ["event Received(address indexed recipient,uint256 amount,string sourceChain)"],
    process.env.FUJI_RECEIVER_ADDR
  );
  const latest = await ethers.provider.getBlockNumber();
  const lookback = 5000, step = 500;
  let events = [];
  for (let from = Math.max(0, latest - lookback); from <= latest; from += step) {
    const to = Math.min(from + step - 1, latest);
    const part = await receiver.queryFilter(receiver.filters.Received(process.env.RECIPIENT), from, to);
    events.push(...part);
  }
  if (events.length === 0) {
    console.log("No recent Received events for recipient in last", lookback, "blocks.");
  } else {
    console.log("Recent Received events:");
    for (const l of events) {
      console.log({
        amount: ethers.utils.formatUnits(l.args.amount, 6),
        sourceChain: l.args.sourceChain,
        tx: l.transactionHash,
        block: l.blockNumber,
      });
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
