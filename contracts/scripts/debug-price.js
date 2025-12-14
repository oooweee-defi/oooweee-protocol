// scripts/debug-price.js
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const deployment = JSON.parse(fs.readFileSync("deployment-sepolia.json", "utf8"));
  
  const pair = await ethers.getContractAt(
    ["function token0() view returns (address)", "function token1() view returns (address)", "function getReserves() view returns (uint112, uint112, uint32)"],
    deployment.uniswapPair
  );
  
  const token0 = await pair.token0();
  const token1 = await pair.token1();
  const reserves = await pair.getReserves();
  
  console.log("Token0:", token0);
  console.log("Token1:", token1);
  console.log("OOOWEEE:", deployment.contracts.token);
  console.log("\nReserve0:", ethers.utils.formatEther(reserves[0]));
  console.log("Reserve1:", ethers.utils.formatEther(reserves[1]));
  
  // Calculate price manually
  const oooweeeIsToken0 = token0.toLowerCase() === deployment.contracts.token.toLowerCase();
  console.log("\nOOOWEEE is token0?", oooweeeIsToken0);
  
  if (oooweeeIsToken0) {
    const price = reserves[1].mul(ethers.utils.parseEther("1")).div(reserves[0]);
    console.log("Price (ETH per OOOWEEE):", ethers.utils.formatEther(price));
  } else {
    const price = reserves[0].mul(ethers.utils.parseEther("1")).div(reserves[1]);
    console.log("Price (ETH per OOOWEEE):", ethers.utils.formatEther(price));
  }
}

main().catch(console.error);