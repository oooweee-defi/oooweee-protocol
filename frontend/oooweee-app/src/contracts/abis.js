export const OOOWEEE_TOKEN_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
];

export const OOOWEEE_SAVINGS_ABI = [
  "function createTimeAccount(uint256 unlockTime, string memory goalName) returns (uint256)",
  "function createBalanceAccount(uint256 targetAmount, address recipient, string memory goalName) returns (uint256)",
  "function createGrowthAccount(uint256 targetAmount, string memory goalName) returns (uint256)",
  "function deposit(uint256 accountId, uint256 amount)",
  "function getAccountInfo(address user, uint256 accountId) view returns (string, string, uint256, uint256, uint256, address, bool, uint256, string)",
  "function getUserAccounts(address user) view returns (uint256[])",
  "function accountCreationFee() view returns (uint256)",
  "function withdrawalFeeRate() view returns (uint256)"
];

export const CONTRACT_ADDRESSES = {
  token: "0x26201D30f17d7a607bfbCb13Cf724AbEbE9cF649",
  savings: "0x3B6CB4042367d96bD9E14A3A48DF26d15537c05c"
};