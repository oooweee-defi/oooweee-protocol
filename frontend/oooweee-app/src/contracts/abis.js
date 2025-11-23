export const OOOWEEE_TOKEN_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function setStabilityMechanism(address _stability)",
  "function enableTrading()"
];

export const OOOWEEE_SAVINGS_ABI = [
  // Updated with initial deposit parameter for all account types
  "function createTimeAccount(uint256 unlockTime, string memory goalName, uint256 initialDeposit) returns (uint256)",
  "function createBalanceAccount(uint256 targetAmount, address recipient, string memory goalName, uint256 initialDeposit) returns (uint256)",
  "function createGrowthAccount(uint256 targetAmount, string memory goalName, uint256 initialDeposit) returns (uint256)",
  "function deposit(uint256 accountId, uint256 amount)",
  "function getAccountInfo(address user, uint256 accountId) view returns (string, string, uint256, uint256, uint256, address, bool, uint256, uint256)",
  "function getUserAccounts(address user) view returns (uint256[])",
  "function creationFeeRate() view returns (uint256)",
  "function withdrawalFeeRate() view returns (uint256)",
  "function receiveRewards(uint256 amount) external",
  "function getStats() view returns (uint256, uint256, uint256, uint256, uint256, uint256)"
];

export const OOOWEEE_STABILITY_ABI = [
  "function setLiquidityPair(address _pair)",
  "function capturePercent() view returns (uint256)",
  "function totalETHCaptured() view returns (uint256)",
  "function totalOOOWEEESold() view returns (uint256)", // If it ever sells
  "function getStats() view returns (uint256, uint256)", // ethCaptured, oooweeeBalance
  "function withdrawToValidators()", // Manual or automatic ETH transfer
  "receive() payable"
];

export const OOOWEEE_VALIDATOR_FUND_ABI = [
  "function donate() external payable",
  "function getStats() external view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256)",
  "function ethUntilNextValidator() external view returns (uint256)",
  "function progressToNextValidator() external view returns (uint256, uint256)",
  "function validatorCount() external view returns (uint256)",
  "function pendingETH() external view returns (uint256)",
  "function totalSentToL1() external view returns (uint256)",
  "function totalReceivedFromL1() external view returns (uint256)",
  "function totalDonations() external view returns (uint256)",
  "function uniqueDonors() external view returns (uint256)",
  "function totalFromStability() external view returns (uint256)",
  "function totalFromRewards() external view returns (uint256)",
  "event DonationReceived(address indexed donor, uint256 amount)",
  "event ValidatorFunded(uint256 indexed validatorId, uint256 amount)",
  "event ETHBridgedToL1(uint256 amount, uint256 timestamp)"
];

export const CONTRACT_ADDRESSES = {
    "token": "0xD4eEa41F12FBb3e2030B17FDeaaF8b38c471B32a",
    "savings": "0x08292751eDBedF6e4A09eD1d133FA6b28af49Fc8",
    "validators": "0xC0E5434c7086b4A5cb1Ff86Ba9372a171CA178Ae",
    "stability": "0xBf12716D81F55A9105Fef47816D67Fa84bCd6373",
    "rewardsReceiver": "0x609413Ac27E1c55474d2D8A5721F887d4c8bEdED"
};