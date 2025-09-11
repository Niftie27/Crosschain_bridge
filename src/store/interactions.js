import { ethers } from 'ethers'

// provider slice
import {
  setProvider,
  setNetwork,
  setAccount
} from './reducers/provider'

import {
  setTokenContracts,
  setSymbols,
  balancesLoaded,
} from './reducers/tokens'

import {
  setBridgeContracts,
  bridgeRequest,
  bridgeSuccess,
  bridgeFail,
} from './reducers/bridge'

// ABIs + config
import TOKEN_ABI from '../abis/Token.json'
import SENDER_ABI from '../abis/USDCSender.json'
import RECEIVER_ABI from '../abis/USDCReceiver.json'
import config from '../config.json';


export const loadProvider = (dispatch) => {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  dispatch(setProvider(provider))

  return provider
}

export const loadNetwork = async (provider, dispatch) => {
  const { chainId } = await provider.getNetwork()
  dispatch(setNetwork(chainId))

  return chainId
}

export const loadAccount = async (dispatch) => {
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  const account = ethers.utils.getAddress(accounts[0])
  dispatch(setAccount(account))

  return account
}


// ----------------- Load contracts (AMM style) -----------------
export const loadContracts = async (provider, chainId, dispatch) => {
  // Sepolia section from config
  const sepolia = config["11155111"]
  const fuji = config["43113"]

  const signer = provider.getSigner()

  // Sepolia (write)
  const ausdcSepolia = new ethers.Contract(sepolia.ausdcSepolia, TOKEN_ABI, signer)
  // const sender       = new ethers.Contract(sepolia.senderSepolia, SENDER_ABI, signer)

  // Fuji (read-only)
  const fujiProvider = new ethers.providers.JsonRpcProvider(fuji.fujiRpcUrl)
  const ausdcFuji    = new ethers.Contract(fuji.ausdcFuji, TOKEN_ABI, fujiProvider)
  // const receiver     = new ethers.Contract(fuji.receiverFuji, RECEIVER_ABI, fujiProvider)

  // Store in Redux (like your AMM setTokenContracts)
  dispatch(setTokenContracts([ausdcSepolia, ausdcFuji]))
  dispatch(setSymbols(['aUSDC']))

  // Return so caller can use immediately if they want (AMM style)
  // return { ausdcSepolia, ausdcFuji, sender, receiver, fujiProvider, destChain: bridgeC.destChain, defaultGasEth: bridgeC.defaultGasEth, recipientDefault: sepolia.recipient }
  return { ausdcSepolia, ausdcFuji, fujiProvider }
}

// -------- Load Bridge (like loadAMM in AMM) --------
export const loadBridge = async (provider, chainId, dispatch) => {
  const sepolia = config["11155111"]
  const fuji    = config["43113"]

  const signer = provider.getSigner()

  // Sepolia (USDCSender, write)
  const sender = new ethers.Contract(sepolia.senderSepolia, SENDER_ABI, signer) // write

  // Fuji (USDCReceiver, read-only)
  const fujiProvider = new ethers.providers.JsonRpcProvider(fuji.fujiRpcUrl)
  const receiver = new ethers.Contract(fuji.receiverFuji, RECEIVER_ABI, fujiProvider) // read

  dispatch(setBridgeContracts([sender, receiver]))

  return { sender, receiver, fujiProvider }
}


// ----------------- Reads (balances + allowance) -----------------
export const loadBalances = async (tokens, account, dispatch) => {
  const balanceSepolia = await tokens[0].balanceOf(account)
  const balanceFuji    = await tokens[1].balanceOf(account)

  dispatch(balancesLoaded([
    ethers.utils.formatUnits(balanceSepolia.toString(), 6),
    ethers.utils.formatUnits(balanceFuji.toString(), 6)
  ]))
}


// ----------------- Bridge action -----------------
export const bridge = async (
  provider,         // ethers.Web3Provider
  account,          // connected wallet address
  sender,           // USDCSender (ethers.Contract)
  ausdcSepolia,     // aUSDC on Sepolia (ethers.Contract)
  inputAmount,      // user input string/number, e.g. "0.25"
  inputGasEth,      // user input string/number, or undefined
  recipient,        // usually = account (or UI input)
  receiverAddress,  // Fuji USDCReceiver address
  dispatch          // keep dispatch last (AMM pattern)
) => {
  try {
    dispatch(bridgeRequest())

    let transaction

    const signer = provider.getSigner()
    const destChain = "Avalanche"                       // Axelar name for Fuji
    const gasDefault = config.bridge.defaultGasEth || '0.03'
    const gasEth = String(inputGasEth ?? gasDefault)
    const amount = ethers.utils.parseUnits(String(inputAmount), 6)
    const value = ethers.utils.parseEther(gasEth)

    // --- approve on TOKEN (spender = USDCSender) ---
    // Simple + robust: try direct approve; if it fails (USDC-style), set to 0 then approve.
    try {
      transaction = await ausdcSepolia.connect(signer).approve(sender.address, amount)
      await transaction.wait()
    } catch (error) {
      transaction = await ausdcSepolia.connect(signer).approve(sender.address, 0)
      await transaction.wait()
      transaction = await ausdcSepolia.connect(signer).approve(sender.address, amount)
      await transaction.wait()
    }

    // --- bridge call ---
    transaction = await sender.connect(signer).bridge(destChain, receiverAddress, recipient, amount, { value })
    await transaction.wait()

    dispatch(bridgeSuccess(transaction.hash))

  } catch (error) {
    dispatch(bridgeFail())
  }
}


