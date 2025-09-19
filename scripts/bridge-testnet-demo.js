require("dotenv").config({ override: true });
const filesystem = require('fs');  // ✅ ADDED
const { ethers , network } = require("hardhat");  // ✅ CHANGED (import network)

async function main() {
  // ---------- Load addresses (prefer deployments, then .env) ----------
  // ✅ ADDED: prefer deployments JSON; fallback to .env
  const hasSepolia  = filesystem.existsSync('deployments/sepolia.json');
  const hasFuji     = filesystem.existsSync('deployments/fuji.json');
  const depSepolia  = hasSepolia ? JSON.parse(filesystem.readFileSync('deployments/sepolia.json','utf8')) : {};
  const depFuji     = hasFuji    ? JSON.parse(filesystem.readFileSync('deployments/fuji.json','utf8')) : {};

  const senderAddr   = depSepolia.sender   || process.env.SEPOLIA_SENDER_ADDR;   // ✅ CHANGED, USDCSender on Sepolia
  const aUSDCAddr    = depSepolia.aUSDC    || process.env.SEPOLIA_AUSDC;          // ✅ CHANGED, aUSDC on Sepolia
  const destContract = depFuji.receiver    || process.env.FUJI_RECEIVER_ADDR;    // ✅ CHANGED, USDCReceiver on Fuji (as "0x..." string)

  const signer       = (await ethers.getSigners())[0];                               // ✅ explicit signer
  const recipient    = process.env.RECIPIENT || (await ethers.getSigners())[0].address;
  const DEST_CHAIN   = "Avalanche";                          // Axelar chain name for Fuji (testnet)

  // Amounts (minimal version)
  // const amount  = ethers.utils.parseUnits(process.env.AMOUNT_USDC || "10", 6);   // aUSDC (6 dp)
  // const gasEth  = ethers.utils.parseEther(process.env.GAS_ETH || "0.01");        // native gas prepay

  // Amounts (read decimals from token)
  const aUSDC  = await ethers.getContractAt('IERC20', aUSDCAddr);
  const decimals    = (await aUSDC.decimals?.().catch(() => 6)) || 6; // ✅ ADDED
  const amount = ethers.utils.parseUnits(process.env.AMOUNT_USDC || '0.25', decimals);  // ✅ auto decimals
  const gasEth = ethers.utils.parseEther(process.env.GAS_ETH || '0.03');           // ✅ native gas prepay, default 0.03

  console.log("Params:", {
    network: network.name,  // ✅ ADDED
    senderAddr,
    aUSDCAddr,
    destContract,
    recipient,
    amountUSDC: ethers.utils.formatUnits(amount, decimals),
    gasEth: ethers.utils.formatEther(gasEth)
  });

  // const usdc   = await ethers.getContractAt("IERC20", aUSDCAddr);
  // const sender = await ethers.getContractAt("USDCSender", senderAddr);

  // ---------- Pre-flight guards (optional but recommended) ----------
  // ✅ START PRE-FLIGHT
  // 0) Required env sanity
  if (network.name !== 'sepolia') throw new Error('Run this script with --network sepolia'); // ✅ ADDED
  if (!process.env.FUJI_RPC_URL) throw new Error("Missing FUJI_RPC_URL in .env");
  if (!ethers.utils.isAddress(senderAddr))   throw new Error("SEPOLIA_SENDER_ADDR invalid.");
  if (!ethers.utils.isAddress(aUSDCAddr))    throw new Error("SEPOLIA_AUSDC invalid.");
  if (!ethers.utils.isAddress(destContract)) throw new Error("FUJI_RECEIVER_ADDR invalid.");
  if (!ethers.utils.isAddress(recipient))    throw new Error("RECIPIENT invalid.");

  // Balance check on Sepolia (aUSDC), lt (less than)
  const balance = await aUSDC.balanceOf(signer.address);
  if (balance.lt(amount)) {
    throw new Error(
      `Insufficient aUSDC on Sepolia: have ${ethers.utils.formatUnits(bal, dec)}, ` +
      `need ${ethers.utils.formatUnits(amount, decimals)}`
    );
  }

  // Receiver exists on Fuji + guards match
  const fujiProvider = new ethers.providers.JsonRpcProvider(process.env.FUJI_RPC_URL);
  const code = await fujiProvider.getCode(destContract);
  if (code === '0x') throw new Error('FUJI_RECEIVER_ADDR is not a deployed contract on Fuji.');


  // ONLY if your receiver keeps checks (this file assumes you do).
  // Remove this block if you switch to minimal receiver.
  try {                                                                                           
    const receiverContract = new ethers.Contract(                                                               
      destContract,                                                                               
      [
        "function expectedSourceChainHash() view returns (bytes32)",                              
        "function expectedSourceAddressHash() view returns (bytes32)"
      ],                          
      fujiProvider                                                                                      
    );                                                                                            
    const [expectedSourceChainHashOnChain, expectedSourceAddressHashOnChain] = await Promise.all([                                                 
      receiverContract.expectedSourceChainHash(),
      receiverContract.expectedSourceAddressHash()                                
    ]);                                                                                           
    const srcChainInput = process.env.SRC_CHAIN || "Ethereum-Sepolia";
    const wantChainHash  = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(srcChainInput.toLowerCase()));
    const wantSenderHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(senderAddr.toLowerCase()));

    if (expectedSourceChainHashOnChain !== wantChainHash ||
      expectedSourceAddressHashOnChain !== wantSenderHash) {                                         
      throw new Error('Receiver mismatch: redeploy with SRC_CHAIN="Ethereum-Sepolia" and SRC_ADDR=lowercased sender.')
    }                                                                                             
  } catch (e) {                                                                                   
    if (!/expectedSourceChainHash/.test(String(e))) throw e;                                      
    throw new Error("destContract doesn't expose expectedSource*; not your USDCReceiver?");       
  }                                                                                               
  // ===== END PRE-FLIGHT =====


  // ---------- Approve (if needed) ----------
  // 1) approve USDCSender to pull your aUSDC
  const sender = await ethers.getContractAt('USDCSender', senderAddr); // ✅ kept (moved here)
  console.log("Approving aUSDC (if needed)...");

  const currentAllowance = await aUSDC.allowance(signer.address, sender.address);
  const neededAllowance  = amount;
  // const have  = await usdc.allowance(owner, sender.address);

  if (currentAllowance.gte(neededAllowance)) {
    console.log("Allowance sufficient, skipping approve.");
  } else {
    // ⚠️ Some USDC-like tokens require reset-to-zero before raising allowance
    try {
      const tx = await aUSDC.approve(sender.address, neededAllowance);
        console.log("approve tx:", tx.hash);
        await tx.wait();
      } catch {
        console.log('approve failed; trying reset-to-zero then approve…');
        const tx0 = await aUSDC.approve(sender.address, 0);
        console.log('approve(0) tx:', tx0.hash);
        await tx0.wait();
        const tx2 = await aUSDC.approve(sender.address, neededAllowance);
        console.log('approve->amount tx:', tx2.hash);
        await tx2.wait();
      }
    }

  // ---------- Bridge (native-gas prepay) ----------
  // 2) bridge: Sepolia -> Fuji
  console.log('Bridging…', {
    DEST_CHAIN,
    destContract,
    recipient,
    amount: ethers.utils.formatUnits(amount, decimals),
    gasEth: ethers.utils.formatEther(gasEth),
  });

  // This is where we pinpointed the error (gas, or the way we bridging, destcontract string or string literal)
  
  const tx = await sender.bridge(DEST_CHAIN, destContract, recipient, amount, { value: gasEth });
  const receipt = await tx.wait();
  console.log('Bridge tx:', tx.hash);
  console.log('Confirmed in block:', receipt.blockNumber);
  console.log('➡️  Track delivery on Axelarscan, then check aUSDC on Fuji.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
