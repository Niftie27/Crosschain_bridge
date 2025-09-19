require("dotenv").config();
const { ethers } = require("hardhat");

const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  // .env
  const {
    SEPOLIA_GATEWAY,
    SEPOLIA_GAS_SERVICE,
    SEPOLIA_AUSDC,
    FUJI_RECEIVER_ADDR,
    AMOUNT_USDC,
    GAS_FEE_AUSDC,
  } = process.env;

  // Attach to deployed contracts (sender is your deployed USDCSender on Sepolia)
  const senderAddr = process.env.SEPOLIA_SENDER_ADDR;
  if (!senderAddr) throw new Error("SEPOLIA_SENDER_ADDR missing in .env");

  const USDCSender = await ethers.getContractFactory("USDCSender");
  const sender = USDCSender.attach(senderAddr);

  const amount  = usdc(Number(AMOUNT_USDC || "2"));
  const gasFee  = usdc(Number(GAS_FEE_AUSDC || "20"));
  const dest    = (FUJI_RECEIVER_ADDR || "").toLowerCase();

  if (!SEPOLIA_GATEWAY || !SEPOLIA_GAS_SERVICE || !SEPOLIA_AUSDC) {
    throw new Error("Axelar Sepolia addresses missing in .env");
  }
  if (!dest) throw new Error("FUJI_RECEIVER_ADDR missing in .env");

  // Approve the sender to pull (amount + gasFee) of aUSDC (with reset fallback)
  const erc20 = await ethers.getContractAt("IERC20", SEPOLIA_AUSDC);
  const need  = amount.add(gasFee);
  const allowance = await erc20.allowance(signer.address, sender.address);

  if (allowance.lt(need)) {
    console.log("Approving sender for", need.toString());
    try {
      const tx = await erc20.approve(sender.address, need);
      console.log("approve tx:", tx.hash);
      await tx.wait();
    } catch (e) {
      console.log("approve failed; retrying approve(0) then approve(need)...");
      const tx0 = await erc20.approve(sender.address, 0);
      console.log("approve(0) tx:", tx0.hash);
      await tx0.wait();

      const tx1 = await erc20.approve(sender.address, need);
      console.log("approve(need) tx:", tx1.hash);
      await tx1.wait();
    }
  } else {
    console.log("Allowance sufficient; skipping approve.");
  }

  console.log("Bridging (ERC-20 gas)...");
  const tx = await sender.bridgeWithERC20Gas(
    "Avalanche",           // Axelar chain name for Fuji (source string)
    dest,                  // receiver contract on Fuji, as string "0x..."
    signer.address,        // recipient on Fuji
    amount,                // aUSDC amount
    gasFee,                // aUSDC gas prepay
    signer.address         // refund address (if any ERC-20 gas is unused)
    // NO msg.value here!
  );
  console.log("Sepolia tx:", tx.hash);
  console.log("Axelarscan (source): https://axelarscan.io/gmp/" + tx.hash);

  console.log("Done. Wait for GMP to confirm → Approve → Execute on Fuji.\nCheck Fuji balances or listen for Received(recipient, amount, sourceChain).");
}

main().catch((e) => { console.error(e); process.exit(1); });
