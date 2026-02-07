// Debug stability intervention failure
const { ethers } = require("hardhat");

const ADDRESSES = {
  OOOWEEEToken: "0xcbA9cDe50239cB7D89fc7a14b320184a48212dB8",
  OOOWEEEStability: "0x9767D758d0bC527bEA0F712b6691Bac384b8Fd8f",
  OOOWEEEValidatorFund: "0x5a584D73a1599A30173493088c50c7d6b50298eb",
  UniswapRouter: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
  UniswapPair: "0xd0F4Ae7c575918B7Bccd67EB4F04D317C97B07C2",
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function isExemptFromFee(address) view returns (bool)",
  "function tradingEnabled() view returns (bool)",
  "function owner() view returns (address)",
  "function stabilityMechanism() view returns (address)"
];

const STABILITY_ABI = [
  "function checkUpkeep(bytes) view returns (bool, bytes memory)",
  "function performUpkeep(bytes) external",
  "function manualStabilityCheck() external payable",
  "function getEffectiveBaseline() view returns (uint256)",
  "function getCurrentPrice() view returns (uint256)",
  "function systemChecksEnabled() view returns (bool)",
  "function circuitBreakerTripped() view returns (bool)",
  "function liquidityPair() view returns (address)",
  "function validatorFundWallet() view returns (address)",
  "function interventionsToday() view returns (uint256)",
  "function tokensUsedToday() view returns (uint256)",
  "function baselinePrice() view returns (uint256)",
  "function chainlinkRegistry() view returns (address)",
  "function oooweeeToken() view returns (address)",
  "function uniswapRouter() view returns (address)",
  "function owner() view returns (address)",
  "function getStabilityStatus() view returns (uint256, uint256, uint256, uint256, bool, uint256, uint256)",
  "function getTokenBalance() view returns (uint256)"
];

const PAIR_ABI = [
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
  const ops = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const token = new ethers.Contract(ADDRESSES.OOOWEEEToken, ERC20_ABI, provider);
  const stability = new ethers.Contract(ADDRESSES.OOOWEEEStability, STABILITY_ABI, provider);
  const pair = new ethers.Contract(ADDRESSES.UniswapPair, PAIR_ABI, provider);

  console.log("=== Stability Debug ===\n");

  // Stability contract state
  const owner = await stability.owner();
  const enabled = await stability.systemChecksEnabled();
  const cbTripped = await stability.circuitBreakerTripped();
  const liqPair = await stability.liquidityPair();
  const vfWallet = await stability.validatorFundWallet();
  const chainlinkReg = await stability.chainlinkRegistry();
  const stabToken = await stability.oooweeeToken();
  const stabRouter = await stability.uniswapRouter();

  console.log("Owner:", owner);
  console.log("Ops:  ", ops.address);
  console.log("Enabled:", enabled);
  console.log("CB Tripped:", cbTripped);
  console.log("LP:", liqPair);
  console.log("VF Wallet:", vfWallet);
  console.log("Chainlink Registry:", chainlinkReg);
  console.log("Token:", stabToken);
  console.log("Router:", stabRouter);

  // Token state
  console.log("\n--- Token State ---");
  const tradingEnabled = await token.tradingEnabled();
  console.log("Trading enabled:", tradingEnabled);

  const stabilityBal = await token.balanceOf(ADDRESSES.OOOWEEEStability);
  console.log("Stability token balance:", ethers.utils.formatUnits(stabilityBal, 18));

  try {
    const isExempt = await token.isExemptFromFee(ADDRESSES.OOOWEEEStability);
    console.log("Stability is fee-exempt:", isExempt);
  } catch (e) {
    console.log("isExemptFromFee not found (different function name on deployed token)");
  }

  try {
    const tokenStabilityAddr = await token.stabilityMechanism();
    console.log("Token's stabilityMechanism:", tokenStabilityAddr);
  } catch (e) {
    console.log("stabilityMechanism not found:", e.reason || "function doesn't exist");
  }

  // Check allowance stability -> router
  const routerAllowance = await token.allowance(ADDRESSES.OOOWEEEStability, ADDRESSES.UniswapRouter);
  console.log("Stability -> Router allowance:", ethers.utils.formatUnits(routerAllowance, 18));

  // Pair reserves
  console.log("\n--- Pair Reserves ---");
  const [reserve0, reserve1] = await pair.getReserves();
  const token0 = await pair.token0();
  console.log("Token0:", token0);
  if (token0.toLowerCase() === ADDRESSES.OOOWEEEToken.toLowerCase()) {
    console.log("OOOWEEE reserves:", ethers.utils.formatUnits(reserve0, 18));
    console.log("WETH reserves:   ", ethers.utils.formatEther(reserve1));
  } else {
    console.log("WETH reserves:   ", ethers.utils.formatEther(reserve0));
    console.log("OOOWEEE reserves:", ethers.utils.formatUnits(reserve1, 18));
  }

  // Prices
  console.log("\n--- Prices ---");
  const baseline = await stability.baselinePrice();
  const effective = await stability.getEffectiveBaseline();
  const current = await stability.getCurrentPrice();
  console.log("Baseline (raw):", ethers.utils.formatUnits(baseline, 18));
  console.log("Baseline (eff):", ethers.utils.formatUnits(effective, 18));
  console.log("Current price: ", ethers.utils.formatUnits(current, 18));

  if (effective.gt(0)) {
    const pctAbove = current.sub(effective).mul(100).div(effective);
    console.log("% above baseline:", pctAbove.toString() + "%");
  }

  // Check upkeep
  console.log("\n--- Check Upkeep ---");
  const [upkeepNeeded, performData] = await stability.checkUpkeep("0x");
  console.log("Upkeep needed:", upkeepNeeded);
  console.log("Perform data:", performData);

  // Token balance for stability
  console.log("\n--- Stability Token Balance ---");
  try {
    const tokenBal = await stability.getTokenBalance();
    console.log("getTokenBalance():", ethers.utils.formatUnits(tokenBal, 18));
  } catch (e) {
    console.log("getTokenBalance failed:", e.reason || e.message);
  }

  // Try to estimate gas for performUpkeep
  console.log("\n--- Gas Estimation ---");
  try {
    const gas = await stability.connect(ops).estimateGas.performUpkeep("0x", { gasLimit: 1000000 });
    console.log("performUpkeep gas estimate:", gas.toString());
  } catch (e) {
    console.log("performUpkeep estimateGas FAILED:", e.reason || e.message);
    // Try static call
    try {
      await stability.connect(ops).callStatic.performUpkeep("0x", { gasLimit: 1000000 });
      console.log("Static call succeeded (unexpected)");
    } catch (e2) {
      console.log("performUpkeep staticCall FAILED:", e2.reason || e2.message);
      if (e2.data) console.log("Error data:", e2.data);
    }
  }

  // Try manual check
  console.log("\n--- Manual Check Gas ---");
  try {
    const gas2 = await stability.connect(ops).estimateGas.manualStabilityCheck({
      value: ethers.utils.parseEther("0.01"),
      gasLimit: 1000000
    });
    console.log("manualStabilityCheck gas estimate:", gas2.toString());
  } catch (e) {
    console.log("manualStabilityCheck estimateGas FAILED:", e.reason || e.message);
    try {
      await stability.connect(ops).callStatic.manualStabilityCheck({
        value: ethers.utils.parseEther("0.01"),
        gasLimit: 1000000
      });
    } catch (e2) {
      console.log("manualStabilityCheck staticCall FAILED:", e2.reason || e2.message);
      if (e2.data) console.log("Error data:", e2.data);
    }
  }

  // Check daily limits
  console.log("\n--- Daily Limits ---");
  const intToday = await stability.interventionsToday();
  const tokensToday = await stability.tokensUsedToday();
  console.log("Interventions today:", intToday.toString());
  console.log("Tokens used today:", ethers.utils.formatUnits(tokensToday, 18));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
