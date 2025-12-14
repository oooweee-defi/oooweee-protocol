// scripts/deploy-all.js
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("🚀 OOOWEEE Protocol - Sepolia Testnet Deployment");
  console.log("=".repeat(50) + "\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

  // ============================================
  // CONFIGURATION - Sepolia Testnet
  // ============================================
  const CONFIG = {
    uniswapRouter: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008",
    founderWallet: "0x56384f1205659291ba5b949d641582af6ae7006b",  // 10M OOOWEEE
    operationsWallet: deployer.address,  // 1M OOOWEEE
    chainlinkEthUsd: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  };

  console.log("Founder Wallet:", CONFIG.founderWallet, "(receives 10M OOOWEEE)");
  console.log("Operations Wallet:", CONFIG.operationsWallet, "(receives 1M OOOWEEE)\n");

  const deployed = {};

  // ============================================
  // 1. Deploy OOOWEEEToken
  // ============================================
  console.log("1/7 Deploying OOOWEEEToken...");
  const Token = await ethers.getContractFactory("OOOWEEEToken");
  const token = await Token.deploy(CONFIG.founderWallet, CONFIG.operationsWallet);
  await token.deployed();
  deployed.token = token.address;
  console.log("    ✅ OOOWEEEToken:", deployed.token);

  // ============================================
  // 2. Deploy SavingsPriceOracle
  // ============================================
  console.log("\n2/7 Deploying SavingsPriceOracle...");
  const Oracle = await ethers.getContractFactory("SavingsPriceOracle");
  const oracle = await Oracle.deploy(CONFIG.uniswapRouter);
  await oracle.deployed();
  deployed.oracle = oracle.address;
  console.log("    ✅ SavingsPriceOracle:", deployed.oracle);

  // ============================================
  // 3. Deploy OOOWEEESavings (NO ROUTER - returns tokens directly)
  // ============================================
  console.log("\n3/7 Deploying OOOWEEESavings...");
  const Savings = await ethers.getContractFactory("OOOWEEESavings");
  const savings = await Savings.deploy(
    deployed.token,
    deployed.oracle
  );
  await savings.deployed();
  deployed.savings = savings.address;
  console.log("    ✅ OOOWEEESavings:", deployed.savings);

  // ============================================
  // 4. Deploy OOOWEEEValidatorFund
  // ============================================
  console.log("\n4/7 Deploying OOOWEEEValidatorFund...");
  const ValidatorFund = await ethers.getContractFactory("OOOWEEEValidatorFund");
  const validatorFund = await ValidatorFund.deploy(
    ethers.constants.AddressZero,
    ethers.constants.AddressZero
  );
  await validatorFund.deployed();
  deployed.validatorFund = validatorFund.address;
  console.log("    ✅ OOOWEEEValidatorFund:", deployed.validatorFund);

  // ============================================
  // 5. Deploy OOOWEEEStability
  // ============================================
  console.log("\n5/7 Deploying OOOWEEEStability...");
  const Stability = await ethers.getContractFactory("OOOWEEEStability");
  const stability = await Stability.deploy(
    deployed.token,
    CONFIG.uniswapRouter,
    deployed.validatorFund
  );
  await stability.deployed();
  deployed.stability = stability.address;
  console.log("    ✅ OOOWEEEStability:", deployed.stability);

  // ============================================
  // 6. Deploy OOOWEEERewardsDistribution
  // ============================================
  console.log("\n6/7 Deploying OOOWEEERewardsDistribution...");
  const Rewards = await ethers.getContractFactory("OOOWEEERewardsDistribution");
  const rewards = await Rewards.deploy(
    deployed.savings,
    deployed.token,
    CONFIG.uniswapRouter,
    deployed.validatorFund,
    CONFIG.operationsWallet,
    CONFIG.operationsWallet
  );
  await rewards.deployed();
  deployed.rewards = rewards.address;
  console.log("    ✅ OOOWEEERewardsDistribution:", deployed.rewards);

  // ============================================
  // 7. Deploy ValidatorCollector
  // ============================================
  console.log("\n7/7 Deploying ValidatorCollector...");
  const Collector = await ethers.getContractFactory("ValidatorCollector");
  const collector = await Collector.deploy(
    "0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1",
    deployed.rewards,
    CONFIG.operationsWallet
  );
  await collector.deployed();
  deployed.collector = collector.address;
  console.log("    ✅ ValidatorCollector:", deployed.collector);

  // ============================================
  // POST-DEPLOYMENT CONFIGURATION
  // ============================================
  console.log("\n" + "=".repeat(50));
  console.log("⚙️  Configuring contracts...\n");

  console.log("Setting stability mechanism in token...");
  const tx1 = await token.setStabilityMechanism(deployed.stability);
  await tx1.wait();
  console.log("    ✅ Stability mechanism set (89M tokens transferred)");

  console.log("Setting stability contract in validator fund...");
  const tx2 = await validatorFund.setStabilityContract(deployed.stability);
  await tx2.wait();
  console.log("    ✅ Stability contract set");

  console.log("Setting rewards contract in validator fund...");
  const tx3 = await validatorFund.setRewardsContract(deployed.rewards);
  await tx3.wait();
  console.log("    ✅ Rewards contract set");

  console.log("Setting rewards distributor in savings...");
  const tx4 = await savings.setRewardsDistributor(deployed.rewards);
  await tx4.wait();
  console.log("    ✅ Rewards distributor set");

  console.log("Setting Chainlink ETH/USD price feed...");
  const tx5 = await oracle.setPriceFeed(0, CONFIG.chainlinkEthUsd);
  await tx5.wait();
  console.log("    ✅ ETH/USD price feed set");

  console.log("Setting emergency fallback prices...");
  const tx6 = await oracle.setEmergencyFixedRate(0, 100);
  await tx6.wait();
  const tx7 = await oracle.setEmergencyFixedRate(1, 100);
  await tx7.wait();
  console.log("    ✅ Emergency prices set");

  // ============================================
  // VERIFY TOKEN DISTRIBUTION
  // ============================================
  console.log("\n" + "=".repeat(50));
  console.log("💰 TOKEN DISTRIBUTION");
  console.log("=".repeat(50));
  
  const founderBalance = await token.balanceOf(CONFIG.founderWallet);
  const opsBalance = await token.balanceOf(CONFIG.operationsWallet);
  const stabilityBalance = await token.balanceOf(deployed.stability);
  
  console.log(`Founder (${CONFIG.founderWallet}): ${ethers.utils.formatEther(founderBalance)} OOOWEEE`);
  console.log(`Operations (${CONFIG.operationsWallet}): ${ethers.utils.formatEther(opsBalance)} OOOWEEE`);
  console.log(`Stability (${deployed.stability}): ${ethers.utils.formatEther(stabilityBalance)} OOOWEEE`);

  // ============================================
  // SAVE DEPLOYMENT
  // ============================================
  const deployment = {
    network: "sepolia",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      token: deployed.token,
      oracle: deployed.oracle,
      savings: deployed.savings,
      validatorFund: deployed.validatorFund,
      stability: deployed.stability,
      rewards: deployed.rewards,
      collector: deployed.collector,
    },
    wallets: {
      founder: CONFIG.founderWallet,
      operations: CONFIG.operationsWallet,
    },
    config: CONFIG,
  };

  fs.writeFileSync(
    "deployment-sepolia.json",
    JSON.stringify(deployment, null, 2)
  );
  console.log("\n✅ Deployment saved to deployment-sepolia.json");

  // ============================================
  // SUMMARY
  // ============================================
  console.log("\n" + "=".repeat(50));
  console.log("📋 DEPLOYMENT SUMMARY");
  console.log("=".repeat(50));
  console.log(`
OOOWEEEToken:               ${deployed.token}
SavingsPriceOracle:         ${deployed.oracle}
OOOWEEESavings:             ${deployed.savings}
OOOWEEEValidatorFund:       ${deployed.validatorFund}
OOOWEEEStability:           ${deployed.stability}
OOOWEEERewardsDistribution: ${deployed.rewards}
ValidatorCollector:         ${deployed.collector}
`);

  console.log("=".repeat(50));
  console.log("📝 NEXT STEPS");
  console.log("=".repeat(50));
  console.log(`
1. CREATE UNISWAP POOL
   Token Address: ${deployed.token}
   Go to: https://app.uniswap.org/#/add/v2/ETH/${deployed.token}
   
2. RUN POOL SETUP
   Update PAIR_ADDRESS in setup-pool.js
   npx hardhat run scripts/setup-pool.js --network sepolia

3. UPDATE FRONTEND
   Copy addresses to your abis.js file
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });