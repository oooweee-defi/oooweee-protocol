const path = require("path");
require("@nomiclabs/hardhat-waffle");
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// Warn if no PRIVATE_KEY (required for deployment, not for compilation)
if (!process.env.PRIVATE_KEY) {
  console.warn("⚠️  No PRIVATE_KEY set - deployment will not work, but compilation is fine");
}

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

if (!ETHERSCAN_API_KEY) {
  console.warn("⚠️  No ETHERSCAN_API_KEY set - verification will not work");
}

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true,
      debug: {
        revertStrings: "strip"
      }
    }
  },
  networks: {
    mainnet: {
      url: MAINNET_RPC_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
      gasPrice: "auto",
      timeout: 120000
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: "auto",
      timeout: 60000
    },
    hardhat: {
      chainId: 31337
    }
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY
    }
  },
  sourcify: {
    enabled: false
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
