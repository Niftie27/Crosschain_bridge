# USDC Cross-Chain Bridge 🌉  

👉 **Live Demo:** [axelar-crosschain-bridge.netlify.app](https://axelar-crosschain-bridge.netlify.app/)  

A full-stack dApp to bridge **Axelar-wrapped USDC (aUSDC)** between **Ethereum Sepolia** and **Avalanche Fuji** using **Axelar GMP (relayer)**.  

💧 Use the **Faucet (Discord)** button in the UI to get test tokens.  

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

---

## ✨ Features  

- 🔑 MetaMask connect with auto network switching + balance updates  
- 🌉 Cross-chain bridging with Axelar GMP (Sepolia → Fuji)  
- 🔔 Transaction progress & toasts: **Approved → Sent → Relaying → Received**  
- 🌓 Light/Dark theme toggle (persisted in localStorage)  
- 📱 Responsive static UI — TransferCard pinned, no page scroll  
- 💨 **Gas prepay + refund**: small ETH prepayment on Sepolia, **unused gas refunded automatically** after execution on Fuji  

---

## 🛠️ Tech Stack  

- **Contracts:** Solidity `0.8.20`, OpenZeppelin v5, Axelar GMP SDK  
- **Frontend:** React 18, Redux Toolkit, React-Bootstrap, Ethers.js  
- **Dev Tools:** Hardhat, Mocha/Chai  
- **Infra:** Netlify hosting, Alchemy RPC  

---

## 🧑‍💻 Run Locally (frontend + testnets)  

> You already have `.env` in the repo. We’ll only **update two values** after deployments; no new file needed.  

### 1. Install 
```bash
git clone https://github.com/yourname/usdc-crosschain-bridge.git
cd usdc-crosschain-bridge
npm install

# Deploy USDCSender on Sepolia
npx hardhat run scripts/deploy-sender.js --network sepolia
# 👉 Copy the printed SENDER address, then update:
#    - src/config.json : set 11155111.senderSepolia = "<SENDER_ADDRESS>"
#    - .env            : set SEPOLIA_SENDER_ADDR=<SENDER_ADDRESS>

# Deploy USDCReceiver on Fuji
npx hardhat run scripts/deploy-receiver.js --network fuji
# 👉 Copy the printed RECEIVER address, then update:
#    - src/config.json : set 43113.receiverFuji = "<RECEIVER_ADDRESS>"
#    - .env            : set FUJI_RECEIVER_ADDR=<RECEIVER_ADDRESS>

# Start the app
npm run start
```

ℹ️ Why these edits?

- The frontend pulls addresses from src/config.json.
- The receiver deploy script reads SEPOLIA_SENDER_ADDR to lock the trusted source.



