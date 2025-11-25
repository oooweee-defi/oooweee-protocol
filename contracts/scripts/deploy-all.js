// scripts/deploy-all.js
const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 OOOWEEE Protocol - Sepolia Testnet Deployment");
  console.log("=".repeat(50) + "\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await deployer.getBalance();
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH\n");

  // Sepolia Config
  const UNISWAP_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
  const FOUNDER_WALLET = "0x56384f1205659291ba5b949d641582af6ae7006b";
  const OPERATIONS_WALLET = "0xb05f42b174e5152d34431ee4504210932ddfe715";
  const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  const deployed = {};

  // 1. OOOWEEEToken
  console.log("1/6 Deploying OOOWEEEToken...");
  const Token = await ethers.getContractFactory("OOOWEEEToken");
  const token = await Token.deploy(FOUNDER_WALLET, OPERATIONS_WALLET);
  await token.deployed();
  deployed.token = token.address;
  console.log("    ✅", deployed.token);

  // 2. SavingsPriceOracle
  console.log("2/6 Deploying SavingsPriceOracle...");
  const Oracle = await ethers.getContractFactory("SavingsPriceOracle");
  const oracle = await Oracle.deploy(UNISWAP_ROUTER);
  await oracle.deployed();
  deployed.oracle = oracle.address;
  console.log("    ✅", deployed.oracle);

  // 3. OOOWEEEValidatorFund
  console.log("3/6 Deploying OOOWEEEValidatorFund...");
  const ValidatorFund = await ethers.getContractFactory("OOOWEEEValidatorFund");
  const validatorFund = await ValidatorFund.deploy(
    ethers.constants.AddressZero,  // stability - set later
    ethers.constants.AddressZero   // rewards - set later
  );
  await validatorFund.deployed();
  deployed.validatorFund = validatorFund.address;
  console.log("    ✅", deployed.validatorFund);

  // 4. OOOWEEEStability
  console.log("4/6 Deploying OOOWEEEStability...");
  const Stability = await ethers.getContractFactory("OOOWEEEStability");
  const stability = await Stability.deploy(
    deployed.token,
    UNISWAP_ROUTER,
    deployed.validatorFund
  );
  await stability.deployed();
  deployed.stability = stability.address;
  console.log("    ✅", deployed.stability);

  // 5. OOOWEEESavings
  console.log("5/6 Deploying OOOWEEESavings...");
  const Savings = await ethers.getContractFactory("OOOWEEESavings");
  const savings = await Savings.deploy(
    deployed.token,
    UNISWAP_ROUTER,
    deployed.oracle
  );
  await savings.deployed();
  deployed.savings = savings.address;
  console.log("    ✅", deployed.savings);

  // 6. OOOWEEERewardsDistribution
  console.log("6/6 Deploying OOOWEEERewardsDistribution...");
  const Rewards = await ethers.getContractFactory("OOOWEEERewardsDistribution");
  const rewards = await Rewards.deploy(
    deployed.savings,
    deployed.token,
    UNISWAP_ROUTER,
    deployed.validatorFund,
    OPERATIONS_WALLET,
    OPERATIONS_WALLET  // L1 collector - not used on testnet
  );
  await rewards.deployed();
  deployed.rewards = rewards.address;
  console.log("    ✅", deployed.rewards);

  // ============================================
  // CONFIGURATION
  // ============================================
  console.log("\n🔧 Configuring contracts...\n");

  // ValidatorFund connections
  let tx;
  tx = await validatorFund.setStabilityContract(deployed.stability);
  await tx.wait();
  console.log("✅ ValidatorFund → Stability");
  tx = await validatorFund.setRewardsContract(deployed.rewards);
  await tx.wait();
  console.log("✅ ValidatorFund → Rewards");

  // Token setup
  tx = await token.setStabilityMechanism(deployed.stability);
  await tx.wait();
  console.log("✅ Token → Stability mechanism");

  // Exemptions
  tx = await token.setExemption(deployed.stability, true);
  await tx.wait();
  tx = await token.setExemption(deployed.savings, true);
  await tx.wait();
  tx = await token.setExemption(deployed.validatorFund, true);
  await tx.wait();
  tx = await token.setExemption(deployed.rewards, true);
  await tx.wait();
  tx = await token.setExemption(UNISWAP_ROUTER, true);
  await tx.wait();
  console.log("✅ Protocol exemptions set");

  // Savings setup
  tx = await savings.setRewardsDistributor(deployed.rewards);
  await tx.wait();
  console.log("✅ Savings → Rewards distributor");
  tx = await savings.setFeeCollector(OPERATIONS_WALLET);
  await tx.wait();
  console.log("✅ Savings → Fee collector");

  // Oracle setup
  tx = await oracle.setPriceFeed(0, CHAINLINK_ETH_USD);  // USD
  await tx.wait();
  tx = await oracle.setPriceFeed(1, CHAINLINK_ETH_USD);  // EUR (using USD feed for testnet)
  await tx.wait();
  console.log("✅ Oracle price feeds set");

  // Transfer stability reserve (89M tokens)
  console.log("\n💰 Transferring 89M tokens to Stability...");
  tx = await token.transfer(deployed.stability, ethers.utils.parseEther("89000000"));
  await tx.wait();
  console.log("✅ Stability reserve funded");

  // ============================================
  // OUTPUT
  // ============================================
  console.log("\n" + "=".repeat(50));
  console.log("📋 DEPLOYMENT COMPLETE - Copy to abis.js:");
  console.log("=".repeat(50));
  console.log(`
export const CONTRACT_ADDRESSES = {
  OOOWEEEToken: "${deployed.token}",
  OOOWEEESavings: "${deployed.savings}",
  OOOWEEEValidatorFund: "${deployed.validatorFund}",
  OOOWEEEStability: "${deployed.stability}",
  OOOWEEERewardsDistribution: "${deployed.rewards}",
  SavingsPriceOracle: "${deployed.oracle}"
};
`);

  console.log("=".repeat(50));
  console.log("⚠️  AFTER CREATING UNISWAP LP:");
  console.log("=".repeat(50));
  console.log(`
// Run these after adding liquidity:

const LP_ADDRESS = "<YOUR_LP_ADDRESS>";

// 1. Set LP on Stability
const stability = await ethers.getContractAt("OOOWEEEStability", "${deployed.stability}");
await stability.setLiquidityPair(LP_ADDRESS);

// 2. Set LP on Token
const token = await ethers.getContractAt("OOOWEEEToken", "${deployed.token}");
await token.setLiquidityPair(LP_ADDRESS, true);

// 3. Set pool on Oracle
const oracle = await ethers.getContractAt("SavingsPriceOracle", "${deployed.oracle}");
await oracle.setOooweeePool(LP_ADDRESS);

// 4. Enable trading
await token.enableTrading();
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });