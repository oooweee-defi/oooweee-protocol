const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying UUPS proxies with account:", deployer.address);
  console.log("Balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // Config
  const UNISWAP_ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
  const FOUNDER_WALLET = "0x56384f1205659291ba5b949d641582af6ae7006b";
  const OPERATIONS_WALLET = deployer.address;
  const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  // ============ 1. Deploy OOOWEEEToken Proxy ============
  console.log("\n1. Deploying OOOWEEEToken proxy...");
  const OOOWEEEToken = await ethers.getContractFactory("OOOWEEEToken");
  const token = await upgrades.deployProxy(
    OOOWEEEToken,
    [FOUNDER_WALLET, OPERATIONS_WALLET],
    { kind: "uups" }
  );
  await token.deployed();
  console.log("   OOOWEEEToken proxy:", token.address);

  // ============ 2. Deploy SavingsPriceOracle Proxy ============
  console.log("\n2. Deploying SavingsPriceOracle proxy...");
  const SavingsPriceOracle = await ethers.getContractFactory("SavingsPriceOracle");
  const oracle = await upgrades.deployProxy(
    SavingsPriceOracle,
    [UNISWAP_ROUTER],
    { kind: "uups" }
  );
  await oracle.deployed();
  console.log("   SavingsPriceOracle proxy:", oracle.address);

  // ============ 3. Deploy OOOWEEESavings Proxy ============
  console.log("\n3. Deploying OOOWEEESavings proxy...");
  const OOOWEEESavings = await ethers.getContractFactory("OOOWEEESavings");
  const savings = await upgrades.deployProxy(
    OOOWEEESavings,
    [token.address, oracle.address],
    { kind: "uups" }
  );
  await savings.deployed();
  console.log("   OOOWEEESavings proxy:", savings.address);

  // ============ 4. Deploy OOOWEEEValidatorFund Proxy ============
  console.log("\n4. Deploying OOOWEEEValidatorFund proxy...");
  const OOOWEEEValidatorFund = await ethers.getContractFactory("OOOWEEEValidatorFund");
  const validatorFund = await upgrades.deployProxy(
    OOOWEEEValidatorFund,
    [UNISWAP_ROUTER, OPERATIONS_WALLET],
    { kind: "uups" }
  );
  await validatorFund.deployed();
  console.log("   OOOWEEEValidatorFund proxy:", validatorFund.address);

  // ============ 5. Deploy OOOWEEEStability Proxy ============
  console.log("\n5. Deploying OOOWEEEStability proxy...");
  const OOOWEEEStability = await ethers.getContractFactory("OOOWEEEStability");
  const stability = await upgrades.deployProxy(
    OOOWEEEStability,
    [token.address, UNISWAP_ROUTER, validatorFund.address],
    { kind: "uups" }
  );
  await stability.deployed();
  console.log("   OOOWEEEStability proxy:", stability.address);

  // ============ 6. Deploy DonorRegistry Proxy ============
  console.log("\n6. Deploying DonorRegistry proxy...");
  const DonorRegistry = await ethers.getContractFactory("DonorRegistry");
  const donorRegistry = await upgrades.deployProxy(
    DonorRegistry,
    [],
    { kind: "uups" }
  );
  await donorRegistry.deployed();
  console.log("   DonorRegistry proxy:", donorRegistry.address);

  // ============ Post-Deploy Setup ============
  console.log("\n--- Setting up cross-contract references ---");

  // Token: enable trading, set exemptions, set stability mechanism
  console.log("Setting token exemptions...");
  await (await token.setExemption(savings.address, true)).wait();
  await (await token.setExemption(validatorFund.address, true)).wait();
  await (await token.setExemption(stability.address, true)).wait();
  console.log("   Token exemptions set");

  console.log("Setting stability mechanism on token (transfers 80M)...");
  await (await token.setStabilityMechanism(stability.address)).wait();
  console.log("   Stability mechanism set");

  console.log("Enabling trading...");
  await (await token.enableTrading()).wait();
  console.log("   Trading enabled");

  // ValidatorFund: set contracts
  console.log("Setting ValidatorFund contracts...");
  await (await validatorFund.setContracts(token.address, savings.address)).wait();
  await (await validatorFund.setStabilityContract(stability.address)).wait();
  console.log("   ValidatorFund contracts set");

  // Savings: set rewards distributor
  console.log("Setting Savings rewards distributor...");
  await (await savings.setRewardsDistributor(validatorFund.address)).wait();
  console.log("   Rewards distributor set");

  // Oracle: set Chainlink price feeds + default prices
  console.log("Setting Oracle price feeds...");
  await (await oracle.setPriceFeed(0, CHAINLINK_ETH_USD)).wait(); // USD
  await (await oracle.setPriceFeed(1, CHAINLINK_ETH_USD)).wait(); // EUR (using same feed on Sepolia)
  await (await oracle.setPriceFeed(2, CHAINLINK_ETH_USD)).wait(); // GBP (using same feed on Sepolia)
  await (await oracle.setDefaultPrice(0, 10)).wait(); // $0.001 default USD
  await (await oracle.setDefaultPrice(1, 9)).wait();  // €0.0009 default EUR
  await (await oracle.setDefaultPrice(2, 8)).wait();  // £0.0008 default GBP
  await (await oracle.setEmergencyFixedRate(0, 10)).wait();
  await (await oracle.setEmergencyFixedRate(1, 9)).wait();
  await (await oracle.setEmergencyFixedRate(2, 8)).wait();
  console.log("   Oracle price feeds set");

  // ============ Save Addresses ============
  const deployment = {
    network: "sepolia",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    proxyType: "UUPS",
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
    },
    setupComplete: true,
  };

  fs.writeFileSync(
    path.join(__dirname, "..", "deployment-upgradeable.json"),
    JSON.stringify(deployment, null, 2)
  );
  console.log("\nDeployment saved to deployment-upgradeable.json");

  // Print summary
  console.log("\n============ DEPLOYMENT SUMMARY ============");
  console.log("OOOWEEEToken proxy:       ", token.address);
  console.log("SavingsPriceOracle proxy: ", oracle.address);
  console.log("OOOWEEESavings proxy:     ", savings.address);
  console.log("OOOWEEEValidatorFund proxy:", validatorFund.address);
  console.log("OOOWEEEStability proxy:   ", stability.address);
  console.log("DonorRegistry proxy:      ", donorRegistry.address);
  console.log("============================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
