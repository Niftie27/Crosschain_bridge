import { useSelector, useDispatch } from 'react-redux'
import { useEffect } from 'react'

import Navbar from 'react-bootstrap/Navbar';
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'

import Blockies from 'react-blockies'
import ThemeSwitcher from './ThemeSwitcher'
import './Navigation.css';

import logo from '../logo.png';   

import { loadAccount } from '../store/interactions'

const Navigation = () => {

  const chainId = useSelector(state => state.provider.chainId)
  const account = useSelector(state => state.provider.account)

  const dispatch = useDispatch()

  const connectHandler = async () => {                                   // 🔵
    try {                                                                 // 🔵
      await loadAccount(dispatch)                                         // 🔵
    } catch (e) {                                                         // 🔵
      alert(e.message || 'MetaMask not detected. Please install or enable it.') // 🔵
    }                                                                     // 🔵
  }                                                                       // 🔵

  const networkHandler = async (e) => {
    const chainHex = e.target.value
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainHex }],
      })
    } catch (err) {
      if (err?.code === 4902 && chainHex.toLowerCase() === '0xaa36a7') {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0xaa36a7',
            chainName: 'Sepolia',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://rpc.sepolia.org'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          }],
        });
      } else {
        console.error(err)
      }
    }
  }

  useEffect(() => {
    const onApproved = () => {}
    window.addEventListener('bridge:approved', onApproved)
    return () => window.removeEventListener('bridge:approved', onApproved)
  }, [])

  return (
    <Navbar
      expand="lg"
      sticky="top"
      className="py-2 sticky-top bg-body"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 2000,                                  // NEW: keep navbar above the card
        background: 'var(--bs-body-bg)',

      }}
    >
      <div className="w-100 d-flex align-items-center">
        {/* left: logo + brand */}
        <div className="d-flex align-items-center">
          <img alt="logo" src={logo} width="70" height="70" className="me-2" />
          <Navbar.Brand className="mb-0">USDC Bridge (powered by Axelar)</Navbar.Brand>
        </div>

        

        {/* right: network + connect/account + theme */}
        
        <div className="d-flex align-items-center ms-auto gap-2" style={{ position: 'relative' }}>
          <div className="net-select-wrap">                                           
            
             <Form.Select                                                             
               aria-label="Network Selector"                                          
               value={chainId ? `0x${chainId.toString(16)}` : '0'}                    
               onChange={networkHandler}
               className={`net-select ${chainId === 11155111 ? 'select--with-eth' : ''}`}
               style={{ width: 170 }}                     
             >
               <option value="0" disabled>Select Network</option>
               <option value="0x7a69">Localhost</option> {/* 31337 */}
               <option value="0xaa36a7">Sepolia</option> {/* 11155111 */}
             </Form.Select>
             
                                                                                                                                 
           </div>

          {account ? (
            <div className="d-flex align-items-center">
              <span className="me-2">{account.slice(0,5) + '...' + account.slice(38,42)}</span>
              <Blockies seed={account} size={10} scale={3}
                color="#2187D0" bgColor="#F1F2F9" spotColor="#767F92" />
            </div>
          ) : (
            <Button onClick={connectHandler} className="btn-connect">Connect</Button>
          )}

          <ThemeSwitcher />
        </div>
      </div>
    </Navbar>
  );
}

export default Navigation;
