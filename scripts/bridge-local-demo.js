// scripts/bridge-local-run.js
const filesystem = require('fs');
const { ethers } = require('hardhat');

async function main() {
  // --- load & validate addresses
  const raw = filesystem.readFileSync('deployments/local.json', 'utf8');
  console.log('Loaded deployments/local.json:\n', raw);
  const d = JSON.parse(raw);
  ['mockAUSDC', 'mockGateway', 'sender', 'receiver'].forEach(k => {
    if (!d[k]) throw new Error(`deployments/local.json missing key: ${k}`);
  });

  const [me] = await ethers.getSigners();
  console.log('Using account:', me.address);

  // --- ABIs
  const ERC20_ABI = [
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
    'function transfer(address,uint256) returns (bool)',
    'function mint(address,uint256)'
  ];
  const SENDER_ABI = ['function bridge(string,string,address,uint256) payable'];
  const GATEWAY_ABI = [
    'function setTokenAddress(string,address)',
    'function mockExecuteWithToken(address,bytes32,string,string,bytes,string,uint256)'
  ];

  // --- connect contracts
  const ausdc   = new ethers.Contract(d.mockAUSDC,   ERC20_ABI,   me);
  const sender  = new ethers.Contract(d.sender,      SENDER_ABI,  me);
  const gateway = new ethers.Contract(d.mockGateway, GATEWAY_ABI, me);

  // --- config for this run
  const DEST_CHAIN  = 'Avalanche';         // must match your sender.bridge arg
  const SRC_CHAIN   = 'Ethereum-Sepolia';  // must match what receiver stored
  const SRC_ADDRESS = d.sender.toLowerCase();
  const RECIPIENT   = me.address;

  const dec   = (await ausdc.decimals().catch(() => 6)) || 6;
  const amt   = ethers.utils.parseUnits('0.25', dec);
  const value = ethers.utils.parseEther('0.01');

  // ensure gateway knows token mapping
  await (await gateway.setTokenAddress('aUSDC', d.mockAUSDC)).wait();

  // ensure we have aUSDC locally
  const balBefore = await ausdc.balanceOf(RECIPIENT);
  if (balBefore.lt(amt)) {
    try { await (await ausdc.mint(RECIPIENT, amt.mul(10))).wait(); }
    catch { console.log('No mint() on token; make sure deploy minted some.'); }
  }

  console.log('Approving sender...');
  await (await ausdc.approve(d.sender, amt)).wait();

  console.log('Calling sender.bridge(...)...');
  await (await sender.bridge(DEST_CHAIN, d.receiver, RECIPIENT, amt, { value })).wait();

  // ✅ ADDED: log receiver balance BEFORE delivery (to prove delivery effect)
  const recvBefore = await ausdc.balanceOf(d.receiver); // ✅ ADDED
  console.log('Receiver before:', ethers.utils.formatUnits(recvBefore, dec)); // ✅ ADDED

  // ✅ CHANGED: mint to receiver (mock Axelar mint-on-arrival) instead of taking from you
  console.log('Minting bridged amount to receiver (mock)…'); // ✅ ADDED
  try { // ✅ ADDED
    await (await ausdc.mint(d.receiver, amt)).wait(); // ✅ ADDED
  } catch { // ✅ ADDED
    console.log('No mint() on token; falling back to transfer from you.'); // ✅ ADDED
    await (await ausdc.transfer(d.receiver, amt)).wait(); // (fallback) ✅ ADDED
  } // ✅ ADDED

  // console.log('Prefunding receiver (mocked arrival mint)…');
  // await (await ausdc.transfer(d.receiver, amt)).wait();


  console.log('Mock delivering via gateway.mockExecuteWithToken…');
  const payload = ethers.utils.defaultAbiCoder.encode(['address'], [RECIPIENT]);
  await (await gateway.mockExecuteWithToken(
    d.receiver,
    ethers.constants.HashZero,
    SRC_CHAIN,
    SRC_ADDRESS,
    payload,
    'aUSDC',
    amt
  )).wait();

  // ✅ ADDED: log receiver AFTER to confirm it forwarded funds out
  const recvAfter = await ausdc.balanceOf(d.receiver); // ✅ ADDED
  console.log('Receiver after :', ethers.utils.formatUnits(recvAfter,  dec)); // ✅ ADDED

  const balAfter = await ausdc.balanceOf(RECIPIENT);
  console.log('Recipient before:', ethers.utils.formatUnits(balBefore, dec));
  console.log('Recipient after :', ethers.utils.formatUnits(balAfter,  dec));
  console.log('✅ Local mocked bridge complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
