const hre = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("\n🔍 Checking Uniswap Pool Reserves");
  console.log("=================================\n");

  const deploymentData = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf8"));
  const pairAddress = deploymentData.uniswapPair;
  const tokenAddress = deploymentData.contracts.token;

  console.log("Uniswap Pair:", pairAddress);
  console.log("Token Address:", tokenAddress);

  const pair = await hre.ethers.getContractAt(
    [
      "function getReserves() view returns (uint112,uint112,uint32)",
      "function token0() view returns (address)",
      "function token1() view returns (address)"
    ],
    pairAddress
  );

  const reserves = await pair.getReserves();
  const token0 = await pair.token0();
  const token1 = await pair.token1();

  console.log("\nToken0:", token0);
  console.log("Token1:", token1);
  console.log("Reserve0:", hre.ethers.utils.formatUnits(reserves[0], 18));
  console.log("Reserve1:", hre.ethers.utils.formatUnits(reserves[1], 18));

  let tokenReserve, ethReserve;
  if (token0.toLowerCase() === tokenAddress.toLowerCase()) {
    tokenReserve = reserves[0];
    ethReserve = reserves[1];
    console.log("\nToken is Token0");
  } else {
    tokenReserve = reserves[1];
    ethReserve = reserves[0];
    console.log("\nToken is Token1");
  }

  console.log("\n📊 Pool Status:");
  console.log("  OOOWEEE Reserve:", hre.ethers.utils.formatUnits(tokenReserve, 18));
  console.log("  ETH Reserve:    ", hre.ethers.utils.formatUnits(ethReserve, 18));

  // Calculate price
  const price = ethReserve.mul(hre.ethers.BigNumber.from(10).pow(18)).div(tokenReserve);
  console.log("\n💰 Price:");
  console.log("  1 OOOWEEE = ", hre.ethers.utils.formatEther(price), "ETH");
  console.log("  1 ETH = ", 1 / parseFloat(hre.ethers.utils.formatEther(price)), "OOOWEEE");

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
