// scripts/setup-pool.js
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("🔧 OOOWEEE Protocol - Pool Setup");
  console.log("=".repeat(50) + "\n");

  // ============================================
  // NEW POOL ADDRESS
  // ============================================
  const PAIR_ADDRESS = "0x9B2474a702605F4f0f48104046a28B3880BaeD54";

  // Load deployment
  let deployment;
  try {
    deployment = JSON.parse(fs.readFileSync("deployment-sepolia.json", "utf8"));
  } catch (e) {
    console.error("❌ ERROR: deployment-sepolia.json not found. Run deploy-all.js first.");
    process.exit(1);
  }

  // Handle both naming conventions in deployment file
  const contracts = {
    token: deployment.contracts.token || deployment.contracts.OOOWEEEToken,
    oracle: deployment.contracts.oracle || deployment.contracts.SavingsPriceOracle,
    stability: deployment.contracts.stability || deployment.contracts.OOOWEEEStability,
    savings: deployment.contracts.savings || deployment.contracts.OOOWEEESavings,
    rewards: deployment.contracts.rewards || deployment.contracts.OOOWEEERewardsDistribution,
    validatorFund: deployment.contracts.validatorFund || deployment.contracts.OOOWEEEValidatorFund,
    collector: deployment.contracts.collector || deployment.contracts.ValidatorCollector,
  };

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Pair Address:", PAIR_ADDRESS);
  console.log("Token Address:", contracts.token);
  console.log();

  // ============================================
  // VERIFY POOL CONTAINS CORRECT TOKEN
  // ============================================
  console.log("🔍 Verifying pool...");
  const pair = await ethers.getContractAt(
    ["function token0() view returns (address)", "function token1() view returns (address)", "function getReserves() view returns (uint112, uint112, uint32)"],
    PAIR_ADDRESS
  );
  
  const token0 = await pair.token0();
  const token1 = await pair.token1();
  
  const tokenLower = contracts.token.toLowerCase();
  if (token0.toLowerCase() !== tokenLower && token1.toLowerCase() !== tokenLower) {
    console.error("❌ ERROR: Pool does not contain OOOWEEE token!");
    console.log("Token0:", token0);
    console.log("Token1:", token1);
    console.log("Expected:", contracts.token);
    process.exit(1);
  }
  console.log("    ✅ Pool contains correct OOOWEEE token\n");

  // ============================================
  // GET CONTRACT INSTANCES
  // ============================================
  const token = await ethers.getContractAt("OOOWEEEToken", contracts.token);
  const oracle = await ethers.getContractAt("SavingsPriceOracle", contracts.oracle);
  const stability = await ethers.getContractAt("OOOWEEEStability", contracts.stability);

  // ============================================
  // CONFIGURE POOL IN ALL CONTRACTS
  // ============================================
  
  console.log("1/5 Setting pool in SavingsPriceOracle...");
  const tx1 = await oracle.setOooweeePool(PAIR_ADDRESS);
  await tx1.wait();
  console.log("    ✅ Oracle pool set");

  console.log("2/5 Setting liquidity pair in OOOWEEEStability...");
  const tx2 = await stability.setLiquidityPair(PAIR_ADDRESS);
  await tx2.wait();
  console.log("    ✅ Stability pair set");

  console.log("3/5 Setting liquidity pair in OOOWEEEToken...");
  const tx3 = await token.setLiquidityPair(PAIR_ADDRESS, true);
  await tx3.wait();
  console.log("    ✅ Token pair set");

  console.log("4/5 Setting exemptions...");
  const tx4 = await token.setExemption(contracts.savings, true);
  await tx4.wait();
  const tx5 = await token.setExemption(contracts.rewards, true);
  await tx5.wait();
  const tx6 = await token.setExemption(PAIR_ADDRESS, true);
  await tx6.wait();
  console.log("    ✅ Exemptions set");

  console.log("5/5 Enabling trading...");
  try {
    const tx7 = await token.enableTrading();
    await tx7.wait();
    console.log("    ✅ Trading enabled");
  } catch (e) {
    if (e.message.includes("Already enabled")) {
      console.log("    ⚠️  Trading already enabled");
    } else {
      throw e;
    }
  }

  // ============================================
  // UPDATE BASELINE PRICE IN STABILITY
  // ============================================
  console.log("\nUpdating baseline price in Stability...");
  const tx8 = await stability.updateBaselinePrice();
  await tx8.wait();
  console.log("    ✅ Baseline price set");

  // ============================================
  // VERIFY SETUP
  // ============================================
  console.log("\n" + "=".repeat(50));
  console.log("🔍 VERIFICATION");
  console.log("=".repeat(50) + "\n");

  const reserves = await pair.getReserves();
  console.log("Reserve0:", ethers.utils.formatEther(reserves[0]));
  console.log("Reserve1:", ethers.utils.formatEther(reserves[1]));

  const currentPrice = await stability.getCurrentPrice();
  console.log("Current OOOWEEE Price:", ethers.utils.formatEther(currentPrice), "ETH");

  const stabilityBalance = await token.balanceOf(contracts.stability);
  console.log("Stability Token Balance:", ethers.utils.formatEther(stabilityBalance), "OOOWEEE");

  const tradingEnabled = await token.tradingEnabled();
  console.log("Trading Enabled:", tradingEnabled);

  // ============================================
  // UPDATE DEPLOYMENT FILE
  // ============================================
  deployment.uniswapPair = PAIR_ADDRESS;
  deployment.setupComplete = true;
  deployment.setupTimestamp = new Date().toISOString();

  fs.writeFileSync(
    "deployment-sepolia.json",
    JSON.stringify(deployment, null, 2)
  );
  console.log("\n✅ Deployment file updated");

  // ============================================
  // GENERATE FRONTEND CONFIG
  // ============================================
  const frontendConfig = `// Frontend Contract Configuration
// Generated: ${new Date().toISOString()}

export const CONTRACT_ADDRESSES = {
  OOOWEEEToken: "${contracts.token}",
  OOOWEEESavings: "${contracts.savings}",
  SavingsPriceOracle: "${contracts.oracle}",
  OOOWEEEStability: "${contracts.stability}",
  OOOWEEEValidatorFund: "${contracts.validatorFund}",
  OOOWEEERewardsDistribution: "${contracts.rewards}",
  ValidatorCollector: "${contracts.collector}",
  UniswapPair: "${PAIR_ADDRESS}",
};

export const NETWORK = {
  chainId: 11155111,
  name: "Sepolia",
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
};
`;

  fs.writeFileSync("frontend-config.js", frontendConfig);
  console.log("✅ Frontend config saved to frontend-config.js");

  console.log("\n" + "=".repeat(50));
  console.log("🎉 SETUP COMPLETE!");
  console.log("=".repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });