const path = require("path");
require("@nomiclabs/hardhat-waffle");
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// Warn if no PRIVATE_KEY (required for deployment, not for compilation)
if (!process.env.PRIVATE_KEY) {
  console.warn("⚠️  No PRIVATE_KEY set - deployment will not work, but compilation is fine");
}

// Default to public RPC if not specified
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// Show warning if no Etherscan key
if (!ETHERSCAN_API_KEY) {
  console.warn("⚠️  No ETHERSCAN_API_KEY set - verification will not work");
  console.warn("   Get a free key at https://etherscan.io/apis");
}

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1
      },
      viaIR: true
    }
  },
  networks: {
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
      sepolia: ETHERSCAN_API_KEY
    },
    customChains: [
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=11155111",
          browserURL: "https://sepolia.etherscan.io"
        }
      }
    ],
    enabled: true
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