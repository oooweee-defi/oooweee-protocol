// scripts/deploy-all.js
const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 OOOWEEE Protocol - Sepolia Testnet Deployment");
  console.log("=".repeat(50) + "\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

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
  await token.waitForDeployment();
  deployed.token = await token.getAddress();
  console.log("    ✅", deployed.token);

  // 2. SavingsPriceOracle
  console.log("2/6 Deploying SavingsPriceOracle...");
  const Oracle = await ethers.getContractFactory("SavingsPriceOracle");
  const oracle = await Oracle.deploy(UNISWAP_ROUTER);
  await oracle.waitForDeployment();
  deployed.oracle = await oracle.getAddress();
  console.log("    ✅", deployed.oracle);

  // 3. OOOWEEEValidatorFund
  console.log("3/6 Deploying OOOWEEEValidatorFund...");
  const ValidatorFund = await ethers.getContractFactory("OOOWEEEValidatorFund");
  const validatorFund = await ValidatorFund.deploy(
    ethers.ZeroAddress,  // stability - set later
    ethers.ZeroAddress   // rewards - set later
  );
  await validatorFund.waitForDeployment();
  deployed.validatorFund = await validatorFund.getAddress();
  console.log("    ✅", deployed.validatorFund);

  // 4. OOOWEEEStability
  console.log("4/6 Deploying OOOWEEEStability...");
  const Stability = await ethers.getContractFactory("OOOWEEEStability");
  const stability = await Stability.deploy(
    deployed.token,
    UNISWAP_ROUTER,
    deployed.validatorFund
  );
  await stability.waitForDeployment();
  deployed.stability = await stability.getAddress();
  console.log("    ✅", deployed.stability);

  // 5. OOOWEEESavings
  console.log("5/6 Deploying OOOWEEESavings...");
  const Savings = await ethers.getContractFactory("OOOWEEESavings");
  const savings = await Savings.deploy(
    deployed.token,
    UNISWAP_ROUTER,
    deployed.oracle
  );
  await savings.waitForDeployment();
  deployed.savings = await savings.getAddress();
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
    ethers.ZeroAddress  // L1 collector - not used on testnet
  );
  await rewards.waitForDeployment();
  deployed.rewards = await rewards.getAddress();
  console.log("    ✅", deployed.rewards);

  // ============================================
  // CONFIGURATION
  // ============================================
  console.log("\n🔧 Configuring contracts...\n");

  // ValidatorFund connections
  const vf = await ethers.getContractAt("OOOWEEEValidatorFund", deployed.validatorFund);
  await (await vf.setStabilityContract(deployed.stability)).wait();
  console.log("✅ ValidatorFund → Stability");
  await (await vf.setRewardsContract(deployed.rewards)).wait();
  console.log("✅ ValidatorFund → Rewards");

  // Token setup
  const tk = await ethers.getContractAt("OOOWEEEToken", deployed.token);
  await (await tk.setStabilityMechanism(deployed.stability)).wait();
  console.log("✅ Token → Stability mechanism");

  // Exemptions
  await (await tk.setExemption(deployed.stability, true)).wait();
  await (await tk.setExemption(deployed.savings, true)).wait();
  await (await tk.setExemption(deployed.validatorFund, true)).wait();
  await (await tk.setExemption(deployed.rewards, true)).wait();
  await (await tk.setExemption(UNISWAP_ROUTER, true)).wait();
  console.log("✅ Protocol exemptions set");

  // Savings setup
  const sv = await ethers.getContractAt("OOOWEEESavings", deployed.savings);
  await (await sv.setRewardsDistributor(deployed.rewards)).wait();
  console.log("✅ Savings → Rewards distributor");
  await (await sv.setFeeCollector(OPERATIONS_WALLET)).wait();
  console.log("✅ Savings → Fee collector");

  // Oracle setup
  const or = await ethers.getContractAt("SavingsPriceOracle", deployed.oracle);
  await (await or.setPriceFeed(0, CHAINLINK_ETH_USD)).wait();  // USD
  await (await or.setPriceFeed(1, CHAINLINK_ETH_USD)).wait();  // EUR (using USD feed for testnet)
  console.log("✅ Oracle price feeds set");

  // Transfer stability reserve (89M tokens)
  console.log("\n💰 Transferring 89M tokens to Stability...");
  await (await tk.transfer(deployed.stability, ethers.parseEther("89000000"))).wait();
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