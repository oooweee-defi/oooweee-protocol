/**
 * OOOWEEE Protocol — Mainnet Deployment
 *
 * Deploys all 6 contracts as UUPS proxies (ERC1967).
 *
 * Uses raw sendTransaction + provider.waitForTransaction to bypass
 * the ethers.js v5 receipt-parsing bug where Alchemy returns to: ""
 * for contract creation transactions.
 *
 * IMPORTANT (M-2 R2): Do NOT call ValidatorFund.distributeRewards() before at
 * least one savings account exists. If rewards arrive when totalDepositedBalance == 0,
 * they accumulate in pendingRewards and the first depositor captures 100%.
 *
 * Usage: npx hardhat run scripts/deploy.js --network mainnet
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============ MAINNET ADDRESSES ============
const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const CHAINLINK_ETH_USD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
const CHAINLINK_EUR_USD = "0xb49f677943BC038e9857d61E7d053CaA2C1734C1";
const CHAINLINK_GBP_USD = "0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5";

// ============ DEPLOYMENT HELPERS ============

/**
 * Deploy a contract via eth_sendTransaction RPC + manual receipt polling.
 * Completely bypasses ethers.js TransactionResponse formatter
 * which crashes on Alchemy's to: "" for contract creation txs.
 */
async function rawDeploy(deployer, bytecode) {
  // Estimate gas
  const gasEstimate = await ethers.provider.estimateGas({
    from: deployer.address,
    data: bytecode,
  });

  // Send via eth_sendTransaction RPC — the provider/node handles signing.
  // This bypasses ethers' TransactionResponse parser entirely.
  const gasWithBuffer = gasEstimate.mul(120).div(100);
  const txHash = await ethers.provider.send("eth_sendTransaction", [{
    from: deployer.address,
    data: bytecode,
    gas: ethers.utils.hexValue(gasWithBuffer),  // 20% buffer, proper hex format
  }]);

  console.log(`    tx: ${txHash.slice(0, 14)}... (waiting)`);

  // Wait for receipt — the receipt formatter handles to:null correctly
  const receipt = await ethers.provider.waitForTransaction(txHash, 1, 120000);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Deploy tx reverted: ${txHash}`);
  }
  return receipt.contractAddress;
}

/**
 * Deploy a UUPS proxy: implementation + ERC1967Proxy + initialize().
 * Returns a Contract instance bound to the proxy address with the impl ABI.
 */
async function deployUUPS(contractName, initArgs, deployer) {
  const ImplFactory = await ethers.getContractFactory(contractName, deployer);

  // 1. Deploy implementation
  const implBytecode = ImplFactory.getDeployTransaction().data;
  const implAddress = await rawDeploy(deployer, implBytecode);
  console.log(`    impl: ${implAddress}`);

  // 2. Encode initialize(...)
  const initData = ImplFactory.interface.encodeFunctionData("initialize", initArgs);

  // 3. Deploy ERC1967Proxy(impl, initData)
  //    Load pre-compiled artifact from @openzeppelin/contracts package
  const proxyArtifact = require("@openzeppelin/contracts/build/contracts/ERC1967Proxy.json");
  const ProxyFactory = new ethers.ContractFactory(
    proxyArtifact.abi,
    proxyArtifact.bytecode,
    deployer
  );
  const proxyBytecode = ProxyFactory.getDeployTransaction(implAddress, initData).data;
  const proxyAddress = await rawDeploy(deployer, proxyBytecode);
  console.log(`    proxy: ${proxyAddress}`);

  // 4. Return contract instance at proxy, using impl ABI
  return ImplFactory.attach(proxyAddress);
}

/**
 * Send a state-changing tx, wait safely via provider.waitForTransaction.
 */
async function safeTx(contract, method, ...args) {
  const tx = await contract[method](...args);
  const receipt = await ethers.provider.waitForTransaction(tx.hash, 1, 120000);
  if (!receipt || receipt.status !== 1) {
    throw new Error(`${method}() failed: ${tx.hash}`);
  }
  return receipt;
}

// ============ MAIN ============

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("OOOWEEE Protocol — Mainnet Deployment");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);

  const balance = await deployer.getBalance();
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH");

  // Pre-flight checks
  const FOUNDER_WALLET = process.env.FOUNDER_WALLET;
  const OPERATIONS_WALLET = process.env.OPERATIONS_WALLET;

  if (!FOUNDER_WALLET || !ethers.utils.isAddress(FOUNDER_WALLET)) {
    console.error("❌ FOUNDER_WALLET not set or invalid in .env");
    process.exit(1);
  }
  if (!OPERATIONS_WALLET || !ethers.utils.isAddress(OPERATIONS_WALLET)) {
    console.error("❌ OPERATIONS_WALLET not set or invalid in .env");
    process.exit(1);
  }
  if (balance.lt(ethers.utils.parseEther("1.1"))) {
    console.error("❌ Insufficient balance:", ethers.utils.formatEther(balance), "ETH (need 1.1+)");
    process.exit(1);
  }

  console.log("Founder:", FOUNDER_WALLET);
  console.log("Operations:", OPERATIONS_WALLET);
  console.log("-".repeat(60));

  // ============ PHASE 1: DEPLOY 6 UUPS PROXIES ============
  console.log("\n📦 Phase 1: Deploying contracts...\n");

  console.log("1/6 OOOWEEEToken...");
  const token = await deployUUPS("OOOWEEEToken", [FOUNDER_WALLET, OPERATIONS_WALLET], deployer);
  console.log("  ✓ OOOWEEEToken:", token.address, "\n");

  console.log("2/6 SavingsPriceOracle...");
  const oracle = await deployUUPS("SavingsPriceOracle", [UNISWAP_ROUTER], deployer);
  console.log("  ✓ SavingsPriceOracle:", oracle.address, "\n");

  console.log("3/6 OOOWEEESavings...");
  const savings = await deployUUPS("OOOWEEESavings", [token.address, oracle.address], deployer);
  console.log("  ✓ OOOWEEESavings:", savings.address, "\n");

  console.log("4/6 OOOWEEEValidatorFund...");
  const validatorFund = await deployUUPS("OOOWEEEValidatorFund", [UNISWAP_ROUTER, OPERATIONS_WALLET], deployer);
  console.log("  ✓ OOOWEEEValidatorFund:", validatorFund.address, "\n");

  console.log("5/6 OOOWEEEStability...");
  const stability = await deployUUPS("OOOWEEEStability", [token.address, UNISWAP_ROUTER, validatorFund.address], deployer);
  console.log("  ✓ OOOWEEEStability:", stability.address, "\n");

  console.log("6/6 DonorRegistry...");
  const donorRegistry = await deployUUPS("DonorRegistry", [], deployer);
  console.log("  ✓ DonorRegistry:", donorRegistry.address, "\n");

  // ============ PHASE 2: ORACLE CONFIGURATION ============
  console.log("🔮 Phase 2: Configuring oracle...\n");

  console.log("  Setting currency decimals (8)...");
  await safeTx(oracle, "setCurrencyDecimals", 0, 8);
  await safeTx(oracle, "setCurrencyDecimals", 1, 8);
  await safeTx(oracle, "setCurrencyDecimals", 2, 8);
  console.log("  ✓ Decimals set");

  console.log("  Setting Chainlink feeds...");
  await safeTx(oracle, "setPriceFeed", 0, CHAINLINK_ETH_USD);
  await safeTx(oracle, "setPriceFeed", 1, CHAINLINK_EUR_USD);
  await safeTx(oracle, "setPriceFeed", 2, CHAINLINK_GBP_USD);
  console.log("  ✓ Feeds set");

  console.log("  Setting default prices...");
  await safeTx(oracle, "setDefaultPrice", 0, 100000);  // $0.001
  await safeTx(oracle, "setDefaultPrice", 1, 90000);   // €0.0009
  await safeTx(oracle, "setDefaultPrice", 2, 80000);   // £0.0008
  console.log("  ✓ Defaults set");

  console.log("  Setting emergency fixed rates...");
  await safeTx(oracle, "setEmergencyFixedRate", 0, 100000);
  await safeTx(oracle, "setEmergencyFixedRate", 1, 90000);
  await safeTx(oracle, "setEmergencyFixedRate", 2, 80000);
  console.log("  ✓ Emergency rates set\n");

  // ============ PHASE 3: CROSS-CONTRACT WIRING ============
  console.log("🔗 Phase 3: Cross-contract wiring...\n");

  console.log("  Token exemptions...");
  await safeTx(token, "setExemption", savings.address, true);
  await safeTx(token, "setExemption", validatorFund.address, true);
  await safeTx(token, "setExemption", stability.address, true);
  console.log("  ✓ Exemptions set");

  console.log("  Stability mechanism (transfers 80M)...");
  await safeTx(token, "setStabilityMechanism", stability.address);
  console.log("  ✓ 80M → Stability");

  console.log("  Enable trading...");
  await safeTx(token, "enableTrading");
  console.log("  ✓ Trading enabled");

  console.log("  Wire ValidatorFund...");
  await safeTx(validatorFund, "setContracts", token.address, savings.address);
  await safeTx(validatorFund, "setStabilityContract", stability.address);
  console.log("  ✓ ValidatorFund wired");

  console.log("  Set Savings rewards distributor...");
  await safeTx(savings, "setRewardsDistributor", validatorFund.address);
  console.log("  ✓ Rewards distributor set");

  console.log("  Set Stability → ValidatorFund...");
  await safeTx(stability, "setValidatorFund", validatorFund.address);
  console.log("  ✓ Stability wired\n");

  // ============ PHASE 4: ON-CHAIN VERIFICATION ============
  console.log("🔍 Phase 4: On-chain verification...\n");

  const supply = await token.totalSupply();
  const founderBal = await token.balanceOf(FOUNDER_WALLET);
  const stabBal = await token.balanceOf(stability.address);
  const trading = await token.tradingEnabled();
  const tokenOwner = await token.owner();
  const oracleOwner = await oracle.owner();
  const savingsOwner = await savings.owner();
  const vfOwner = await validatorFund.owner();
  const stabOwner = await stability.owner();
  const donorOwner = await donorRegistry.owner();

  const check = (label, ok) => console.log(`  ${ok ? "✓" : "✗"} ${label}`);

  check("Total supply = 100M", supply.eq(ethers.utils.parseUnits("100000000", 18)));
  check("Founder has 10M", founderBal.eq(ethers.utils.parseUnits("10000000", 18)));
  check("Stability has 80M", stabBal.eq(ethers.utils.parseUnits("80000000", 18)));
  check("Trading enabled", trading === true);
  check("Token owner = deployer", tokenOwner.toLowerCase() === deployer.address.toLowerCase());
  check("Oracle owner = deployer", oracleOwner.toLowerCase() === deployer.address.toLowerCase());
  check("Savings owner = deployer", savingsOwner.toLowerCase() === deployer.address.toLowerCase());
  check("VF owner = deployer", vfOwner.toLowerCase() === deployer.address.toLowerCase());
  check("Stability owner = deployer", stabOwner.toLowerCase() === deployer.address.toLowerCase());
  check("DonorRegistry owner = deployer", donorOwner.toLowerCase() === deployer.address.toLowerCase());

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

  // ============ SUMMARY ============
  const remaining = await deployer.getBalance();

  console.log("\n" + "=".repeat(60));
  console.log("✅ DEPLOYMENT COMPLETE — Ethereum Mainnet");
  console.log("=".repeat(60));
  console.log("\n  OOOWEEEToken:        ", token.address);
  console.log("  SavingsPriceOracle:  ", oracle.address);
  console.log("  OOOWEEESavings:      ", savings.address);
  console.log("  OOOWEEEValidatorFund:", validatorFund.address);
  console.log("  OOOWEEEStability:    ", stability.address);
  console.log("  DonorRegistry:       ", donorRegistry.address);
  console.log("\n  Gas used:", ethers.utils.formatEther(balance.sub(remaining)), "ETH");
  console.log("  Remaining:", ethers.utils.formatEther(remaining), "ETH");
  console.log("\n  Saved to: deployment.json");
  console.log("\n⚠️  NEXT STEPS:");
  console.log("  1. npx hardhat run scripts/setup-liquidity.js --network mainnet");
  console.log("  2. npx hardhat run scripts/verify-deployment.js --network mainnet");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED:");
    console.error(error);
    process.exit(1);
  });
