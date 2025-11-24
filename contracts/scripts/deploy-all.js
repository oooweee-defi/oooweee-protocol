// scripts/deploy-all.js
const hre = require("hardhat");
const fs = require('fs');

async function main() {
  console.log("🚀 OOOWEEE Protocol - Complete Redeployment\n");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");
  
  // ============ CONFIGURATION ============
  const CONFIG = {
    FOUNDER_WALLET: "0x56384f1205659291ba5b949d641582af6ae7006b", // UPDATE THIS
    OPERATIONS_WALLET: "0xb05f42b174e5152d34431ee4504210932ddfe715", // UPDATE THIS
    UNISWAP_ROUTER: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008", // Sepolia Uniswap V2
    
    // For testnet, use dummy L1 addresses
    L1_VALIDATOR_COLLECTOR: "0x0000000000000000000000000000000000000001",
    L1_OPERATOR: "0x0000000000000000000000000000000000000001"
  };
  
  console.log("Configuration:");
  console.log("Founder:", CONFIG.FOUNDER_WALLET);
  console.log("Operations:", CONFIG.OPERATIONS_WALLET);
  console.log("Router:", CONFIG.UNISWAP_ROUTER);
  console.log("-------------------\n");
  
  const contracts = {};
  
  // ============ 1. DEPLOY TOKEN ============
  console.log("1/5 Deploying OOOWEEEToken...");
  const Token = await ethers.getContractFactory("OOOWEEEToken");
  contracts.token = await Token.deploy(
    CONFIG.FOUNDER_WALLET,
    CONFIG.OPERATIONS_WALLET
  );
  await contracts.token.deployed();
  console.log("✅ Token:", contracts.token.address);
  
  // ============ 2. DEPLOY VALIDATOR FUND ============
  console.log("\n2/5 Deploying OOOWEEEValidatorFund...");
  const ValidatorFund = await ethers.getContractFactory("OOOWEEEValidatorFund");
  contracts.validatorFund = await ValidatorFund.deploy(
    ethers.constants.AddressZero, // Stability - will set later
    ethers.constants.AddressZero  // Rewards - will set later
  );
  await contracts.validatorFund.deployed();
  console.log("✅ ValidatorFund:", contracts.validatorFund.address);
  
  // ============ 3. DEPLOY STABILITY ============
  console.log("\n3/5 Deploying OOOWEEEStability...");
  const Stability = await ethers.getContractFactory("OOOWEEEStability");
  contracts.stability = await Stability.deploy(
    contracts.token.address,
    CONFIG.UNISWAP_ROUTER,
    contracts.validatorFund.address
  );
  await contracts.stability.deployed();
  console.log("✅ Stability:", contracts.stability.address);
  
  // ============ 4. DEPLOY SAVINGS ============
  console.log("\n4/5 Deploying OOOWEEESavings...");
  const Savings = await ethers.getContractFactory("OOOWEEESavings");
  contracts.savings = await Savings.deploy(
    contracts.token.address,
    CONFIG.UNISWAP_ROUTER
  );
  await contracts.savings.deployed();
  console.log("✅ Savings:", contracts.savings.address);
  
  // ============ 5. DEPLOY REWARDS DISTRIBUTION ============
  console.log("\n5/5 Deploying OOOWEEERewardsDistribution...");
  const Rewards = await ethers.getContractFactory("OOOWEEERewardsDistribution");
  contracts.rewards = await Rewards.deploy(
    contracts.savings.address,
    contracts.token.address,
    CONFIG.UNISWAP_ROUTER,
    contracts.validatorFund.address,
    CONFIG.OPERATIONS_WALLET,
    CONFIG.L1_VALIDATOR_COLLECTOR
  );
  await contracts.rewards.deployed();
  console.log("✅ Rewards:", contracts.rewards.address);
  
  // Note: ValidatorCollector (6th contract) is L1 only - skip for testnet
  console.log("\n📝 Note: ValidatorCollector is L1-only, not needed for testnet");
  
  // ============ CONFIGURE CONTRACTS ============
  console.log("\n⚙️  Configuring contracts...");
  
  // 1. Set stability mechanism in token (89M tokens transfer)
  console.log("Setting stability mechanism...");
  const tx1 = await contracts.token.setStabilityMechanism(contracts.stability.address);
  await tx1.wait();
  console.log("✅ 89M tokens transferred to stability");
  
  // 2. Configure ValidatorFund
  console.log("Configuring ValidatorFund...");
  const tx2 = await contracts.validatorFund.setStabilityContract(contracts.stability.address);
  await tx2.wait();
  const tx3 = await contracts.validatorFund.setRewardsContract(contracts.rewards.address);
  await tx3.wait();
  const tx4 = await contracts.validatorFund.setOperatorL1Address(CONFIG.L1_OPERATOR);
  await tx4.wait();
  
  // 3. Configure Savings
  console.log("Configuring Savings...");
  const tx5 = await contracts.savings.setRewardsDistributor(contracts.rewards.address);
  await tx5.wait();
  const tx6 = await contracts.savings.setFeeCollector(CONFIG.OPERATIONS_WALLET);
  await tx6.wait();
  
  // 4. Set exemptions
  console.log("Setting exemptions...");
  const tx7 = await contracts.token.setExemption(contracts.stability.address, true);
  await tx7.wait();
  const tx8 = await contracts.token.setExemption(contracts.savings.address, true);
  await tx8.wait();
  const tx9 = await contracts.token.setExemption(contracts.rewards.address, true);
  await tx9.wait();
  const tx10 = await contracts.token.setExemption(contracts.validatorFund.address, true);
  await tx10.wait();
  
  // ============ SAVE DEPLOYMENT ============
  const deployment = {
    network: "sepolia",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      token: contracts.token.address,
      stability: contracts.stability.address,
      validatorFund: contracts.validatorFund.address,
      savings: contracts.savings.address,
      rewards: contracts.rewards.address
    },
    configuration: CONFIG,
    status: "awaiting_liquidity_pool"
  };
  
  fs.writeFileSync('deployment-new.json', JSON.stringify(deployment, null, 2));
  
  console.log("\n✅ DEPLOYMENT COMPLETE!");
  console.log("📄 Saved to: deployment-new.json");
  console.log("\n📋 Contract Addresses:");
  console.log("```");
  console.log("Token:         ", contracts.token.address);
  console.log("Stability:     ", contracts.stability.address);
  console.log("ValidatorFund: ", contracts.validatorFund.address);
  console.log("Savings:       ", contracts.savings.address);
  console.log("Rewards:       ", contracts.rewards.address);
  console.log("```");
  
  console.log("\n⚠️  NEXT STEPS:");
  console.log("1. Create Uniswap pool at https://app.uniswap.org");
  console.log("2. Add liquidity (use operations wallet)");
  console.log("3. Run: npx hardhat run scripts/setup-pool.js --network sepolia");
  console.log("4. Enable trading");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });