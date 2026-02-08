/**
 * OOOWEEE Protocol — Mainnet Liquidity Setup
 *
 * Adds 2,000,000 OOOWEEE + 2 ETH to Uniswap V2.
 * Configures oracle pool, stability pair, token LP pair, and baseline.
 *
 * Reads contract addresses from deployment.json (created by deploy.js).
 *
 * Usage: npx hardhat run scripts/setup-liquidity.js --network mainnet
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============ LIQUIDITY PARAMETERS ============
const TOKEN_AMOUNT = "2000000";  // 2M OOOWEEE
const ETH_AMOUNT = "2";          // 2 ETH

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("OOOWEEE Protocol — Mainnet Liquidity Setup");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // Load deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("\n❌ deployment.json not found. Run deploy.js first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const ROUTER_ADDRESS = deployment.config.uniswapRouter;
  const TOKEN_ADDRESS = deployment.contracts.OOOWEEEToken;
  const ORACLE_ADDRESS = deployment.contracts.SavingsPriceOracle;
  const STABILITY_ADDRESS = deployment.contracts.OOOWEEEStability;

  console.log("\nToken:", TOKEN_ADDRESS);
  console.log("Oracle:", ORACLE_ADDRESS);
  console.log("Stability:", STABILITY_ADDRESS);
  console.log("Router:", ROUTER_ADDRESS);
  console.log("-".repeat(60));

  // Uniswap V2 Router + Factory ABIs
  const routerABI = [
    "function factory() external pure returns (address)",
    "function WETH() external pure returns (address)",
    "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)"
  ];
  const factoryABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
  ];

  const router = new ethers.Contract(ROUTER_ADDRESS, routerABI, deployer);
  const WETH = await router.WETH();
  const factoryAddress = await router.factory();
  console.log("WETH:", WETH);
  console.log("Factory:", factoryAddress);

  // Get token contract
  const token = await ethers.getContractAt("OOOWEEEToken", TOKEN_ADDRESS, deployer);
  const tokenBalance = await token.balanceOf(deployer.address);
  console.log("\nDeployer OOOWEEE balance:", ethers.utils.formatUnits(tokenBalance, 18));

  const tokenAmount = ethers.utils.parseUnits(TOKEN_AMOUNT, 18);
  const ethAmount = ethers.utils.parseEther(ETH_AMOUNT);

  // Pre-flight checks
  if (tokenBalance.lt(tokenAmount)) {
    console.error(`\n❌ Not enough OOOWEEE. Need ${TOKEN_AMOUNT}, have:`, ethers.utils.formatUnits(tokenBalance, 18));
    process.exit(1);
  }

  const ethBalance = await deployer.getBalance();
  if (ethBalance.lt(ethAmount.add(ethers.utils.parseEther("0.05")))) {
    console.error(`\n❌ Not enough ETH. Need ${ETH_AMOUNT} + gas, have:`, ethers.utils.formatEther(ethBalance));
    process.exit(1);
  }

  // Step 1: Approve router
  console.log(`\n1. Approving router to spend ${TOKEN_AMOUNT} OOOWEEE...`);
  const approveTx = await token.approve(ROUTER_ADDRESS, tokenAmount);
  await approveTx.wait();
  console.log("   ✓ Router approved");

  // Step 2: Add liquidity
  console.log(`\n2. Adding liquidity: ${TOKEN_AMOUNT} OOOWEEE + ${ETH_AMOUNT} ETH...`);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
  const addLiqTx = await router.addLiquidityETH(
    TOKEN_ADDRESS,
    tokenAmount,
    tokenAmount.mul(95).div(100), // 5% slippage
    ethAmount.mul(95).div(100),
    deployer.address,
    deadline,
    { value: ethAmount }
  );
  const receipt = await addLiqTx.wait();
  console.log("   ✓ Liquidity added! Tx:", receipt.transactionHash);

  // Step 3: Get pair address
  const factory = new ethers.Contract(factoryAddress, factoryABI, deployer);
  const pairAddress = await factory.getPair(TOKEN_ADDRESS, WETH);
  console.log("   ✓ Uniswap Pair:", pairAddress);

  // Step 4: Set oracle pool
  console.log("\n3. Setting oracle OOOWEEE pool...");
  const oracle = await ethers.getContractAt("SavingsPriceOracle", ORACLE_ADDRESS, deployer);
  await (await oracle.setOooweeePool(pairAddress)).wait();
  console.log("   ✓ Oracle pool set");

  // Step 5: Set stability liquidity pair
  console.log("\n4. Setting stability liquidity pair...");
  const stability = await ethers.getContractAt("OOOWEEEStability", STABILITY_ADDRESS, deployer);
  await (await stability.setLiquidityPair(pairAddress)).wait();
  console.log("   ✓ Stability pair set");

  // Step 6: Set token liquidity pair
  console.log("\n5. Setting token liquidity pair...");
  await (await token.setLiquidityPair(pairAddress, true)).wait();
  console.log("   ✓ Token LP pair set");

  // Step 7: Initialize stability baseline
  console.log("\n6. Initialising stability baseline...");
  try {
    await (await stability.initialiseBaseline()).wait();
    console.log("   ✓ Baseline initialised");
  } catch (e) {
    console.log("   ⚠️  Baseline already initialised or error:", e.reason || e.message);
  }

  // Update deployment file
  deployment.uniswapPair = pairAddress;
  deployment.liquiditySetup = {
    timestamp: new Date().toISOString(),
    tokenAmount: TOKEN_AMOUNT,
    ethAmount: ETH_AMOUNT,
    pair: pairAddress,
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  // Summary
  const remainingBalance = await deployer.getBalance();
  console.log("\n" + "=".repeat(60));
  console.log("LIQUIDITY SETUP COMPLETE");
  console.log("=".repeat(60));
  console.log("Uniswap Pair:", pairAddress);
  console.log(`Liquidity: ${TOKEN_AMOUNT} OOOWEEE + ${ETH_AMOUNT} ETH`);
  console.log("Remaining ETH:", ethers.utils.formatEther(remainingBalance));
  console.log("\n⚠️  NEXT: npx hardhat run scripts/verify-deployment.js --network mainnet");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ LIQUIDITY SETUP FAILED:");
    console.error(error);
    process.exit(1);
  });
