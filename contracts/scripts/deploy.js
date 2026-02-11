/**
 * OOOWEEE Protocol — Mainnet Deployment
 *
 * Deploys all 6 contracts as UUPS proxies with flattened Savings.
 * Reads wallet addresses from .env — nothing hardcoded.
 *
 * IMPORTANT (M-2 R2): Do NOT call ValidatorFund.distributeRewards() before at
 * least one savings account exists. If rewards arrive when totalDepositedBalance == 0,
 * they accumulate in pendingRewards and the first depositor captures 100%.
 * Deployment order: deploy → setup-liquidity → verify → setup-chainlink → create
 * at least one savings account → THEN start reward distribution.
 *
 * Usage: npx hardhat run scripts/deploy.js --network mainnet
 */
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============ MAINNET ADDRESSES ============
const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const CHAINLINK_ETH_USD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const CHAINLINK_EUR_USD = "0xb49f677943BC038e9857d61E7d053CaA2C1734C1";
const CHAINLINK_GBP_USD = "0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("OOOWEEE Protocol — Mainnet Deployment");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);

  const balance = await deployer.getBalance();
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH");

  // ============ PRE-FLIGHT CHECKS ============
  const FOUNDER_WALLET = process.env.FOUNDER_WALLET;
  const OPERATIONS_WALLET = process.env.OPERATIONS_WALLET;

  if (!FOUNDER_WALLET || !ethers.utils.isAddress(FOUNDER_WALLET)) {
    console.error("\n❌ FOUNDER_WALLET not set or invalid in .env");
    console.error("   Add: FOUNDER_WALLET=0x...");
    process.exit(1);
  }
  if (!OPERATIONS_WALLET || !ethers.utils.isAddress(OPERATIONS_WALLET)) {
    console.error("\n❌ OPERATIONS_WALLET not set or invalid in .env");
    console.error("   Add: OPERATIONS_WALLET=0x...");
    process.exit(1);
  }
  if (balance.lt(ethers.utils.parseEther("1.5"))) {
    console.error("\n❌ Insufficient balance. Need at least 1.5 ETH (1 ETH LP + ~0.5 gas)");
    console.error("   Current:", ethers.utils.formatEther(balance), "ETH");
    process.exit(1);
  }

  console.log("Founder wallet:", FOUNDER_WALLET);
  console.log("Operations wallet:", OPERATIONS_WALLET);
  console.log("-".repeat(60));

  // ============ PHASE 1: DEPLOY CONTRACTS ============
  console.log("\n📦 Phase 1: Deploying contracts...\n");

  // 1. OOOWEEEToken (UUPS proxy)
  console.log("1/6 Deploying OOOWEEEToken (UUPS proxy)...");
  const Token = await ethers.getContractFactory("OOOWEEEToken");
  const token = await upgrades.deployProxy(
    Token,
    [FOUNDER_WALLET, OPERATIONS_WALLET],
    { kind: "uups" }
  );
  await token.deployed();
  console.log("  ✓ OOOWEEEToken:", token.address);

  // 2. SavingsPriceOracle (UUPS proxy)
  console.log("2/6 Deploying SavingsPriceOracle (UUPS proxy)...");
  const Oracle = await ethers.getContractFactory("SavingsPriceOracle");
  const oracle = await upgrades.deployProxy(
    Oracle,
    [UNISWAP_ROUTER],
    { kind: "uups" }
  );
  await oracle.deployed();
  console.log("  ✓ SavingsPriceOracle:", oracle.address);

  // 3. OOOWEEESavings (UUPS proxy — single flattened contract)
  console.log("3/6 Deploying OOOWEEESavings (UUPS proxy)...");
  const Savings = await ethers.getContractFactory("OOOWEEESavings");
  const savings = await upgrades.deployProxy(
    Savings,
    [token.address, oracle.address],
    { kind: "uups" }
  );
  await savings.deployed();
  console.log("  ✓ OOOWEEESavings:", savings.address);

  // 4. OOOWEEEValidatorFund (UUPS proxy)
  console.log("4/6 Deploying OOOWEEEValidatorFund (UUPS proxy)...");
  const ValidatorFund = await ethers.getContractFactory("OOOWEEEValidatorFund");
  const validatorFund = await upgrades.deployProxy(
    ValidatorFund,
    [UNISWAP_ROUTER, OPERATIONS_WALLET],
    { kind: "uups" }
  );
  await validatorFund.deployed();
  console.log("  ✓ OOOWEEEValidatorFund:", validatorFund.address);

  // 5. OOOWEEEStability (UUPS proxy)
  console.log("5/6 Deploying OOOWEEEStability (UUPS proxy)...");
  const Stability = await ethers.getContractFactory("OOOWEEEStability");
  const stability = await upgrades.deployProxy(
    Stability,
    [token.address, UNISWAP_ROUTER, validatorFund.address],
    { kind: "uups" }
  );
  await stability.deployed();
  console.log("  ✓ OOOWEEEStability:", stability.address);

  // 6. DonorRegistry (UUPS proxy)
  console.log("6/6 Deploying DonorRegistry (UUPS proxy)...");
  const DonorRegistry = await ethers.getContractFactory("DonorRegistry");
  const donorRegistry = await upgrades.deployProxy(DonorRegistry, [], { kind: "uups" });
  await donorRegistry.deployed();
  console.log("  ✓ DonorRegistry proxy:", donorRegistry.address);

  // ============ PHASE 2: ORACLE CONFIGURATION ============
  console.log("\n🔮 Phase 2: Configuring oracle...\n");

  // Set 8-decimal precision for all currencies
  console.log("Setting currency decimals to 8...");
  await (await oracle.setCurrencyDecimals(0, 8)).wait(); // USD
  await (await oracle.setCurrencyDecimals(1, 8)).wait(); // EUR
  await (await oracle.setCurrencyDecimals(2, 8)).wait(); // GBP
  console.log("  ✓ All currencies set to 8 decimals");

  // Set per-currency Chainlink feeds
  console.log("Setting Chainlink price feeds...");
  await (await oracle.setPriceFeed(0, CHAINLINK_ETH_USD)).wait(); // USD
  await (await oracle.setPriceFeed(1, CHAINLINK_EUR_USD)).wait(); // EUR
  await (await oracle.setPriceFeed(2, CHAINLINK_GBP_USD)).wait(); // GBP
  console.log("  ✓ USD feed:", CHAINLINK_ETH_USD);
  console.log("  ✓ EUR feed:", CHAINLINK_EUR_USD);
  console.log("  ✓ GBP feed:", CHAINLINK_GBP_USD);

  // Set default prices (8 decimals: 100000000 = 1.00 fiat)
  // $0.001 = 100000, €0.0009 = 90000, £0.0008 = 80000
  console.log("Setting default prices (8 decimals)...");
  await (await oracle.setDefaultPrice(0, 100000)).wait();
  await (await oracle.setDefaultPrice(1, 90000)).wait();
  await (await oracle.setDefaultPrice(2, 80000)).wait();
  console.log("  ✓ Default prices set");

  // Set emergency fixed rates (same as defaults)
  console.log("Setting emergency fixed rates...");
  await (await oracle.setEmergencyFixedRate(0, 100000)).wait();
  await (await oracle.setEmergencyFixedRate(1, 90000)).wait();
  await (await oracle.setEmergencyFixedRate(2, 80000)).wait();
  console.log("  ✓ Emergency rates set");

  // ============ PHASE 3: CROSS-CONTRACT WIRING ============
  console.log("\n🔗 Phase 3: Cross-contract wiring...\n");

  // Token: set exemptions
  console.log("Setting token exemptions...");
  await (await token.setExemption(savings.address, true)).wait();
  await (await token.setExemption(validatorFund.address, true)).wait();
  await (await token.setExemption(stability.address, true)).wait();
  console.log("  ✓ Exemptions set for Savings, ValidatorFund, Stability");

  // Token: transfer 80M to stability
  console.log("Setting stability mechanism (transfers 80M)...");
  let tx = await token.setStabilityMechanism(stability.address);
  await tx.wait();
  console.log("  ✓ 80M tokens transferred to Stability");

  // Token: enable trading
  console.log("Enabling trading...");
  tx = await token.enableTrading();
  await tx.wait();
  console.log("  ✓ Trading enabled");

  // ValidatorFund: wire contracts
  console.log("Wiring ValidatorFund...");
  await (await validatorFund.setContracts(token.address, savings.address)).wait();
  await (await validatorFund.setStabilityContract(stability.address)).wait();
  console.log("  ✓ ValidatorFund wired");

  // Savings: set rewards distributor
  console.log("Setting Savings rewards distributor...");
  await (await savings.setRewardsDistributor(validatorFund.address)).wait();
  console.log("  ✓ Rewards distributor set");

  // Stability: set validator fund
  console.log("Setting Stability validator fund...");
  await (await stability.setValidatorFund(validatorFund.address)).wait();
  console.log("  ✓ Validator fund set on Stability");

  // ============ SAVE DEPLOYMENT ============
  const deployment = {
    network: "mainnet",
    chainId: 1,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      OOOWEEEToken: token.address,
      SavingsPriceOracle: oracle.address,
      OOOWEEESavings: savings.address,
      OOOWEEEValidatorFund: validatorFund.address,
      OOOWEEEStability: stability.address,
      DonorRegistry: donorRegistry.address,
    },
    wallets: {
      founder: FOUNDER_WALLET,
      operations: OPERATIONS_WALLET,
    },
    config: {
      uniswapRouter: UNISWAP_ROUTER,
      chainlinkEthUsd: CHAINLINK_ETH_USD,
      chainlinkEurUsd: CHAINLINK_EUR_USD,
      chainlinkGbpUsd: CHAINLINK_GBP_USD,
    },
  };

  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log("\n✓ Deployment saved to deployment.json");

  // ============ SUMMARY ============
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE — Ethereum Mainnet");
  console.log("=".repeat(60));
  console.log("\nContract Addresses:");
  console.log("  OOOWEEEToken:        ", token.address);
  console.log("  SavingsPriceOracle:  ", oracle.address);
  console.log("  OOOWEEESavings:      ", savings.address);
  console.log("  OOOWEEEValidatorFund:", validatorFund.address);
  console.log("  OOOWEEEStability:    ", stability.address);
  console.log("  DonorRegistry:       ", donorRegistry.address);
  console.log("\nWallets:");
  console.log("  Founder:    ", FOUNDER_WALLET);
  console.log("  Operations: ", OPERATIONS_WALLET);

  const remainingBalance = await deployer.getBalance();
  console.log("\nGas used:", ethers.utils.formatEther(balance.sub(remainingBalance)), "ETH");
  console.log("Remaining:", ethers.utils.formatEther(remainingBalance), "ETH");

  console.log("\n⚠️  NEXT STEPS:");
  console.log("  1. npx hardhat run scripts/setup-liquidity.js --network mainnet");
  console.log("  2. npx hardhat run scripts/verify-deployment.js --network mainnet");
  console.log("  3. npx hardhat run scripts/setup-chainlink.js --network mainnet");
  console.log("  4. Copy addresses from deployment.json → frontend abis.js");
  console.log("  5. npx hardhat verify --network mainnet <each address>");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED:");
    console.error(error);
    process.exit(1);
  });
