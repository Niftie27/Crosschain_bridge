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

  // ===== PRE-FLIGHT GUARDS (optional but recommended) =====
  // ✅ START PRE-FLIGHT
  if (!process.env.FUJI_RPC_URL) throw new Error("Missing FUJI_RPC_URL in .env");      // ✅
  if (!ethers.utils.isAddress(senderAddr))   throw new Error("SEPOLIA_SENDER_ADDR invalid."); // ✅
  if (!ethers.utils.isAddress(aUSDCAddr))    throw new Error("SEPOLIA_AUSDC invalid.");      // ✅
  if (!ethers.utils.isAddress(destContract)) throw new Error("FUJI_RECEIVER_ADDR invalid."); // ✅
  if (!ethers.utils.isAddress(recipient))    throw new Error("RECIPIENT invalid.");         // ✅

  const me = (await ethers.getSigners())[0].address;
  const bal = await usdc.balanceOf(me);
  if (bal.lt(amount)) {
    throw new Error(`Insufficient aUSDC: have ${ethers.utils.formatUnits(bal, 6)}, need ${ethers.utils.formatUnits(amount, 6)}`); // ✅
  }

  const fuji = new ethers.providers.JsonRpcProvider(process.env.FUJI_RPC_URL);
  const code = await fuji.getCode(destContract);
  if (code === "0x") throw new Error("FUJI_RECEIVER_ADDR is not a deployed contract on Fuji."); // ✅

  // ONLY if your receiver keeps checks (this file assumes you do). Remove this block if you switch to minimal receiver.
  try {                                                                                           // ✅
    const rx = new ethers.Contract(                                                               // ✅
      destContract,                                                                               // ✅
      [ "function expectedSourceChainHash() view returns (bytes32)",                              // ✅
        "function expectedSourceAddressHash() view returns (bytes32)" ],                          // ✅
      fuji                                                                                        // ✅
    );                                                                                            // ✅
    const [hChain, hSender] = await Promise.all([                                                 // ✅
      rx.expectedSourceChainHash(), rx.expectedSourceAddressHash()                                // ✅
    ]);                                                                                           // ✅
    const wantChain  = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Ethereum Sepolia"));      // ✅
    const wantSender = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(senderAddr.toLowerCase())); // ✅
    if (hChain !== wantChain || hSender !== wantSender) {                                         // ✅
      throw new Error("Receiver mismatch: redeploy with SRC_CHAIN='Ethereum Sepolia' and SRC_ADDR=lowercased sender."); // ✅
    }                                                                                             // ✅
  } catch (e) {                                                                                   // ✅
    if (!/expectedSourceChainHash/.test(String(e))) throw e;                                      // ✅
    throw new Error("destContract doesn't expose expectedSource*; not your USDCReceiver?");       // ✅
  }                                                                                               // ✅
  // ✅ END PRE-FLIGHT
  // ===== END PRE-FLIGHT =====


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
