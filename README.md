# USDC Cross-Chain Bridge 🌉  

👉 **Live Demo:** [axelar-crosschain-bridge.netlify.app](https://axelar-crosschain-bridge.netlify.app/)  

💧 Use the **Faucet (Discord)** button in the UI to get test tokens.  

A full-stack dApp to bridge **Axelar-wrapped USDC (aUSDC)** between **Ethereum Sepolia** and **Avalanche Fuji** using **Axelar GMP (relayer)**.  

---

- **Smart Contracts**: `USDCSender` (Sepolia) + `USDCReceiver` (Fuji)  
- **Frontend**: React + Redux, Bootstrap UI  
- **Backend/Infra**: Hardhat, Ethers.js, Axelar GMP SDK  
- **Stack**: Solidity 0.8.20, OpenZeppelin v5, React, Redux, Bootstrap, Ethers.js, Hardhat, Netlify  

---

## 📖 Overview  

This bridge demonstrates a **lock & mint cross-chain transfer pattern**:  

1. User sends aUSDC on **Sepolia** to `USDCSender`.  
2. **Axelar GMP** relays the message + tokens.  
3. `USDCReceiver` on **Fuji** validates the origin and forwards aUSDC to the recipient.  

Transactions can be tracked on **Etherscan**, **Axelarscan**, and **Snowtrace**.  
