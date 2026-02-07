const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Setting up Uniswap liquidity with account:", deployer.address);
  console.log("Balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // Load deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployment-upgradeable.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const ROUTER_ADDRESS = deployment.config.uniswapRouter;
  const TOKEN_ADDRESS = deployment.contracts.OOOWEEEToken;
  const ORACLE_ADDRESS = deployment.contracts.SavingsPriceOracle;
  const STABILITY_ADDRESS = deployment.contracts.OOOWEEEStability;

  // Uniswap V2 Router ABI (only what we need)
  const routerABI = [
    "function factory() external pure returns (address)",
    "function WETH() external pure returns (address)",
    "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)"
  ];

  // Uniswap V2 Factory ABI
  const factoryABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
  ];

  const router = new ethers.Contract(ROUTER_ADDRESS, routerABI, deployer);
  const WETH = await router.WETH();
  const factoryAddress = await router.factory();
  console.log("Router:", ROUTER_ADDRESS);
  console.log("WETH:", WETH);
  console.log("Factory:", factoryAddress);

  // Get token contract
  const token = await ethers.getContractAt("OOOWEEEToken", TOKEN_ADDRESS, deployer);
  const tokenBalance = await token.balanceOf(deployer.address);
  console.log("\nDeployer OOOWEEE balance:", ethers.utils.formatUnits(tokenBalance, 18));

  // Add liquidity: 10M OOOWEEE + 0.5 ETH (testnet price)
  const tokenAmount = ethers.utils.parseUnits("10000000", 18); // 10M OOOWEEE
  const ethAmount = ethers.utils.parseEther("0.5"); // 0.5 ETH for testnet

  if (tokenBalance.lt(tokenAmount)) {
    console.error("Not enough OOOWEEE tokens. Have:", ethers.utils.formatUnits(tokenBalance, 18));
    process.exit(1);
  }

  // Step 1: Approve router to spend tokens
  console.log("\n1. Approving router to spend 10M OOOWEEE...");
  const approveTx = await token.approve(ROUTER_ADDRESS, tokenAmount);
  await approveTx.wait();
  console.log("   Approved");

  // Step 2: Add liquidity
  console.log("\n2. Adding liquidity: 10M OOOWEEE + 0.5 ETH...");
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
  console.log("   Liquidity added! Tx:", receipt.transactionHash);

  // Step 3: Get the pair address
  const factory = new ethers.Contract(factoryAddress, factoryABI, deployer);
  const pairAddress = await factory.getPair(TOKEN_ADDRESS, WETH);
  console.log("   Uniswap Pair:", pairAddress);

  // Step 4: Set oracle pool
  console.log("\n3. Setting oracle OOOWEEE pool...");
  const oracle = await ethers.getContractAt("SavingsPriceOracle", ORACLE_ADDRESS, deployer);
  const oracleTx = await oracle.setOooweeePool(pairAddress);
  await oracleTx.wait();
  console.log("   Oracle pool set");

  // Step 5: Set stability liquidity pair
  console.log("\n4. Setting stability liquidity pair...");
  const stability = await ethers.getContractAt("OOOWEEEStability", STABILITY_ADDRESS, deployer);
  const stabilityTx = await stability.setLiquidityPair(pairAddress);
  await stabilityTx.wait();
  console.log("   Stability pair set");

  // Step 6: Set token liquidity pair
  console.log("\n5. Setting token liquidity pair...");
  const tokenPairTx = await token.setLiquidityPair(pairAddress, true);
  await tokenPairTx.wait();
  console.log("   Token LP pair set");

  // Step 7: Initialise stability baseline
  console.log("\n6. Initialising stability baseline...");
  try {
    const initTx = await stability.initialiseBaseline();
    await initTx.wait();
    console.log("   Baseline initialised");
  } catch (e) {
    console.log("   Baseline already initialised or error:", e.message?.slice(0, 100));
  }

  // Update deployment file
  deployment.uniswapPair = pairAddress;
  deployment.liquiditySetup = {
    timestamp: new Date().toISOString(),
    tokenAmount: "10000000",
    ethAmount: "0.5",
    pair: pairAddress
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n============ LIQUIDITY SETUP COMPLETE ============");
  console.log("Uniswap Pair:", pairAddress);
  console.log("Oracle pool: set");
  console.log("Stability pair: set");
  console.log("Token LP pair: set");
  console.log("Baseline: initialised");
  console.log("==================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
