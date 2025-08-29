import { useSelector, useDispatch } from 'react-redux'
import Navbar from 'react-bootstrap/Navbar';
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Blockies from 'react-blockies'
import ThemeSwitcher from './ThemeSwitcher'   // + add

import logo from '../logo.png';

import { loadAccount } from '../store/interactions'

import config from '../config.json'

const Navigation = () => {
  const chainId = useSelector(state => state.provider.chainId)
  const account = useSelector(state => state.provider.account)

  const dispatch = useDispatch()

  const connectHandler = async () => {
    const account = await loadAccount(dispatch)
  }

  const networkHandler = async (e) => {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: e.target.value }],
    })
  }

  const theme =
    localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  
  const borderColor = theme === 'dark' ? 'rgba(255,255,255,.08)' : 'rgba(220, 220, 220, 0.1)';

return (
  <Navbar
    expand="lg"
    sticky="top"
    className="py-2"
    style={{
      position: 'sticky',
      top: 0,
      zIndex: 2000,                          // ensure it’s above content
      background: 'var(--bs-body-bg)',       // solid bg so content can’t intercept clicks
      borderBottom: '1px solid var(--nav-divider)'
    }}
  >

      <div className="w-100 d-flex align-items-center">
        {/* left: logo + brand */}
        <div className="d-flex align-items-center">
          <img alt="logo" src={logo} width="70" height="70" className="me-2" />
          <Navbar.Brand className="mb-0">One-Click USDC Bridge</Navbar.Brand>
        </div>

        {/* right: network + connect/account + theme */}
        <div className="d-flex align-items-center ms-auto gap-2">
          <Form.Select
            aria-label="Network Selector"
            value={config[chainId] ? `0x${chainId.toString(16)}` : `0`}
            onChange={networkHandler}
            style={{ width: 170 }}
          >
            <option value="0" disabled>Select Network</option>
            <option value="0x7A69">Localhost</option>
            <option value="0x5">Sepolia</option>
          </Form.Select>

          {account ? (
            <div className="d-flex align-items-center">
              <span className="me-2">{account.slice(0,5) + '...' + account.slice(38,42)}</span>
              <Blockies seed={account} size={10} scale={3}
              color="#2187D0" bgColor="#F1F2F9" spotColor="#767F92" />
            </div>
          ) : (
            <Button onClick={connectHandler}>Connect</Button>
          )}

          <ThemeSwitcher /> {/* ← sits on the same row */}
        </div>
      </div>
    </Navbar>
  );
}

export default Navigation;
