const { ethers } = require("hardhat");

// ============ CONFIGURATION ============
const FOUNDER_WALLET = "0x56384f1205659291Ba5B949D641582AF6Ae7006b";
const OPERATIONS_WALLET = "0xB05F42B174E5152d34431eE4504210932ddfE715";
const UNISWAP_ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
const LP_ETH_AMOUNT = "4"; // ETH to pair with 10M OOOWEEE

// Uniswap V2 Router ABI (minimal)
const ROUTER_ABI = [
  "function factory() external pure returns (address)",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
  "function WETH() external pure returns (address)"
];

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("OOOWEEE Protocol — Sepolia Deployment");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);

  const balance = await deployer.getBalance();
  console.log("Balance:", ethers.utils.formatEther(balance), "ETH");
  console.log("Founder wallet:", FOUNDER_WALLET);
  console.log("Operations wallet:", OPERATIONS_WALLET);
  console.log("-".repeat(60));

  if (balance.lt(ethers.utils.parseEther("5"))) {
    console.warn("WARNING: Low balance. Need ~5 ETH (4 for LP + gas)");
  }

  // ============ PHASE 1: DEPLOY CONTRACTS ============
  console.log("\n📦 Phase 1: Deploying contracts...\n");

  // 1. SavingsPriceOracle
  console.log("1/5 Deploying SavingsPriceOracle...");
  const Oracle = await ethers.getContractFactory("SavingsPriceOracle");
  const oracle = await Oracle.deploy(UNISWAP_ROUTER);
  await oracle.deployed();
  console.log("  ✓ SavingsPriceOracle:", oracle.address);

  // 2. OOOWEEEToken
  console.log("2/5 Deploying OOOWEEEToken...");
  const Token = await ethers.getContractFactory("OOOWEEEToken");
  const token = await Token.deploy(FOUNDER_WALLET, OPERATIONS_WALLET);
  await token.deployed();
  console.log("  ✓ OOOWEEEToken:", token.address);

  // 3. OOOWEEEValidatorFund
  console.log("3/5 Deploying OOOWEEEValidatorFund...");
  const ValidatorFund = await ethers.getContractFactory("OOOWEEEValidatorFund");
  const validatorFund = await ValidatorFund.deploy(UNISWAP_ROUTER, OPERATIONS_WALLET);
  await validatorFund.deployed();
  console.log("  ✓ OOOWEEEValidatorFund:", validatorFund.address);

  // 4. OOOWEEESavings
  console.log("4/5 Deploying OOOWEEESavings...");
  const Savings = await ethers.getContractFactory("OOOWEEESavings");
  const savings = await Savings.deploy(token.address, oracle.address);
  await savings.deployed();
  console.log("  ✓ OOOWEEESavings:", savings.address);

  // 5. OOOWEEEStability
  console.log("5/5 Deploying OOOWEEEStability...");
  const Stability = await ethers.getContractFactory("OOOWEEEStability");
  const stability = await Stability.deploy(token.address, UNISWAP_ROUTER, validatorFund.address);
  await stability.deployed();
  console.log("  ✓ OOOWEEEStability:", stability.address);

  // ============ PHASE 2: CROSS-CONTRACT CONFIGURATION ============
  console.log("\n🔗 Phase 2: Configuring cross-contract references...\n");

  // 6. Transfer 80M stability reserve to stability contract
  console.log("6. token.setStabilityMechanism(stability)...");
  let tx = await token.setStabilityMechanism(stability.address);
  await tx.wait();
  console.log("  ✓ 80M tokens transferred to stability contract");

  // 7. Set rewards distributor
  console.log("7. savings.setRewardsDistributor(validatorFund)...");
  tx = await savings.setRewardsDistributor(validatorFund.address);
  await tx.wait();
  console.log("  ✓ Rewards distributor set");

  // 8. Set validator fund on stability
  console.log("8. stability.setValidatorFund(validatorFund)...");
  tx = await stability.setValidatorFund(validatorFund.address);
  await tx.wait();
  console.log("  ✓ Validator fund set on stability");

  // 9. Set contracts on validator fund
  console.log("9. validatorFund.setContracts(token, savings)...");
  tx = await validatorFund.setContracts(token.address, savings.address);
  await tx.wait();
  console.log("  ✓ Token and savings set on validator fund");

  // 10. Set stability contract on validator fund
  console.log("10. validatorFund.setStabilityContract(stability)...");
  tx = await validatorFund.setStabilityContract(stability.address);
  await tx.wait();
  console.log("  ✓ Stability contract set on validator fund");

  // 11. Enable trading
  console.log("11. token.enableTrading()...");
  tx = await token.enableTrading();
  await tx.wait();
  console.log("  ✓ Trading enabled");

  // ============ PHASE 3: CREATE UNISWAP LP ============
  console.log("\n💧 Phase 3: Creating Uniswap V2 liquidity pool...\n");

  const router = new ethers.Contract(UNISWAP_ROUTER, ROUTER_ABI, deployer);
  const factoryAddress = await router.factory();
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, deployer);

  // The operations wallet (deployer) received 10M OOOWEEE at token deploy
  const lpTokenAmount = ethers.utils.parseUnits("10000000", 18); // 10M
  const lpEthAmount = ethers.utils.parseEther(LP_ETH_AMOUNT);

  // Check deployer's token balance
  const deployerTokenBalance = await token.balanceOf(deployer.address);
  console.log("  Deployer token balance:", ethers.utils.formatUnits(deployerTokenBalance, 18), "OOOWEEE");

  // 12. Approve router to spend tokens
  console.log("12. Approving router to spend 10M OOOWEEE...");
  tx = await token.approve(UNISWAP_ROUTER, lpTokenAmount);
  await tx.wait();
  console.log("  ✓ Router approved");

  // 13. Add liquidity
  console.log(`13. Adding liquidity: 10M OOOWEEE + ${LP_ETH_AMOUNT} ETH...`);
  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 min
  tx = await router.addLiquidityETH(
    token.address,
    lpTokenAmount,
    lpTokenAmount.mul(95).div(100), // 5% slippage
    lpEthAmount.mul(95).div(100),   // 5% slippage
    deployer.address,
    deadline,
    { value: lpEthAmount }
  );
  const receipt = await tx.wait();
  console.log("  ✓ Liquidity added! Tx:", receipt.transactionHash);

  // 14. Get pair address
  const weth = await router.WETH();
  const pairAddress = await factory.getPair(token.address, weth);
  console.log("  ✓ Uniswap Pair:", pairAddress);

  // ============ PHASE 4: POST-LP CONFIGURATION ============
  console.log("\n⚙️  Phase 4: Post-LP configuration...\n");

  // 15. Set liquidity pair on token
  console.log("15. token.setLiquidityPair(pair)...");
  tx = await token.setLiquidityPair(pairAddress, true);
  await tx.wait();
  console.log("  ✓ Liquidity pair set on token");

  // 16. Set liquidity pair on stability
  console.log("16. stability.setLiquidityPair(pair)...");
  tx = await stability.setLiquidityPair(pairAddress);
  await tx.wait();
  console.log("  ✓ Liquidity pair set on stability");

  // 17. Set OOOWEEE pool on oracle
  console.log("17. oracle.setOooweeePool(pair)...");
  tx = await oracle.setOooweeePool(pairAddress);
  await tx.wait();
  console.log("  ✓ OOOWEEE pool set on oracle");

  // 18. Initialize baseline price
  console.log("18. stability.initialiseBaseline()...");
  tx = await stability.initialiseBaseline();
  await tx.wait();
  console.log("  ✓ Baseline price initialized");

  // ============ SUMMARY ============
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));

  const addresses = {
    SavingsPriceOracle: oracle.address,
    OOOWEEEToken: token.address,
    OOOWEEEValidatorFund: validatorFund.address,
    OOOWEEESavings: savings.address,
    OOOWEEEStability: stability.address,
    UniswapPair: pairAddress,
    UniswapRouter: UNISWAP_ROUTER,
    FounderWallet: FOUNDER_WALLET,
    OperationsWallet: OPERATIONS_WALLET,
    Network: "Sepolia (11155111)",
    DeployedAt: new Date().toISOString()
  };

  console.log("\nContract Addresses:");
  Object.entries(addresses).forEach(([name, addr]) => {
    console.log(`  ${name}: ${addr}`);
  });

  // Write addresses to file
  const fs = require("fs");
  fs.writeFileSync(
    "./deployed-addresses.json",
    JSON.stringify(addresses, null, 2)
  );
  console.log("\n✓ Addresses written to deployed-addresses.json");

  console.log("\n⚠️  NEXT STEPS:");
  console.log("  1. Update frontend ABIs and addresses");
  console.log("  2. Register Chainlink Automation upkeep at automation.chain.link");
  console.log("  3. Verify contracts on Etherscan");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED:");
    console.error(error);
    process.exit(1);
  });
