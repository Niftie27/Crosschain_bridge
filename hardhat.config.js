require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: { url: process.env.SEPOLIA_RPC_URL, accounts: [process.env.PRIVATE_KEY], chainId: 11155111 },
    fuji:    { url: process.env.FUJI_RPC_URL,    accounts: [process.env.PRIVATE_KEY], chainId: 43113 },
  },
};
