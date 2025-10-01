// src/components/App.js
// 🟡 Added useSelector to access tokens/account.
// 🟡 Added a useEffect that subscribes to token Transfer events and cleans up on change.
// 🟡 Everything else kept as-is.

import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux' // 🟡
import { Container } from 'react-bootstrap'

// Components
import { setTokenContracts, setSymbols, balancesLoaded } from '../store/reducers/tokens'   // 🟡
import { setBridgeContracts } from '../store/reducers/bridge'                               // 🟡
import Navigation from './Navigation';
import TransferCard from './TransferCard';
import Footer from './Footer'
import config from '../config.json'; // <-- add this

import {
  loadProvider,
  loadNetwork,
  loadAccount,
  loadContracts,  // ✅ (your AMM: loadTokens)
  loadBridge,      // ✅ (your AMM: loadAMM)
  subscribeReceiverExecuted,   // 🟡
  loadBalances
} from '../store/interactions'

function App() {

  const dispatch = useDispatch()

  // 🟡 Access tokens/account to wire subscriptions
  const provider = useSelector((state) => state.provider.connection)          // 🟡
  const tokens  = useSelector((state) => state.tokens.contracts)    // 🟡
  const account = useSelector((state) => state.provider.account)    // 🟡

  const receiver = useSelector(state => state.bridge.contracts[1])  // 🟡

  const loadEverythingForChain = async (provider, chainId) => {
    const SUPPORTED = Number(config?.chains?.sepolia ?? 11155111) // 🔵
    // Only init contracts on supported chain(s)
    if (chainId === SUPPORTED) {
      await loadContracts(provider, chainId, dispatch) // 🔵
      await loadBridge(provider, chainId, dispatch)    // 🔵
    } else {
      // Clear contracts and zero balances when not on a supported chain                       // 🟡
      dispatch(setTokenContracts([null, null]))                                               // 🟡
      dispatch(setSymbols(['aUSDC']))                                                         // 🟡 (keep default symbol)
      dispatch(balancesLoaded(['0', '0']))                                                    // 🟡
      dispatch(setBridgeContracts([null, null]))                                              // 🟡
    }
  }

  // Bootstrap app: provider, network, contracts + listeners
  const loadBlockchainData = async () => {
    // Initiate provider
    const provider = await loadProvider(dispatch)

    // Fetch current network's chainId (e.g. hardhat: 31337, kovan: 42)
    const chainId = await loadNetwork(provider, dispatch)

    // Initialize (conditional by chain)
    await loadEverythingForChain(provider, chainId) // 🔵

    // Reload page when network changes
    const chainChangedHandler = async () => {       // 🔵 no page reload
      try {
        const newChainId = await loadNetwork(provider, dispatch)
        await loadEverythingForChain(provider, newChainId) // 🔵 re-init if supported
      } catch (e) {
        console.error('chainChanged handler failed:', e)
      }
    }

    // Fetch accounts on change
    const accountsChangedHandler = async () => {
      try {
        await loadAccount(dispatch)
        const current = await loadNetwork(provider, dispatch) // ensure chainId reflects MM
        await loadEverythingForChain(provider, current)        // 🔵
      } catch (e) {
        console.error('accountsChanged handler failed:', e)
      }
    }

    if (window.ethereum) {
      window.ethereum.on('chainChanged', chainChangedHandler)
      window.ethereum.on('accountsChanged', accountsChangedHandler)
    }

    // Initiate contracts
    await loadContracts(provider, chainId, dispatch) // ✅ ()
    await loadBridge(provider, chainId, dispatch)    // ✅ ()

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('chainChanged', chainChangedHandler) // 🔵
        window.ethereum.removeListener('accountsChanged', accountsChangedHandler) // 🔵
      }
    }

    // setIsLoading(false)
  }

  useEffect(() => {
    (async () => {                      // 🔵
      try {
        const cleanup = await loadBlockchainData()
        return cleanup
      } catch (e) {
        alert(e.message || 'Failed to initialize provider') // 🔵
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🟡 App.js – wire the receiver event
  useEffect(() => {                                                // 🟡
    if (!receiver) return                                          // 🟡
    const unsub = subscribeReceiverExecuted(receiver, dispatch)    // 🟡
    return () => { try { unsub && unsub() } catch {} }             // 🟡
  }, [receiver])                                                   // 🟡

  // Instant balance refresh when provider/account/tokens change
  useEffect(() => {
    if (provider && account && tokens?.[0]) {
      loadBalances(tokens, account, dispatch)
    }
  }, [provider, account, tokens, dispatch])

  return (
    <>
      <Navigation />
      <Container>
        <TransferCard />
      </Container>
      <Footer />
    </>
  );
}

export default App;

