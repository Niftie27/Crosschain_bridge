// [NEW FILE] scripts/check-sepolia.js
require("dotenv").config({ override: true });
const { ethers } = require("hardhat");

async function main() {
  const me = (await ethers.getSigners())[0].address;
  const usdc = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)",
     "function allowance(address,address) view returns (uint256)",
     "function decimals() view returns (uint8)"],
    process.env.SEPOLIA_AUSDC
  );
  const [bal, dec, allowance] = await Promise.all([
    usdc.balanceOf(me),
    usdc.decimals(),
    usdc.allowance(me, process.env.SEPOLIA_SENDER_ADDR),
  ]);
  console.log("Sepolia aUSDC balance:", ethers.utils.formatUnits(bal, dec));
  console.log("Allowance to sender:", ethers.utils.formatUnits(allowance, dec));
}
main().catch(e => { console.error(e); process.exit(1); });
