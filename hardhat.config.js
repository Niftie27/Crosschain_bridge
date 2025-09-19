require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,                    // <= enables the IR pipeline (fixes “stack too deep”)
    },
  },
  networks: {
    sepolia: { url: process.env.SEPOLIA_RPC_URL, accounts: [process.env.PRIVATE_KEY], chainId: 11155111 },
    fuji:    { url: process.env.FUJI_RPC_URL,    accounts: [process.env.PRIVATE_KEY], chainId: 43113 },
  },
};

