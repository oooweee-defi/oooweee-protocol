// scripts/test-stability.js
const { ethers } = require("hardhat");

async function main() {
  const stability = await ethers.getContractAt(
    "OOOWEEEStability", 
    "0x6af645117Ea9E96fCBb910B8b2Bf31A622e3c7CD"
  );
  
  const token = await ethers.getContractAt(
    "IERC20",
    "0xE9E1AbFa961A3967FB4daF22875521a3c9249a44"
  );
  
  console.log("LP:", await stability.liquidityPair());
  console.log("Baseline:", (await stability.baselinePrice()).toString());
  console.log("Token Balance:", ethers.utils.formatEther(await token.balanceOf(stability.address)));
  console.log("Current Price:", (await stability.getCurrentPrice()).toString());
  console.log("Interventions Today:", (await stability.interventionsToday()).toString());
  console.log("Tokens Used Today:", ethers.utils.formatEther(await stability.tokensUsedToday()));
}

main();