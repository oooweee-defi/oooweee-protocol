export const CONTRACT_ADDRESSES = {
  OOOWEEEToken: "0x700732ca3B5F751775284C75a4f90D179c89d5ce",
  OOOWEEESavings: "0xaABe5E9510157AFf6fb02Bd7D65ED4E093Cda863",
  OOOWEEEValidatorFund: "0xE580dFEe31234c7622F389326B7ED1BB753C8b10",
  OOOWEEEStability: "0xefDFf57c5ff02Cdc539165A2546f8bF04Db71e66",
  OOOWEEERewardsDistribution: "0xBf9b3925d4C3884C16d2a7c20E6C5A899c0f92C8",
  SavingsPriceOracle: "0xBA6a77e90666Ae9fF4A88fE2DeC25662184AfAc0",
  ValidatorCollector: "0xB0C448c3D7e1b57fee1Da789E3F65ba618F09F01",
  UniswapPair: "0x4FDc01f03d30a718854cE4105eBC77CDAC374073"
};

// ============================================
// OOOWEEEToken ABI
// ============================================
export const OOOWEEETokenABI = [
  // Constructor
  {
    "inputs": [
      { "internalType": "address", "name": "_founderWallet", "type": "address" },
      { "internalType": "address", "name": "_operationsWallet", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "spender", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" }
    ],
    "name": "Approval",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "account", "type": "address" },
      { "indexed": false, "internalType": "bool", "name": "exempt", "type": "bool" }
    ],
    "name": "ExemptionSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "pair", "type": "address" },
      { "indexed": false, "internalType": "bool", "name": "value", "type": "bool" }
    ],
    "name": "LiquidityPairSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "mechanism", "type": "address" }
    ],
    "name": "StabilityMechanismSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "oldMechanism", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newMechanism", "type": "address" }
    ],
    "name": "StabilityMechanismUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "TradingEnabled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" }
    ],
    "name": "Transfer",
    "type": "event"
  },
  // Constants
  {
    "inputs": [],
    "name": "FOUNDER_ALLOCATION",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPERATIONS_ALLOCATION",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "STABILITY_RESERVE",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "TOTAL_SUPPLY",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "buyTaxRate",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "sellTaxRate",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // State Variables
  {
    "inputs": [],
    "name": "stabilityMechanism",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "founderWallet",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "operationsWallet",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "tradingEnabled",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "isLiquidityPair",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "isExemptFromLimits",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  // ERC20 Standard Functions
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "from", "type": "address" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "transferFrom",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "addedValue", "type": "uint256" }
    ],
    "name": "increaseAllowance",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "subtractedValue", "type": "uint256" }
    ],
    "name": "decreaseAllowance",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Ownable
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Admin Functions
  {
    "inputs": [],
    "name": "enableTrading",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_mechanism", "type": "address" }],
    "name": "setStabilityMechanism",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "pair", "type": "address" },
      { "internalType": "bool", "name": "value", "type": "bool" }
    ],
    "name": "setLiquidityPair",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "bool", "name": "exempt", "type": "bool" }
    ],
    "name": "setExemption",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// ============================================
// OOOWEEESavings ABI - UPDATED: Returns OOOWEEE tokens (no ETH conversion)
// ============================================
export const OOOWEEESavingsABI = [
  // Constructor - NOW ONLY 2 PARAMS (no uniswapRouter)
  {
    "inputs": [
      { "internalType": "address", "name": "_tokenAddress", "type": "address" },
      { "internalType": "address", "name": "_priceOracle", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "accountId", "type": "uint256" },
      { "indexed": false, "internalType": "enum OOOWEEESavings.AccountType", "name": "accountType", "type": "uint8" },
      { "indexed": false, "internalType": "string", "name": "goalName", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "initialDeposit", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "creationFee", "type": "uint256" }
    ],
    "name": "AccountCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "tokenAmount", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "goalName", "type": "string" }
    ],
    "name": "BalanceTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "accountId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "tokensAdded", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "newBalance", "type": "uint256" }
    ],
    "name": "Deposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "collector", "type": "address" }
    ],
    "name": "FeeCollectorSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "creationFee", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "withdrawalFee", "type": "uint256" }
    ],
    "name": "FeesUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "accountId", "type": "uint256" },
      { "indexed": false, "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" },
      { "indexed": false, "internalType": "uint256", "name": "targetFiat", "type": "uint256" }
    ],
    "name": "FiatAccountCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "accountId", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "goalName", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "tokensReturned", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "feeCollected", "type": "uint256" }
    ],
    "name": "GoalCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "newOracle", "type": "address" }
    ],
    "name": "PriceOracleUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "accountId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "claimed", "type": "uint256" }
    ],
    "name": "RewardsClaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "distributor", "type": "address" }
    ],
    "name": "RewardsDistributorSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "RewardsReceived",
    "type": "event"
  },
  // Constants
  {
    "inputs": [],
    "name": "FEE_DIVISOR",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_LOCK_DURATION",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // State Variables
  {
    "inputs": [],
    "name": "oooweeeToken",
    "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "priceOracle",
    "outputs": [{ "internalType": "contract SavingsPriceOracle", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeCollector",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "rewardsDistributor",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "creationFeeRate",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdrawalFeeRate",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalValueLocked",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalAccountsCreated",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalGoalsCompleted",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalFeesCollected",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRewardsDistributed",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalActiveBalance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "globalRewardPerToken",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pendingRewards",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lastRewardDistribution",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Ownable
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Admin Functions
  {
    "inputs": [{ "internalType": "address", "name": "_distributor", "type": "address" }],
    "name": "setRewardsDistributor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_feeCollector", "type": "address" }],
    "name": "setFeeCollector",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "_creationFeeRate", "type": "uint256" },
      { "internalType": "uint256", "name": "_withdrawalFeeRate", "type": "uint256" }
    ],
    "name": "setFees",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_priceOracle", "type": "address" }],
    "name": "setPriceOracle",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Price Functions (state-changing)
  {
    "inputs": [
      { "internalType": "uint256", "name": "oooweeeBalance", "type": "uint256" },
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" }
    ],
    "name": "getBalanceInFiat",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "fiatAmount", "type": "uint256" },
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" }
    ],
    "name": "getFiatToTokens",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Price Functions (view - for frontend)
  {
    "inputs": [
      { "internalType": "uint256", "name": "oooweeeBalance", "type": "uint256" },
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" }
    ],
    "name": "getBalanceInFiatView",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "fiatAmount", "type": "uint256" },
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" }
    ],
    "name": "getFiatToTokensView",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Account Creation Functions
  {
    "inputs": [
      { "internalType": "uint256", "name": "unlockTime", "type": "uint256" },
      { "internalType": "string", "name": "goalName", "type": "string" },
      { "internalType": "uint256", "name": "initialDeposit", "type": "uint256" },
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "displayCurrency", "type": "uint8" }
    ],
    "name": "createTimeAccountFiat",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "targetFiatAmount", "type": "uint256" },
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "targetCurrency", "type": "uint8" },
      { "internalType": "string", "name": "goalName", "type": "string" },
      { "internalType": "uint256", "name": "initialDeposit", "type": "uint256" }
    ],
    "name": "createGrowthAccountFiat",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "targetFiatAmount", "type": "uint256" },
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "targetCurrency", "type": "uint8" },
      { "internalType": "address", "name": "recipient", "type": "address" },
      { "internalType": "string", "name": "goalName", "type": "string" },
      { "internalType": "uint256", "name": "initialDeposit", "type": "uint256" }
    ],
    "name": "createBalanceAccountFiat",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Deposit Function
  {
    "inputs": [
      { "internalType": "uint256", "name": "accountId", "type": "uint256" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Rewards Functions
  {
    "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }],
    "name": "receiveRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "accountId", "type": "uint256" }],
    "name": "claimRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claimAllRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Manual Withdraw
  {
    "inputs": [{ "internalType": "uint256", "name": "accountId", "type": "uint256" }],
    "name": "manualWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // View Functions
  {
    "inputs": [{ "internalType": "address", "name": "user", "type": "address" }],
    "name": "getUserAccounts",
    "outputs": [{ "internalType": "uint256[]", "name": "activeIds", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "user", "type": "address" }],
    "name": "getUserAccountCount",
    "outputs": [
      { "internalType": "uint256", "name": "total", "type": "uint256" },
      { "internalType": "uint256", "name": "active", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "uint256", "name": "accountId", "type": "uint256" }
    ],
    "name": "getAccountDetails",
    "outputs": [
      { "internalType": "enum OOOWEEESavings.AccountType", "name": "accountType", "type": "uint8" },
      { "internalType": "bool", "name": "isActive", "type": "bool" },
      { "internalType": "uint256", "name": "balance", "type": "uint256" },
      { "internalType": "uint256", "name": "targetAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "targetFiat", "type": "uint256" },
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "targetCurrency", "type": "uint8" },
      { "internalType": "uint256", "name": "unlockTime", "type": "uint256" },
      { "internalType": "address", "name": "recipient", "type": "address" },
      { "internalType": "string", "name": "goalName", "type": "string" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "uint256", "name": "accountId", "type": "uint256" }
    ],
    "name": "getAccountFiatProgress",
    "outputs": [
      { "internalType": "uint256", "name": "currentValue", "type": "uint256" },
      { "internalType": "uint256", "name": "targetValue", "type": "uint256" },
      { "internalType": "uint256", "name": "percentComplete", "type": "uint256" },
      { "internalType": "bool", "name": "canWithdraw", "type": "bool" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "uint256", "name": "accountId", "type": "uint256" }
    ],
    "name": "getAccountFiatProgressView",
    "outputs": [
      { "internalType": "uint256", "name": "currentValue", "type": "uint256" },
      { "internalType": "uint256", "name": "targetValue", "type": "uint256" },
      { "internalType": "uint256", "name": "percentComplete", "type": "uint256" },
      { "internalType": "bool", "name": "canWithdraw", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getStatsView",
    "outputs": [
      { "internalType": "uint256", "name": "_totalValueLocked", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalAccountsCreated", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalGoalsCompleted", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalActiveBalance", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalRewardsDistributed", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalFeesCollected", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" },
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "name": "userAccounts",
    "outputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "enum OOOWEEESavings.AccountType", "name": "accountType", "type": "uint8" },
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "targetCurrency", "type": "uint8" },
      { "internalType": "bool", "name": "isActive", "type": "bool" },
      { "internalType": "bool", "name": "isFiatTarget", "type": "bool" },
      { "internalType": "uint32", "name": "createdAt", "type": "uint32" },
      { "internalType": "uint32", "name": "completedAt", "type": "uint32" },
      { "internalType": "address", "name": "recipient", "type": "address" },
      { "internalType": "uint32", "name": "unlockTime", "type": "uint32" },
      { "internalType": "uint64", "name": "lastRewardUpdate", "type": "uint64" },
      { "internalType": "uint256", "name": "balance", "type": "uint256" },
      { "internalType": "uint256", "name": "targetAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "targetFiat", "type": "uint256" },
      { "internalType": "string", "name": "goalName", "type": "string" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// ============================================
// SavingsPriceOracle ABI
// ============================================
export const SavingsPriceOracleABI = [
  // Constructor
  {
    "inputs": [{ "internalType": "address", "name": "_uniswapRouter", "type": "address" }],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" },
      { "indexed": false, "internalType": "address", "name": "feed", "type": "address" }
    ],
    "name": "PriceFeedUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "enum SavingsPriceOracle.PriceSource", "name": "oldSource", "type": "uint8" },
      { "indexed": false, "internalType": "enum SavingsPriceOracle.PriceSource", "name": "newSource", "type": "uint8" }
    ],
    "name": "PriceSourceChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "string", "name": "reason", "type": "string" }],
    "name": "EmergencyPriceModeActivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" },
      { "indexed": false, "internalType": "uint256", "name": "price", "type": "uint256" }
    ],
    "name": "ManualPriceSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "pool", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "weight", "type": "uint256" }
    ],
    "name": "PoolAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "pool", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "PoolDeactivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": true, "internalType": "address", "name": "pool", "type": "address" }],
    "name": "PoolAddressSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  // Constants
  {
    "inputs": [],
    "name": "PRICE_STALENESS_THRESHOLD",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "CHAINLINK_DECIMALS",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // State Variables
  {
    "inputs": [],
    "name": "uniswapRouter",
    "outputs": [{ "internalType": "contract IUniswapV2Router02", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "oooweeePool",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "activePriceSource",
    "outputs": [{ "internalType": "enum SavingsPriceOracle.PriceSource", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "emergencyPriceMode",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Mappings
  {
    "inputs": [{ "internalType": "enum SavingsPriceOracle.Currency", "name": "", "type": "uint8" }],
    "name": "priceFeeds",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "enum SavingsPriceOracle.Currency", "name": "", "type": "uint8" }],
    "name": "currencyDecimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "enum SavingsPriceOracle.Currency", "name": "", "type": "uint8" }],
    "name": "defaultPrices",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "enum SavingsPriceOracle.Currency", "name": "", "type": "uint8" }],
    "name": "emergencyFixedRates",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Ownable
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Price Functions
  {
    "inputs": [{ "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" }],
    "name": "getETHPrice",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" }],
    "name": "getOooweeePrice",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" }],
    "name": "getOooweeePriceView",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" }],
    "name": "getCurrencyDecimals",
    "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getLiquidityPoolCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Admin Functions
  {
    "inputs": [{ "internalType": "address", "name": "_pool", "type": "address" }],
    "name": "setOooweeePool",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" },
      { "internalType": "address", "name": "feed", "type": "address" }
    ],
    "name": "setPriceFeed",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" },
      { "internalType": "uint256", "name": "price", "type": "uint256" }
    ],
    "name": "setDefaultPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" },
      { "internalType": "uint256", "name": "rate", "type": "uint256" }
    ],
    "name": "setEmergencyFixedRate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "enum SavingsPriceOracle.Currency", "name": "currency", "type": "uint8" },
      { "internalType": "uint8", "name": "decimals_", "type": "uint8" }
    ],
    "name": "setCurrencyDecimals",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "enum SavingsPriceOracle.PriceSource", "name": "source", "type": "uint8" }],
    "name": "setActivePriceSource",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bool", "name": "enabled", "type": "bool" },
      { "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "setEmergencyMode",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "pool", "type": "address" },
      { "internalType": "uint256", "name": "weight", "type": "uint256" }
    ],
    "name": "addLiquidityPool",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "index", "type": "uint256" }],
    "name": "removeLiquidityPool",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// ============================================
// OOOWEEEStability ABI
// ============================================
export const OOOWEEEStabilityABI = [
  // Constructor
  {
    "inputs": [
      { "internalType": "address", "name": "_oooweeeToken", "type": "address" },
      { "internalType": "address", "name": "_uniswapRouter", "type": "address" },
      { "internalType": "address", "name": "_validatorFund", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "tokensInjected", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "ethCaptured", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "priceBefore", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "priceAfter", "type": "uint256" },
      { "indexed": false, "internalType": "bool", "name": "systemTriggered", "type": "bool" }
    ],
    "name": "StabilityIntervention",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "oldBaseline", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "newBaseline", "type": "uint256" }
    ],
    "name": "BaselineUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "string", "name": "reason", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "CircuitBreakerTripped",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }],
    "name": "CircuitBreakerReset",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "blockNumber", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "currentPrice", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "priceIncrease", "type": "uint256" },
      { "indexed": false, "internalType": "bool", "name": "intervened", "type": "bool" }
    ],
    "name": "SystemCheck",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }],
    "name": "DailyLimitsReset",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "ETHSentToValidators",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "triggeredBy", "type": "address" }
    ],
    "name": "ForceDailyReset",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  // Constants
  {
    "inputs": [],
    "name": "INTERVENTION_THRESHOLD",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "CRITICAL_THRESHOLD",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "HIGH_VOLATILITY_THRESHOLD",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_DAILY_INTERVENTIONS",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_DAILY_TOKEN_USE",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MAX_SELL_PERCENT",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MEASUREMENT_WINDOW",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // State Variables
  {
    "inputs": [],
    "name": "oooweeeToken",
    "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "uniswapRouter",
    "outputs": [{ "internalType": "contract IUniswapV2Router02", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "liquidityPair",
    "outputs": [{ "internalType": "contract IUniswapV2Pair", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "validatorFundWallet",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "systemAddress",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "baselinePrice",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "baselineTimestamp",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "interventionsToday",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "tokensUsedToday",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lastDayReset",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalInterventions",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalTokensUsed",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalETHCaptured",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalETHSentToValidators",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lastInterventionPrice",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "circuitBreakerTripped",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "systemChecksEnabled",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Ownable
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Main Functions
  {
    "inputs": [],
    "name": "manualStabilityCheck",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "systemStabilityCheck",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // View Functions
  {
    "inputs": [],
    "name": "getCurrentPrice",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getStabilityStatus",
    "outputs": [
      { "internalType": "uint256", "name": "currentPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "baseline", "type": "uint256" },
      { "internalType": "uint256", "name": "priceIncrease", "type": "uint256" },
      { "internalType": "bool", "name": "needsIntervention", "type": "bool" },
      { "internalType": "uint256", "name": "remainingInterventions", "type": "uint256" },
      { "internalType": "uint256", "name": "remainingTokens", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getStabilityInfo",
    "outputs": [
      { "internalType": "uint256", "name": "currentPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "tokenBalance", "type": "uint256" },
      { "internalType": "uint256", "name": "totalInterventionsCount", "type": "uint256" },
      { "internalType": "uint256", "name": "totalTokensSold", "type": "uint256" },
      { "internalType": "uint256", "name": "totalETHEarned", "type": "uint256" },
      { "internalType": "uint256", "name": "totalETHToValidators", "type": "uint256" },
      { "internalType": "uint256", "name": "baseline", "type": "uint256" },
      { "internalType": "uint256", "name": "priceIncrease", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getCircuitBreakerStatus",
    "outputs": [
      { "internalType": "bool", "name": "tripped", "type": "bool" },
      { "internalType": "uint256", "name": "dailyInterventions", "type": "uint256" },
      { "internalType": "uint256", "name": "dailyTokensUsed", "type": "uint256" },
      { "internalType": "uint256", "name": "remainingInterventions", "type": "uint256" },
      { "internalType": "uint256", "name": "remainingTokens", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getMarketConditions",
    "outputs": [
      { "internalType": "bool", "name": "highVolatility", "type": "bool" },
      { "internalType": "uint256", "name": "currentCheckInterval", "type": "uint256" },
      { "internalType": "uint256", "name": "blocksSinceLastSpike", "type": "uint256" },
      { "internalType": "uint256", "name": "dailyInterventionCount", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTokenBalance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "needsDailyReset",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "timeUntilDailyReset",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getInterventionHistory",
    "outputs": [
      {
        "components": [
          { "internalType": "uint64", "name": "timestamp", "type": "uint64" },
          { "internalType": "uint256", "name": "priceBefore", "type": "uint256" },
          { "internalType": "uint256", "name": "priceAfter", "type": "uint256" },
          { "internalType": "uint256", "name": "tokensInjected", "type": "uint256" },
          { "internalType": "uint256", "name": "ethCaptured", "type": "uint256" },
          { "internalType": "bool", "name": "systemTriggered", "type": "bool" }
        ],
        "internalType": "struct OOOWEEEStability.InterventionRecord[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "count", "type": "uint256" }],
    "name": "getRecentInterventions",
    "outputs": [
      {
        "components": [
          { "internalType": "uint64", "name": "timestamp", "type": "uint64" },
          { "internalType": "uint256", "name": "priceBefore", "type": "uint256" },
          { "internalType": "uint256", "name": "priceAfter", "type": "uint256" },
          { "internalType": "uint256", "name": "tokensInjected", "type": "uint256" },
          { "internalType": "uint256", "name": "ethCaptured", "type": "uint256" },
          { "internalType": "bool", "name": "systemTriggered", "type": "bool" }
        ],
        "internalType": "struct OOOWEEEStability.InterventionRecord[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getInterventionHistoryCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Admin Functions
  {
    "inputs": [{ "internalType": "address", "name": "_pair", "type": "address" }],
    "name": "setLiquidityPair",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_fund", "type": "address" }],
    "name": "setValidatorFund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_system", "type": "address" }],
    "name": "setSystemAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "updateBaselinePrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "resetCircuitBreaker",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bool", "name": "_enabled", "type": "bool" }],
    "name": "setChecksEnabled",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "toggleSystemChecks",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "forceDailyReset",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "_baseCaptureRate", "type": "uint256" },
      { "internalType": "uint256", "name": "_captureRange", "type": "uint256" }
    ],
    "name": "setCaptureRates",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "emergencyWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "emergencyRecoverTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Receive ETH
  { "stateMutability": "payable", "type": "receive" }
];

// ============================================
// OOOWEEEValidatorFund ABI
// ============================================
export const OOOWEEEValidatorFundABI = [
  // Constructor
  {
    "inputs": [
      { "internalType": "address", "name": "_stabilityContract", "type": "address" },
      { "internalType": "address", "name": "_rewardsContract", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "ETHReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" }
    ],
    "name": "ETHBridgedForValidator",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": true, "internalType": "uint256", "name": "validatorId", "type": "uint256" }],
    "name": "ValidatorCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "donor", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "DonationReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": true, "internalType": "address", "name": "newContract", "type": "address" }],
    "name": "StabilityContractUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": true, "internalType": "address", "name": "newContract", "type": "address" }],
    "name": "RewardsContractUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": true, "internalType": "address", "name": "newOperator", "type": "address" }],
    "name": "OperatorAddressUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "EmergencyWithdrawal",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  // Errors
  { "inputs": [], "name": "OnlyStability", "type": "error" },
  { "inputs": [], "name": "OnlyRewards", "type": "error" },
  { "inputs": [], "name": "InsufficientETH", "type": "error" },
  { "inputs": [], "name": "InvalidAddress", "type": "error" },
  { "inputs": [], "name": "TransferFailed", "type": "error" },
  // Constants
  {
    "inputs": [],
    "name": "VALIDATOR_STAKE",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "L2_BRIDGE",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  // State Variables
  {
    "inputs": [],
    "name": "operatorL1Address",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalETHReceived",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pendingETH",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalETHBridged",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "validatorsToCreate",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "validatorsCreated",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalValidatorRewards",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalDonations",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "stabilityContract",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "rewardsContract",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "donations",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "donors",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Ownable
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Main Functions
  {
    "inputs": [],
    "name": "receiveFromStability",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "bridgeForValidator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "donate",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "confirmValidatorCreated",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }],
    "name": "recordValidatorRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Admin Functions
  {
    "inputs": [{ "internalType": "address", "name": "_operator", "type": "address" }],
    "name": "setOperatorL1Address",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_stability", "type": "address" }],
    "name": "setStabilityContract",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_rewards", "type": "address" }],
    "name": "setRewardsContract",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "emergencyWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // View Functions
  {
    "inputs": [],
    "name": "getStats",
    "outputs": [
      { "internalType": "uint256", "name": "_validatorsCreated", "type": "uint256" },
      { "internalType": "uint256", "name": "_pendingETH", "type": "uint256" },
      { "internalType": "uint256", "name": "_validatorsToCreate", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalETHReceived", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalDonations", "type": "uint256" },
      { "internalType": "uint256", "name": "_donorCount", "type": "uint256" },
      { "internalType": "uint256", "name": "_totalETHBridged", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "ethUntilNextValidator",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "progressToNextValidator",
    "outputs": [
      { "internalType": "uint256", "name": "current", "type": "uint256" },
      { "internalType": "uint256", "name": "required", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Receive ETH
  { "stateMutability": "payable", "type": "receive" }
];

// ============================================
// OOOWEEERewardsDistribution ABI
// ============================================
export const OOOWEEERewardsDistributionABI = [
  // Constructor
  {
    "inputs": [
      { "internalType": "address", "name": "_savingsContract", "type": "address" },
      { "internalType": "address", "name": "_oooweeeToken", "type": "address" },
      { "internalType": "address", "name": "_uniswapRouter", "type": "address" },
      { "internalType": "address", "name": "_validatorFund", "type": "address" },
      { "internalType": "address", "name": "_operationsWallet", "type": "address" },
      { "internalType": "address", "name": "_l1ValidatorCollector", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "from", "type": "address" }
    ],
    "name": "RewardsReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }],
    "name": "RewardsReceivedFromL1",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "totalAmount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "toSavers", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "toValidators", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "toOperations", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "oooweeeTokensBought", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "RewardsDistributed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "savings", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "token", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "validatorFund", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "operations", "type": "address" }
    ],
    "name": "ContractsUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "address", "name": "newCollector", "type": "address" }],
    "name": "L1CollectorUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "uint256", "name": "newThreshold", "type": "uint256" }],
    "name": "ThresholdUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "EmergencyWithdrawal",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  // Errors
  { "inputs": [], "name": "InvalidAddress", "type": "error" },
  { "inputs": [], "name": "InsufficientRewards", "type": "error" },
  { "inputs": [], "name": "TransferFailed", "type": "error" },
  { "inputs": [], "name": "UnauthorizedBridgeCall", "type": "error" },
  { "inputs": [], "name": "SwapFailed", "type": "error" },
  // Constants
  {
    "inputs": [],
    "name": "L2_CROSS_DOMAIN_MESSENGER",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SAVERS_SHARE",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "VALIDATORS_SHARE",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPERATIONS_SHARE",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "BASIS_POINTS",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SLIPPAGE_TOLERANCE",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // State Variables
  {
    "inputs": [],
    "name": "l1ValidatorCollector",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "savingsContract",
    "outputs": [{ "internalType": "contract IOOOWEEESavings", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "oooweeeToken",
    "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "uniswapRouter",
    "outputs": [{ "internalType": "contract IUniswapV2Router02", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "validatorFund",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "operationsWallet",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRewardsReceived",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRewardsToSavers",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRewardsToValidators",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRewardsToOperations",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pendingRewards",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "distributionThreshold",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lastDistribution",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Ownable
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Main Functions
  {
    "inputs": [],
    "name": "receiveFromL1Bridge",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "distributeRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }],
    "name": "fundValidators",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Admin Functions
  {
    "inputs": [{ "internalType": "address", "name": "_l1Collector", "type": "address" }],
    "name": "setL1ValidatorCollector",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "_savingsContract", "type": "address" },
      { "internalType": "address", "name": "_oooweeeToken", "type": "address" },
      { "internalType": "address", "name": "_validatorFund", "type": "address" },
      { "internalType": "address", "name": "_operationsWallet", "type": "address" }
    ],
    "name": "updateContracts",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_threshold", "type": "uint256" }],
    "name": "setDistributionThreshold",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "emergencyWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "recoverTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // View Functions
  {
    "inputs": [],
    "name": "getStatus",
    "outputs": [
      { "internalType": "uint256", "name": "_totalReceived", "type": "uint256" },
      { "internalType": "uint256", "name": "_toSavers", "type": "uint256" },
      { "internalType": "uint256", "name": "_toValidators", "type": "uint256" },
      { "internalType": "uint256", "name": "_toOperations", "type": "uint256" },
      { "internalType": "uint256", "name": "_pending", "type": "uint256" },
      { "internalType": "uint256", "name": "_lastDistribution", "type": "uint256" },
      { "internalType": "bool", "name": "_canDistribute", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }],
    "name": "calculateSplit",
    "outputs": [
      { "internalType": "uint256", "name": "savers", "type": "uint256" },
      { "internalType": "uint256", "name": "validators", "type": "uint256" },
      { "internalType": "uint256", "name": "operations", "type": "uint256" }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  // Receive ETH
  { "stateMutability": "payable", "type": "receive" }
];

// ============================================
// ValidatorCollector ABI (L1)
// ============================================
export const ValidatorCollectorABI = [
  // Constructor
  {
    "inputs": [
      { "internalType": "address", "name": "_l2StandardBridge", "type": "address" },
      { "internalType": "address", "name": "_l2RewardsDistributor", "type": "address" },
      { "internalType": "address", "name": "_operationalTreasury", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "RewardsBridged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" }
    ],
    "name": "PrincipalRecovered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "totalPending", "type": "uint256" }
    ],
    "name": "ValidatorExitExpected",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "string", "name": "param", "type": "string" },
      { "indexed": false, "internalType": "address", "name": "value", "type": "address" }
    ],
    "name": "ConfigurationUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "bool", "name": "enabled", "type": "bool" }
    ],
    "name": "BridgingToggled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "EmergencyWithdrawal",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  // Errors
  { "inputs": [], "name": "BridgingDisabled", "type": "error" },
  { "inputs": [], "name": "CooldownActive", "type": "error" },
  { "inputs": [], "name": "InsufficientBalance", "type": "error" },
  { "inputs": [], "name": "NoPrincipalAvailable", "type": "error" },
  { "inputs": [], "name": "TransferFailed", "type": "error" },
  { "inputs": [], "name": "InvalidAddress", "type": "error" },
  // Constants
  {
    "inputs": [],
    "name": "VALIDATOR_PRINCIPAL",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "L2_STANDARD_BRIDGE",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  // State Variables
  {
    "inputs": [],
    "name": "l2RewardsDistributor",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "operationalTreasury",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRewardsBridged",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalPrincipalRecovered",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pendingValidatorExits",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lastBridgeTime",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minBridgeAmount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "bridgeCooldown",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "l2GasLimit",
    "outputs": [{ "internalType": "uint32", "name": "", "type": "uint32" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "bridgingEnabled",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Ownable
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Main Functions
  {
    "inputs": [],
    "name": "bridgeRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "recoverValidatorPrincipal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Admin Functions
  {
    "inputs": [],
    "name": "expectValidatorExit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_cooldown", "type": "uint256" }],
    "name": "setBridgeCooldown",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_minAmount", "type": "uint256" }],
    "name": "setMinBridgeAmount",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint32", "name": "_gasLimit", "type": "uint32" }],
    "name": "setL2GasLimit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "toggleBridging",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_l2RewardsDistributor", "type": "address" }],
    "name": "setL2RewardsDistributor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_treasury", "type": "address" }],
    "name": "setOperationalTreasury",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "emergencyWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // View Functions
  {
    "inputs": [],
    "name": "getBridgeableAmount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "canBridge",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getStatus",
    "outputs": [
      { "internalType": "uint256", "name": "balance", "type": "uint256" },
      { "internalType": "uint256", "name": "bridgeable", "type": "uint256" },
      { "internalType": "uint256", "name": "reserved", "type": "uint256" },
      { "internalType": "uint256", "name": "nextBridgeTime", "type": "uint256" },
      { "internalType": "bool", "name": "bridgeAvailable", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // Receive ETH
  { "stateMutability": "payable", "type": "receive" }
];
