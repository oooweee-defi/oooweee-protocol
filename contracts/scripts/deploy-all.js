// scripts/deploy-all.js
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 OOOWEEE Protocol - Sepolia Testnet Deployment");
  console.log("=".repeat(50) + "\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const balance = await deployer.getBalance();
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH\n");

  // Sepolia Config - UPDATED ROUTER & WETH
  const UNISWAP_ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";  // Official Uniswap V2 Sepolia
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
    ethers.constants.AddressZero,
    ethers.constants.AddressZero
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
    OPERATIONS_WALLET  // L1 collector placeholder
  );
  await rewards.deployed();
  deployed.rewards = rewards.address;
  console.log("    ✅", deployed.rewards);

  // ============================================
  // CONFIGURATION
  // ============================================
  console.log("\n🔧 Configuring contracts...\n");

  let tx;
  tx = await validatorFund.setStabilityContract(deployed.stability);
  await tx.wait();
  console.log("✅ ValidatorFund → Stability");
  tx = await validatorFund.setRewardsContract(deployed.rewards);
  await tx.wait();
  console.log("✅ ValidatorFund → Rewards");

  tx = await token.setStabilityMechanism(deployed.stability);
  await tx.wait();
  console.log("✅ Token → Stability mechanism (89M transferred)");

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

  tx = await savings.setRewardsDistributor(deployed.rewards);
  await tx.wait();
  console.log("✅ Savings → Rewards distributor");
  tx = await savings.setFeeCollector(OPERATIONS_WALLET);
  await tx.wait();
  console.log("✅ Savings → Fee collector");

  tx = await oracle.setPriceFeed(0, CHAINLINK_ETH_USD);
  await tx.wait();
  tx = await oracle.setPriceFeed(1, CHAINLINK_ETH_USD);
  await tx.wait();
  console.log("✅ Oracle price feeds set");

  // ============================================
  // OUTPUT
  // ============================================
  console.log("\n" + "=".repeat(50));
  console.log("📋 DEPLOYMENT COMPLETE");
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

// Router & WETH for App.js
const UNISWAP_ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
const WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
`);

  console.log("=".repeat(50));
  console.log("⚠️  NEXT: Create LP on Uniswap UI, then run configure-lp.js");
  console.log("=".repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });