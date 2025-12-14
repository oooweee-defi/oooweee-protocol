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
    // Uniswap V2 Router - MUST MATCH FRONTEND (App.js)
    uniswapRouter: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
    wethAddress: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    founderWallet: "0x56384f1205659291ba5b949d641582af6ae7006b",  // 10M OOOWEEE
    operationsWallet: deployer.address,  // 1M OOOWEEE
    // Chainlink Price Feeds (Sepolia)
    chainlinkEthUsd: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    // Note: EUR and GBP feeds may not exist on Sepolia - we'll use USD with manual conversion
    // For mainnet, use proper EUR/USD and GBP/USD feeds
    chainlinkEurUsd: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // Placeholder - uses USD
    chainlinkGbpUsd: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // Placeholder - uses USD
    // L2 Bridge (Sepolia)
    l2Bridge: "0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1",
  };

  // Currency enum: USD=0, EUR=1, GBP=2
  const Currency = {
    USD: 0,
    EUR: 1,
    GBP: 2
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
  // 3. Deploy OOOWEEESavings
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
    ethers.constants.AddressZero,  // stability contract (set later)
    ethers.constants.AddressZero   // rewards contract (set later)
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
    CONFIG.operationsWallet  // L1 validator collector placeholder
  );
  await rewards.deployed();
  deployed.rewards = rewards.address;
  console.log("    ✅ OOOWEEERewardsDistribution:", deployed.rewards);

  // ============================================
  // 7. Deploy ValidatorCollector (L1 Contract)
  // ============================================
  console.log("\n7/7 Deploying ValidatorCollector...");
  const Collector = await ethers.getContractFactory("ValidatorCollector");
  const collector = await Collector.deploy(
    CONFIG.l2Bridge,
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

  // Token configuration
  console.log("Setting stability mechanism in token...");
  const tx1 = await token.setStabilityMechanism(deployed.stability);
  await tx1.wait();
  console.log("    ✅ Stability mechanism set (89M tokens transferred)");

  // ValidatorFund configuration
  console.log("Setting stability contract in validator fund...");
  const tx2 = await validatorFund.setStabilityContract(deployed.stability);
  await tx2.wait();
  console.log("    ✅ Stability contract set");

  console.log("Setting rewards contract in validator fund...");
  const tx3 = await validatorFund.setRewardsContract(deployed.rewards);
  await tx3.wait();
  console.log("    ✅ Rewards contract set");

  // Savings configuration
  console.log("Setting rewards distributor in savings...");
  const tx4 = await savings.setRewardsDistributor(deployed.rewards);
  await tx4.wait();
  console.log("    ✅ Rewards distributor set");

  // ============================================
  // ORACLE CONFIGURATION - USD/EUR/GBP
  // ============================================
  console.log("\nConfiguring price oracle for USD/EUR/GBP...");

  // Set Chainlink price feeds
  console.log("Setting Chainlink ETH/USD price feed (USD)...");
  const tx5 = await oracle.setPriceFeed(Currency.USD, CONFIG.chainlinkEthUsd);
  await tx5.wait();
  console.log("    ✅ USD price feed set");

  console.log("Setting Chainlink price feed (EUR)...");
  const tx6 = await oracle.setPriceFeed(Currency.EUR, CONFIG.chainlinkEurUsd);
  await tx6.wait();
  console.log("    ✅ EUR price feed set");

  console.log("Setting Chainlink price feed (GBP)...");
  const tx7 = await oracle.setPriceFeed(Currency.GBP, CONFIG.chainlinkGbpUsd);
  await tx7.wait();
  console.log("    ✅ GBP price feed set");

  // Set emergency fallback prices (in 4 decimal format: 10000 = $1.00)
  // These are fallback prices per OOOWEEE token if oracle fails
  // Setting to ~$0.001 per token as emergency fallback
  const emergencyPrice = 10; // $0.001 in 4-decimal format
  
  console.log("Setting emergency fallback prices...");
  const tx8 = await oracle.setEmergencyFixedRate(Currency.USD, emergencyPrice);
  await tx8.wait();
  const tx9 = await oracle.setEmergencyFixedRate(Currency.EUR, emergencyPrice);
  await tx9.wait();
  const tx10 = await oracle.setEmergencyFixedRate(Currency.GBP, emergencyPrice);
  await tx10.wait();
  console.log("    ✅ Emergency prices set for USD/EUR/GBP");

  // Set default prices (used if Chainlink fails but before emergency)
  console.log("Setting default oracle prices...");
  const tx11 = await oracle.setDefaultPrice(Currency.USD, emergencyPrice);
  await tx11.wait();
  const tx12 = await oracle.setDefaultPrice(Currency.EUR, emergencyPrice);
  await tx12.wait();
  const tx13 = await oracle.setDefaultPrice(Currency.GBP, emergencyPrice);
  await tx13.wait();
  console.log("    ✅ Default prices set for USD/EUR/GBP");

  // ============================================
  // VERIFY TOKEN DISTRIBUTION
  // ============================================
  console.log("\n" + "=".repeat(50));
  console.log("💰 TOKEN DISTRIBUTION");
  console.log("=".repeat(50));
  
  const founderBalance = await token.balanceOf(CONFIG.founderWallet);
  const opsBalance = await token.balanceOf(CONFIG.operationsWallet);
  const stabilityBalance = await token.balanceOf(deployed.stability);
  const totalSupply = await token.totalSupply();
  
  console.log(`Founder (${CONFIG.founderWallet}): ${ethers.utils.formatEther(founderBalance)} OOOWEEE`);
  console.log(`Operations (${CONFIG.operationsWallet}): ${ethers.utils.formatEther(opsBalance)} OOOWEEE`);
  console.log(`Stability (${deployed.stability}): ${ethers.utils.formatEther(stabilityBalance)} OOOWEEE`);
  console.log(`Total Supply: ${ethers.utils.formatEther(totalSupply)} OOOWEEE`);

  // ============================================
  // SAVE DEPLOYMENT
  // ============================================
  const deployment = {
    network: "sepolia",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      OOOWEEEToken: deployed.token,
      SavingsPriceOracle: deployed.oracle,
      OOOWEEESavings: deployed.savings,
      OOOWEEEValidatorFund: deployed.validatorFund,
      OOOWEEEStability: deployed.stability,
      OOOWEEERewardsDistribution: deployed.rewards,
      ValidatorCollector: deployed.collector,
    },
    wallets: {
      founder: CONFIG.founderWallet,
      operations: CONFIG.operationsWallet,
    },
    config: CONFIG,
    currencies: ["USD", "EUR", "GBP"],
  };

  fs.writeFileSync(
    "deployment-sepolia.json",
    JSON.stringify(deployment, null, 2)
  );
  console.log("\n✅ Deployment saved to deployment-sepolia.json");

  // ============================================
  // GENERATE FRONTEND ABI CONFIG
  // ============================================
  const abiConfig = `// Auto-generated contract addresses - ${new Date().toISOString()}
export const CONTRACT_ADDRESSES = {
  OOOWEEEToken: "${deployed.token}",
  OOOWEEESavings: "${deployed.savings}",
  OOOWEEEValidatorFund: "${deployed.validatorFund}",
  OOOWEEEStability: "${deployed.stability}",
  OOOWEEERewardsDistribution: "${deployed.rewards}",
  SavingsPriceOracle: "${deployed.oracle}",
  ValidatorCollector: "${deployed.collector}",
};
`;

  fs.writeFileSync("frontend-addresses.js", abiConfig);
  console.log("✅ Frontend addresses saved to frontend-addresses.js");

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

Supported Currencies: USD (0), EUR (1), GBP (2)
`);

  console.log("=".repeat(50));
  console.log("📝 NEXT STEPS");
  console.log("=".repeat(50));
  console.log(`
1. ENABLE TRADING
   await token.enableTrading()

2. CREATE UNISWAP POOL
   Token Address: ${deployed.token}
   Go to: https://app.uniswap.org/#/add/v2/ETH/${deployed.token}
   
3. CONFIGURE POOL IN CONTRACTS
   After creating pool, run:
   
   // Get pool address from Uniswap factory
   const PAIR_ADDRESS = "0x..."; // Your pool address
   
   // Set in oracle
   await oracle.setOooweeePool(PAIR_ADDRESS);
   
   // Set in stability
   await stability.setLiquidityPair(PAIR_ADDRESS);
   
   // Set in token
   await token.setLiquidityPair(PAIR_ADDRESS, true);
   
   // Update baseline price
   await stability.updateBaselinePrice();

4. UPDATE FRONTEND
   Copy addresses from frontend-addresses.js to your abis.js file

5. VERIFY CONTRACTS ON ETHERSCAN
   npx hardhat verify --network sepolia ${deployed.token} "${CONFIG.founderWallet}" "${CONFIG.operationsWallet}"
   npx hardhat verify --network sepolia ${deployed.oracle} "${CONFIG.uniswapRouter}"
   npx hardhat verify --network sepolia ${deployed.savings} "${deployed.token}" "${deployed.oracle}"
   // ... etc
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
