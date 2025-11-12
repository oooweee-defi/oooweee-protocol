const hre = require("hardhat");
const fs = require("fs");

// Deployment configuration
const CONFIG = {
  UNISWAP_V2_ROUTER_SEPOLIA: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008",
  // Alternative routers if needed:
  // UNISWAP_V3_SEPOLIA: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
  
  // Gas settings
  GAS_LIMIT_MULTIPLIER: 1.2, // 20% buffer on gas estimates
};

async function verifyContract(address, args, contractName) {
  console.log(`\n📝 Verifying ${contractName} on Etherscan...`);
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: args,
    });
    console.log(`✅ ${contractName} verified on Etherscan`);
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log(`ℹ️  ${contractName} already verified`);
    } else {
      console.log(`⚠️  ${contractName} verification failed:`, error.message);
    }
  }
}

async function main() {
  console.log("\n🚀 OOOWEEE Protocol Deployment v3.0");
  console.log("====================================\n");
  
  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  const deployerBalance = await deployer.getBalance();
  
  console.log("📍 Network:", hre.network.name);
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", hre.ethers.utils.formatEther(deployerBalance), "ETH\n");
  
  // Check minimum balance
  if (deployerBalance.lt(hre.ethers.utils.parseEther("0.05"))) {
    throw new Error("Insufficient ETH balance. Need at least 0.05 ETH for deployment.");
  }
  
  const contracts = {};
  
  // === DEPLOY TOKEN ===
  console.log("1️⃣  Deploying OOOWEEEToken...");
  const Token = await hre.ethers.getContractFactory("OOOWEEEToken");
  const tokenArgs = [deployer.address, deployer.address]; // founder, liquidity wallets
  const token = await Token.deploy(...tokenArgs);
  await token.deployed();
  contracts.token = token.address;
  console.log("✅ Token deployed:", token.address);
  
  // === DEPLOY SAVINGS ===
  console.log("\n2️⃣  Deploying OOOWEEESavings...");
  const Savings = await hre.ethers.getContractFactory("OOOWEEESavings");
  const savingsArgs = [token.address, CONFIG.UNISWAP_V2_ROUTER_SEPOLIA];
  const savings = await Savings.deploy(...savingsArgs);
  await savings.deployed();
  contracts.savings = savings.address;
  console.log("✅ Savings deployed:", savings.address);
  
  // === DEPLOY VALIDATORS (New simplified version) ===
  console.log("\n3️⃣  Deploying OOOWEEEValidators...");
  const Validators = await hre.ethers.getContractFactory("OOOWEEEValidators");
  const validatorsArgs = [deployer.address]; // Just operator address
  const validators = await Validators.deploy(...validatorsArgs);
  await validators.deployed();
  contracts.validators = validators.address;
  console.log("✅ Validators deployed:", validators.address);
  
  // === DEPLOY STABILITY ===
  console.log("\n4️⃣  Deploying OOOWEEEStability...");
  const Stability = await hre.ethers.getContractFactory("OOOWEEEStability");
  const stabilityArgs = [token.address, CONFIG.UNISWAP_V2_ROUTER_SEPOLIA, validators.address];
  const stability = await Stability.deploy(...stabilityArgs);
  await stability.deployed();
  contracts.stability = stability.address;
  console.log("✅ Stability deployed:", stability.address);
  
  // === DEPLOY REWARDS RECEIVER ===
  console.log("\n5️⃣  Deploying OOOWEEERewardsReceiver...");
  const RewardsReceiver = await hre.ethers.getContractFactory("OOOWEEERewardsReceiver");
  const rewardsReceiverArgs = [
    deployer.address,     // operations wallet (can be same as deployer)
    validators.address,   // validators contract
    savings.address,      // savings contract
    CONFIG.UNISWAP_V2_ROUTER_SEPOLIA, // Uniswap router
    token.address        // OOOWEEE token
  ];
  const rewardsReceiver = await RewardsReceiver.deploy(...rewardsReceiverArgs);
  await rewardsReceiver.deployed();
  contracts.rewardsReceiver = rewardsReceiver.address;
  console.log("✅ RewardsReceiver deployed:", rewardsReceiver.address);
  
  // === SETUP CONNECTIONS ===
  console.log("\n🔗 Setting up contract connections...");
  
  // 1. Set stability mechanism in token
  console.log("  Setting stability mechanism in token...");
  const tx1 = await token.setStabilityMechanism(stability.address);
  await tx1.wait();
  console.log("  ✅ Stability mechanism set");
  
  // 2. Set stability contract in validators
  console.log("  Setting stability contract in validators...");
  const tx2 = await validators.setStabilityContract(stability.address);
  await tx2.wait();
  console.log("  ✅ Stability contract set");
  
  // 3. Set rewards receiver in validators
  console.log("  Setting rewards receiver in validators...");
  const tx3 = await validators.setRewardsReceiver(rewardsReceiver.address);
  await tx3.wait();
  console.log("  ✅ Rewards receiver set");
  
  // 4. Set validator contract in savings (for old compatibility if needed)
  console.log("  Setting validator contract in savings...");
  const tx4 = await savings.setValidatorContract(validators.address);
  await tx4.wait();
  console.log("  ✅ Validator contract set in savings");
  
  // === VERIFY TOKEN DISTRIBUTION ===
  console.log("\n📊 Verifying token distribution...");
  const founderBalance = await token.balanceOf(deployer.address);
  const stabilityBalance = await token.balanceOf(stability.address);
  const totalSupply = await token.totalSupply();
  
  console.log("  Total Supply:", hre.ethers.utils.formatEther(totalSupply), "OOOWEEE");
  console.log("  Founder (11M):", hre.ethers.utils.formatEther(founderBalance), "OOOWEEE");
  console.log("  Stability (89M):", hre.ethers.utils.formatEther(stabilityBalance), "OOOWEEE");
  
  // === SAVE DEPLOYMENT DATA ===
  const deploymentData = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    operationsWallet: deployer.address, // Same as deployer for now
    timestamp: new Date().toISOString(),
    contracts: {
      token: token.address,
      savings: savings.address,
      validators: validators.address,
      stability: stability.address,
      rewardsReceiver: rewardsReceiver.address
    },
    ticker: "OOOWEEE",
    uniswapRouter: CONFIG.UNISWAP_V2_ROUTER_SEPOLIA
  };
  
  // Save to file
  fs.writeFileSync(
    "deployed-addresses.json",
    JSON.stringify(deploymentData, null, 2)
  );
  
  console.log("\n💾 Deployment data saved to deployed-addresses.json");
  
  // === VERIFY ON ETHERSCAN ===
  if (hre.network.name === "sepolia") {
    console.log("\n🔍 Starting Etherscan verification...");
    console.log("   (Waiting 30 seconds for Etherscan to index contracts)");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    await verifyContract(token.address, tokenArgs, "Token");
    await verifyContract(savings.address, savingsArgs, "Savings");
    await verifyContract(validators.address, validatorsArgs, "Validators");
    await verifyContract(stability.address, stabilityArgs, "Stability");
    await verifyContract(rewardsReceiver.address, rewardsReceiverArgs, "RewardsReceiver");
  }
  
  // === DEPLOYMENT SUMMARY ===
  console.log("\n" + "=".repeat(50));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(50));
  console.log("\n📝 Contract Addresses:");
  console.log("  Token:          ", token.address);
  console.log("  Savings:        ", savings.address);
  console.log("  Validators:     ", validators.address);
  console.log("  Stability:      ", stability.address);
  console.log("  RewardsReceiver:", rewardsReceiver.address);
  console.log("\n💼 Configuration:");
  console.log("  Operations Wallet:", deployer.address);
  console.log("  Operator:         ", deployer.address);
  console.log("\n📋 Next Steps:");
  console.log("  1. Update frontend with new contract addresses");
  console.log("  2. Create Uniswap V2 liquidity pool");
  console.log("  3. Call stability.setLiquidityPair() with pool address");
  console.log("  4. Enable trading with token.enableTrading()");
  console.log("  5. Lock founder tokens in UniCrypt");
  console.log("  6. When creating validators, set withdrawal address to:", rewardsReceiver.address);
  console.log("\n🔐 IMPORTANT: Validator Withdrawal Address:");
  console.log("  Use this for ALL validators:", rewardsReceiver.address);
  console.log("\n✨ Happy building with OOOWEEE!");
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });