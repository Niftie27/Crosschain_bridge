import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { Container } from 'react-bootstrap'
import { ethers } from 'ethers'

// Components
import Navigation from './Navigation';
import Loading from './Loading';
import TransferCard from './TransferCard';

import {
  loadProvider,
  loadNetwork,
  loadAccount,
  loadContracts,  // ✅ (your AMM: loadTokens)
  loadBridge      // ✅ (your AMM: loadAMM)
} from '../store/interactions'

function App() {

  const dispatch = useDispatch()

  const loadBlockchainData = async () => {
    // Initiate provider
    const provider = await loadProvider(dispatch)

    // Fetch current network's chainId (e.g. hardhat: 31337, kovan: 42)
    const chainId = await loadNetwork(provider, dispatch)

    // Reload page when network changes
    window.ethereum.on('chainChanged', () => {
      window.location.reload()
    })

    // Fetch accounts
    window.ethereum.on('accountsChanged', async () => {
      await loadAccount(dispatch)
    })

    // Initiate contracts
    await loadContracts(provider, chainId, dispatch) // ✅ (was loadTokens)
    await loadBridge(provider, chainId, dispatch)    // ✅ (was loadAMM)
    // await loadTokens(provider, chainId, dispatch)
    // setIsLoading(false)
  }

  useEffect(() => {
    loadBlockchainData()
  }, []);

    return (
  <>
    <Navigation />

    <Container>
      <TransferCard></TransferCard>
    </Container>
  </>
  )
}

export default App;

