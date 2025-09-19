const { expect } = require('chai');
const { ethers } = require('hardhat');
require("dotenv").config();

const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);

describe('USDCReceiver', () => {
  let accounts, deployer, user
  let mockAUSDC, mockGateway, receiver
  let expectedSourceChain;
  let expectedSourceAddr;

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

    // map symbol -> token address on this (dest) chain
    await mockGateway.setTokenAddress("aUSDC", mockAUSDC.address)

    // set expected source (assign BEFORE using), to match receiver's _keccakLower comparison
    expectedSourceChain = "Ethereum-Sepolia";
    // use your real sender addr from .env (or a fixed dummy)
    expectedSourceAddr  = (process.env.SEPOLIA_SENDER_ADDR || "0x1111111111111111111111111111111111111111").toLowerCase();

    // deploy receiver (with gateway + expected source strings)
    receiver = await (await ethers.getContractFactory("USDCReceiver")).deploy(
      mockGateway.address,
      expectedSourceChain,
      expectedSourceAddr
    );
    await receiver.deployed();

    // pre-fund receiver (simulate Axelar depositing tokens before calling)
    await mockAUSDC.mint(receiver.address, usdc(1_000))
  })

  it("accepts from expected source and transfers aUSDC to recipient", async () => {
    const recipient = user.address;
    const amount = usdc(1_000);

    // payload encodes recipient
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient])
    
    // simulate Axelar delivery
    const cmdId = ethers.utils.formatBytes32String("cmd1")
    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,     // must match constructor
        expectedSourceAddr,      // must match constructor (lowercased)
        payload,
        "aUSDC",
        amount
      )
    )
      .to.emit(receiver, "Received")
      .withArgs(recipient, amount, expectedSourceChain); // ✅ event assertion

    expect(await mockAUSDC.balanceOf(recipient)).to.equal(amount)
  });

  it("reverts on wrong token symbol", async () => {
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [user.address])
    const cmdId   = ethers.utils.formatBytes32String("cmd_bad")


    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        payload,
        "NOTUSDC",
        usdc(1)
      )
    ).to.be.revertedWith("wrong token")

  })

  // 🔵 reverts on wrong sourceChain
  it("🔵 reverts on wrong sourceChain", async () => {
    const recipient = user.address;
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId = ethers.utils.formatBytes32String("bad-chain");

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        "ethereum-mainnet",        // wrong
        expectedSourceAddr,        // correct origin address (lowercased)
        payload,
        "aUSDC",
        usdc(1)
      )
    ).to.be.revertedWith("bad sourceChain");
  });

  // 🔵 reverts on wrong sourceAddress
  it("🔵 reverts on wrong sourceAddress", async () => {
    const recipient = user.address;
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId = ethers.utils.formatBytes32String("bad-origin");

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,        // correct chain
        "0x0000000000000000000000000000000000000000", // wrong origin
        payload,
        "aUSDC",
        usdc(1)
      )
    ).to.be.revertedWith("unauthorized source");
  });

  // 🔵 reverts on malformed payload (cannot decode address)
  it("🔵 reverts on malformed payload", async () => {
    const cmdId = ethers.utils.formatBytes32String("bad-payload");

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        "0x1234",            // not decodable as (address)
        "aUSDC",
        usdc(1)
      )
    ).to.be.reverted;
  });

  // 🔵 resolves token dynamically from gateway.tokenAddresses
  it("🔵 resolves token dynamically from gateway.tokenAddresses", async () => {
    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const newToken = await MockAUSDC.deploy();
    await newToken.deployed();

    // point symbol to a NEW token and fund receiver with it
    await mockGateway.setTokenAddress("aUSDC", newToken.address);
    await newToken.mint(receiver.address, usdc(555));

    const amount = usdc(123);
    const recipient = user.address;
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId = ethers.utils.formatBytes32String("dyn-token");

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      cmdId,
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      amount
    );

    expect(await newToken.balanceOf(recipient)).to.equal(amount);
  });

  // 🔵 reverts when recipient is zero address
  it("🔵 reverts when recipient is zero address", async () => {
    const zero = "0x0000000000000000000000000000000000000000";
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [zero]);
    const cmdId = ethers.utils.formatBytes32String("zero-recipient");

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        payload,
        "aUSDC",
        usdc(10)
      )
    ).to.be.reverted; // OZ ERC20 reverts on transfer to zero
  });

  // 🔵 reverts when token mapping is missing (zero address)
  it("🔵 reverts when token mapping is missing (zero address)", async () => {
    // unset mapping by pointing to zero
    await mockGateway.setTokenAddress("aUSDC", "0x0000000000000000000000000000000000000000");

    const recipient = user.address;
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId = ethers.utils.formatBytes32String("no-token");

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        payload,
        "aUSDC",
        usdc(5)
      )
    ).to.be.reverted;
  });

  // 🔵 accepts mixed-case source chain/address (case-insensitive match)
  it("🔵 accepts mixed-case source chain/address", async () => {
    const recipient = user.address;
    const amount = usdc(11);
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId = ethers.utils.formatBytes32String("case-ok");

    const mixedChain = "Ethereum-Sepolia";
    const mixedAddr  = expectedSourceAddr.toUpperCase(); // case-changed

    // ensure receiver has funds to send
    await mockAUSDC.mint(receiver.address, amount);

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        mixedChain,            // mixed case
        mixedAddr,             // mixed case
        payload,
        "aUSDC",
        amount
      )
    )
      .to.emit(receiver, "Received")
      .withArgs(recipient, amount, mixedChain);

    expect(await mockAUSDC.balanceOf(recipient)).to.equal(amount);
  });

  // 🔵 emits Received with exact args for a tiny amount
  it("🔵 emits Received with exact args (tiny amount)", async () => {
    const recipient = user.address;
    const amount = usdc(1);
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId = ethers.utils.formatBytes32String("tiny-amt");

    // ensure receiver has at least 1 unit
    await mockAUSDC.mint(receiver.address, amount);

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        payload,
        "aUSDC",
        amount
      )
    )
      .to.emit(receiver, "Received")
      .withArgs(recipient, amount, expectedSourceChain);

    expect(await mockAUSDC.balanceOf(recipient)).to.equal(amount);
  });

  // 🔵 amount=0 should not change balances but should not revert
  it("🔵 allows amount=0 (no-op transfer, still emits event)", async () => {
    const recipient = user.address;
    const amount = usdc(0);
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId = ethers.utils.formatBytes32String("zero-amt");

    const before = await mockAUSDC.balanceOf(recipient);

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        payload,
        "aUSDC",
        amount
      )
    )
      .to.emit(receiver, "Received")
      .withArgs(recipient, amount, expectedSourceChain);

    const after = await mockAUSDC.balanceOf(recipient);
    expect(after).to.equal(before); // no change
  });

  // 🔵 sweep is owner-only; owner can sweep tokens out
  it("🔵 sweep is owner-only; owner can sweep", async () => {
    // non-owner (user) attempt
    await expect(
      receiver.connect(user).sweep(mockAUSDC.address, user.address, usdc(10))
    ).to.be.reverted;

    // owner succeeds
    const before = await mockAUSDC.balanceOf(deployer.address);
    await receiver.sweep(mockAUSDC.address, deployer.address, usdc(10));
    expect(await mockAUSDC.balanceOf(deployer.address)).to.equal(before.add(usdc(10)));
  });

  // 🟡 allows direct executeWithToken (SDK validation path); asserts event + transfer
it("🟡 allows direct executeWithToken from non-gateway (mock validates), emits Received", async () => {
  const cmdId   = ethers.utils.formatBytes32String("non-gw-ok");
  const amount  = usdc(7);
  const payload = ethers.utils.defaultAbiCoder.encode(["address"], [user.address]);

  // ensure receiver has funds to forward (in real Axelar, mint + execute happen atomically)
  await mockAUSDC.mint(receiver.address, amount);

  await expect(
    receiver.executeWithToken(
      cmdId,
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      amount
    )
  )
    .to.emit(receiver, "Received")
    .withArgs(user.address, amount, expectedSourceChain);
});

  // 🟡 message-only execute is blocked (and unsupported anyway)
  it("🟡 rejects direct message-only execute from non-gateway", async () => {
    const cmdId = ethers.utils.formatBytes32String("non-gw-msg");
    await expect(
      receiver.execute(
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        "0x"
      )
    ).to.be.reverted; // onlyGateway guard fires first
  });

  // 🟡 insufficient balance on receiver should revert during forwarding
  it("🟡 reverts when receiver lacks sufficient token balance to forward", async () => {
    const recipient = user.address;
    const amount = usdc(2_000); // more than the 1,000 pre-funded
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId = ethers.utils.formatBytes32String("insufficient-balance");

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        payload,
        "aUSDC",
        amount
      )
    ).to.be.reverted; // ERC20 transfer fails
  });

  // 🟡 two deliveries to same recipient should accumulate balances
  it("🟡 accumulates recipient balance across multiple deliveries", async () => {
    const recipient = user.address;
    const p = (addr) => ethers.utils.defaultAbiCoder.encode(["address"], [addr]);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("acc-1"),
      expectedSourceChain,
      expectedSourceAddr,
      p(recipient),
      "aUSDC",
      usdc(600)
    );
    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("acc-2"),
      expectedSourceChain,
      expectedSourceAddr,
      p(recipient),
      "aUSDC",
      usdc(400)
    );

    expect(await mockAUSDC.balanceOf(recipient)).to.equal(usdc(1000));
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(0));
  });

  // 🟡 mapping changed mid-stream: next delivery uses NEW token address
  it("🟡 uses updated token mapping on subsequent delivery", async () => {
    const recipient = user.address;
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);

    // deliver some original token first
    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("map-a"),
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      usdc(100)
    );
    expect(await mockAUSDC.balanceOf(recipient)).to.equal(usdc(100));

    // switch mapping to a new token and fund receiver with it
    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const newToken = await MockAUSDC.deploy();
    await newToken.deployed();
    await mockGateway.setTokenAddress("aUSDC", newToken.address);
    await newToken.mint(receiver.address, usdc(50));

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("map-b"),
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      usdc(50)
    );

    expect(await mockAUSDC.balanceOf(recipient)).to.equal(usdc(100));
    expect(await newToken.balanceOf(recipient)).to.equal(usdc(50));
  });

  // 🟡 event should carry EXACT sourceChain casing passed in (punctuation unchanged)
  it("🟡 emits Received with the exact sourceChain casing provided", async () => {
    const recipient = user.address;
    const amount = usdc(13);
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const weirdCase = "eThErEuM-SePoLiA";

    await mockAUSDC.mint(receiver.address, amount);

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        ethers.utils.formatBytes32String("weird-case"),
        weirdCase,               // same hyphen, different casing
        expectedSourceAddr,
        payload,
        "aUSDC",
        amount
      )
    )
      .to.emit(receiver, "Received")
      .withArgs(recipient, amount, weirdCase);
  });

  // 🟡 recipient equal to the receiver contract (self-transfer): no net balance change
  it("🟡 self-recipient results in no net balance change on receiver", async () => {
    const recipient = receiver.address; // self
    const amount = usdc(21);
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);

    // ensure funds are available
    await mockAUSDC.mint(receiver.address, amount);

    const before = await mockAUSDC.balanceOf(receiver.address);

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        ethers.utils.formatBytes32String("self"),
        expectedSourceChain,
        expectedSourceAddr,
        payload,
        "aUSDC",
        amount
      )
    )
      .to.emit(receiver, "Received")
      .withArgs(recipient, amount, expectedSourceChain);

    const after = await mockAUSDC.balanceOf(receiver.address);
    expect(after).to.equal(before); // transfer to self: no net change
  });

  // 🟡 owner sweep with amount=0 should succeed and leave balances unchanged
  it("🟡 owner sweep with zero amount is a no-op", async () => {
    const beforeOwner = await mockAUSDC.balanceOf(deployer.address);
    const beforeRecv  = await mockAUSDC.balanceOf(receiver.address);

    await receiver.sweep(mockAUSDC.address, deployer.address, usdc(0));

    expect(await mockAUSDC.balanceOf(deployer.address)).to.equal(beforeOwner);
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(beforeRecv);
  });

  // 🟡 owner sweep to zero address should revert
  it("🟡 owner sweep to zero-address should revert", async () => {
    await expect(
      receiver.sweep(mockAUSDC.address, "0x0000000000000000000000000000000000000000", usdc(1))
    ).to.be.reverted;
  });

  // 🟡 wrong token symbol with different casing should revert
  it("🟡 reverts on token symbol with wrong casing (aUsDc)", async () => {
    const recipient = user.address;
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId   = ethers.utils.formatBytes32String("bad-case");

    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        cmdId,
        expectedSourceChain,
        expectedSourceAddr,
        payload,
        "aUsDc", // wrong casing
        usdc(1)
      )
    ).to.be.revertedWith("wrong token");

  });

  // 🟣 owner is the deployer
  it("🟣 owner is the deployer", async () => {
    expect(await receiver.owner()).to.equal(deployer.address);
  });

  // 🟣 receiver starts with 1000 aUSDC (from test setup)
  it("🟣 receiver starts with 1000 aUSDC (prefunded)", async () => {
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(1000));
  });

  // 🟣 gateway maps aUSDC to the mock token initially
  it("🟣 gateway maps aUSDC to mock token initially", async () => {
    expect(await mockGateway.tokenAddresses("aUSDC")).to.equal(mockAUSDC.address);
  });

  // 🟣 expectedSourceChainHash equals keccak256(lowercase(chain string))
  it("🟣 expectedSourceChainHash equals keccak(lowercase(chain))", async () => {
    const onChain = await receiver.expectedSourceChainHash();
    const want = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(expectedSourceChain.toLowerCase())
    );
    expect(onChain).to.equal(want);
  });

  // 🟣 expectedSourceAddressHash equals keccak256(lowercase(address))
  it("🟣 expectedSourceAddressHash equals keccak(lowercase(address))", async () => {
    const onChain = await receiver.expectedSourceAddressHash();
    const want = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(expectedSourceAddr.toLowerCase())
    );
    expect(onChain).to.equal(want);
  });

  // 🟣 successful delivery moves exact amount from receiver to recipient
  it("🟣 successful delivery moves exact amount from receiver to recipient", async () => {
    const recipient = user.address;
    const amount = usdc(250);
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const cmdId = ethers.utils.formatBytes32String("delta-check");

    const beforeReceiver = await mockAUSDC.balanceOf(receiver.address);
    const beforeRecipient = await mockAUSDC.balanceOf(recipient);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      cmdId,
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      amount
    );

    const afterReceiver = await mockAUSDC.balanceOf(receiver.address);
    const afterRecipient = await mockAUSDC.balanceOf(recipient);

    expect(afterReceiver).to.equal(beforeReceiver.sub(amount));
    expect(afterRecipient).to.equal(beforeRecipient.add(amount));
  });

  // 🟣 deliveries to two different recipients credit each separately
  it("🟣 credits two different recipients separately", async () => {
    const r1 = user.address;
    const r2 = (await ethers.getSigners())[2].address;

    const p = (addr) => ethers.utils.defaultAbiCoder.encode(["address"], [addr]);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("r1"),
      expectedSourceChain,
      expectedSourceAddr,
      p(r1),
      "aUSDC",
      usdc(100)
    );

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("r2"),
      expectedSourceChain,
      expectedSourceAddr,
      p(r2),
      "aUSDC",
      usdc(200)
    );

    expect(await mockAUSDC.balanceOf(r1)).to.equal(usdc(100));
    expect(await mockAUSDC.balanceOf(r2)).to.equal(usdc(200));
  });

  // 🟣 uppercase chain string is accepted (hyphen preserved)
  it("🟣 accepts fully uppercase sourceChain (hyphen preserved)", async () => {
    const recipient = user.address;
    const amount = usdc(5);
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const chainUpper = expectedSourceChain.toUpperCase(); // "ETHEREUM-SEPOLIA"

    // ensure funds available
    await mockAUSDC.mint(receiver.address, amount);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("upper"),
      chainUpper,
      expectedSourceAddr,
      payload,
      "aUSDC",
      amount
    );

    expect(await mockAUSDC.balanceOf(recipient)).to.equal(amount);
  });

  // 🟣 empty payload (0x) reverts (cannot decode address)
  it("🟣 reverts on empty payload (cannot decode address)", async () => {
    await expect(
      mockGateway.mockExecuteWithToken(
        receiver.address,
        ethers.utils.formatBytes32String("empty"),
        expectedSourceChain,
        expectedSourceAddr,
        "0x",       // empty payload
        "aUSDC",
        usdc(1)
      )
    ).to.be.reverted;
  });

  // 🟣 sending exactly the full receiver balance empties it
  it("🟣 sending full balance empties receiver", async () => {
    const recipient = user.address;
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [recipient]);
    const full = await mockAUSDC.balanceOf(receiver.address);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("full"),
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      full
    );

    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(0));
    expect(await mockAUSDC.balanceOf(recipient)).to.equal(full);
  });

  // 🔴 mint 500 to receiver, then send 200 to user — receiver 1000+500-200=1300; user +200
  it("🔴 mint 500 to receiver, then send 200 to user → receiver=1300, user=+200", async () => {
    await mockAUSDC.mint(receiver.address, usdc(500));
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [user.address]);

    const beforeUser = await mockAUSDC.balanceOf(user.address);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("mint500-send200"),
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      usdc(200)
    );

    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(1300));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(beforeUser.add(usdc(200)));
  });

  // 🔴 send 100 to user and 150 to account[2] — receiver 1000-250=750; user +100; acc2 +150
  it("🔴 send 100 to user and 150 to acc2 → receiver=750, user=+100, acc2=+150", async () => {
    const [, , acc2] = await ethers.getSigners();
    const p = (addr) => ethers.utils.defaultAbiCoder.encode(["address"], [addr]);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("u100"),
      expectedSourceChain,
      expectedSourceAddr,
      p(user.address),
      "aUSDC",
      usdc(100)
    );
    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("a150"),
      expectedSourceChain,
      expectedSourceAddr,
      p(acc2.address),
      "aUSDC",
      usdc(150)
    );

    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(750));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(100));
    expect(await mockAUSDC.balanceOf(acc2.address)).to.equal(usdc(150));
  });

  // 🔴 user starts with 50 (mint), then receives 70 — user 120; receiver 1000-70=930
  it("🔴 user minted 50, then sent 70 → user=120, receiver=930", async () => {
    await mockAUSDC.mint(user.address, usdc(50));
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [user.address]);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("user70"),
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      usdc(70)
    );

    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(120));
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(930));
  });

  // 🔴 sequential deliveries 10, 20, 30 to user — user 60; receiver 940
  it("🔴 send 10, then 20, then 30 to user → user=60, receiver=940", async () => {
    const p = ethers.utils.defaultAbiCoder.encode(["address"], [user.address]);

    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("d10"),
      expectedSourceChain, expectedSourceAddr, p, "aUSDC", usdc(10)
    );
    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("d20"),
      expectedSourceChain, expectedSourceAddr, p, "aUSDC", usdc(20)
    );
    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("d30"),
      expectedSourceChain, expectedSourceAddr, p, "aUSDC", usdc(30)
    );

    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(60));
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(940));
  });

  // 🔴 mint 1 to receiver, then send 1 to user — receiver back to 1000; user +1
  it("🔴 mint 1 to receiver, send 1 to user → receiver=1000, user=+1", async () => {
    await mockAUSDC.mint(receiver.address, usdc(1));
    const payload = ethers.utils.defaultAbiCoder.encode(["address"], [user.address]);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("m1s1"),
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      usdc(1)
    );

    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(1000));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(1));
  });

  // 🔴 send 400 to user and 400 to acc3, then mint 50, then send 50 to user — receiver 200; user 450; acc3 400
  it("🔴 send 400→user & 400→acc3, mint 50, send 50→user → receiver=200, user=450, acc3=400", async () => {
    const [, , , acc3] = await ethers.getSigners();
    const p = (addr) => ethers.utils.defaultAbiCoder.encode(["address"], [addr]);

    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("u400"),
      expectedSourceChain, expectedSourceAddr, p(user.address), "aUSDC", usdc(400)
    );
    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("c400"),
      expectedSourceChain, expectedSourceAddr, p(acc3.address), "aUSDC", usdc(400)
    );

    await mockAUSDC.mint(receiver.address, usdc(50));

    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("u50"),
      expectedSourceChain, expectedSourceAddr, p(user.address), "aUSDC", usdc(50)
    );

    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(200));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(450));
    expect(await mockAUSDC.balanceOf(acc3.address)).to.equal(usdc(400));
  });

  // 🔴 mint 100 to receiver, no sends — receiver 1100; user 0
  it("🔴 mint 100 to receiver, no sends → receiver=1100, user=0", async () => {
    await mockAUSDC.mint(receiver.address, usdc(100));
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(1100));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(0));
  });

  // 🔴 send 0 then send 25 to user — receiver 975; user 25
  it("🔴 send 0 then 25 to user → receiver=975, user=25", async () => {
    const p = ethers.utils.defaultAbiCoder.encode(["address"], [user.address]);

    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("zero"),
      expectedSourceChain, expectedSourceAddr, p, "aUSDC", usdc(0)
    );
    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("twentyfive"),
      expectedSourceChain, expectedSourceAddr, p, "aUSDC", usdc(25)
    );

    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(975));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(25));
  });

  // 🔴 remap to new token, mint 70 new token to receiver, send 20 new token to user — user has 20 NEW; aUSDC user balance 0; aUSDC receiver still 1000
  it("🔴 remap to NEW token, mint 70, send 20 → user NEW=20, aUSDC user=0, aUSDC receiver=1000", async () => {
    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const newToken = await MockAUSDC.deploy();
    await newToken.deployed();

    await mockGateway.setTokenAddress("aUSDC", newToken.address);
    await newToken.mint(receiver.address, usdc(70));

    const p = ethers.utils.defaultAbiCoder.encode(["address"], [user.address]);

    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String("new20"),
      expectedSourceChain,
      expectedSourceAddr,
      p,
      "aUSDC",
      usdc(20)
    );

    expect(await newToken.balanceOf(user.address)).to.equal(usdc(20));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(0));
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(1000));
  });

  // 🔴 r1 starts with 5 and r2 with 7 (mint), then send 8 to r1 and 9 to r2 — r1=13, r2=16; receiver=983
  it("🔴 r1 minted 5, r2 minted 7; then send 8→r1 & 9→r2 → r1=13, r2=16, receiver=983", async () => {
    const [, , r1, r2] = await ethers.getSigners();
    await mockAUSDC.mint(r1.address, usdc(5));
    await mockAUSDC.mint(r2.address, usdc(7));

    const p = (addr) => ethers.utils.defaultAbiCoder.encode(["address"], [addr]);

    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("r1+8"),
      expectedSourceChain, expectedSourceAddr, p(r1.address), "aUSDC", usdc(8)
    );
    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("r2+9"),
      expectedSourceChain, expectedSourceAddr, p(r2.address), "aUSDC", usdc(9)
    );

    expect(await mockAUSDC.balanceOf(r1.address)).to.equal(usdc(13));
    expect(await mockAUSDC.balanceOf(r2.address)).to.equal(usdc(16));
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(983));
  });

    // ---------------- compact, readable balance scenarios ----------------
  // helpers (scoped to this describe)
  const _abi = () => ethers.utils.defaultAbiCoder;
  async function sendTo(to, amount, tag = "tbl") {
    const payload = _abi().encode(["address"], [to]);
    await mockGateway.mockExecuteWithToken(
      receiver.address,
      ethers.utils.formatBytes32String(tag),
      expectedSourceChain,
      expectedSourceAddr,
      payload,
      "aUSDC",
      usdc(amount)
    );
  }
  async function mintToReceiver(amount) {
    await mockAUSDC.mint(receiver.address, usdc(amount));
  }
  async function bal(addr) {
    return (await mockAUSDC.balanceOf(addr)).toString();
  }

  // 🟣/🟪: you can delete the noisy micro-tests later; this block keeps it tight.

  it("🟪 start:1000 | mint:+500 | send:200→user => receiver:1300, user:+200", async () => {
    const userBefore = await mockAUSDC.balanceOf(user.address);
    await mintToReceiver(500);
    await sendTo(user.address, 200, "t1");
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(1300));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(userBefore.add(usdc(200)));
  });

  it("🟪 start:1000 | send:100→user, 150→acc2 => receiver:750, user:+100, acc2:+150", async () => {
    const [, , acc2] = await ethers.getSigners();
    await sendTo(user.address, 100, "t2a");
    await sendTo(acc2.address, 150, "t2b");
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(750));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(100));
    expect(await mockAUSDC.balanceOf(acc2.address)).to.equal(usdc(150));
  });

  it("🟪 start:1000 | user minted:+50 | send:70→user => receiver:930, user:120", async () => {
    await mockAUSDC.mint(user.address, usdc(50));
    await sendTo(user.address, 70, "t3");
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(930));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(120));
  });

  it("🟪 start:1000 | send:10,20,30→user => receiver:940, user:60", async () => {
    await sendTo(user.address, 10, "t4a");
    await sendTo(user.address, 20, "t4b");
    await sendTo(user.address, 30, "t4c");
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(940));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(60));
  });

  it("🟪 start:1000 | mint:+1 | send:1→user => receiver:1000, user:+1", async () => {
    await mintToReceiver(1);
    await sendTo(user.address, 1, "t5");
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(1000));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(1));
  });

  it("🟪 start:1000 | send:400→user, 400→acc3 | mint:+50 | send:50→user => receiver:200, user:450, acc3:400", async () => {
    const [, , , acc3] = await ethers.getSigners();
    await sendTo(user.address, 400, "t6a");
    await sendTo(acc3.address, 400, "t6b");
    await mintToReceiver(50);
    await sendTo(user.address, 50, "t6c");
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(200));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(450));
    expect(await mockAUSDC.balanceOf(acc3.address)).to.equal(usdc(400));
  });

  it("🟪 start:1000 | mint:+100 | no sends => receiver:1100, user:0", async () => {
    await mintToReceiver(100);
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(1100));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(0));
  });

  it("🟪 start:1000 | send:0, then 25→user => receiver:975, user:25", async () => {
    await sendTo(user.address, 0, "t8a");
    await sendTo(user.address, 25, "t8b");
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(975));
    expect(await mockAUSDC.balanceOf(user.address)).to.equal(usdc(25));
  });

  it("🟪 start:1000 | remap→NEW token | mint NEW:+70 | send NEW:20→user => aUSDC(receiver)=1000, NEW(user)=20", async () => {
    const MockAUSDC = await ethers.getContractFactory("MockAUSDC");
    const newToken = await MockAUSDC.deploy();
    await newToken.deployed();
    await mockGateway.setTokenAddress("aUSDC", newToken.address);
    await newToken.mint(receiver.address, usdc(70));
    const payload = _abi().encode(["address"], [user.address]);
    await mockGateway.mockExecuteWithToken(
      receiver.address, ethers.utils.formatBytes32String("t9"),
      expectedSourceChain, expectedSourceAddr, payload, "aUSDC", usdc(20)
    );
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(1000));
    expect(await newToken.balanceOf(user.address)).to.equal(usdc(20));
  });

  it("🟪 start:1000 | r1 minted:+5, r2 minted:+7 | send:8→r1, 9→r2 => receiver:983, r1:13, r2:16", async () => {
    const [, , r1, r2] = await ethers.getSigners();
    await mockAUSDC.mint(r1.address, usdc(5));
    await mockAUSDC.mint(r2.address, usdc(7));
    await sendTo(r1.address, 8, "t10a");
    await sendTo(r2.address, 9, "t10b");
    expect(await mockAUSDC.balanceOf(receiver.address)).to.equal(usdc(983));
    expect(await mockAUSDC.balanceOf(r1.address)).to.equal(usdc(13));
    expect(await mockAUSDC.balanceOf(r2.address)).to.equal(usdc(16));
  });

})
