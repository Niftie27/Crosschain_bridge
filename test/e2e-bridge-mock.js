// [NEW FILE] test/e2e-bridge-mock.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

const eth  = (n) => ethers.utils.parseEther(n.toString());
const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);

describe("E2E (mocks): USDCSender -> Axelar -> USDCReceiver", () => {
  it("bridges aUSDC and credits recipient", async () => {
    const [deployer, user] = await ethers.getSigners();

    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const aUSDC = await MockAUSDC.deploy(); await aUSDC.deployed();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gw = await MockGateway.deploy(); await gw.deployed();

    const MockGas = await ethers.getContractFactory("MockGasService");
    const gas = await MockGas.deploy(); await gas.deployed();

    const USDCSender = await ethers.getContractFactory("USDCSender");
    const sender = await USDCSender.deploy(gw.address, gas.address, aUSDC.address);
    await sender.deployed();
    

    await gw.setTokenAddress("aUSDC", aUSDC.address);

    const USDCReceiver = await ethers.getContractFactory("USDCReceiver");
    const srcChain = "Ethereum-Sepolia";
    const srcAddr  = sender.address.toLowerCase();
    const receiver = await USDCReceiver.deploy(gw.address, srcChain, srcAddr);
    await receiver.deployed();

    // mint & approve
    await aUSDC.mint(user.address, usdc(1000));
    await aUSDC.connect(user).approve(sender.address, usdc(1000));

    // user initiates bridge
    const amount = usdc(123);
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [user.address]);
    await sender.connect(user).bridge("Avalanche", receiver.address.toLowerCase(), user.address, amount, { value: eth(0.01) });

    // simulate Axelar delivering to receiver
    await aUSDC.mint(receiver.address, amount); // simulate gateway deposit before execute
    const cmdId = ethers.utils.formatBytes32String("cmd1");
    await gw.mockExecuteWithToken(
      receiver.address,
      cmdId,
      srcChain,
      srcAddr,
      payload,
      "aUSDC",
      amount
    );

    expect(await aUSDC.balanceOf(user.address)).to.equal(usdc(1000)); // initial + received - sent == equal (we simulated mint to receiver)
    // If you want to assert deltas exactly, snapshot balances and compare.
  });

  describe("E2E (mocks): USDCSender -> Axelar -> USDCReceiver — appended", () => {
  const abi = () => ethers.utils.defaultAbiCoder;
  const ORIGIN_CHAIN = "Ethereum-Sepolia"; // keep the hyphen; constructor uses this exact string

  let accounts, deployer, user, alice, bob, carol;
  let aUSDC, gw, gas, sender, receiver;
  let cmdIdCounter;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    [deployer, user, alice, bob, carol] = accounts;

    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const MockGas = await ethers.getContractFactory("MockGasService");
    const USDCSender = await ethers.getContractFactory("USDCSender");
    const USDCReceiver = await ethers.getContractFactory("USDCReceiver");

    aUSDC = await MockAUSDC.deploy(); await aUSDC.deployed();
    gw    = await MockGateway.deploy(); await gw.deployed();
    gas   = await MockGas.deploy();     await gas.deployed();

    // sender on source
    sender = await USDCSender.deploy(gw.address, gas.address, aUSDC.address);
    await sender.deployed();

    // receiver on dest, expects chain + sender
    receiver = await USDCReceiver.deploy(
      gw.address,
      ORIGIN_CHAIN,
      sender.address.toLowerCase()
    );
    await receiver.deployed();

    // map symbol -> token (dest)
    await gw.setTokenAddress("aUSDC", aUSDC.address);

    // fund user on source and approve sender
    await aUSDC.mint(user.address, usdc(1_000_000));
    await aUSDC.connect(user).approve(sender.address, usdc(1_000_000));

    cmdIdCounter = 0;
  });

  const nextCmd = (tag="cmd") => ethers.utils.formatBytes32String(`${tag}-${++cmdIdCounter}`);

  async function bridgeFromSource({
    from = user,
    destChain = "Avalanche",
    destAddr = receiver.address.toLowerCase(),
    recipient = alice.address,
    amount = usdc(100),
    value = eth(0.01),
  } = {}) {
    const tx = await sender.connect(from).bridge(destChain, destAddr, recipient, amount, { value });
    await tx.wait();
    return tx;
  }

  async function deliverToDest({
    rcv = receiver,
    recipient = alice.address,
    amount = usdc(100),
    token = aUSDC,
    symbol = "aUSDC",
    sourceChain = ORIGIN_CHAIN,
    sourceAddr = sender.address.toLowerCase(),
    payload,
  } = {}) {
    const p = payload ?? abi().encode(["address"], [recipient]);
    if (amount.gt(0)) {
      await token.mint(rcv.address, amount); // simulate Axelar mint to receiver before execute
    }
    const cmd = nextCmd("deliver");
    return gw.mockExecuteWithToken(
      rcv.address, cmd, sourceChain, sourceAddr, p, symbol, amount
    );
  }

  // 1) basic happy path
  it("🧪 happy path: bridge 100 then deliver 100 to alice", async () => {
    const amt = usdc(100);
    await bridgeFromSource({ recipient: alice.address, amount: amt });
    await expect(deliverToDest({ recipient: alice.address, amount: amt }))
      .to.emit(receiver, "Received")
      .withArgs(alice.address, amt, ORIGIN_CHAIN);
    expect(await aUSDC.balanceOf(alice.address)).to.equal(amt);
  });

  // 2) gas service records refund=user & value
  it("🧪 gas service records refund=user and msg.value", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(7), value: eth(0.003) });
    const gs = await gas.last();
    expect(gs.refund).to.equal(user.address);
    expect(gs.value).to.equal(eth(0.003));
  });

  // 3) gateway records payload=recipient
  it("🧪 gateway payload decodes to the recipient", async () => {
    await bridgeFromSource({ recipient: bob.address, amount: usdc(9) });
    const g = await gw.lastCall();
    const [decoded] = abi().decode(["address"], g.payload);
    expect(decoded).to.equal(bob.address);
  });

  // 4) wrong sourceChain on delivery -> revert
  it("🧪 wrong sourceChain reverts on delivery", async () => {
    await bridgeFromSource({ amount: usdc(5) });
    await expect(deliverToDest({ amount: usdc(5), sourceChain: "Ethereum Mainnet" }))
      .to.be.revertedWith("bad sourceChain");
  });

  // 5) wrong sourceAddress on delivery -> revert
  it("🧪 wrong sourceAddress reverts on delivery", async () => {
    await bridgeFromSource({ amount: usdc(5) });
    await expect(deliverToDest({ amount: usdc(5), sourceAddr: deployer.address }))
      .to.be.revertedWith("unauthorized source");
  });

  // 6) wrong symbol -> revert
  it("🧪 wrong token symbol reverts on delivery", async () => {
    await bridgeFromSource({ amount: usdc(5) });
    await expect(deliverToDest({ amount: usdc(5), symbol: "NOTUSDC" }))
      .to.be.revertedWith("wrong token");
  });

  // 7) malformed payload -> revert
  it("🧪 malformed payload reverts on delivery", async () => {
    await bridgeFromSource({ amount: usdc(5) });
    await expect(deliverToDest({ amount: usdc(5), payload: "0x1234" }))
      .to.be.reverted;
  });

  // 🧪 bridging amount=0 reverts at sender (sender enforces amount>0)
  it("🧪 bridging amount=0 reverts at sender", async () => {
    await expect(
      sender.connect(user).bridge(
        "Avalanche",
        receiver.address.toLowerCase(),
        alice.address,
        usdc(0),
        { value: eth(0.001) }
      )
    ).to.be.revertedWith("amount=0");
  });

  // 🧪 direct delivery amount=0 emits Received; balances unchanged (fixed)
  it("🧪 direct delivery amount=0 emits Received; balances unchanged", async () => {
    const before = await aUSDC.balanceOf(alice.address);

    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [alice.address]);
    const tx = await gw.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("zero-amt"),
      "Ethereum-Sepolia",
      sender.address.toLowerCase(),
      payload,
      "aUSDC",
      usdc(0)
    );

    await expect(tx)
      .to.emit(receiver, "Received")
      .withArgs(alice.address, usdc(0), "Ethereum-Sepolia");

    const after = await aUSDC.balanceOf(alice.address);
    expect(after).to.equal(before);
  });

  // 9) recipient is zero -> revert (ERC20)
  it("🧪 zero recipient reverts on delivery", async () => {
    const zero = "0x0000000000000000000000000000000000000000";
    await bridgeFromSource({ recipient: zero, amount: usdc(3) });
    await expect(deliverToDest({ recipient: zero, amount: usdc(3) }))
      .to.be.reverted;
  });

  // 🧪 self-recipient on delivery => receiver balance increases by minted amount
  it("🧪 self-recipient on delivery => receiver balance increases by minted amount", async () => {
    const amt = usdc(11);
    const before = await aUSDC.balanceOf(receiver.address);
    await bridgeFromSource({ recipient: receiver.address, amount: amt });
    // deliverToDest mints 'amt' to receiver before execute; transfer to self is net-zero,
    // so final = before + amt
    await deliverToDest({ recipient: receiver.address, amount: amt });
    const after = await aUSDC.balanceOf(receiver.address);
    expect(after).to.equal(before.add(amt));
  });

  // 11) two sequential deliveries accumulate on alice
  it("🧪 two deliveries accumulate recipient balance", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(10) });
    await deliverToDest({ recipient: alice.address, amount: usdc(10) });
    await bridgeFromSource({ recipient: alice.address, amount: usdc(20) });
    await deliverToDest({ recipient: alice.address, amount: usdc(20) });
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(30));
  });

  // 12) different recipients credited separately
  it("🧪 different recipients get separate credits", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(7) });
    await deliverToDest({ recipient: alice.address, amount: usdc(7) });
    await bridgeFromSource({ recipient: bob.address, amount: usdc(9) });
    await deliverToDest({ recipient: bob.address, amount: usdc(9) });
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(7));
    expect(await aUSDC.balanceOf(bob.address)).to.equal(usdc(9));
  });

  // 13) gateway.lastCall shows last bridge
  it("🧪 gateway.lastCall shows the last bridge details", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(4) });
    await bridgeFromSource({ recipient: bob.address, amount: usdc(6) });
    const g = await gw.lastCall();
    expect(g.amount).to.equal(usdc(6));
    const [who] = abi().decode(["address"], g.payload);
    expect(who).to.equal(bob.address);
  });

  // 14) gas.last shows last amount/value
  it("🧪 gas.last shows last amount/value", async () => {
    await bridgeFromSource({ amount: usdc(1), value: eth(0.001) });
    await bridgeFromSource({ amount: usdc(2), value: eth(0.003) });
    const gs = await gas.last();
    expect(gs.amount).to.equal(usdc(2));
    expect(gs.value).to.equal(eth(0.003));
  });

  // 15) dynamic token mapping: remap to new token, deliver new token
  it("🧪 dynamic token mapping: remap to new token and deliver", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(12) });
    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const newToken  = await MockAUSDC.deploy(); await newToken.deployed();
    await gw.setTokenAddress("aUSDC", newToken.address);
    // mint & deliver using the new token
    await newToken.mint(receiver.address, usdc(12));
    await gw.mockExecuteWithToken(
      receiver.address, nextCmd("dyn"),
      ORIGIN_CHAIN, sender.address.toLowerCase(),
      abi().encode(["address"], [alice.address]),
      "aUSDC", usdc(12)
    );
    expect(await newToken.balanceOf(alice.address)).to.equal(usdc(12));
    expect(await aUSDC.balanceOf(alice.address)).to.equal(0);
  });

  // 16) mapping switch mid-run: old then new token balances
  it("🧪 mapping switch mid-run: old followed by new token", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(5) });
    await deliverToDest({ recipient: alice.address, amount: usdc(5) }); // old token
    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const t2 = await MockAUSDC.deploy(); await t2.deployed();
    await gw.setTokenAddress("aUSDC", t2.address);
    await t2.mint(receiver.address, usdc(8));
    await gw.mockExecuteWithToken(
      receiver.address, nextCmd("dyn2"),
      ORIGIN_CHAIN, sender.address.toLowerCase(),
      abi().encode(["address"], [alice.address]),
      "aUSDC", usdc(8)
    );
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(5));
    expect(await t2.balanceOf(alice.address)).to.equal(usdc(8));
  });

  // 17) event carries exact sourceChain casing you pass at delivery
  it("🧪 event carries exact sourceChain casing used at delivery", async () => {
    await bridgeFromSource({ amount: usdc(3) });
    const cased = "eThErEuM-SePoLiA";
    await expect(deliverToDest({ amount: usdc(3), sourceChain: cased }))
      .to.emit(receiver, "Received")
      .withArgs(alice.address, usdc(3), cased);
  });

  // 18) payload equality: gasService.payload == gateway.payload
  it("🧪 gasService.payload equals gateway.payload", async () => {
    await bridgeFromSource({ recipient: bob.address, amount: usdc(4) });
    const gs = await gas.last();
    const g  = await gw.lastCall();
    expect(gs.payload).to.equal(g.payload);
  });

  // 19) allowance to gateway equals last bridged amount
  it("🧪 sender allowance to gateway equals last amount", async () => {
    await bridgeFromSource({ amount: usdc(20) });
    expect(await aUSDC.allowance(sender.address, gw.address)).to.equal(usdc(20));
    await bridgeFromSource({ amount: usdc(7) });
    expect(await aUSDC.allowance(sender.address, gw.address)).to.equal(usdc(7));
  });

  // 20) user's allowance to sender decreases over multiple bridges
  it("🧪 user's allowance to sender decreases with each bridge", async () => {
    const before = await aUSDC.allowance(user.address, sender.address);
    await bridgeFromSource({ amount: usdc(10) });
    await bridgeFromSource({ amount: usdc(15) });
    const after = await aUSDC.allowance(user.address, sender.address);
    expect(after).to.equal(before.sub(usdc(25)));
  });

  // 21) no source credit to recipient until delivery
  it("🧪 recipient not credited on source chain pre-delivery", async () => {
    const before = await aUSDC.balanceOf(bob.address);
    await bridgeFromSource({ recipient: bob.address, amount: usdc(9) });
    expect(await aUSDC.balanceOf(bob.address)).to.equal(before);
    await deliverToDest({ recipient: bob.address, amount: usdc(9) });
    expect(await aUSDC.balanceOf(bob.address)).to.equal(before.add(usdc(9)));
  });

  // 22) delivery fails if not minted to receiver
  it("🧪 delivery fails without pre-mint to receiver", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(13) });
    await expect(
      gw.mockExecuteWithToken(
        receiver.address, nextCmd("nomint"),
        ORIGIN_CHAIN, sender.address.toLowerCase(),
        abi().encode(["address"], [alice.address]),
        "aUSDC", usdc(13)
      )
    ).to.be.reverted;
  });

  // 23) deliver parts that sum to total
  it("🧪 two partial deliveries sum correctly", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(30) });
    await deliverToDest({ recipient: alice.address, amount: usdc(10) });
    await deliverToDest({ recipient: alice.address, amount: usdc(20) });
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(30));
  });

  // 24) many small bridges & deliveries accumulate
  it("🧪 many small bridges then deliveries accumulate", async () => {
    for (let i = 0; i < 5; i++) {
      await bridgeFromSource({ recipient: alice.address, amount: usdc(2) });
      await deliverToDest({ recipient: alice.address, amount: usdc(2) });
    }
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(10));
  });

  // 25) mixed recipients across a few rounds
  it("🧪 mixed recipients across multiple rounds", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(2) });
    await bridgeFromSource({ recipient: bob.address, amount: usdc(3) });
    await deliverToDest({ recipient: alice.address, amount: usdc(2) });
    await deliverToDest({ recipient: bob.address, amount: usdc(3) });
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(2));
    expect(await aUSDC.balanceOf(bob.address)).to.equal(usdc(3));
  });

  // 26) gasService stores exact destAddr string
  it("🧪 gas service stores exact destAddr string", async () => {
    const dest = receiver.address.toLowerCase();
    await bridgeFromSource({ destAddr: dest, amount: usdc(4) });
    const gs = await gas.last();
    expect(gs.destAddr.toLowerCase()).to.equal(dest);
  });

  // 27) gateway symbol stays 'aUSDC'
  it("🧪 gateway symbol is 'aUSDC'", async () => {
    await bridgeFromSource({ amount: usdc(5) });
    const g = await gw.lastCall();
    expect(g.symbol).to.equal("aUSDC");
  });

  // 28) exactly one Bridging event per bridge
  it("🧪 exactly one Bridging event per bridge", async () => {
    const tx = await bridgeFromSource({ amount: usdc(6) });
    const rc = await tx.wait();
    const evts = rc.events?.filter(e => e.event === "Bridging") || [];
    expect(evts.length).to.equal(1);
  });

  // 29) uppercase source address accepted on delivery
  it("🧪 uppercase source address accepted on delivery", async () => {
    await bridgeFromSource({ amount: usdc(8) });
    await expect(deliverToDest({ amount: usdc(8), sourceAddr: sender.address.toUpperCase() }))
      .to.emit(receiver, "Received");
  });

  // 30) three recipients round-robin
  it("🧪 three recipients receive credits round-robin", async () => {
    for (const r of [alice.address, bob.address, carol.address]) {
      await bridgeFromSource({ recipient: r, amount: usdc(4) });
      await deliverToDest({ recipient: r, amount: usdc(4) });
    }
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(4));
    expect(await aUSDC.balanceOf(bob.address)).to.equal(usdc(4));
    expect(await aUSDC.balanceOf(carol.address)).to.equal(usdc(4));
  });

  // 31) payload decodes correctly each time
  it("🧪 payload decodes to recipient each time", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(1) });
    let g = await gw.lastCall();
    let [to] = abi().decode(["address"], g.payload);
    expect(to).to.equal(alice.address);

    await bridgeFromSource({ recipient: bob.address, amount: usdc(1) });
    g = await gw.lastCall();
    [to] = abi().decode(["address"], g.payload);
    expect(to).to.equal(bob.address);
  });

  // 32) different msg.value doesn't affect delivered amount
  it("🧪 msg.value size does not affect delivered amount", async () => {
    await bridgeFromSource({ amount: usdc(10), value: eth(0.001) });
    await deliverToDest({ amount: usdc(10) });
    await bridgeFromSource({ amount: usdc(10), value: eth(0.02) });
    await deliverToDest({ amount: usdc(10) });
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(20));
  });

  // 33) failing delivery then retry with mint succeeds
  it("🧪 first delivery fails (no mint), retry with mint succeeds", async () => {
    await bridgeFromSource({ amount: usdc(13) });
    await expect(
      gw.mockExecuteWithToken(
        receiver.address, nextCmd("nomint-first"),
        ORIGIN_CHAIN, sender.address.toLowerCase(),
        abi().encode(["address"], [alice.address]),
        "aUSDC", usdc(13)
      )
    ).to.be.reverted;

    await deliverToDest({ amount: usdc(13) });
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(13));
  });

  // 34) event casing equals what is passed in delivery
  it("🧪 event casing equals delivery sourceChain casing", async () => {
    const sc = "Ethereum-Sepolia";
    await bridgeFromSource({ amount: usdc(2) });
    await expect(deliverToDest({ amount: usdc(2), sourceChain: sc }))
      .to.emit(receiver, "Received")
      .withArgs(alice.address, usdc(2), sc);
  });

  // 35) punctuation mismatch (space) fails
  it("🧪 punctuation mismatch in sourceChain (space) fails", async () => {
    await bridgeFromSource({ amount: usdc(2) });
    await expect(deliverToDest({ amount: usdc(2), sourceChain: "Ethereum Sepolia" }))
      .to.be.revertedWith("bad sourceChain");
  });

  // 🧪 zero-amount deliveries (no sender) leave balances unchanged for multiple recipients
it("🧪 zero-amount deliveries leave balances unchanged (no sender call)", async () => {
  const bAlice = await aUSDC.balanceOf(alice.address);
  const bBob   = await aUSDC.balanceOf(bob.address);

  // direct delivery with amount=0; helper won't mint on 0
  const payloadA = ethers.utils.defaultAbiCoder.encode(["address"], [alice.address]);
  const payloadB = ethers.utils.defaultAbiCoder.encode(["address"], [bob.address]);

  await gw.mockExecuteWithToken(
    receiver.address,
    ethers.utils.formatBytes32String("zero-a"),
    "Ethereum-Sepolia",
    sender.address.toLowerCase(),
    payloadA,
    "aUSDC",
    usdc(0)
  );

  await gw.mockExecuteWithToken(
    receiver.address,
    ethers.utils.formatBytes32String("zero-b"),
    "Ethereum-Sepolia",
    sender.address.toLowerCase(),
    payloadB,
    "aUSDC",
    usdc(0)
  );

  expect(await aUSDC.balanceOf(alice.address)).to.equal(bAlice);
  expect(await aUSDC.balanceOf(bob.address)).to.equal(bBob);
});

  // 37) change destAddr between bridges updates gas.last.destAddr
  it("🧪 changing destAddr between bridges updates gas.last.destAddr", async () => {
    const d1 = receiver.address.toLowerCase();
    const d2 = "0x" + "ab".repeat(20);
    await bridgeFromSource({ destAddr: d1, amount: usdc(1) });
    await bridgeFromSource({ destAddr: d2, amount: usdc(1) });
    const gs = await gas.last();
    expect(gs.destAddr.toLowerCase()).to.equal(d2.toLowerCase());
  });

  // 38) sender balance on source equals sum of bridged amounts
  it("🧪 sender source balance equals sum of bridged amounts", async () => {
    const before = await aUSDC.balanceOf(sender.address);
    await bridgeFromSource({ amount: usdc(1) });
    await bridgeFromSource({ amount: usdc(2) });
    await bridgeFromSource({ amount: usdc(3) });
    expect(await aUSDC.balanceOf(sender.address)).to.equal(before.add(usdc(6)));
  });

  // 39) big delivery works when pre-minted
  it("🧪 big delivery works when pre-minted", async () => {
    const amt = usdc(250_000);
    await bridgeFromSource({ amount: amt });
    await deliverToDest({ amount: amt });
    expect(await aUSDC.balanceOf(alice.address)).to.equal(amt);
  });

  // 40) after deliveries, receiver balance returns to 0
  it("🧪 after exact deliveries, receiver balance is 0", async () => {
    for (let i = 0; i < 3; i++) {
      await bridgeFromSource({ amount: usdc(5) });
      await deliverToDest({ amount: usdc(5) });
    }
    expect(await aUSDC.balanceOf(receiver.address)).to.equal(usdc(0));
  });

  // 41) many deliveries to alice sum equals total
  it("🧪 many different amounts to alice sum correctly", async () => {
    const nums = [2, 5, 7, 11];
    for (const n of nums) {
      await bridgeFromSource({ amount: usdc(n) });
      await deliverToDest({ amount: usdc(n) });
    }
    const sum = nums.reduce((a,b)=>a+b,0);
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(sum));
  });

  // 42) checksum vs lowercase recipient behaves the same
  it("🧪 checksum vs lowercase recipient behaves the same", async () => {
    const recipLower = bob.address.toLowerCase();
    const recipCheck = ethers.utils.getAddress(recipLower);
    await bridgeFromSource({ recipient: recipCheck, amount: usdc(6) });
    await deliverToDest({ recipient: recipCheck, amount: usdc(6) });
    await bridgeFromSource({ recipient: recipLower, amount: usdc(4) });
    await deliverToDest({ recipient: recipLower, amount: usdc(4) });
    expect(await aUSDC.balanceOf(recipCheck)).to.equal(usdc(10));
  });

  // 43) two bridges before any delivery; then deliver in same order
  it("🧪 two bridges queued; deliveries in order", async () => {
    await bridgeFromSource({ recipient: alice.address, amount: usdc(4) });
    await bridgeFromSource({ recipient: bob.address, amount: usdc(9) });
    await deliverToDest({ recipient: alice.address, amount: usdc(4) });
    await deliverToDest({ recipient: bob.address, amount: usdc(9) });
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(4));
    expect(await aUSDC.balanceOf(bob.address)).to.equal(usdc(9));
  });

  // 44) three bridges to alice, deliver in reverse order
  it("🧪 three bridges to same recipient, deliveries reverse order", async () => {
    const amts = [3, 5, 7].map(usdc);
    for (const a of amts) await bridgeFromSource({ amount: a });
    for (const a of amts.slice().reverse()) await deliverToDest({ amount: a });
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(15));
  });

  // 45) remap to new token, then remap back and deliver both kinds
  it("🧪 remap to new token and back; both deliveries succeed", async () => {
    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const t2 = await MockAUSDC.deploy(); await t2.deployed();

    // map to t2 & deliver 4
    await gw.setTokenAddress("aUSDC", t2.address);
    await t2.mint(receiver.address, usdc(4));
    await gw.mockExecuteWithToken(
      receiver.address, nextCmd("t2"),
      ORIGIN_CHAIN, sender.address.toLowerCase(),
      abi().encode(["address"], [alice.address]),
      "aUSDC", usdc(4)
    );
    expect(await t2.balanceOf(alice.address)).to.equal(usdc(4));

    // map back and deliver 3
    await gw.setTokenAddress("aUSDC", aUSDC.address);
    await aUSDC.mint(receiver.address, usdc(3));
    await gw.mockExecuteWithToken(
      receiver.address, nextCmd("a-back"),
      ORIGIN_CHAIN, sender.address.toLowerCase(),
      abi().encode(["address"], [alice.address]),
      "aUSDC", usdc(3)
    );
    expect(await aUSDC.balanceOf(alice.address)).to.equal(usdc(3));
  });

  // 🧪 batch: five recipients (excluding payer) each receive +5 (assert deltas)
  it("🧪 batch: five recipients (excluding payer) each receive +5 (assert deltas)", async () => {
    const signers = await ethers.getSigners();
    // exclude deployer (0) and user (1); take next 5 EOAs as recipients
    const recips = signers.slice(2, 7).map(s => s.address);

    const before = {};
    for (const r of recips) before[r] = await aUSDC.balanceOf(r);

    for (const r of recips) {
      await bridgeFromSource({ recipient: r, amount: usdc(5) });   // payer = user
      await deliverToDest({ recipient: r, amount: usdc(5) });
    }

    for (const r of recips) {
      const after = await aUSDC.balanceOf(r);
      expect(after).to.equal(before[r].add(usdc(5)));
    }
  });

  // 47) sender (source) balance increases by the bridged amount each time
  it("🧪 sender source balance tracks bridged sum", async () => {
    const before = await aUSDC.balanceOf(sender.address);
    await bridgeFromSource({ amount: usdc(2) });
    await bridgeFromSource({ amount: usdc(3) });
    expect(await aUSDC.balanceOf(sender.address)).to.equal(before.add(usdc(5)));
  });

  // 48) gas.value can be tiny (1 wei) and still recorded
  it("🧪 tiny native gas (1 wei) is recorded", async () => {
    await sender.connect(user).bridge("Avalanche", receiver.address.toLowerCase(), alice.address, usdc(1), { value: 1 });
    const gs = await gas.last();
    expect(gs.value).to.equal(1);
  });

  // 49) gateway.destChain stays exactly as passed from sender
  it("🧪 gateway.destChain is exactly 'Avalanche'", async () => {
    await bridgeFromSource({ amount: usdc(2), destChain: "Avalanche" });
    const g = await gw.lastCall();
    expect(g.destChain).to.equal("Avalanche");
  });

  // 50) multiple bridges keep gateway.symbol constant 'aUSDC'
  it("🧪 multiple bridges keep symbol 'aUSDC'", async () => {
    await bridgeFromSource({ amount: usdc(2) });
    await bridgeFromSource({ amount: usdc(3) });
    const g = await gw.lastCall();
    expect(g.symbol).to.equal("aUSDC");
  });

  });

});
