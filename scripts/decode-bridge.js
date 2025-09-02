// [NEW FILE] scripts/decode-bridge.js
require("dotenv").config({ override: true });
const { ethers } = require("hardhat");

async function main() {
  const hash = process.argv[2];
  if (!hash) throw new Error("Usage: npx hardhat run scripts/decode-bridge.js --network sepolia <txhash>");
  const tx = await ethers.provider.getTransaction(hash);
  const iface = new ethers.utils.Interface(["function bridge(string,string,address,uint256)"]);
  const [destChain, destContract, recipient, amount] = iface.decodeFunctionData("bridge", tx.data);
  console.log({ destChain, destContract, recipient, amount: ethers.utils.formatUnits(amount, 6) });
}
main().catch(e => { console.error(e); process.exit(1); });
