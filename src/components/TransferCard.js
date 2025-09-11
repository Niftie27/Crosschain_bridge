import React, { useState, useEffect } from 'react' 
import { useDispatch, useSelector } from 'react-redux'
import { Card, Button, Dropdown } from 'react-bootstrap';
import { Gear } from "react-bootstrap-icons";
import './TransferCard.css';

import {
  loadAccount,        // ✅ keep connect here
  loadBalances,       // ✅ minimal read from UI
  bridge as bridgeAction
} from '../store/interactions'

import config from '../config.json'     

const CHAIN_META = {
  "Ethereum Sepolia": {
    name: "Ethereum Sepolia",
    logo: "https://assets.coingecko.com/coins/images/279/standard/ethereum.png",
  },
  "Avalanche Fuji": {
    name: "Avalanche Fuji",
    logo: "https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png",
  },
};

// ✅ token metadata (only one option for now)
const TOKEN_META = {
  axlUSDC: {
    symbol: 'axlUSDC',
    name: 'Axelar USDC',
    logo: 'https://assets.coingecko.com/coins/images/26476/standard/uausdc_D_3x.png',
  },
};

const TransferCard = () => {

  const dispatch  = useDispatch()

  // -------- Global (Redux) --------
  const provider = useSelector((state) => state.provider.connection)
  const account  = useSelector((state) => state.provider.account)
  const tokens   = useSelector((state) => state.tokens.contracts)     // ✅ MOVED ABOVE any usage
  const balances = useSelector((state) => state.tokens.balances)
  const [sender, receiver] =
    useSelector((state) => state.bridge.contracts) || [null, null]
  const isBridging = useSelector((state) => state.bridge.bridging.isBridging)

  // -------- Local UI state --------
  const [fromAmount, setFromAmount] = useState('0.0')  // ✅ CHANGED: string (not number)
  const [toAmount,   setToAmount]   = useState('0.0')  // ✅ CHANGED: string
  const [fromToken,  setFromToken]  = useState('axlUSDC')
  const [toToken,    setToToken]    = useState('axlUSDC')

  // ✅ Default route: Sepolia → Fuji
  const [fromChain, setFromChain] = useState('Ethereum Sepolia')
  const [toChain,   setToChain]   = useState('Avalanche Fuji')

  const [openMenu, setOpenMenu] = useState(null) // (unused; fine to keep or remove)

  // ✅ locals used in onBridge (simple + readable)
  const defaultGasEth   = config.bridge?.defaultGasEth || '0.03'
  const receiverAddress = config['43113']?.receiverFuji || ''
  const ausdcSepolia    = tokens?.[0] || null                    // ✅ NOW SAFE: tokens is already defined
  const isSupportedRoute =
    fromChain === 'Ethereum Sepolia' && toChain === 'Avalanche Fuji'

  // (optional UX) swap button
  const handleSwapTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setFromChain(toChain);
    setToChain(fromChain);
    setOpenMenu(null);
  };

  // ❌ Removed loading contracts here (App already did it)
  // ✅ Keep a minimal effect to refresh balances when account or token contracts present
  // -------- Refresh balances when ready --------
  useEffect(() => {
    (async () => {
      if (provider && tokens?.[0] && tokens?.[1] && account) {
        await loadBalances(tokens, account, dispatch)              // ✅
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, tokens, provider])

  const onConnect = async () => {                                     // ✅
    await loadAccount(dispatch)
  }

  const onBridge = async () => {                                      // ✅
    if (!provider || !account || !sender || !ausdcSepolia) return
    if (!isSupportedRoute || !receiverAddress) return

    const amt = (fromAmount || '0').trim()
    if (Number(amt) <= 0) return

    await bridgeAction(
      provider,       // ethers.Web3Provider
      account,        // wallet
      sender,         // USDCSender
      ausdcSepolia,   // aUSDC (Sepolia)
      amt,            // amount
      defaultGasEth,  // axelar prepay (simple default)
      account,        // recipient = wallet
      receiverAddress,// USDCReceiver on Fuji
      dispatch        // dispatch last (AMM style)
    )

    setToAmount(amt) // simple 1:1 reflection
    // Optionally re-read balances after bridging:
    // await loadBalances(tokensArr, account, dispatch)
  }

  // ✅ button state/label (clean)
  const ctaLabel = !account
    ? 'Connect Wallet'
    : isBridging
      ? 'Bridging...'
      : 'Bridge'

  const ctaDisabled = !account || isBridging

  // ===== Chain dropdown (Chain & Token dropdowns kept as in your file) =====
  const ChainSelect = ({ value, onChange, ariaLabel }) => {
    const meta = CHAIN_META[value];

    const Toggle = React.forwardRef(({ onClick, ...props }, ref) => (
      <button
        ref={ref}
        className="xy-token xy-chain"
        type="button"
        aria-label={ariaLabel}
        aria-expanded={props['aria-expanded']}
        onClick={(e) => { e.preventDefault(); onClick(e); }}
      >
        <div className="xy-token-meta">
          <div className="xy-token-logo">
            {meta?.logo ? (
              <img alt={value} src={meta.logo} />
            ) : (
              <svg viewBox="0 0 24 24" width="28" height="28">
                <circle cx="12" cy="12" r="10" className="xy-softdisk"/>
              </svg>
            )}
          </div>
          <div className="xy-token-text">
            <span className="xy-token-symbol">{value}</span>
            <span className="xy-token-name">Testnet</span>
          </div>
        </div>

        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </button>
    ));
    Toggle.displayName = "ChainToggle";

    return (
      <Dropdown>
        <Dropdown.Toggle as={Toggle} id={`${ariaLabel}-toggle`} />
        <Dropdown.Menu className="xy-menu" align="end">
          {Object.keys(CHAIN_META).map((chain) => {
            const m = CHAIN_META[chain];
            const active = chain === value;
            return (
              <Dropdown.Item
                as="button"
                key={chain}
                onClick={() => onChange(chain)}
                className={`xy-menu-item${active ? " active" : ""}`}
              >
                <div className="xy-token-meta">
                  <div className="xy-token-logo">
                    {m.logo ? <img alt={chain} src={m.logo} /> : null}
                  </div>
                  <div className="xy-token-text">
                    <span className="xy-token-symbol">{chain}</span>
                    <span className="xy-token-name">Testnet</span>
                  </div>
                </div>
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown>
    );
  };

  // ===== ✅ Token dropdown (identical for FROM/TO; single option axlUSDC) =====
  const TokenSelect = ({ value, onChange, ariaLabel }) => {
    const meta = TOKEN_META[value] || TOKEN_META.axlUSDC;

    const Toggle = React.forwardRef(({ onClick, ...props }, ref) => (
      <button
        ref={ref}
        className="xy-token"
        type="button"
        aria-label={ariaLabel}
        aria-expanded={props['aria-expanded']}
        onClick={(e) => { e.preventDefault(); onClick(e); }}
      >
        <div className="xy-token-meta">
          <div className="xy-token-logo">
            <img alt={meta.symbol} src={meta.logo} />
          </div>
          <div className="xy-token-text">
            <span className="xy-token-symbol">{meta.symbol}</span>
            <span className="xy-token-name">{meta.name}</span>
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>
    ));
    Toggle.displayName = "TokenToggle";

    return (
      <Dropdown>
        <Dropdown.Toggle as={Toggle} id={`${ariaLabel}-toggle`} />
        <Dropdown.Menu className="xy-menu" align="end">
          <Dropdown.Item
            as="button"
            onClick={() => onChange('axlUSDC')}
            className={`xy-menu-item${value === 'axlUSDC' ? " active" : ""}`}
          >
            <div className="xy-token-meta">
              <div className="xy-token-logo">
                <img alt="axlUSDC" src={TOKEN_META.axlUSDC.logo} />
              </div>
              <div className="xy-token-text">
                <span className="xy-token-symbol">{TOKEN_META.axlUSDC.symbol}</span>
                <span className="xy-token-name">{TOKEN_META.axlUSDC.name}</span>
              </div>
            </div>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    );
  };

  return (
    <div className="transfer-container">
      <Card className="xy-card">
        <Card.Body className="xy-body">
          {/* Header */}
          <div className="xy-header">
            <h3 className="xy-title">Transfer</h3>
            <div className="xy-actions">
              <button className="xy-iconbtn" type="button" aria-label="Settings">
                <Gear size={20} />
              </button>
            </div>
          </div>

          {/* Networks (chains) */}
          <div className="xy-netbar">
            <div className="xy-netcol">
              <span className="xy-label">From</span>
              <ChainSelect
                value={fromChain}
                onChange={setFromChain}
                ariaLabel="Select from chain"
              />
              <div className="xy-help">{fromChain === 'Ethereum Sepolia' && balances?.[0] ? <small>Balance: {balances[0]} axlUSDC</small> : null}</div> {/* ✅ */}
            </div>

            <div className="xy-netcol">
              <span className="xy-label">To</span>
              <ChainSelect
                value={toChain}
                onChange={setToChain}
                ariaLabel="Select to chain"
              />
              <div className="xy-help">{toChain === 'Avalanche Fuji' && balances?.[1] ? <small>Balance: {balances[1]} axlUSDC</small> : null}</div>   {/* ✅ */}
            </div>
          </div>

          {/* FROM */}
          <div className="xy-row">
            <div className="xy-left">
              <span className="xy-label">From</span>
              <input
                className="xy-amount"
                placeholder="0.0"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                inputMode="decimal"
              />
              <span className="xy-sub">≈ $ 0</span>
            </div>

            {/* ✅ token dropdown */}
            <TokenSelect
              value={fromToken}
              onChange={setFromToken}
              ariaLabel="Select from token"
            />
          </div>

          {/* swap button (mid-card) */}
          <div className="xy-swap-wrap">
            <button className="xy-swap" onClick={handleSwapTokens} aria-label="Swap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </button>
          </div>

          {/* TO (identical to FROM) */}
          <div className="xy-row">
            <div className="xy-left">
              <span className="xy-label">To</span>
              <input
                className="xy-amount"
                placeholder="0.0"
                value={toAmount}
                onChange={(e) => setToAmount(e.target.value)}
                inputMode="decimal"
              />
              <span className="xy-sub">≈ $ 0</span>
            </div>

            {/* ✅ token dropdown */}
            <TokenSelect
              value={toToken}
              onChange={setToToken}
              ariaLabel="Select to token"
            />
          </div>

          {/* Exchange rate */}
          <div className="xy-meta">
            <span>Exchange Rate</span>
            <span>-</span>
          </div>

          {/* CTA */}
          <Button
            className="xy-cta"
            disabled={ctaDisabled}
            onClick={!account ? onConnect : onBridge}                // ✅ connect or bridge
            title={!isSupportedRoute ? 'Only Sepolia → Fuji supported right now' : undefined}
          >
            {ctaLabel}
          </Button>
        </Card.Body>
      </Card>
    </div>
  );
};

export default TransferCard;
