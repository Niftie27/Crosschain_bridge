import React from 'react';
import { Card, Button, Dropdown } from 'react-bootstrap';
import { Gear } from "react-bootstrap-icons";
import './TransferCard.css';

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
  const [fromAmount, setFromAmount] = React.useState('0.0');
  const [toAmount, setToAmount] = React.useState('0.0');

  // ✅ initialize to the only allowed token
  const [fromToken, setFromToken] = React.useState('axlUSDC');
  const [toToken, setToToken] = React.useState('axlUSDC');

  const [fromChain, setFromChain] = React.useState('Avalanche Fuji');
  const [toChain, setToChain] = React.useState('Ethereum Sepolia');

  // (not required anymore, but harmless if you keep it)
  const [openMenu, setOpenMenu] = React.useState(null);

  const handleSwapTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setFromChain(toChain);
    setToChain(fromChain);
    setOpenMenu(null);
  };

  // ===== Chain dropdown (your version, with tiny aria fix) =====
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
            </div>

            <div className="xy-netcol">
              <span className="xy-label">To</span>
              <ChainSelect
                value={toChain}
                onChange={setToChain}
                ariaLabel="Select to chain"
              />
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
          <Button className="xy-cta">Connect Wallet</Button>
        </Card.Body>
      </Card>
    </div>
  );
};

export default TransferCard;
