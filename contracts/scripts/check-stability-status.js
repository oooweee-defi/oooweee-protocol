const hre = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("\n🛡️  Checking Stability Mechanism Status");
  console.log("=====================================\n");

  const deploymentData = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf8"));
  const stabilityAddress = deploymentData.contracts.stability;
  const pairAddress = deploymentData.uniswapPair;
  const tokenAddress = deploymentData.contracts.token;

  const stability = await hre.ethers.getContractAt("OOOWEEEStability", stabilityAddress);
  const pair = await hre.ethers.getContractAt(
    ["function getReserves() view returns (uint112,uint112,uint32)", "function token0() view returns (address)"],
    pairAddress
  );

  // Get Stability Info
  const baselinePrice = await stability.baselinePrice();
  const currentPrice = await stability.getCurrentPrice();
  const tokenBalance = await stability.getTokenBalance();
  
  // Get Pool Reserves
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

  console.log("📊 Prices (in ETH per 1e18 OOOWEEE):");
  console.log("  Baseline Price: ", hre.ethers.utils.formatEther(baselinePrice));
  console.log("  Current Price:  ", hre.ethers.utils.formatEther(currentPrice));
  
  const increase = currentPrice.sub(baselinePrice).mul(100).div(baselinePrice);
  console.log(`  Current Increase: ${increase.toString()}%`);

  console.log("\n💰 Stability Reserves:");
  console.log("  OOOWEEE Balance:", hre.ethers.utils.formatUnits(tokenBalance, 18));

  console.log("\n🎯 Targets:");
  
  // Calculate target prices
  const target20 = baselinePrice.mul(120).div(100);
  const target50 = baselinePrice.mul(150).div(100);
  
  console.log("  Target +20% (Min Trigger): ", hre.ethers.utils.formatEther(target20));
  console.log("  Target +50% (Max Trigger): ", hre.ethers.utils.formatEther(target50));

  // Calculate ETH needed to reach targets using Constant Product Formula (x * y = k)
  // New Price P' = (y + dy) / (x - dx)
  // We want to find dy (ETH in) such that P' = Target Price
  // This is an approximation since price changes as we buy.
  // A better way is to solve for the amount of ETH that shifts the ratio to the target price.
  
  // Current Ratio: y / x = P
  // Target Ratio: (y + dy) / (x - dx) = P_target
  // Also (x - dx)(y + dy) = xy = k
  
  // We can solve for dy (ETH to add):
  // dy = sqrt(k * P_target) - y
  
  const k = tokenReserve.mul(ethReserve);
  
  function calculateEthNeeded(targetPrice) {
    // sqrt(k * targetPrice) - ethReserve
    // Note: targetPrice is scaled by 1e18, so we need to handle decimals carefully
    // k has 36 decimals (18 + 18)
    // targetPrice has 18 decimals
    // k * targetPrice has 54 decimals
    // sqrt(k * targetPrice) has 27 decimals
    // We want the result in 18 decimals (ETH)
    
    // Let's use a simpler iterative approach or just the formula if BigNumber supports sqrt (it doesn't natively in v5)
    // We'll use the formula: P_new = (ETH_pool + ETH_in) / (Token_pool - Token_out)
    // And (ETH_pool + ETH_in) * (Token_pool - Token_out) = K
    // So Token_pool - Token_out = K / (ETH_pool + ETH_in)
    // P_new = (ETH_pool + ETH_in)^2 / K
    // sqrt(P_new * K) = ETH_pool + ETH_in
    // ETH_in = sqrt(P_new * K) - ETH_pool
    
    // Since we don't have sqrt in BigNumber easily available here without a library, 
    // we can estimate using the current price impact.
    // Or we can just output the target price and let the user experiment.
    
    // Actually, let's try to implement a simple integer sqrt
    const val = k.mul(targetPrice).div(hre.ethers.utils.parseEther("1")); // Adjust for 1e18 scaling of price
    // val is now roughly (ETH_new * Token_new) * (ETH_new / Token_new) = ETH_new^2 * 1e18 (if we didn't divide)
    // Wait, K = Token * ETH. Price = ETH / Token.
    // K * Price = (Token * ETH) * (ETH / Token) = ETH^2
    // So sqrt(K * Price) = ETH_new (the new amount of ETH in the pool)
    
    // k is reserves[0] * reserves[1]
    // targetPrice is scaled by 1e18
    // We need sqrt(k * targetPrice / 1e18)
    
    // Let's just print the target price ratio.
    return "Calculated below";
  }

  console.log("\n🧮 Estimates (Approximate):");
  
  // Current ETH in pool
  const ethInPool = parseFloat(hre.ethers.utils.formatEther(ethReserve));
  const tokenInPool = parseFloat(hre.ethers.utils.formatUnits(tokenReserve, 18));
  const k_float = ethInPool * tokenInPool;
  
  const targetPrice20 = parseFloat(hre.ethers.utils.formatEther(target20));
  const targetPrice50 = parseFloat(hre.ethers.utils.formatEther(target50));
  
  // New ETH amount in pool = sqrt(k * targetPrice)
  const newEthPool20 = Math.sqrt(k_float * targetPrice20);
  const ethNeeded20 = newEthPool20 - ethInPool;
  
  const newEthPool50 = Math.sqrt(k_float * targetPrice50);
  const ethNeeded50 = newEthPool50 - ethInPool;
  
  console.log(`  ETH to buy to reach +20%: ~${ethNeeded20.toFixed(4)} ETH`);
  console.log(`  ETH to buy to reach +50%: ~${ethNeeded50.toFixed(4)} ETH`);
  
  // Calculate tokens received
  const tokensOut20 = tokenInPool - (k_float / newEthPool20);
  const tokensOut50 = tokenInPool - (k_float / newEthPool50);
  
  console.log(`  (You would receive ~${tokensOut20.toFixed(2)} OOOWEEE for 20% increase)`);
  console.log(`  (You would receive ~${tokensOut50.toFixed(2)} OOOWEEE for 50% increase)`);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
