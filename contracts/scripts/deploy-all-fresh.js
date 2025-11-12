const hre = require("hardhat");
const fs = require('fs');

async function main() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║   OOOWEEE PROTOCOL - FRESH DEPLOYMENT   ║");
  console.log("╚════════════════════════════════════════╝\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

  // Configuration
  const FOUNDER_WALLET = deployer.address;
  const LIQUIDITY_WALLET = deployer.address;
  const OPERATIONS_WALLET = deployer.address;
  const UNISWAP_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"; // Sepolia V2

  const contracts = {};

  try {
    // ═══════════════════════════════════════
    // 1. Deploy Token
    // ═══════════════════════════════════════
    console.log("📝 [1/6] Deploying Token...");
    const Token = await ethers.getContractFactory("OOOWEEEToken");
    const token = await Token.deploy(FOUNDER_WALLET, LIQUIDITY_WALLET);
    await token.deployed();
    contracts.token = token.address;
    console.log("✅ Token deployed to:", token.address);

    // ═══════════════════════════════════════
    // 2. Deploy Savings  
    // ═══════════════════════════════════════
    console.log("\n📝 [2/6] Deploying Savings...");
    const Savings = await ethers.getContractFactory("OOOWEEESavings");
    const savings = await Savings.deploy(
      token.address,     // token address
      UNISWAP_ROUTER     // uniswap router
    );
    await savings.deployed();
    contracts.savings = savings.address;
    console.log("✅ Savings deployed to:", savings.address);

    // ═══════════════════════════════════════
    // 3. Deploy Validators (FIXED - needs token!)
    // ═══════════════════════════════════════
    console.log("\n📝 [3/6] Deploying Validators...");
    const Validators = await ethers.getContractFactory("OOOWEEEValidators");
    const validators = await Validators.deploy(
      token.address      // NEEDS TOKEN ADDRESS!
    );
    await validators.deployed();
    contracts.validators = validators.address;
    console.log("✅ Validators deployed to:", validators.address);

    // ═══════════════════════════════════════
    // 4. Deploy Stability (FIXED - needs 3 args!)
    // ═══════════════════════════════════════
    console.log("\n📝 [4/6] Deploying Stability (SSA)...");
    const Stability = await ethers.getContractFactory("OOOWEEEStability");
    const stability = await Stability.deploy(
      token.address,         // arg 1: token
      UNISWAP_ROUTER,       // arg 2: router  
      validators.address    // arg 3: validators
    );
    await stability.deployed();
    contracts.stability = stability.address;
    console.log("✅ Stability deployed to:", stability.address);

    // ═══════════════════════════════════════
    // 5. Deploy RewardsReceiver (needs 5 args!)
    // ═══════════════════════════════════════
    console.log("\n📝 [5/6] Deploying RewardsReceiver...");
    const RewardsReceiver = await ethers.getContractFactory("OOOWEEERewardsReceiver");
    const rewardsReceiver = await RewardsReceiver.deploy(
      OPERATIONS_WALLET,    // arg 1: operations wallet
      validators.address,   // arg 2: validators contract
      savings.address,      // arg 3: savings contract
      UNISWAP_ROUTER,      // arg 4: uniswap router
      token.address        // arg 5: token address
    );
    await rewardsReceiver.deployed();
    contracts.rewardsReceiver = rewardsReceiver.address;
    console.log("✅ RewardsReceiver deployed to:", rewardsReceiver.address);

    // ═══════════════════════════════════════
    // 6. Wire Everything Together
    // ═══════════════════════════════════════
    console.log("\n📝 [6/6] Connecting contracts...");
    
    // Set stability mechanism in token
    console.log("  - Setting stability mechanism in token...");
    await token.setStabilityMechanism(stability.address);
    
    // Set validator contract in Savings
    console.log("  - Setting validator contract in savings...");
    await savings.setValidatorContract(validators.address);
    
    // Set rewards receiver in validators
    console.log("  - Setting rewards receiver in validators...");
    await validators.setRewardsReceiver(rewardsReceiver.address);
    
    console.log("✅ All contracts connected!\n");

    // ═══════════════════════════════════════
    // Save deployment info
    // ═══════════════════════════════════════
    const deployment = {
      network: "sepolia",
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        token: token.address,
        savings: savings.address,
        validators: validators.address,
        stability: stability.address,
        rewardsReceiver: rewardsReceiver.address
      },
      settings: {
        uniswapRouter: UNISWAP_ROUTER,
        operationsWallet: OPERATIONS_WALLET
      }
    };

    fs.writeFileSync(
      'deployment-final.json',
      JSON.stringify(deployment, null, 2)
    );

    // ═══════════════════════════════════════
    // Display summary
    // ═══════════════════════════════════════
    console.log("╔════════════════════════════════════════╗");
    console.log("║        DEPLOYMENT COMPLETE! 🎉         ║");
    console.log("╚════════════════════════════════════════╝\n");
    
    console.log("📋 Contract Addresses:");
    console.log("  Token:           ", token.address);
    console.log("  Savings:         ", savings.address);
    console.log("  Validators:      ", validators.address);
    console.log("  Stability (SSA): ", stability.address);
    console.log("  RewardsReceiver: ", rewardsReceiver.address);
    
    console.log("\n🔥 NEXT STEPS:");
    console.log("═══════════════════════════════════════");
    console.log("1. Create Uniswap pool:");
    console.log("   npx hardhat run scripts/create-pool.js --network sepolia");
    console.log("");
    console.log("2. Set the pool in Stability contract:");
    console.log("   npx hardhat console --network sepolia");
    console.log(`   const stability = await ethers.getContractAt("OOOWEEEStability", "${stability.address}")`);
    console.log('   await stability.setLiquidityPair("POOL_ADDRESS_HERE")');
    console.log("");
    console.log("3. Enable trading:");
    console.log(`   const token = await ethers.getContractAt("OOOWEEEToken", "${token.address}")`);
    console.log('   await token.enableTrading()');
    console.log("");
    console.log("4. Update frontend abis.js with addresses above");
    console.log("");
    console.log("5. For mainnet validators, use this withdrawal address:");
    console.log("   ", rewardsReceiver.address);
    console.log("═══════════════════════════════════════\n");
    
    console.log("✨ Deployment info saved to: deployment-final.json");
    console.log("🚀 Happy building with OOOWEEE!\n");

  } catch (error) {
    console.error("\n❌ Deployment failed:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });