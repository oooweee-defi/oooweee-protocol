/**
 * OOOWEEE Protocol — Post-Deploy Verification
 *
 * 1. Bootstraps TWAP by calling oracle.updateTWAP()
 * 2. Verifies all cross-contract references
 * 3. Checks oracle pricing, decimals, feeds
 * 4. Prints security checklist
 * 5. Prints addresses formatted for frontend copy-paste
 *
 * Usage: npx hardhat run scripts/verify-deployment.js --network mainnet
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("OOOWEEE Protocol — Post-Deploy Verification");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

  // Load deployment
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ deployment.json not found. Run deploy.js first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const c = deployment.contracts;
  let passed = 0;
  let failed = 0;

  function check(label, condition) {
    if (condition) {
      console.log(`  ✓ ${label}`);
      passed++;
    } else {
      console.log(`  ✗ ${label}`);
      failed++;
    }
  }

  // Get contract instances
  const token = await ethers.getContractAt("OOOWEEEToken", c.OOOWEEEToken);
  const oracle = await ethers.getContractAt("SavingsPriceOracle", c.SavingsPriceOracle);
  const savings = await ethers.getContractAt("OOOWEEESavings", c.OOOWEEESavings);
  const validatorFund = await ethers.getContractAt("OOOWEEEValidatorFund", c.OOOWEEEValidatorFund);
  const stability = await ethers.getContractAt("OOOWEEEStability", c.OOOWEEEStability);
  const donorRegistry = await ethers.getContractAt("DonorRegistry", c.DonorRegistry);

  // ============ STEP 1: BOOTSTRAP TWAP ============
  console.log("--- Step 1: TWAP Bootstrap ---");
  if (deployment.uniswapPair) {
    try {
      console.log("Calling oracle.updateTWAP()...");
      const tx = await oracle.updateTWAP();
      await tx.wait();
      console.log("  ✓ TWAP bootstrapped");
    } catch (e) {
      console.log("  ⚠️  TWAP update:", e.reason || e.message);
    }
  } else {
    console.log("  ⚠️  No Uniswap pair in deployment.json — run setup-liquidity.js first");
  }

  // ============ STEP 2: TOKEN CHECKS ============
  console.log("\n--- Step 2: Token ---");
  const totalSupply = await token.totalSupply();
  check("Total supply = 100M", totalSupply.eq(ethers.utils.parseUnits("100000000", 18)));

  const founderBal = await token.balanceOf(deployment.wallets.founder);
  check("Founder has 10M", founderBal.eq(ethers.utils.parseUnits("10000000", 18)));

  const tradingEnabled = await token.tradingEnabled();
  check("Trading enabled", tradingEnabled);

  const stabilityBal = await token.balanceOf(c.OOOWEEEStability);
  check("Stability has 80M", stabilityBal.eq(ethers.utils.parseUnits("80000000", 18)));

  // ============ STEP 3: ORACLE CHECKS ============
  console.log("\n--- Step 3: Oracle ---");

  // Decimals
  for (const [name, code] of [["USD", 0], ["EUR", 1], ["GBP", 2]]) {
    const dec = await oracle.currencyDecimals(code);
    check(`${name} decimals = 8`, dec === 8);
  }

  // Price feeds
  const usdFeed = await oracle.priceFeeds(0);
  check("USD feed = ETH/USD", usdFeed.toLowerCase() === deployment.config.chainlinkEthUsd.toLowerCase());

  const eurFeed = await oracle.priceFeeds(1);
  check("EUR feed = EUR/USD", eurFeed.toLowerCase() === deployment.config.chainlinkEurUsd.toLowerCase());

  const gbpFeed = await oracle.priceFeeds(2);
  check("GBP feed = GBP/USD", gbpFeed.toLowerCase() === deployment.config.chainlinkGbpUsd.toLowerCase());

  // Try reading prices
  for (const [name, code] of [["USD", 0], ["EUR", 1], ["GBP", 2]]) {
    try {
      const price = await oracle.getOooweeePriceView(code);
      console.log(`  ℹ ${name} price: ${price.toString()} (${Number(price) / 1e8} ${name})`);
    } catch (e) {
      console.log(`  ⚠️  ${name} price view failed: ${e.reason || e.message}`);
    }
  }

  // Pool
  if (deployment.uniswapPair) {
    const pool = await oracle.oooweeePool();
    check("Oracle pool set", pool.toLowerCase() === deployment.uniswapPair.toLowerCase());
  }

  // ============ STEP 4: SAVINGS CHECKS ============
  console.log("\n--- Step 4: Savings ---");

  const savingsToken = await savings.oooweeeToken();
  check("Savings → token", savingsToken.toLowerCase() === c.OOOWEEEToken.toLowerCase());

  const savingsOracle = await savings.priceOracle();
  check("Savings → oracle", savingsOracle.toLowerCase() === c.SavingsPriceOracle.toLowerCase());

  const rewardsDistributor = await savings.rewardsDistributor();
  check("Savings → rewardsDistributor", rewardsDistributor.toLowerCase() === c.OOOWEEEValidatorFund.toLowerCase());

  const batch = await savings.maxAutoProcessBatch();
  check("maxAutoProcessBatch = 20", batch.toNumber() === 20);

  // ============ STEP 5: VALIDATOR FUND CHECKS ============
  console.log("\n--- Step 5: ValidatorFund ---");

  const vfToken = await validatorFund.oooweeeToken();
  check("VF → token", vfToken.toLowerCase() === c.OOOWEEEToken.toLowerCase());

  const vfSavings = await validatorFund.savingsContract();
  check("VF → savings", vfSavings.toLowerCase() === c.OOOWEEESavings.toLowerCase());

  const vfStability = await validatorFund.stabilityContract();
  check("VF → stability", vfStability.toLowerCase() === c.OOOWEEEStability.toLowerCase());

  // ============ STEP 6: STABILITY CHECKS ============
  console.log("\n--- Step 6: Stability ---");

  const stabToken = await stability.oooweeeToken();
  check("Stability → token", stabToken.toLowerCase() === c.OOOWEEEToken.toLowerCase());

  const stabVF = await stability.validatorFundWallet();
  check("Stability → validatorFundWallet", stabVF.toLowerCase() === c.OOOWEEEValidatorFund.toLowerCase());

  if (deployment.uniswapPair) {
    const stabPair = await stability.liquidityPair();
    check("Stability → LP pair", stabPair.toLowerCase() === deployment.uniswapPair.toLowerCase());
  }

  // ============ RESULTS ============
  console.log("\n" + "=".repeat(60));
  console.log(`VERIFICATION: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.log("\n⚠️  Some checks failed — review above before proceeding.");
  }

  // ============ SECURITY CHECKLIST ============
  console.log("\n🔒 POST-DEPLOY SECURITY CHECKLIST:");
  console.log("  [ ] Transfer proxy admin ownership to multisig (Gnosis Safe)");
  console.log("  [ ] Consider LP token lock/burn");
  console.log("  [ ] Rotate deployer key (don't reuse for day-to-day)");
  console.log("  [ ] Delete PRIVATE_KEY from .env after deploy");
  console.log("  [ ] Verify all contracts on Etherscan:");
  console.log(`      npx hardhat verify --network mainnet ${c.OOOWEEEToken}`);
  console.log(`      npx hardhat verify --network mainnet ${c.SavingsPriceOracle}`);
  console.log(`      npx hardhat verify --network mainnet ${c.OOOWEEEValidatorFund}`);
  console.log(`      npx hardhat verify --network mainnet ${c.OOOWEEEStability}`);
  console.log("  [ ] Review WEB3AUTH_CLIENT_ID for mainnet");
  console.log("  [ ] Review TRANSAK_API_KEY for mainnet");

  // ============ FRONTEND COPY-PASTE ============
  console.log("\n📋 FRONTEND abis.js — Copy these addresses:");
  console.log("─".repeat(50));
  console.log(`export const CONTRACT_ADDRESSES = {`);
  console.log(`  OOOWEEEToken: "${c.OOOWEEEToken}",`);
  console.log(`  OOOWEEESavings: "${c.OOOWEEESavings}",`);
  console.log(`  OOOWEEEValidatorFund: "${c.OOOWEEEValidatorFund}",`);
  console.log(`  OOOWEEEStability: "${c.OOOWEEEStability}",`);
  console.log(`  SavingsPriceOracle: "${c.SavingsPriceOracle}",`);
  console.log(`  DonorRegistry: "${c.DonorRegistry}",`);
  console.log(`  UniswapPair: "${deployment.uniswapPair || "0x0000000000000000000000000000000000000000"}"`);
  console.log(`};`);
  console.log("─".repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ VERIFICATION FAILED:");
    console.error(error);
    process.exit(1);
  });
