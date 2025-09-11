// scripts/check-fuji.js
// Checks aUSDC on Fuji: token address via Axelar Gateway, balances, and USDCReceiver events.
const { ethers } = require("hardhat");
require("dotenv").config();

// Defaults to Fuji testnet gateway if .env missing
const GATEWAY_FUJI = process.env.FUJI_GATEWAY || "0xC249632c2D40b9001FE907806902f63038B737Ab";

// Minimal ABIs
const GATEWAY_ABI = [
  "function tokenAddresses(string symbol) view returns (address)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const RECEIVER_ABI = [
  "function expectedSourceChainHash() view returns (bytes32)",
  "function expectedSourceAddressHash() view returns (bytes32)",
  "event Received(address indexed recipient, uint256 amount, string sourceChain)"
];

async function main() {
  const cfg = require("../src/config.json");
  const fuji = cfg["43113"] || {};
  const sepolia = cfg["11155111"] || {};

  if (!fuji.receiverFuji) throw new Error("Missing receiverFuji in src/config.json");
  if (!fuji.fujiRpcUrl) console.warn("Note: fujiRpcUrl missing in config.json (not required when running via --network fuji).");

  const [signer] = await ethers.getSigners();
  const recipient = process.env.RECIPIENT || sepolia.recipient || signer.address;

  // Resolve aUSDC token on Fuji via Axelar Gateway
  const gw = await ethers.getContractAt(GATEWAY_ABI, GATEWAY_FUJI);
  let token = await gw.tokenAddresses("aUSDC");
  if (token === ethers.constants.AddressZero) {
    // Some envs expose as "axlUSDC"
    token = await gw.tokenAddresses("axlUSDC");
  }
  if (token === ethers.constants.AddressZero) {
    throw new Error("Axelar gateway did not return a token address for aUSDC/axlUSDC.");
  }
  console.log("Fuji aUSDC token:", token);

  // Balances
  const erc20 = await ethers.getContractAt(ERC20_ABI, token);
  const [balRecipient, balReceiver, dec, sym] = await Promise.all([
    erc20.balanceOf(recipient),
    erc20.balanceOf(fuji.receiverFuji),
    erc20.decimals(),
    erc20.symbol().catch(() => "aUSDC"),
  ]);
  console.log(`Recipient (${recipient}) balance: ${ethers.utils.formatUnits(balRecipient, dec)} ${sym}`);
  console.log(`Receiver  (${fuji.receiverFuji}) balance: ${ethers.utils.formatUnits(balReceiver, dec)} ${sym}`);

  // Verify receiver trust config (optional but useful)
  try {
    const receiver = await ethers.getContractAt(RECEIVER_ABI, fuji.receiverFuji);
    const [hChain, hSender] = await Promise.all([
      receiver.expectedSourceChainHash(),
      receiver.expectedSourceAddressHash(),
    ]);

    const chainStr = "Ethereum Sepolia"; // expected string used at deploy
    const senderAddrLower = (sepolia.senderSepolia || "").toLowerCase();

    const wantChainHash  = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(chainStr));
    const wantSenderHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(senderAddrLower));

    console.log("Trust check:", {
      chainOK:  hChain  === wantChainHash,
      senderOK: hSender === wantSenderHash,
    });
  } catch (e) {
    console.warn("Receiver trust fields not readable (expectedSource*). Skipping trust check.");
  }

  // Recent Received events for recipient (chunked to respect 500 block limit)
  const latest = await ethers.provider.getBlockNumber();
  const lookback = Number(process.env.LOOKBACK_BLOCKS || 5000);
  const step = 500;
  const fromStart = Math.max(0, latest - lookback);

  const receiver = await ethers.getContractAt(RECEIVER_ABI, fuji.receiverFuji);
  let events = [];
  for (let from = fromStart; from <= latest; from += step) {
    const to = Math.min(from + step - 1, latest);
    const part = await receiver.queryFilter(receiver.filters.Received(recipient), from, to);
    events.push(...part);
  }

  if (events.length === 0) {
    console.log(`No Received(recipient=${recipient}) events in last ${lookback} blocks.`);
  } else {
    console.log(`Received events (last ${lookback} blocks):`);
    for (const e of events) {
      console.log({
        tx: e.transactionHash,
        block: e.blockNumber,
        amount: ethers.utils.formatUnits(e.args.amount, 6),
        sourceChain: e.args.sourceChain,
      });
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
