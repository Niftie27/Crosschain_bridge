const { expect } = require('chai');
const { ethers } = require('hardhat');

const eth  = (n) => ethers.utils.parseEther(n.toString());     // 18 dp
const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);  // 6 dp

describe("USDCSender (unit, mocks)", () => {
  let accounts, deployer, user
  let mockAUSDC, mockGateway, mockGasService, sender

  beforeEach(async () => {
    accounts = await ethers.getSigners()
    deployer = accounts[0]
    user = accounts[1]

    // Deploy mocks
    const MockAUSDC = await ethers.getContractFactory("MockAUSDC")
    mockAUSDC = await MockAUSDC.deploy()
    await mockAUSDC.deployed()

    const MockGateway = await ethers.getContractFactory("MockGateway")
    mockGateway = await MockGateway.deploy()
    await mockGateway.deployed()

    const MockGasService = await ethers.getContractFactory("MockGasService")
    mockGasService = await MockGasService.deploy()
    await mockGasService.deployed()

    // Deploy sender (needs real addresses)
    const USDCSender = await ethers.getContractFactory("USDCSender")
    sender = await USDCSender.deploy(
      mockGateway.address,
      mockGasService.address,
      mockAUSDC.address
    );
    await sender.deployed()

    //////////////////////////////////////////////
    // BALANCES
    //

    // mint balances (mock token)
    await mockAUSDC.mint(deployer.address, usdc(1_000_000))   // 1,000,000 aUSDC
    await mockAUSDC.mint(user.address, usdc(1_000_000))

    // deployer sends HALF to user
    await mockAUSDC.connect(deployer).transfer(user.address, usdc(500_000)) // half

    // User approves sender to pull HALF
    await mockAUSDC.connect(user).approve(sender.address, usdc(500_000))
  })

  it("pulls aUSDC, pays gas, and calls gateway with payload", async () => {
    const amount    = usdc(1_000)
    const destChain = "Avalanche" // Fuji’s Axelar name
    const destAddr  = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" // string form
    const recipient = user.address

    const tx = await sender.connect(user).bridge(
      destChain, destAddr, recipient, amount, { value: eth(0.01) }
    )
    await tx.wait()

    // aUSDC pulled into sender
    expect(await mockAUSDC.balanceOf(sender.address)).to.equal(amount)

    // allowance to gateway == amount
    expect(await mockAUSDC.allowance(sender.address, mockGateway.address)).to.equal(amount)

    // gas service saw correct args (recorded args)
    const gs = await mockGasService.last()
    expect(gs.sender).to.equal(sender.address)  // ✅ new assertion
    expect(gs.destChain).to.equal(destChain)
    expect(gs.destAddr.toLowerCase()).to.equal(destAddr.toLowerCase());
    expect(gs.symbol).to.equal("aUSDC")
    expect(gs.amount).to.equal(amount)
    expect(gs.value).to.equal(eth(0.01));

    // gateway recorded call + payload decodes to recipient
    const g = await mockGateway.lastCall()
    expect(g.destChain).to.equal(destChain)
    expect(g.destAddr.toLowerCase()).to.equal(destAddr.toLowerCase())
    expect(g.symbol).to.equal("aUSDC")
    expect(g.amount).to.equal(amount)

    const [decodedRecipient] = ethers.utils.defaultAbiCoder.decode(["address"], g.payload);
    expect(decodedRecipient).to.equal(recipient);
  });

    it("reverts if amount = 0", async () => { // ✅ new test
    await expect(
      sender.connect(user).bridge(
        "Avalanche",
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        user.address,
        0,
        { value: eth(0.01) }
      )
    ).to.be.revertedWith("amount=0");
  });

  it("reverts if destContract is empty", async () => {
    await expect(
      sender.connect(user).bridge(
        "Avalanche",
        "", // empty
        user.address,
        usdc(1),
        { value: eth(0.01) }
      )
    ).to.be.revertedWith("destContract required");
  });

  it("reverts when msg.value == 0 (native gas path)", async () => { // ✅ new test
    await expect(
      sender.connect(user).bridge(
        "Avalanche",
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        user.address,
        usdc(1),
        { value: 0 }
      )
    ).to.be.revertedWith("msg.value (gas) required");
  });

  it("emits Bridging with correct args", async () => {
    const amount    = usdc(1);
    const destChain = "Avalanche";
    const destAddr  = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

    await mockAUSDC.connect(user).approve(sender.address, amount);

    await expect(
      sender.connect(user).bridge(destChain, destAddr, user.address, amount, { value: eth(0.01) })
    )
      .to.emit(sender, "Bridging")
      .withArgs(user.address, user.address, amount, destChain, destAddr);
  });

  // 🔺 records refund address as the caller (user)
  it("🔺 records refund address as the caller (user)", async () => {
    const amount = usdc(10);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", user.address, amount, { value: eth(0.005) });
    const gs = await mockGasService.last();
    expect(gs.refund).to.equal(user.address);
  });

  // 🔺 records gasService.sender as the USDCSender contract
  it("🔺 records gasService.sender as the USDCSender contract", async () => {
    const amount = usdc(10);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x1111111111111111111111111111111111111111", user.address, amount, { value: eth(0.001) });
    const gs = await mockGasService.last();
    expect(gs.sender).to.equal(sender.address);
  });

  // 🔺 payload encodes the recipient address exactly
  it("🔺 payload encodes the recipient address", async () => {
    const amount = usdc(1);
    const recipient = deployer.address;
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x2222222222222222222222222222222222222222", recipient, amount, { value: eth(0.001) });
    const gs = await mockGasService.last();
    const [decoded] = ethers.utils.defaultAbiCoder.decode(["address"], gs.payload);
    expect(decoded).to.equal(recipient);
  });

  // 🔺 user balance decreases by amount; sender balance increases by amount
  it("🔺 user balance decreases and sender balance increases by the bridged amount", async () => {
    const amount = usdc(1234);
    const beforeUser = await mockAUSDC.balanceOf(user.address);
    const beforeSender = await mockAUSDC.balanceOf(sender.address);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x3333333333333333333333333333333333333333", user.address, amount, { value: eth(0.002) });
    const afterUser = await mockAUSDC.balanceOf(user.address);
    const afterSender = await mockAUSDC.balanceOf(sender.address);
    expect(afterUser).to.equal(beforeUser.sub(amount));
    expect(afterSender).to.equal(beforeSender.add(amount));
  });

  // 🔺 sequential bridges accumulate tokens in the sender contract
  it("🔺 sequential bridges accumulate sender's aUSDC balance", async () => {
    const a1 = usdc(100), a2 = usdc(250);
    await mockAUSDC.connect(user).approve(sender.address, a1.add(a2));
    await sender.connect(user).bridge("Avalanche", "0x4444444444444444444444444444444444444444", user.address, a1, { value: eth(0.001) });
    await sender.connect(user).bridge("Avalanche", "0x4444444444444444444444444444444444444444", user.address, a2, { value: eth(0.001) });
    expect(await mockAUSDC.balanceOf(sender.address)).to.equal(a1.add(a2));
  });

  // 🔺 forceApprove sets exact allowance per-call (100 -> 250 -> 50)
  it("🔺 allowance to gateway equals the latest amount (100 → 250 → 50)", async () => {
    await mockAUSDC.connect(user).approve(sender.address, usdc(1000));
    await sender.connect(user).bridge("Avalanche", "0x5555555555555555555555555555555555555555", user.address, usdc(100), { value: eth(0.001) });
    expect(await mockAUSDC.allowance(sender.address, mockGateway.address)).to.equal(usdc(100));
    await sender.connect(user).bridge("Avalanche", "0x5555555555555555555555555555555555555555", user.address, usdc(250), { value: eth(0.001) });
    expect(await mockAUSDC.allowance(sender.address, mockGateway.address)).to.equal(usdc(250));
    await sender.connect(user).bridge("Avalanche", "0x5555555555555555555555555555555555555555", user.address, usdc(50),  { value: eth(0.001) });
    expect(await mockAUSDC.allowance(sender.address, mockGateway.address)).to.equal(usdc(50));
  });

  // 🔺 zero recipient is allowed; payload carries zero address
  it("🔺 allows zero recipient; payload contains 0x000...0000", async () => {
    const zero = "0x0000000000000000000000000000000000000000";
    const amount = usdc(5);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x6666666666666666666666666666666666666666", zero, amount, { value: eth(0.001) });
    const g = await mockGateway.lastCall();
    const [decoded] = ethers.utils.defaultAbiCoder.decode(["address"], g.payload);
    expect(decoded).to.equal(zero);
  });

  // 🔺 gateway.lastCall reflects the last bridge call after multiple bridges
  it("🔺 gateway.lastCall matches the most recent bridge", async () => {
    await mockAUSDC.connect(user).approve(sender.address, usdc(1000));
    await sender.connect(user).bridge("Avalanche", "0x7777777777777777777777777777777777777777", user.address, usdc(10), { value: eth(0.001) });
    await sender.connect(user).bridge("Avalanche", "0x8888888888888888888888888888888888888888", deployer.address, usdc(20), { value: eth(0.002) });
    const last = await mockGateway.lastCall();
    const [decoded] = ethers.utils.defaultAbiCoder.decode(["address"], last.payload);
    expect(last.destAddr.toLowerCase()).to.equal("0x8888888888888888888888888888888888888888".toLowerCase());
    expect(last.amount).to.equal(usdc(20));
    expect(decoded).to.equal(deployer.address);
  });

  // 🔺 gasService.last updates to the most recent values
  it("🔺 gas service record updates on each bridge", async () => {
    await mockAUSDC.connect(user).approve(sender.address, usdc(300));
    await sender.connect(user).bridge("Avalanche", "0x9999999999999999999999999999999999999999", user.address, usdc(100), { value: eth(0.001) });
    await sender.connect(user).bridge("Avalanche", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", user.address, usdc(200), { value: eth(0.003) });
    const gs = await mockGasService.last();
    expect(gs.destAddr.toLowerCase()).to.equal("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(gs.amount).to.equal(usdc(200));
    expect(gs.value).to.equal(eth(0.003));
  });

  // 🔺 symbol is always "aUSDC" in gasService and gateway records
  it('🔺 symbol recorded as "aUSDC" in both gas service and gateway', async () => {
    const amount = usdc(12);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", user.address, amount, { value: eth(0.001) });
    const gs = await mockGasService.last();
    const g  = await mockGateway.lastCall();
    expect(gs.symbol).to.equal("aUSDC");
    expect(g.symbol).to.equal("aUSDC");
  });

  // 🔺 refund address is caller, not recipient
  it("🔺 refund address equals caller, not recipient", async () => {
    const amount = usdc(30);
    const recipient = deployer.address;
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0xcccccccccccccccccccccccccccccccccccccccc", recipient, amount, { value: eth(0.002) });
    const gs = await mockGasService.last();
    expect(gs.refund).to.equal(user.address);
    expect(gs.refund).to.not.equal(recipient);
  });

  // 🔺 accepts minimal native gas (1 wei)
  it("🔺 accepts minimal native gas (1 wei)", async () => {
    const amount = usdc(2);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0xdddddddddddddddddddddddddddddddddddddddd", user.address, amount, { value: 1 });
    const gs = await mockGasService.last();
    expect(gs.value).to.equal(1);
  });

  // 🔺 supports tiny amount (1 unit of aUSDC)
  it("🔺 supports bridging the minimum unit (1 aUSDC unit)", async () => {
    const amount = usdc(1);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", user.address, amount, { value: eth(0.001) });
    const g = await mockGateway.lastCall();
    expect(g.amount).to.equal(amount);
  });

  // 🔺 bridges exactly the user's approved amount (500,000) successfully
  it("🔺 bridges exactly the user's approved amount (500,000)", async () => {
    const amount = usdc(500_000);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0xffffffffffffffffffffffffffffffffffffffff", user.address, amount, { value: eth(0.01) });
    const g = await mockGateway.lastCall();
    expect(g.amount).to.equal(amount);
  });

  // 🔺 user's allowance to sender decreases by the bridged amount
  it("🔺 user's allowance to sender decreases by the bridged amount", async () => {
    const startAllowance = usdc(10_000);
    const amount = usdc(1_234);
    await mockAUSDC.connect(user).approve(sender.address, startAllowance);
    await sender.connect(user).bridge("Avalanche", "0x1212121212121212121212121212121212121212", user.address, amount, { value: eth(0.001) });
    const remaining = await mockAUSDC.allowance(user.address, sender.address);
    expect(remaining).to.equal(startAllowance.sub(amount));
  });

  // 🔺 fails without prior approval (allowance = 0)
  it("🔺 reverts when user has no allowance set", async () => {
    const [, , third] = await ethers.getSigners();
    await mockAUSDC.mint(third.address, usdc(100));
    await expect(
      sender.connect(third).bridge("Avalanche", "0x1313131313131313131313131313131313131313", third.address, usdc(50), { value: eth(0.001) })
    ).to.be.reverted; // transferFrom should revert on no allowance
  });

  // 🔺 reverts on insufficient balance even if allowance is high
  it("🔺 reverts when balance is insufficient even with high allowance", async () => {
    const [, , fourth] = await ethers.getSigners();
    await mockAUSDC.mint(fourth.address, usdc(10)); // small balance
    await mockAUSDC.connect(fourth).approve(sender.address, usdc(1000)); // high allowance
    await expect(
      sender.connect(fourth).bridge("Avalanche", "0x1414141414141414141414141414141414141414", fourth.address, usdc(100), { value: eth(0.001) })
    ).to.be.reverted;
  });

  // 🔺 refund goes to respective caller for different callers (fixed)
  it("🔺 refund goes to respective caller for different callers", async () => {
    const caller2 = accounts[2]; // distinct from `user`

    // fund & approve each caller for their own amount
    await mockAUSDC.mint(caller2.address, usdc(20));
    await mockAUSDC.connect(user).approve(sender.address, usdc(10));
    await mockAUSDC.connect(caller2).approve(sender.address, usdc(20));

    // 1) user bridges 10
    await sender
      .connect(user)
      .bridge("Avalanche", "0x1515151515151515151515151515151515151515", user.address, usdc(10), { value: eth(0.001) });
    let gs = await mockGasService.last();
    expect(gs.refund).to.equal(user.address);

    // 2) caller2 bridges 20
    await sender
      .connect(caller2)
      .bridge("Avalanche", "0x1616161616161616161616161616161616161616", caller2.address, usdc(20), { value: eth(0.002) });
    gs = await mockGasService.last();
    expect(gs.refund).to.equal(caller2.address);
  });

  // 🔺 gateway records the exact destChain string ("Avalanche")
  it('🔺 gateway records the exact destChain "Avalanche"', async () => {
    const amount = usdc(2);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x1717171717171717171717171717171717171717", user.address, amount, { value: eth(0.001) });
    const g = await mockGateway.lastCall();
    expect(g.destChain).to.equal("Avalanche");
  });

  // 🔺 gas service records the exact destAddr string that was passed
  it("🔺 gas service records the exact destAddr string", async () => {
    const amount = usdc(2);
    const destAddr = "0x1818181818181818181818181818181818181818";
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", destAddr, user.address, amount, { value: eth(0.001) });
    const gs = await mockGasService.last();
    expect(gs.destAddr.toLowerCase()).to.equal(destAddr.toLowerCase());
  });

  // 🔺 no approval granted to gasService in native-gas path
  it("🔺 no aUSDC allowance to gasService in native-gas path", async () => {
    const amount = usdc(10);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x1919191919191919191919191919191919191919", user.address, amount, { value: eth(0.001) });
    expect(await mockAUSDC.allowance(sender.address, mockGasService.address)).to.equal(0);
  });

  // 🔺 event 'Bridging' emits caller as sender, not the contract
  it("🔺 Bridging event 'sender' arg equals msg.sender", async () => {
    const amount = usdc(3);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await expect(
      sender.connect(user).bridge("Avalanche", "0x1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a", user.address, amount, { value: eth(0.001) })
    ).to.emit(sender, "Bridging").withArgs(user.address, user.address, amount, "Avalanche", "0x1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a");
  });

  // 🔺 recipient can be deployer; event carries deployer as recipient
  it("🔺 recipient can be deployer; event uses deployer as recipient", async () => {
    const amount = usdc(4);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await expect(
      sender.connect(user).bridge("Avalanche", "0x1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b", deployer.address, amount, { value: eth(0.001) })
    ).to.emit(sender, "Bridging").withArgs(user.address, deployer.address, amount, "Avalanche", "0x1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b");
  });

  // 🔺 identical destAddr with different casing is treated the same (we compare lowercased)
  it("🔺 destAddr comparison is case-insensitive in tests", async () => {
    const amount = usdc(6);
    const destAddr = "0x1C1c1C1C1c1C1c1C1c1C1c1C1c1C1c1C1c1C1c1C";
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", destAddr, user.address, amount, { value: eth(0.001) });
    const g = await mockGateway.lastCall();
    expect(g.destAddr.toLowerCase()).to.equal(destAddr.toLowerCase());
  });

  // 🔺 bridging reduces user->sender allowance each time by the bridged amount
  it("🔺 allowance from user to sender decreases with each bridge", async () => {
    const startAllowance = usdc(1000);
    await mockAUSDC.connect(user).approve(sender.address, startAllowance);
    await sender.connect(user).bridge("Avalanche", "0x1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d", user.address, usdc(400), { value: eth(0.001) });
    let remaining = await mockAUSDC.allowance(user.address, sender.address);
    expect(remaining).to.equal(usdc(600));
    await sender.connect(user).bridge("Avalanche", "0x1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e", user.address, usdc(150), { value: eth(0.001) });
    remaining = await mockAUSDC.allowance(user.address, sender.address);
    expect(remaining).to.equal(usdc(450));
  });

  // 🔺 sender balance equals sum of amounts bridged by two callers (fixed)
  it("🔺 sender balance equals sum of amounts bridged by two callers", async () => {
    const caller2 = accounts[2]; // distinct from `user`

    // fund both callers exactly for clarity, then approve
    await mockAUSDC.mint(user.address,    usdc(100));
    await mockAUSDC.mint(caller2.address, usdc(200));
    await mockAUSDC.connect(user).approve(sender.address,    usdc(100));
    await mockAUSDC.connect(caller2).approve(sender.address, usdc(200));

    await sender
      .connect(user)
      .bridge("Avalanche", "0x1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f", user.address, usdc(100), { value: eth(0.001) });
    await sender
      .connect(caller2)
      .bridge("Avalanche", "0x2020202020202020202020202020202020202020", caller2.address, usdc(200), { value: eth(0.002) });

    expect(await mockAUSDC.balanceOf(sender.address)).to.equal(usdc(300));
  });

  // 🔺 large msg.value is recorded fully by gas service
  it("🔺 large msg.value is recorded by gas service", async () => {
    const amount = usdc(5);
    const big = eth(0.5);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x2121212121212121212121212121212121212121", user.address, amount, { value: big });
    const gs = await mockGasService.last();
    expect(gs.value).to.equal(big);
  });

  // 🔺 bridging does not change deployer's balance when user bridges
  it("🔺 user bridging does not change deployer's aUSDC balance", async () => {
    const amount = usdc(9);
    const before = await mockAUSDC.balanceOf(deployer.address);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x2222222222222222222222222222222222222222", user.address, amount, { value: eth(0.001) });
    expect(await mockAUSDC.balanceOf(deployer.address)).to.equal(before);
  });

  // 🔺 multiple bridges keep symbol constant as "aUSDC"
  it('🔺 multiple bridges keep symbol constant "aUSDC"', async () => {
    await mockAUSDC.connect(user).approve(sender.address, usdc(30));
    await sender.connect(user).bridge("Avalanche", "0x2323232323232323232323232323232323232323", user.address, usdc(10), { value: eth(0.001) });
    let g = await mockGateway.lastCall();
    expect(g.symbol).to.equal("aUSDC");
    await sender.connect(user).bridge("Avalanche", "0x2424242424242424242424242424242424242424", user.address, usdc(20), { value: eth(0.001) });
    g = await mockGateway.lastCall();
    expect(g.symbol).to.equal("aUSDC");
  });

  // 🔺 gateway payload and gasService payload are identical bytes
  it("🔺 gasService.payload equals gateway.payload", async () => {
    const amount = usdc(11);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x2525252525252525252525252525252525252525", user.address, amount, { value: eth(0.001) });
    const gs = await mockGasService.last();
    const g  = await mockGateway.lastCall();
    expect(gs.payload).to.equal(g.payload);
  });

  // 🔺 bridging with different recipients updates payload accordingly
  it("🔺 payload changes with different recipients", async () => {
    const [, r2] = accounts;
    await mockAUSDC.connect(user).approve(sender.address, usdc(10));
    await sender.connect(user).bridge("Avalanche", "0x2626262626262626262626262626262626262626", user.address, usdc(5), { value: eth(0.001) });
    let g = await mockGateway.lastCall();
    let [rec] = ethers.utils.defaultAbiCoder.decode(["address"], g.payload);
    expect(rec).to.equal(user.address);

    await sender.connect(user).bridge("Avalanche", "0x2727272727272727272727272727272727272727", r2.address, usdc(5), { value: eth(0.001) });
    g = await mockGateway.lastCall();
    [rec] = ethers.utils.defaultAbiCoder.decode(["address"], g.payload);
    expect(rec).to.equal(r2.address);
  });

  // 🔺 gas service and gateway amounts match exactly
  it("🔺 gas service amount equals gateway amount", async () => {
    const amount = usdc(77);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x2828282828282828282828282828282828282828", user.address, amount, { value: eth(0.001) });
    const gs = await mockGasService.last();
    const g  = await mockGateway.lastCall();
    expect(gs.amount).to.equal(g.amount);
  });

  // 🔺 does not mutate destChain string (exact case preserved)
  it("🔺 preserves destChain string case as passed", async () => {
    const chain = "Avalanche"; // exact case
    const amount = usdc(3);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge(chain, "0x2929292929292929292929292929292929292929", user.address, amount, { value: eth(0.001) });
    const g = await mockGateway.lastCall();
    expect(g.destChain).to.equal(chain);
  });

  // 🔺 bridging twice sets gateway allowance to the SECOND amount (not sum)
  it("🔺 gateway allowance equals second amount (not additive)", async () => {
    await mockAUSDC.connect(user).approve(sender.address, usdc(1000));
    await sender.connect(user).bridge("Avalanche", "0x2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a", user.address, usdc(300), { value: eth(0.001) });
    await sender.connect(user).bridge("Avalanche", "0x2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b", user.address, usdc(40),  { value: eth(0.001) });
    expect(await mockAUSDC.allowance(sender.address, mockGateway.address)).to.equal(usdc(40));
  });

  // 🔺 payload decode works for mixed-case recipient (checksummed address)
  it("🔺 payload decodes to the exact checksummed recipient", async () => {
    const recipient = ethers.utils.getAddress(user.address); // checksum
    const amount = usdc(12);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c", recipient, amount, { value: eth(0.001) });
    const g = await mockGateway.lastCall();
    const [decoded] = ethers.utils.defaultAbiCoder.decode(["address"], g.payload);
    expect(decoded).to.equal(recipient);
  });

  // 🔺 bridging with very large (but funded) amount succeeds
  it("🔺 supports a large amount within user's balance", async () => {
    const amount = usdc(300_000);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d", user.address, amount, { value: eth(0.01) });
    const g = await mockGateway.lastCall();
    expect(g.amount).to.equal(amount);
  });

  // 🔺 bridging with same destAddr twice updates lastCall but not revert
  it("🔺 bridging twice to the same destAddr updates lastCall without errors", async () => {
    const destAddr = "0x2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e";
    await mockAUSDC.connect(user).approve(sender.address, usdc(20));
    await sender.connect(user).bridge("Avalanche", destAddr, user.address, usdc(10), { value: eth(0.001) });
    await sender.connect(user).bridge("Avalanche", destAddr, user.address, usdc(10), { value: eth(0.001) });
    const g = await mockGateway.lastCall();
    expect(g.destAddr.toLowerCase()).to.equal(destAddr.toLowerCase());
    expect(g.amount).to.equal(usdc(10));
  });

  // 🔺 gas service sees the same payload bytes as encoded locally
  it("🔺 local ABI-encoded payload equals gas service payload", async () => {
    const amount = usdc(33);
    const recipient = user.address;
    const expectedPayload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    await mockAUSDC.connect(user).approve(sender.address, amount);
    await sender.connect(user).bridge("Avalanche", "0x2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f", recipient, amount, { value: eth(0.001) });
    const gs = await mockGasService.last();
    expect(gs.payload).to.equal(expectedPayload);
  });

  // 🔺 sending with different msg.value does not alter amount in gateway call
  it("🔺 varying msg.value does not affect gateway amount", async () => {
    const amount = usdc(44);
    await mockAUSDC.connect(user).approve(sender.address, amount.mul(2));
    await sender.connect(user).bridge("Avalanche", "0x3030303030303030303030303030303030303030", user.address, amount,      { value: eth(0.001) });
    let g = await mockGateway.lastCall();
    expect(g.amount).to.equal(amount);
    await sender.connect(user).bridge("Avalanche", "0x3030303030303030303030303030303030303030", user.address, amount,      { value: eth(0.009) });
    g = await mockGateway.lastCall();
    expect(g.amount).to.equal(amount);
  });

  // 🔺 event fires exactly once per bridge (length of matching events == 1)
  it("🔺 emits exactly one Bridging event per call", async () => {
    const amount = usdc(5);
    const tx = await sender.connect(user).bridge("Avalanche", "0x3131313131313131313131313131313131313131", user.address, amount, { value: eth(0.001) });
    const rc = await tx.wait();
    const matching = rc.events?.filter(e => e.event === "Bridging") || [];
    expect(matching.length).to.equal(1);
  });

  // 🔺 constructor wires gateway/gasService/aUSDC addresses
  it("🔺 constructor wires gateway/gasService/aUSDC addresses", async () => {
    expect(await sender.gateway()).to.equal(mockGateway.address);
    expect(await sender.gasService()).to.equal(mockGasService.address);
    expect(await sender.aUSDC()).to.equal(mockAUSDC.address);
  });

  // 🔺 TOKEN_SYMBOL is 'aUSDC'
  it("🔺 TOKEN_SYMBOL is 'aUSDC'", async () => {
    expect(await sender.TOKEN_SYMBOL()).to.equal("aUSDC");
  });

  // 🔺 user's allowance to GATEWAY remains 0 (bridge shouldn't touch it)
  it("🔺 user's allowance to gateway remains 0", async () => {
    const amount = usdc(10);
    const dest = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
    // user already approved sender in beforeEach
    await sender.connect(user).bridge("Avalanche", dest, user.address, amount, { value: eth(0.001) });
    expect(await mockAUSDC.allowance(user.address, mockGateway.address)).to.equal(0);
  });

  // 🔺 user's allowance to GAS SERVICE remains 0 (native gas path)
  it("🔺 user's allowance to gas service remains 0 in native path", async () => {
    const amount = usdc(7);
    const dest = "0xBbBBBBbBBbBBBbBBbbBBBBBbBBBbBbBbBBBBBbBB";
    await sender.connect(user).bridge("Avalanche", dest, user.address, amount, { value: eth(0.001) });
    expect(await mockAUSDC.allowance(user.address, mockGasService.address)).to.equal(0);
  });

  // 🔺 emits Bridging when recipient is zero address
  it("🔺 emits Bridging when recipient is zero address", async () => {
    const zero = "0x0000000000000000000000000000000000000000";
    const amount = usdc(5);
    const dest = "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc";
    await expect(
      sender.connect(user).bridge("Avalanche", dest, zero, amount, { value: eth(0.001) })
    ).to.emit(sender, "Bridging").withArgs(user.address, zero, amount, "Avalanche", dest);
  });

  // 🔺 deployer can bridge too (after approving); refund goes to deployer
  it("🔺 deployer can bridge (after approve); refund goes to deployer", async () => {
    const amount = usdc(12);
    const dest = "0xDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDd";
    await mockAUSDC.connect(deployer).approve(sender.address, amount);
    await sender.connect(deployer).bridge("Avalanche", dest, deployer.address, amount, { value: eth(0.002) });
    const gs = await mockGasService.last();
    expect(gs.refund).to.equal(deployer.address);
  });

  // 🔺 deployer bridging does NOT change user's balance
  it("🔺 deployer bridging does not change user's balance", async () => {
    const amount = usdc(9);
    const dest = "0xEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEe";
    const before = await mockAUSDC.balanceOf(user.address);
    await mockAUSDC.connect(deployer).approve(sender.address, amount);
    await sender.connect(deployer).bridge("Avalanche", dest, deployer.address, amount, { value: eth(0.001) });
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(before);
  });

  // 🔺 when amount=0 and msg.value=0, revert reason is 'amount=0' (checks order)
  it("🔺 amount=0 and msg.value=0 => reverts with 'amount=0'", async () => {
    await expect(
      sender.connect(user).bridge("Avalanche", "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", user.address, 0, { value: 0 })
    ).to.be.revertedWith("amount=0");
  });

  // 🔺 empty destContract reverts and gasService.last.value stays 0 (no call made)
  it("🔺 empty destContract keeps gasService.last.value = 0", async () => {
    await expect(
      sender.connect(user).bridge("Avalanche", "", user.address, usdc(1), { value: eth(0.001) })
    ).to.be.revertedWith("destContract required");
    const gs = await mockGasService.last();
    expect(gs.value).to.equal(0);
  });

  // 🔺 recipient's balance on source chain is unchanged by bridge (tokens held by sender)
  it("🔺 recipient balance is unchanged on source chain after bridge", async () => {
    const recipient = deployer.address; // pick someone who doesn't call transferFrom
    const amount = usdc(20);
    const dest = "0x1234567890abcdef1234567890ABCDEF12345678";
    const before = await mockAUSDC.balanceOf(recipient);
    await sender.connect(user).bridge("Avalanche", dest, recipient, amount, { value: eth(0.002) });
    const after = await mockAUSDC.balanceOf(recipient);
    expect(after).to.equal(before); // no local credit on source chain
  });

});

