const { expect } = require('chai');
const { ethers } = require('hardhat');

const eth  = (n) => ethers.utils.parseEther(n.toString());
const usdc = (n) => ethers.utils.parseUnits(n.toString(), 6);

describe('USDCSender (ERC-20 gas path)', () => {
  let accounts, deployer, user;
  let mockAUSDC, mockGateway, mockGasV2, sender;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    [deployer, user] = accounts;

    const MockAUSDC      = await ethers.getContractFactory('MockAUSDC');
    const MockGateway    = await ethers.getContractFactory('MockGateway');
    const MockGasService = await ethers.getContractFactory('MockGasServiceV2');
    const USDCSender     = await ethers.getContractFactory('USDCSender');

    mockAUSDC   = await MockAUSDC.deploy();
    mockGateway = await MockGateway.deploy();
    mockGasV2   = await MockGasService.deploy();
    sender      = await USDCSender.deploy(
      mockGateway.address,
      mockGasV2.address,
      mockAUSDC.address
    );

    // balances + allowance to sender
    await mockAUSDC.mint(user.address, usdc(1_000_000));
    await mockAUSDC.connect(user).approve(sender.address, usdc(1_000_000));
  });

  it('🔺 ERC-20 gas: pulls amount + gasFee; no msg.value needed', async () => {
    const amount = usdc(500);
    const gasFee = usdc(5);
    const before = await mockAUSDC.balanceOf(user.address);

    await sender.connect(user).bridgeWithERC20Gas(
      'Avalanche',
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      user.address,
      amount,
      gasFee,
      user.address
    );

    // user spent amount + gasFee
    const after = await mockAUSDC.balanceOf(user.address);
    expect(before.sub(after)).to.equal(amount.add(gasFee));

    // sender holds the whole (amount + gasFee) until gateway/gas service take them
    expect(await mockAUSDC.balanceOf(sender.address)).to.equal(amount.add(gasFee));

    // gas service recorded ERC-20 payment
    const erc = await mockGasV2.lastERC20();
    expect(erc.destChain).to.equal('Avalanche');
    expect(erc.symbol).to.equal('aUSDC');
    expect(erc.amount).to.equal(amount);
    expect(erc.gasToken).to.equal(mockAUSDC.address);
    expect(erc.gasFeeInToken).to.equal(gasFee);
    expect(erc.refund).to.equal(user.address);

    // gateway got correct call
    const g = await mockGateway.lastCall();
    expect(g.symbol).to.equal('aUSDC');
    expect(g.amount).to.equal(amount);
    const [decoded] = ethers.utils.defaultAbiCoder.decode(['address'], g.payload);
    expect(decoded).to.equal(user.address);
  });

  it('🔺 ERC-20 gas: reverts when gasFeeInAUSDC = 0', async () => {
    await expect(
      sender.connect(user).bridgeWithERC20Gas(
        'Avalanche',
        '0x1111111111111111111111111111111111111111',
        user.address,
        usdc(1),
        0,                 // <-- no ERC-20 gas fee
        user.address
      )
    ).to.be.revertedWith('gasFeeInAUSDC=0');
  });

  // 🔺 ERC-20 gas: function is NON-PAYABLE; providing msg.value is rejected by ethers
  it("🔺 ERC-20 gas: rejects msg.value (non-payable)", async () => {
    const amount = usdc(2);
    const gasFee = usdc(5);

    // happy path still works with NO msg.value
    await sender.connect(user).bridgeWithERC20Gas(
      "Avalanche",
      "0x2222222222222222222222222222222222222222",
      user.address,
      amount,
      gasFee,
      user.address
    );

    // explicitly verify that trying to send msg.value throws a client-side error
    let threw = false;
    try {
      await sender.connect(user).bridgeWithERC20Gas(
        "Avalanche",
        "0x2222222222222222222222222222222222222222",
        user.address,
        amount,
        gasFee,
        user.address,
        { value: eth(0.01) } // not allowed; function is non-payable
      );
    } catch (e) {
      threw = true;
      expect(String(e.message)).to.match(/non-payable method/i);
    }
    expect(threw).to.equal(true);
  });


  it('🔺 ERC-20 gas: pulls EXACT amount+fee (no over/under)', async () => {
    const amount = usdc(321);
    const gasFee = usdc(7);
    const before = await mockAUSDC.balanceOf(user.address);
    await sender.connect(user).bridgeWithERC20Gas(
      'Avalanche',
      '0x3333333333333333333333333333333333333333',
      user.address,
      amount,
      gasFee,
      user.address
    );
    const delta = before.sub(await mockAUSDC.balanceOf(user.address));
    expect(delta).to.equal(amount.add(gasFee));
  });

  it('🔺 ERC-20 gas: reverts if allowance to sender insufficient (even if user balance is high)', async () => {
    const [, someone] = accounts;
    await mockAUSDC.mint(someone.address, usdc(100));
    await mockAUSDC.connect(someone).approve(sender.address, usdc(50)); // not enough for 60 total
    await expect(
      sender.connect(someone).bridgeWithERC20Gas(
        'Avalanche',
        '0x4444444444444444444444444444444444444444',
        someone.address,
        usdc(55), // amount
        usdc(5),  // gas
        someone.address
      )
    ).to.be.reverted; // transferFrom fails
  });

  it('🔺 ERC-20 gas: destContract required (empty string reverts)', async () => {
    await expect(
      sender.connect(user).bridgeWithERC20Gas(
        'Avalanche',
        '',
        user.address,
        usdc(1),
        usdc(1),
        user.address
      )
    ).to.be.revertedWith('destContract required');
  });

  it('🔺 ERC-20 gas: amount must be > 0', async () => {
    await expect(
      sender.connect(user).bridgeWithERC20Gas(
        'Avalanche',
        '0x5555555555555555555555555555555555555555',
        user.address,
        0,
        usdc(1),
        user.address
      )
    ).to.be.revertedWith('amount=0');
  });
});
