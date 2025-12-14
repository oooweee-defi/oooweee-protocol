// scripts/verify-deployment.js
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("🔍 OOOWEEE Protocol - Deployment Verification");
  console.log("=".repeat(50) + "\n");

  // Load deployment
  let deployment;
  try {
    deployment = JSON.parse(fs.readFileSync("deployment-sepolia.json", "utf8"));
  } catch (e) {
    console.error("❌ ERROR: deployment-sepolia.json not found.");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("Checking as:", deployer.address);
  console.log();

  let allPassed = true;

  // ============================================
  // CHECK TOKEN
  // ============================================
  console.log("📦 OOOWEEEToken");
  try {
    const token = await ethers.getContractAt("OOOWEEEToken", deployment.contracts.token);
    const name = await token.name();
    const symbol = await token.symbol();
    const totalSupply = await token.totalSupply();
    const tradingEnabled = await token.tradingEnabled();
    const founderBalance = await token.balanceOf(deployment.deployer);
    
    console.log(`   Name: ${name}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Total Supply: ${ethers.utils.formatEther(totalSupply)} OOOWEEE`);
    console.log(`   Trading Enabled: ${tradingEnabled}`);
    console.log(`   Founder Balance: ${ethers.utils.formatEther(founderBalance)} OOOWEEE`);
    console.log("   ✅ Token OK\n");
  } catch (e) {
    console.log("   ❌ Token check failed:", e.message, "\n");
    allPassed = false;
  }

  // ============================================
  // CHECK ORACLE
  // ============================================
  console.log("📦 SavingsPriceOracle");
  try {
    const oracle = await ethers.getContractAt("SavingsPriceOracle", deployment.contracts.oracle);
    const pool = await oracle.oooweeePool();
    const activePriceSource = await oracle.activePriceSource();
    
    console.log(`   Pool Address: ${pool}`);
    console.log(`   Active Price Source: ${activePriceSource}`);
    
    if (pool !== ethers.constants.AddressZero) {
      try {
        const price = await oracle.getOooweeePriceView(0); // USD
        console.log(`   OOOWEEE Price (USD): ${price} cents`);
      } catch (e) {
        console.log(`   Price fetch failed (pool may need liquidity)`);
      }
    }
    console.log("   ✅ Oracle OK\n");
  } catch (e) {
    console.log("   ❌ Oracle check failed:", e.message, "\n");
    allPassed = false;
  }

  // ============================================
  // CHECK SAVINGS
  // ============================================
  console.log("📦 OOOWEEESavings");
  try {
    const savings = await ethers.getContractAt("OOOWEEESavings", deployment.contracts.savings);
    const stats = await savings.getStatsView();
    const rewardsDistributor = await savings.rewardsDistributor();
    
    console.log(`   Total Value Locked: ${ethers.utils.formatEther(stats._totalValueLocked)} OOOWEEE`);
    console.log(`   Total Accounts: ${stats._totalAccountsCreated}`);
    console.log(`   Goals Completed: ${stats._totalGoalsCompleted}`);
    console.log(`   Rewards Distributor: ${rewardsDistributor}`);
    console.log("   ✅ Savings OK\n");
  } catch (e) {
    console.log("   ❌ Savings check failed:", e.message, "\n");
    allPassed = false;
  }

  // ============================================
  // CHECK STABILITY
  // ============================================
  console.log("📦 OOOWEEEStability");
  try {
    const stability = await ethers.getContractAt("OOOWEEEStability", deployment.contracts.stability);
    const token = await ethers.getContractAt("OOOWEEEToken", deployment.contracts.token);
    
    const tokenBalance = await token.balanceOf(deployment.contracts.stability);
    const baselinePrice = await stability.baselinePrice();
    const totalInterventions = await stability.totalInterventions();
    const circuitBreaker = await stability.circuitBreakerTripped();
    
    console.log(`   Token Balance: ${ethers.utils.formatEther(tokenBalance)} OOOWEEE`);
    console.log(`   Baseline Price: ${ethers.utils.formatEther(baselinePrice)} ETH`);
    console.log(`   Total Interventions: ${totalInterventions}`);
    console.log(`   Circuit Breaker: ${circuitBreaker ? "TRIPPED" : "OK"}`);
    console.log("   ✅ Stability OK\n");
  } catch (e) {
    console.log("   ❌ Stability check failed:", e.message, "\n");
    allPassed = false;
  }

  // ============================================
  // CHECK VALIDATOR FUND
  // ============================================
  console.log("📦 OOOWEEEValidatorFund");
  try {
    const validatorFund = await ethers.getContractAt("OOOWEEEValidatorFund", deployment.contracts.validatorFund);
    const stats = await validatorFund.getStats();
    
    console.log(`   Validators Created: ${stats._validatorsCreated}`);
    console.log(`   Pending ETH: ${ethers.utils.formatEther(stats._pendingETH)} ETH`);
    console.log(`   Total ETH Received: ${ethers.utils.formatEther(stats._totalETHReceived)} ETH`);
    console.log("   ✅ ValidatorFund OK\n");
  } catch (e) {
    console.log("   ❌ ValidatorFund check failed:", e.message, "\n");
    allPassed = false;
  }

  // ============================================
  // CHECK REWARDS DISTRIBUTION
  // ============================================
  console.log("📦 OOOWEEERewardsDistribution");
  try {
    const rewards = await ethers.getContractAt("OOOWEEERewardsDistribution", deployment.contracts.rewards);
    const status = await rewards.getStatus();
    
    console.log(`   Total Received: ${ethers.utils.formatEther(status._totalReceived)} ETH`);
    console.log(`   To Savers: ${ethers.utils.formatEther(status._toSavers)} ETH`);
    console.log(`   To Validators: ${ethers.utils.formatEther(status._toValidators)} ETH`);
    console.log(`   Pending: ${ethers.utils.formatEther(status._pending)} ETH`);
    console.log("   ✅ Rewards OK\n");
  } catch (e) {
    console.log("   ❌ Rewards check failed:", e.message, "\n");
    allPassed = false;
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log("=".repeat(50));
  if (allPassed) {
    console.log("✅ ALL CHECKS PASSED");
  } else {
    console.log("⚠️  SOME CHECKS FAILED - Review above");
  }
  console.log("=".repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });