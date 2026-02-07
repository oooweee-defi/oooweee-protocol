const { ethers } = require("hardhat");

// ============ CONFIGURATION ============
const BILL_PRIVATE_KEY = "4eb4cfe4dc6a45e4330e6b8b30a4a8bde735ec926e68f1e02440681bf3111cda";
const ADMIN_PRIVATE_KEY = "504d093dce2a7e98cb1ee44528afa8cbf1cdb619d6838e0884e1df33cf862a89";

const CONTRACTS = {
  OOOWEEEToken: "0x860B25684119acBB5Ffe5aD50611c6BE90E7882b",
  OOOWEEESavings: "0x1687f07Fbf180189502BaA652911382a62cB9DF6",
  OOOWEEEStability: "0x706E4c306c29Acc6a6C7bE5ec8b9957cf07BE33D",
  OOOWEEEValidatorFund: "0x1706240479829e9eACDA35336527225DbF817e0a",
  SavingsPriceOracle: "0x6A1f5eD53Ff87E7D955072e440E989cb588fa323",
  UniswapPair: "0x7f1bB15e09cEdFCA496B280Ff78815243821a598"
};

const UNISWAP_ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

const ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) public view returns (uint[] memory amounts)"
];

const PAIR_ABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

async function main() {
  console.log("=".repeat(60));
  console.log("OOOWEEE Protocol — Stability Mechanism Test");
  console.log("=".repeat(60));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Network: Sepolia (11155111)\n`);

  // Setup
  const provider = new ethers.providers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const bill = new ethers.Wallet(BILL_PRIVATE_KEY, provider);
  const admin = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);

  console.log(`Bill:  ${bill.address}`);
  console.log(`Admin: ${admin.address}\n`);

  // Load contracts
  const stabilityArt = await ethers.getContractFactory("OOOWEEEStability");
  const tokenArt = await ethers.getContractFactory("OOOWEEEToken");
  const validatorArt = await ethers.getContractFactory("OOOWEEEValidatorFund");

  const stability = stabilityArt.attach(CONTRACTS.OOOWEEEStability).connect(admin);
  const stabilityBill = stabilityArt.attach(CONTRACTS.OOOWEEEStability).connect(bill);
  const token = tokenArt.attach(CONTRACTS.OOOWEEEToken).connect(bill);
  const validatorFund = validatorArt.attach(CONTRACTS.OOOWEEEValidatorFund).connect(admin);
  const router = new ethers.Contract(UNISWAP_ROUTER, ROUTER_ABI, bill);
  const pair = new ethers.Contract(CONTRACTS.UniswapPair, PAIR_ABI, provider);

  // ============ STEP 1: PRE-CHECK STATE ============
  console.log("-".repeat(60));
  console.log("STEP 1: Pre-check contract state\n");

  const billBalance = await provider.getBalance(bill.address);
  console.log(`  Bill ETH balance: ${ethers.utils.formatEther(billBalance)} ETH`);

  const checksEnabled = await stability.systemChecksEnabled();
  console.log(`  System checks enabled: ${checksEnabled}`);

  const circuitBreaker = await stability.circuitBreakerTripped();
  console.log(`  Circuit breaker tripped: ${circuitBreaker}`);

  const chainlinkRegistry = await stability.chainlinkRegistry();
  console.log(`  Chainlink registry: ${chainlinkRegistry}`);

  const currentPrice = await stability.getCurrentPrice();
  console.log(`  Current price: ${ethers.utils.formatUnits(currentPrice, 18)} ETH/token`);

  const baselinePrice = await stability.baselinePrice();
  console.log(`  Baseline price: ${ethers.utils.formatUnits(baselinePrice, 18)} ETH/token`);

  const effectiveBaseline = await stability.getEffectiveBaseline();
  console.log(`  Effective baseline: ${ethers.utils.formatUnits(effectiveBaseline, 18)} ETH/token`);

  const stabilityTokenBalance = await token.balanceOf(CONTRACTS.OOOWEEEStability);
  console.log(`  Stability token reserve: ${ethers.utils.formatUnits(stabilityTokenBalance, 18)} OOOWEEE`);

  const validatorFundETH = await provider.getBalance(CONTRACTS.OOOWEEEValidatorFund);
  console.log(`  ValidatorFund ETH: ${ethers.utils.formatEther(validatorFundETH)} ETH`);

  // Get reserves
  const token0 = await pair.token0();
  const reserves = await pair.getReserves();
  const isToken0OOOWEEE = token0.toLowerCase() === CONTRACTS.OOOWEEEToken.toLowerCase();
  const reserveToken = isToken0OOOWEEE ? reserves[0] : reserves[1];
  const reserveETH = isToken0OOOWEEE ? reserves[1] : reserves[0];
  console.log(`  LP reserves: ${ethers.utils.formatUnits(reserveToken, 18)} OOOWEEE / ${ethers.utils.formatEther(reserveETH)} ETH`);

  // Check if checkUpkeep returns false (no intervention needed yet)
  const [upkeepNeeded] = await stability.checkUpkeep("0x");
  console.log(`  checkUpkeep() → upkeepNeeded: ${upkeepNeeded}`);

  if (circuitBreaker) {
    console.log("\n  ⚠️  Circuit breaker is tripped! Resetting...");
    const tx = await stability.resetCircuitBreaker();
    await tx.wait();
    console.log("  ✓ Circuit breaker reset");
  }

  if (!checksEnabled) {
    console.log("\n  ⚠️  System checks disabled! Enabling...");
    const tx = await stability.setChecksEnabled(true);
    await tx.wait();
    console.log("  ✓ System checks enabled");
  }

  // ============ STEP 2: CALCULATE REQUIRED BUY ============
  console.log("\n" + "-".repeat(60));
  console.log("STEP 2: Calculate buy size to trigger >10% price spike\n");

  // Price = reserveETH / reserveToken
  // After buy: new reserveETH = reserveETH + buyETH, new reserveToken = k / newReserveETH
  // We want newPrice / oldPrice > 1.12 (12% to be safely above 10% threshold)
  // newPrice/oldPrice = (newReserveETH/newReserveToken) / (reserveETH/reserveToken)
  //                   = (newReserveETH * reserveToken) / (reserveETH * newReserveToken)
  // Since k = reserveETH * reserveToken = newReserveETH * newReserveToken
  // newReserveToken = k / newReserveETH
  // ratio = (newReserveETH^2) / (reserveETH * reserveToken) * (reserveToken / 1)
  // Simplified: ratio = (newReserveETH / reserveETH)^2
  // For 15% spike: sqrt(1.15) * reserveETH = newReserveETH
  // buyETH = newReserveETH - reserveETH = reserveETH * (sqrt(1.15) - 1)

  const targetSpike = 1.15; // 15% — comfortably above 10% threshold
  const sqrtTarget = Math.sqrt(targetSpike);
  const reserveETHFloat = parseFloat(ethers.utils.formatEther(reserveETH));
  const buyETHFloat = reserveETHFloat * (sqrtTarget - 1);

  console.log(`  Target spike: ${((targetSpike - 1) * 100).toFixed(0)}%`);
  console.log(`  sqrt(${targetSpike}) = ${sqrtTarget.toFixed(6)}`);
  console.log(`  Required buy: ~${buyETHFloat.toFixed(4)} ETH`);

  // Round up a bit and cap at Bill's balance minus gas
  const buyETH = Math.min(buyETHFloat * 1.1, parseFloat(ethers.utils.formatEther(billBalance)) - 0.05);
  console.log(`  Actual buy amount: ${buyETH.toFixed(4)} ETH (with 10% buffer, reserving 0.05 for gas)`);

  if (buyETH <= 0) {
    console.log("  ❌ Bill doesn't have enough ETH for the test!");
    process.exit(1);
  }

  const buyWei = ethers.utils.parseEther(buyETH.toFixed(6));

  // Preview expected tokens
  const amountsOut = await router.getAmountsOut(buyWei, [WETH, CONTRACTS.OOOWEEEToken]);
  console.log(`  Expected tokens out: ${ethers.utils.formatUnits(amountsOut[1], 18)} OOOWEEE`);

  // ============ STEP 3: EXECUTE THE BUY (SPIKE THE PRICE) ============
  console.log("\n" + "-".repeat(60));
  console.log("STEP 3: Bill buys OOOWEEE to spike the price\n");

  const deadline = Math.floor(Date.now() / 1000) + 600;
  console.log(`  Swapping ${buyETH.toFixed(4)} ETH for OOOWEEE...`);

  const buyTx = await router.swapExactETHForTokens(
    0, // accept any amount (testnet)
    [WETH, CONTRACTS.OOOWEEEToken],
    bill.address,
    deadline,
    { value: buyWei, gasLimit: 300000 }
  );
  const buyReceipt = await buyTx.wait();
  console.log(`  ✓ Buy tx confirmed: ${buyReceipt.transactionHash}`);

  // Check new price
  const newPrice = await stability.getCurrentPrice();
  const priceIncrease = newPrice.sub(effectiveBaseline).mul(100).div(effectiveBaseline);
  console.log(`  New price: ${ethers.utils.formatUnits(newPrice, 18)} ETH/token`);
  console.log(`  Price increase vs effective baseline: ${priceIncrease.toString()}%`);

  // Check new reserves
  const newReserves = await pair.getReserves();
  const newReserveToken = isToken0OOOWEEE ? newReserves[0] : newReserves[1];
  const newReserveETH = isToken0OOOWEEE ? newReserves[1] : newReserves[0];
  console.log(`  New LP reserves: ${ethers.utils.formatUnits(newReserveToken, 18)} OOOWEEE / ${ethers.utils.formatEther(newReserveETH)} ETH`);

  // ============ STEP 4: CHECK UPKEEP ============
  console.log("\n" + "-".repeat(60));
  console.log("STEP 4: Verify checkUpkeep() detects the spike\n");

  const [needsUpkeep, performData] = await stability.checkUpkeep("0x");
  console.log(`  checkUpkeep() → upkeepNeeded: ${needsUpkeep}`);

  if (needsUpkeep) {
    console.log("  ✅ Chainlink Automation will detect this spike!");
  } else {
    console.log("  ⚠️  checkUpkeep says no upkeep needed. Checking why...");
    const checksOn = await stability.systemChecksEnabled();
    const cbTripped = await stability.circuitBreakerTripped();
    console.log(`    systemChecksEnabled: ${checksOn}`);
    console.log(`    circuitBreakerTripped: ${cbTripped}`);
    console.log(`    Price increase: ${priceIncrease.toString()}% (need >10%)`);
  }

  // ============ STEP 5: WAIT FOR CHAINLINK OR MANUAL TRIGGER ============
  console.log("\n" + "-".repeat(60));
  console.log("STEP 5: Wait for Chainlink Automation (30s) then fallback to manual\n");

  const stabilityBalanceBefore = await token.balanceOf(CONTRACTS.OOOWEEEStability);
  const vfBalanceBefore = await provider.getBalance(CONTRACTS.OOOWEEEValidatorFund);

  // Listen for StabilityIntervention event
  let interventionDetected = false;
  let interventionEvent = null;

  const interventionFilter = stability.filters.StabilityIntervention();

  // Poll for 30 seconds — check if Chainlink fires performUpkeep
  console.log("  Waiting for Chainlink to call performUpkeep()...");
  const startTime = Date.now();
  const waitTimeMs = 30000; // 30 seconds

  while (Date.now() - startTime < waitTimeMs) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  Waiting... ${elapsed}s / ${waitTimeMs / 1000}s`);

    // Check for recent events
    const latestBlock = await provider.getBlockNumber();
    const events = await stability.queryFilter(interventionFilter, latestBlock - 2, latestBlock);
    if (events.length > 0) {
      interventionEvent = events[events.length - 1];
      interventionDetected = true;
      console.log("\n  🎉 StabilityIntervention event detected! Chainlink fired!");
      break;
    }

    await new Promise(r => setTimeout(r, 5000)); // Check every 5s
  }

  if (!interventionDetected) {
    console.log("\n  ⏰ Chainlink didn't fire in 30s — using manualStabilityCheck() as fallback");
    console.log("  (Chainlink checks ~every 30s-60s on Sepolia, may just need more time)");
    console.log("\n  Calling manualStabilityCheck() with 0.01 ETH...");

    try {
      // First try a static call to get the revert reason if any
      try {
        await stabilityBill.callStatic.manualStabilityCheck({
          value: ethers.utils.parseEther("0.01"),
          gasLimit: 1000000
        });
        console.log("  Static call succeeded — sending real tx...");
      } catch (staticErr) {
        console.log(`  ⚠️  Static call revert: ${staticErr.reason || staticErr.message}`);
        console.log("  Trying real tx anyway to see on-chain result...");
      }

      const manualTx = await stabilityBill.manualStabilityCheck({
        value: ethers.utils.parseEther("0.01"),
        gasLimit: 1000000
      });
      const manualReceipt = await manualTx.wait();
      console.log(`  ✓ Manual check tx confirmed: ${manualReceipt.transactionHash}`);

      // Check for events in the receipt
      for (const log of manualReceipt.logs) {
        try {
          const parsed = stability.interface.parseLog(log);
          if (parsed.name === "StabilityIntervention") {
            interventionEvent = parsed;
            interventionDetected = true;
            console.log("  ✅ StabilityIntervention emitted via manual check!");
          } else if (parsed.name === "SystemCheck") {
            console.log(`  📊 SystemCheck: price=${ethers.utils.formatUnits(parsed.args.currentPrice, 18)}, increase=${parsed.args.priceIncrease}%, intervened=${parsed.args.intervened}`);
          } else if (parsed.name === "BaselineUpdated") {
            console.log(`  📈 BaselineUpdated: ${ethers.utils.formatUnits(parsed.args.oldBaseline, 18)} → ${ethers.utils.formatUnits(parsed.args.newBaseline, 18)}`);
          } else if (parsed.name === "ETHSentToValidators") {
            console.log(`  💰 ETHSentToValidators: ${ethers.utils.formatEther(parsed.args.amount)} ETH`);
          }
        } catch (e) {
          // Not our event, skip
        }
      }
    } catch (err) {
      console.log(`  ❌ Manual check failed: ${err.reason || err.message}`);
    }
  }

  // ============ STEP 6: VERIFY RESULTS ============
  console.log("\n" + "-".repeat(60));
  console.log("STEP 6: Verify intervention results\n");

  const finalPrice = await stability.getCurrentPrice();
  const finalBaseline = await stability.baselinePrice();
  const stabilityBalanceAfter = await token.balanceOf(CONTRACTS.OOOWEEEStability);
  const vfBalanceAfter = await provider.getBalance(CONTRACTS.OOOWEEEValidatorFund);

  const tokensUsed = stabilityBalanceBefore.sub(stabilityBalanceAfter);
  const ethCaptured = vfBalanceAfter.sub(vfBalanceBefore);

  console.log(`  Price before spike: ${ethers.utils.formatUnits(currentPrice, 18)} ETH/token`);
  console.log(`  Price after spike:  ${ethers.utils.formatUnits(newPrice, 18)} ETH/token`);
  console.log(`  Price after intervention: ${ethers.utils.formatUnits(finalPrice, 18)} ETH/token`);
  console.log(`  Baseline updated to: ${ethers.utils.formatUnits(finalBaseline, 18)} ETH/token`);
  console.log(`  Tokens sold by stability: ${ethers.utils.formatUnits(tokensUsed, 18)} OOOWEEE`);
  console.log(`  ETH captured to ValidatorFund: ${ethers.utils.formatEther(ethCaptured)} ETH`);

  if (interventionDetected) {
    if (interventionEvent && interventionEvent.args) {
      console.log(`\n  Intervention details:`);
      console.log(`    Tokens injected: ${ethers.utils.formatUnits(interventionEvent.args.tokensInjected, 18)}`);
      console.log(`    ETH captured: ${ethers.utils.formatEther(interventionEvent.args.ethCaptured)}`);
      console.log(`    Price before: ${ethers.utils.formatUnits(interventionEvent.args.priceBefore, 18)}`);
      console.log(`    Price after: ${ethers.utils.formatUnits(interventionEvent.args.priceAfter, 18)}`);
      console.log(`    Capture rate: ${interventionEvent.args.captureRate.toString()}%`);
    }
    console.log("\n  ✅ STABILITY MECHANISM TEST PASSED");
  } else {
    console.log("\n  ⚠️  No intervention detected — check contract state");

    // Additional diagnostics
    const cbStatus = await stability.getCircuitBreakerStatus();
    console.log(`  Daily interventions: ${cbStatus.dailyInterventions.toString()}`);
    console.log(`  Daily tokens used: ${ethers.utils.formatUnits(cbStatus.dailyTokensUsed, 18)}`);
    console.log(`  Remaining interventions: ${cbStatus.remainingInterventions.toString()}`);
    console.log(`  Remaining tokens: ${ethers.utils.formatUnits(cbStatus.remainingTokens, 18)}`);
  }

  // ============ STEP 7: CHECK BILL'S FINAL STATE ============
  console.log("\n" + "-".repeat(60));
  console.log("STEP 7: Final state\n");

  const billFinalETH = await provider.getBalance(bill.address);
  const billTokens = await token.balanceOf(bill.address);
  const [finalUpkeepNeeded] = await stability.checkUpkeep("0x");

  console.log(`  Bill ETH: ${ethers.utils.formatEther(billFinalETH)}`);
  console.log(`  Bill OOOWEEE: ${ethers.utils.formatUnits(billTokens, 18)}`);
  console.log(`  checkUpkeep() now: ${finalUpkeepNeeded} (should be false after intervention)`);

  const finalReserves = await pair.getReserves();
  const frToken = isToken0OOOWEEE ? finalReserves[0] : finalReserves[1];
  const frETH = isToken0OOOWEEE ? finalReserves[1] : finalReserves[0];
  console.log(`  Final LP reserves: ${ethers.utils.formatUnits(frToken, 18)} OOOWEEE / ${ethers.utils.formatEther(frETH)} ETH`);

  console.log("\n" + "=".repeat(60));
  console.log("STABILITY TEST COMPLETE");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ TEST FAILED:");
    console.error(error);
    process.exit(1);
  });
