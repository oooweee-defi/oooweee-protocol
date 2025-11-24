const hre = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("\n🔧 Preparing Stability Test");
  console.log("===========================\n");

  const deploymentData = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf8"));
  const stabilityAddress = deploymentData.contracts.stability;
  const pairAddress = deploymentData.uniswapPair;
  const tokenAddress = deploymentData.contracts.token;

  const stability = await hre.ethers.getContractAt("OOOWEEEStability", stabilityAddress);
  const pair = await hre.ethers.getContractAt(
    ["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"],
    pairAddress
  );

  // 1. Check and Fix Baseline
  let baselinePrice = await stability.baselinePrice();
  console.log("Current Baseline Price:", hre.ethers.utils.formatEther(baselinePrice));

  if (baselinePrice.eq(0)) {
    console.log("⚠️ Baseline is 0. Updating baseline to current price...");
    const tx = await stability.updateBaselinePrice();
    await tx.wait();
    baselinePrice = await stability.baselinePrice();
    console.log("✅ Baseline updated to:", hre.ethers.utils.formatEther(baselinePrice));
  }

  // 2. Get Pool Data
  const reserves = await pair.getReserves();
  const token0 = await pair.token0();
  
  let tokenReserve, ethReserve;
  if (token0.toLowerCase() === tokenAddress.toLowerCase()) {
    tokenReserve = reserves[0];
    ethReserve = reserves[1];
  } else {
    tokenReserve = reserves[1];
    ethReserve = reserves[0];
  }

  const ethInPool = parseFloat(hre.ethers.utils.formatEther(ethReserve));
  const tokenInPool = parseFloat(hre.ethers.utils.formatUnits(tokenReserve, 18));
  const k = ethInPool * tokenInPool;
  const currentPriceEth = ethInPool / tokenInPool;

  console.log("\n📊 Pool Stats:");
  console.log(`  ETH Liquidity: ${ethInPool.toFixed(4)} ETH`);
  console.log(`  Token Liquidity: ${tokenInPool.toFixed(2)} OOOWEEE`);
  console.log(`  Current Price: ${currentPriceEth.toFixed(9)} ETH`);

  // 3. Calculate Amounts for Triggers
  // Target Price = Baseline * (1 + percentage/100)
  // New ETH in Pool = sqrt(k * Target Price)
  // ETH to Buy = New ETH in Pool - Current ETH in Pool

  function calculateEthForIncrease(percent) {
    const targetPrice = parseFloat(hre.ethers.utils.formatEther(baselinePrice)) * (1 + percent/100);
    const newEthPool = Math.sqrt(k * targetPrice);
    const ethNeeded = newEthPool - ethInPool;
    return { ethNeeded, targetPrice };
  }

  const trigger20 = calculateEthForIncrease(25); // Aim for 25% to be safe for the 20% threshold
  const trigger50 = calculateEthForIncrease(55); // Aim for 55% to be safe for the 50% threshold

  console.log("\n🎯 Buying Recommendations:");
  console.log("To trigger the Stability Mechanism (Threshold: >20% increase):");
  console.log(`  👉 Buy approx. ${trigger20.ethNeeded.toFixed(4)} ETH worth of OOOWEEE`);
  console.log(`     (Target Price: ${trigger20.targetPrice.toFixed(9)} ETH)`);

  console.log("\nTo trigger Critical Intervention (Threshold: >50% increase):");
  console.log(`  👉 Buy approx. ${trigger50.ethNeeded.toFixed(4)} ETH worth of OOOWEEE`);
  console.log(`     (Target Price: ${trigger50.targetPrice.toFixed(9)} ETH)`);

  console.log("\n⚠️  Note: These are estimates. Due to slippage and fees, buy slightly more to ensure the threshold is hit.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
