USDC Cross-Chain Bridge 🌉

👉 Live Demo: axelar-crosschain-bridge.netlify.app
💧 Use Faucet (Discord) button to get tokens for bridging.

A full-stack dApp to bridge Axelar-wrapped USDC (aUSDC) between Ethereum Sepolia and Avalanche Fuji using Axelar GMP (relayer)
.

• Smart Contracts: USDCSender (Sepolia) + USDCReceiver (Fuji) available in the Footer under the Transfer card.
• Frontend: React + Redux, Bootstrap UI
• Backend/Infra: Hardhat, Ethers.js, Axelar GMP SDK
• Stack: Solidity 0.8.20, OpenZeppelin v5, Axelar GMP SDK, React, Redux, Bootstrap, Ethers.js, Hardhat, Netlify hosting

📖 Overview
• This bridge demonstrates a lock & mint cross-chain transfer pattern:
• User sends aUSDC on Sepolia to USDCSender.
• Axelar GMP relays the message + tokens.
• USDCReceiver on Fuji validates the origin and forwards aUSDC to the recipient.
• Transactions can be tracked on Etherscan, Axelarscan, and Snowtrace.

✨ Features
🔑 MetaMask connect with auto network switching, updating balances
🌉 Cross-chain bridging with Axelar GMP (Sepolia → Fuji)
🔔 Transaction progress & toasts: Approved → Sent → Relaying → Received
🌓 Light/Dark theme toggle (persisted in localStorage)
📱 Responsive static UI — TransferCard pinned, no page scroll

🧑‍💻 Run Locally (frontend + testnets)
1. Clone & install
git clone https://github.com/yourname/usdc-crosschain-bridge.git
npm install
npx hardhat run scripts/deploy-sender.js --network sepolia
• update src/config.json → 11155111.senderSepolia with this address.
• update .env → SEPOLIA_SENDER_ADDR= with the same address
npx hardhat run scripts/deploy-receiver.js --network fuji
• update src/config.json → 43113.receiverFuji with this address.
• update .env → FUJI_RECEIVER_ADDR= with the same address
npm run start

Why these edits?
• The frontend pulls addresses from src/config.json at runtime.
• The receiver deploy script reads SEPOLIA_SENDER_ADDR to lock the trusted source.

Open http://localhost:3000, connect MetaMask on Sepolia, enter amount, click Bridge, and track progress (Etherscan → Axelar → Snowtrace).
aUSDC --> Need test tokens? Use the Faucet (Discord) button in the UI.
gas ETH --> You need a little Sepolia ETH for gas prepay. Most of the unused gas is refunded back to your wallet automatically after execution on Fuji.

🔍 Explorers
Sepolia Etherscan
Avalanche Fuji Snowtrace (or Avascan Testnet)
Axelar GMP Scan

