require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("dotenv").config();

// Ensure we have required environment variables
if (!process.env.PRIVATE_KEY) {
  console.error("Please set PRIVATE_KEY in your .env file");
  process.exit(1);
}

// Default to public RPC if not specified
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
      chainId: 11155111,
      gasPrice: "auto",
      timeout: 60000 // 60 seconds timeout for public RPC
    },
    // Localhost for testing
    hardhat: {
      chainId: 31337
    }
  },
  etherscan: {
    // Optional: Add your Etherscan API key for contract verification
    // Get one free at https://etherscan.io/apis
    apiKey: process.env.ETHERSCAN_API_KEY || "YOUR_ETHERSCAN_API_KEY"
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  }
};