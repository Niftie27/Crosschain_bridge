require("@nomicfoundation/hardhat-verify");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    sepolia: { url: process.env.SEPOLIA_RPC_URL, accounts: [process.env.PRIVATE_KEY], chainId: 11155111 },
    fuji:    { url: process.env.FUJI_RPC_URL,    accounts: [process.env.PRIVATE_KEY], chainId: 43113 },
  },
  etherscan: {
    // Use your single Etherscan (V2) key here
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "fuji",
        chainId: 43113,
        urls: {
          apiURL: "https://api-testnet.snowtrace.io/api",
          browserURL: "https://testnet.snowtrace.io"
        }
      }
    ]
  }
}
