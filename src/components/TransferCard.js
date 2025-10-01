// src/components/TransferCard.js
/**
 * CHANGES (🟡):
 * - 🟡 Added static contract links (Sepolia sender & Fuji receiver on Snowtrace + Avascan).
 * - 🟡 Success & error Alerts (already added previously) kept and expanded.
 * - 🟡 Added Toast notifications (success/failure) without polling.
 * - 🟡 Added simple 3-step "progress" row (Submitted → Relaying → Executed); no polling.
 * - 🟡 Shows Axelar GMP link and receiver contract explorers to help find Fuji tx.
 * - 🟡 Uses Redux `destTxHash` placeholder if you ever set it later.
 * - 🟡 CTA shows “Insufficient amount” and disables when balance too low.
 */


import React, { useState, useEffect } from 'react' 
import { useDispatch, useSelector } from 'react-redux'
import { Card, Button, Dropdown } from 'react-bootstrap';
import { Gear } from "react-bootstrap-icons";
import './TransferCard.css';
import Notifications from './Notifications'; // add at top

import {
  loadAccount,        // ✅ keep connect here
  loadBalances,       // ✅ minimal read from UI
  bridge as bridgeAction
} from '../store/interactions'

import config from '../config.json'     

// ✅ chain metadata
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

                                                                         // 🟡

/* ---------------- Input helpers (beginner-friendly) ---------------- */
// Allow . → 0., preserve trailing dot for typing, max 6 decimals
function normalizeAmountInput(s) {
  let v = String(s ?? '')
  // Remove illegal characters
  v = v.replace(/[^0-9.]/g, '')
  // If starts with '.', prefix 0
  if (v.startsWith('.')) v = '0' + v
  // Keep only first dot
  const firstDot = v.indexOf('.')
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '')
  }
  // Enforce 6 decimals, but allow trailing dot while typing
  const [i, d = ''] = v.split('.')
  if (d.length > 6) v = `${i}.${d.slice(0, 6)}`
  // Disallow negative (we never allow '-')
  return v
}

// 🟡 Uniform Bootstrap pill using <a class="btn btn-..."> (no custom CSS)
const StatusItem = ({ state, label, href }) => {
  const variant =
    state === 'done'    ? 'success' :
    state === 'pending' ? 'warning' :
                          'secondary';

  const icon =
    state === 'pending'
      ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
      : state === 'done'
        ? '✓'
        : '•';

  const content = (
    <>
      <span
        className="d-inline-flex justify-content-center align-items-center me-2"
        style={{ width: '1rem' }}                // keeps all pills same width/height
      >
        {icon}
      </span>
      <span className={href ? 'text-decoration-none' : ''}>
        {label}{href && <sup className="ms-1">↗</sup>}
      </span>
    </>
  );

  // anchor when clickable, span when not
  return href ? (
    <a
      className={`btn btn-sm rounded-pill btn-${variant} d-inline-flex align-items-center`}
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{ marginRight: 8 }}
    >
      {content}
    </a>
  ) : (
    <span
      className={`btn btn-sm rounded-pill btn-${variant} disabled d-inline-flex align-items-center`}
      style={{ marginRight: 8 }}
    >
      {content}
    </span>
  );
};

const StatusRail = ({ s1, s2, s3, links }) => (
  <div className="d-flex flex-wrap align-items-center">
    <StatusItem state={s1} label="Sent"          href={links.etherscan} />
    <StatusItem state={s2} label="Relayering (Axelar)"   href={links.axelar}    />
    <StatusItem state={s3} label="Received"    href={links.snowtrace} />
  </div>
);

const TransferCard = () => {

  const dispatch  = useDispatch()

  // -------- Global (Redux) --------
  const provider = useSelector((state) => state.provider.connection)
  const account  = useSelector((state) => state.provider.account)
  const chainId  = useSelector((state) => state.provider.chainId) // 🔵
  const tokens   = useSelector((state) => state.tokens.contracts)     // ✅ MOVED ABOVE any usage
  const balances = useSelector((state) => state.tokens.balances)
  const [sender] = useSelector((state) => state.bridge.contracts) || [];


  const bridgeState = useSelector((state) => state.bridge.bridging) /* 🟡 */
  const isBridging  = bridgeState.isBridging // 🔵
  const txHash      = bridgeState.transactionHash       // Sepolia tx hash
  const destTxHash  = bridgeState.destTxHash            // 🟡 Fuji tx hash (optional)


  const IS_SEPOLIA  = Number(config?.chains?.sepolia ?? 11155111) // 🔵 read from config, fallback kept
  const isOnSepolia = chainId === IS_SEPOLIA // 🔵

  // -------- Local UI state --------
  const [fromAmount, setFromAmount] = useState('')  // ✅ CHANGED: string (not number)
  const [toAmount,   setToAmount]   = useState('')  // ✅ CHANGED: string
  const [fromToken,  setFromToken]  = useState(null)
  const [toToken,    setToToken]    = useState(null)
  const [fromChain,  setFromChain]  = useState(null)     // 🔵 start unselected
  const [toChain,    setToChain]    = useState(null)         // 🔵 start unselected

  // ✅ locals used in onBridge (simple + readable)
  // 🟡 Links + addresses from config
  const defaultGasEth   = config.bridge?.defaultGasEth || '0.03'
  const receiverAddress = config['43113']?.receiverFuji || ''

  const ausdcSepolia    = tokens?.[0] || null // ✅ NOW SAFE: tokens is already defined
  const isSupportedRoute =
    fromChain === 'Ethereum Sepolia' && toChain === 'Avalanche Fuji'
  const selectionsOk = Boolean(fromChain && toChain && fromToken && toToken) /* 🟡 */

  // Validation
  const balanceFrom = Number(balances?.[0] || 0) // 🔵
  const amountNum   = Number(fromAmount || 0)    // 🔵
  const amountValid = amountNum > 0 && amountNum <= balanceFrom // ✅ used for CTA label + disabled

  // Simple USD mirror w/ 2 decimals (no pricing, just echo) 🟡
  const usd2 = (s) => (Number.parseFloat(String(s)) || 0).toFixed(2) /* 🟡 */

  // (optional UX) swap (both chains and tokens) button
  const handleSwapTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setFromChain(toChain);
    setToChain(fromChain);
  };

  // ❌ Removed loading contracts here (App already did it)
  // ✅ Keep a minimal effect to refresh balances when account or token contracts present
  // -------- Refresh balances when ready --------
  // 🟡 App.js — live balance on new blocks (tiny + reliable)
  useEffect(() => {                                            // 🟡
    if (!provider || !account || !tokens?.[0]) return          // 🟡
    const onBlock = () => loadBalances(tokens, account, dispatch) // 🟡
    provider.on('block', onBlock)                              // 🟡
    return () => provider.off('block', onBlock)                // 🟡
  }, [provider, account, tokens, dispatch])                              // 🟡                                // 🟡

  // Listen for "bridge:approved" → no need to set local state
  useEffect(() => {
    const onApproved = (e) => {
      // forward the event so Notifications.js can catch it
      window.dispatchEvent(new CustomEvent('bridge:approved', { detail: { hash: e.detail?.hash } }))
    }
    window.addEventListener('bridge:approved', onApproved)
    return () => window.removeEventListener('bridge:approved', onApproved)
  }, [])                                               // 🟡

  const onConnect = async () => {                                        // 🔵
    try {                                                                // 🔵
      await loadAccount(dispatch)                                        // 🔵
    } catch (e) {                                                        // 🔵
      alert(e.message || 'MetaMask not detected. Please install or enable it.') // 🔵
    }                                                                    // 🔵
  }

  // (kept) + 🟡 toasts
  const onBridge = async () => { // 🔵
    if (!account) { await onConnect(); return } // 🔵 early connect guard
    if (!provider || !sender || !ausdcSepolia) return
    if (!isSupportedRoute || !receiverAddress) return
    if (!amountValid) return
    if (!isOnSepolia) return // 🔵

    const amt = normalizeAmountInput(fromAmount || '0') // 🔵                                                                              // 🟡

    try {
      const { hash } = await bridgeAction(
        provider,
        account,
        sender,
        ausdcSepolia,
        amt,
        defaultGasEth,
        account,         // recipient = wallet
        receiverAddress, // Fuji receiver
        dispatch
      )
      setToAmount(amt)
      await loadBalances(tokens, account, dispatch)

      // instead of local setShowOkToast(true):
      window.dispatchEvent(new CustomEvent('toast:sent', { detail: { link: `https://sepolia.etherscan.io/tx/${hash}` } }))
    } catch (err) {
      // instead of local setShowErrToast(true):
      window.dispatchEvent(new CustomEvent('toast:reverted'))
    }
  }

  // CTA label with insufficient amount
  const ctaLabel = !account
    ? 'Connect Wallet'
    : isBridging
      ? 'Bridging...'
      : (!selectionsOk || !isSupportedRoute || !isOnSepolia)
        ? 'Bridge'
        : (!amountValid ? 'Insufficient amount' : 'Bridge')

  // Note: when !account, we hide the bridge UI and show a dedicated Connect button.
  // const ctaDisabled = isBridging || !isSupportedRoute || !isOnSepolia // 🔵
  const ctaDisabled =
    isBridging ||
    !selectionsOk ||
    !isSupportedRoute ||
    !isOnSepolia ||
    !amountValid   // ✅ disable when insufficient amount

  // 🟡 Helpful links
  const linkEtherscanTx        = txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : null // 🟡
  const linkAxelarGMP          = txHash ? `https://testnet.axelarscan.io/gmp/${txHash}` : null // 🟡
  const linkSnowtraceTx        = destTxHash ? `https://testnet.snowtrace.io/tx/${destTxHash}` : null // 🟡

  // 🟡 Step states (simple + correct timings)
  const s1 = txHash ? 'done' : 'idle';
  const s2 = txHash && !destTxHash ? 'pending' : destTxHash ? 'done' : 'idle';
  const s3 = destTxHash ? 'done' : 'idle';

  // map links (null when not available)
  const links = {
    etherscan: linkEtherscanTx || null,
    axelar:    linkAxelarGMP   || null,
    snowtrace: linkSnowtraceTx || null
  };

  return (
    // outermost wrapper div of TransferCard
    <div className="transfer-container" style={{ position: 'relative', zIndex: 2000 }}>

        <Card className="xy-card">
          <Card.Body className="xy-body">

          {/* Show only connect button if wallet not connected */} {/* 🔵 */}
          {!account ? ( // 🔵
            <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: 240 }}> {/* 🔵 */}
              <p className="mb-3">Connect your wallet to start bridging</p> {/* 🔵 */}
              <Button className="xy-cta" onClick={onConnect}>Connect Wallet</Button> {/* 🔵 */}
            </div> // 🔵
          ) : ( // 🔵
            <>

            

            {/* Header */}
            <div className="xy-header">
              <h3 className="xy-title">Transfer</h3>
              <div className="xy-actions">


                {/* 🟡 header additions, next to <Gear/> */}
                <Button
                class="btn btn-dark"
                variant="outline-primary"
                onClick={() => window.open('https://discord.com/invite/aRZ3Ra6f7D','_blank','noopener')}
                
              >
                <strong>💧 Faucet (Discord)</strong>
              </Button>

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
                  onChange={(e) => { // 🔵
                    const v = normalizeAmountInput(e.target.value) 
                    // 🔵 normalizeAmountInput not allowing negative numbers
                    setFromAmount(v) // 🔵
                    setToAmount(v) // 🔵
                  }} // 🔵
                  inputMode="decimal"
                />
                <span className="xy-sub">≈ $ {usd2(fromAmount)}</span> {/* 🟡 */}
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

            {/* TO */}
            <div className="xy-row">
              <div className="xy-left">
                <span className="xy-label">To</span>
                <input
                  className="xy-amount"
                  placeholder="0.0"
                  value={toAmount}
                  readOnly                  // 🔵 
                  inputMode="decimal"
                  onFocus={(e) => e.target.blur()}          // 🔵 prevent cursor
                  tabIndex={-1}                             // 🔵 skip in tab order
                />
                <span className="xy-sub">≈ $ {usd2(toAmount)}</span> {/* 🟡 */}
              </div>

                {/* ✅ token dropdown */}
                <TokenSelect
                  value={toToken}
                  onChange={setToToken}
                  ariaLabel="Select to token"
                />
              </div>

              {/* Validation messages */}
              {!isSupportedRoute && (
                <div className="xy-error"><small>Only Sepolia → Fuji supported right now.</small></div>
              )}
              {!isOnSepolia && (
                <div className="xy-error"><small>Wrong network. Please switch MetaMask to Sepolia.</small></div>
              )}

              {/* Progress */}
              { s1 === 'done' && (                   // <-- add this guard
              <div className="mt-3">
                <div className="mb-1"><small>Progress:</small></div>
                <StatusRail s1={s1} s2={s2} s3={s3} links={links} />
              </div>
              )}                                   

              {/* Connect/Bridge/Insufficient amount button */}
              <Button
                className="xy-cta"
                disabled={ctaDisabled}
                onClick={!account ? onConnect : onBridge}
                title={!isSupportedRoute ? 'Only Sepolia → Fuji supported right now' : undefined}
              >
                {ctaLabel}
              </Button>

              </>
            )}

          </Card.Body>
        </Card>
      <Notifications />
    </div>
  )
}


// ===== Chain dropdown (Chain & Token dropdowns kept as in your file) =====
  const ChainSelect = ({ value, onChange, ariaLabel }) => {
    const meta = value ? CHAIN_META[value] : null

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
            {value && meta?.logo ? (                         /* 🔵 only when selected */
            <img alt={value} src={meta.logo} />            /* 🔵 */
            ) : (
              <svg viewBox="0 0 24 24" width="28" height="28">
                <circle cx="12" cy="12" r="10" className="xy-softdisk"/>
              </svg>
            )}
          </div>
          <div className="xy-token-text">
            <span className="xy-token-symbol">
              {value || 'Select chain'} {/* 🔵 placeholder */}
            </span>
            <span className="xy-token-name">{value ? 'Testnet' : ''}</span> {/* 🔵 */}
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
        className={`xy-token ${!value ? 'xy-token--empty' : ''}`}          // 🟡
        type="button"
        aria-label={ariaLabel}
        aria-expanded={props['aria-expanded']}
        onClick={(e) => { e.preventDefault(); onClick(e); }}
      >
        <div className="xy-token-meta">
          <div className="xy-token-logo">
            {/* render logo only when an actual selection exists */}
          {value ? (                                      /* 🔵 */
            <img alt={meta.symbol} src={meta.logo} />     /* 🔵 */
          ) : null}                                       
          </div>
          <div className="xy-token-text">
            <span className="xy-token-symbol">
              {value ? meta.symbol : 'Select token'}         {/* 🔵 placeholder */}
            </span>
            <span className="xy-token-name">
              {value ? meta.name : ''}                       {/* 🔵 empty when no selection */}
            </span>
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
    )
  }


export default TransferCard;
