USDC Cross-Chain Bridge 🌉

👉 Live Demo: axelar-crosschain-bridge.netlify.app
💧 Use the Faucet (Discord) button in the UI to get test tokens.

A full-stack dApp to bridge Axelar-wrapped USDC (aUSDC) between Ethereum Sepolia and Avalanche Fuji using Axelar GMP (relayer).

Smart Contracts: USDCSender (Sepolia) + USDCReceiver (Fuji)

Frontend: React + Redux, Bootstrap UI

Backend/Infra: Hardhat, Ethers.js, Axelar GMP SDK

Stack: Solidity 0.8.20, OpenZeppelin v5, React, Redux, Bootstrap, Ethers.js, Hardhat, Netlify

📖 Overview

This bridge demonstrates a lock & mint cross-chain transfer pattern:

User sends aUSDC on Sepolia to USDCSender.

Axelar GMP relays the message + tokens.

USDCReceiver on Fuji validates the origin and forwards aUSDC to the recipient.

Transactions can be tracked on Etherscan, Axelarscan, and Snowtrace.

✨ Features

🔑 MetaMask connect with auto network switching + balance updates

🌉 Cross-chain bridging with Axelar GMP (Sepolia → Fuji)

🔔 Transaction progress & toasts: Approved → Sent → Relaying → Received

🌓 Light/Dark theme toggle (persisted in localStorage)

📱 Responsive static UI — TransferCard pinned, no page scroll

💨 Gas prepay + refund: small ETH prepayment on Sepolia, unused gas refunded automatically after execution on Fuji

🧑‍💻 Run Locally (frontend + testnets)

Clone & install

git clone https://github.com/yourname/usdc-crosschain-bridge.git
cd usdc-crosschain-bridge
npm install


Deploy USDCSender on Sepolia

npx hardhat run scripts/deploy-sender.js --network sepolia


Copy the printed sender address.

Update:

src/config.json → 11155111.senderSepolia

.env → SEPOLIA_SENDER_ADDR=<sender address>

Deploy USDCReceiver on Fuji

npx hardhat run scripts/deploy-receiver.js --network fuji


Copy the printed receiver address.

Update:

src/config.json → 43113.receiverFuji

.env → FUJI_RECEIVER_ADDR=<receiver address>

ℹ️ Why these edits?

The frontend pulls addresses from src/config.json.

The receiver deploy script reads SEPOLIA_SENDER_ADDR to lock the trusted source.

Run the app

npm start


Open http://localhost:3000
, connect MetaMask on Sepolia, enter amount, click Bridge, and track progress (Etherscan → Axelar → Snowtrace).

💧 Need test tokens? Use the Faucet button.
💨 Need gas? Just a little Sepolia ETH — most of it will be refunded automatically.

🔍 Explorers

Sepolia Etherscan

Avalanche Fuji Snowtrace

Avascan Testnet

Axelar GMP Scan
