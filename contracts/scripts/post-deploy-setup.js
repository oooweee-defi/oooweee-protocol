const hre = require("hardhat");
const fs = require("fs");

// Configuration
const CONFIG = {
  INITIAL_ETH_LIQUIDITY: "0.5", // ETH to add to pool
  INITIAL_TOKEN_LIQUIDITY: "1000000", // 1M OOOWEEE tokens
};

async function main() {
  console.log("\n🔧 OOOWEEE Post-Deployment Setup");
  console.log("=================================\n");
  
  // Load deployment data
  const deploymentData = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf8"));
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("👤 Operator:", deployer.address);
  
  // Get contract instances
  const token = await hre.ethers.getContractAt("OOOWEEEToken", deploymentData.contracts.token);
  const stability = await hre.ethers.getContractAt("OOOWEEEStability", deploymentData.contracts.stability);
  
  // Get Uniswap contracts
  const routerAddress = deploymentData.uniswapRouter;
  const router = await hre.ethers.getContractAt(
    ["function factory() view returns (address)"],
    routerAddress
  );
  const factoryAddress = await router.factory();
  
  const factory = await hre.ethers.getContractAt(
    [
      "function createPair(address,address) returns (address)",
      "function getPair(address,address) view returns (address)"
    ],
    factoryAddress
  );
  
  // Get WETH address
  const weth = await hre.ethers.getContractAt(
    ["function WETH() view returns (address)"],
    routerAddress
  );
  const wethAddress = await weth.WETH();
  
  console.log("\n📊 Current Status:");
  const tradingEnabled = await token.tradingEnabled();
  console.log("  Trading Enabled:", tradingEnabled);
  
  // Check if pair exists
  let pairAddress = await factory.getPair(token.address, wethAddress);
  console.log("  Existing Pair:", pairAddress !== hre.ethers.constants.AddressZero ? pairAddress : "None");
  
  // === STEP 1: CREATE LIQUIDITY POOL ===
  if (pairAddress === hre.ethers.constants.AddressZero) {
    console.log("\n1️⃣  Creating Uniswap V2 Pair...");
    
    // Create pair
    const createTx = await factory.createPair(token.address, wethAddress);
    const receipt = await createTx.wait();
    
    // Get pair address from event
    const pairCreatedEvent = receipt.events?.find(e => e.event === "PairCreated");
    if (pairCreatedEvent) {
      pairAddress = pairCreatedEvent.args.pair;
    } else {
      pairAddress = await factory.getPair(token.address, wethAddress);
    }
    
    console.log("✅ Pair created:", pairAddress);
  } else {
    console.log("\n1️⃣  Using existing pair:", pairAddress);
  }
  
  // === STEP 2: SET LIQUIDITY PAIR IN STABILITY ===
  const currentPair = await stability.liquidityPair();
  if (currentPair === hre.ethers.constants.AddressZero) {
    console.log("\n2️⃣  Setting liquidity pair in Stability contract...");
    const setPairTx = await stability.setLiquidityPair(pairAddress);
    await setPairTx.wait();
    console.log("✅ Liquidity pair set");
  } else {
    console.log("\n2️⃣  Liquidity pair already set:", currentPair);
  }
  
  // === STEP 3: ADD LIQUIDITY ===
  const pair = await hre.ethers.getContractAt(
    ["function getReserves() view returns (uint112,uint112,uint32)"],
    pairAddress
  );
  const reserves = await pair.getReserves();
  
  if (reserves[0].eq(0) && reserves[1].eq(0)) {
    console.log("\n3️⃣  Adding initial liquidity...");
    console.log("  ETH Amount:", CONFIG.INITIAL_ETH_LIQUIDITY);
    console.log("  Token Amount:", CONFIG.INITIAL_TOKEN_LIQUIDITY);
    
    // Approve router
    const tokensToAdd = hre.ethers.utils.parseEther(CONFIG.INITIAL_TOKEN_LIQUIDITY);
    const ethToAdd = hre.ethers.utils.parseEther(CONFIG.INITIAL_ETH_LIQUIDITY);
    
    console.log("  Approving router...");
    const approveTx = await token.approve(routerAddress, tokensToAdd);
    await approveTx.wait();
    
    // Add liquidity
    const uniswapRouter = await hre.ethers.getContractAt(
      [
        "function addLiquidityETH(address,uint256,uint256,uint256,address,uint256) payable returns (uint256,uint256,uint256)"
      ],
      routerAddress
    );
    
    console.log("  Adding liquidity...");
    const addLiqTx = await uniswapRouter.addLiquidityETH(
      token.address,
      tokensToAdd,
      0, // Min tokens
      0, // Min ETH
      deployer.address, // LP tokens recipient
      Math.floor(Date.now() / 1000) + 300, // Deadline
      { value: ethToAdd }
    );
    
    const addLiqReceipt = await addLiqTx.wait();
    console.log("✅ Liquidity added. TX:", addLiqReceipt.transactionHash);
  } else {
    console.log("\n3️⃣  Pool already has liquidity");
  }
  
  // === STEP 4: SET LIQUIDITY PAIR AS EXEMPT ===
  console.log("\n4️⃣  Setting pair as trading exempt...");
  const setExemptTx = await token.setLiquidityPair(pairAddress, true);
  await setExemptTx.wait();
  console.log("✅ Pair marked as liquidity pair");
  
  // === STEP 5: ENABLE TRADING ===
  if (!tradingEnabled) {
    console.log("\n5️⃣  Enabling trading...");
    const enableTx = await token.enableTrading();
    await enableTx.wait();
    console.log("✅ Trading enabled!");
  } else {
    console.log("\n5️⃣  Trading already enabled");
  }
  
  // === UPDATE DEPLOYMENT DATA ===
  deploymentData.uniswapPair = pairAddress;
  deploymentData.setupComplete = true;
  deploymentData.setupTimestamp = new Date().toISOString();
  
  fs.writeFileSync(
    "deployed-addresses.json",
    JSON.stringify(deploymentData, null, 2)
  );
  
  // === SUMMARY ===
  console.log("\n" + "=".repeat(50));
  console.log("✨ POST-DEPLOYMENT SETUP COMPLETE!");
  console.log("=".repeat(50));
  console.log("\n📋 Final Configuration:");
  console.log("  Uniswap Pair:", pairAddress);
  console.log("  Trading Status: ENABLED");
  console.log("  Stability Mechanism: ACTIVE");
  console.log("\n🚀 The OOOWEEE Protocol is now LIVE!");
  console.log("\n⚠️  IMPORTANT REMINDERS:");
  console.log("  1. Lock founder tokens (10M) on UniCrypt");
  console.log("  2. Update frontend with contract addresses");
  console.log("  3. Test all functions on Sepolia first");
  console.log("  4. Monitor stability mechanism triggers");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  });