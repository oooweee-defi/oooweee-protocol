const { ethers } = require("hardhat");

async function main() {
  const router = await ethers.getContractAt("IUniswapV2Router02", "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008");
  const lp = await ethers.getContractAt("IUniswapV2Pair", "0x7C7abc858F7B06a9547e1dc33Db46F896C4BE6a8");

  console.log("Router WETH:", await router.WETH());
  console.log("Router Factory:", await router.factory());
  console.log("LP Factory:", await lp.factory());
  console.log("LP Token0:", await lp.token0());
  console.log("LP Token1:", await lp.token1());
  
  const reserves = await lp.getReserves();
  console.log("Reserve0:", ethers.utils.formatEther(reserves[0]));
  console.log("Reserve1:", ethers.utils.formatEther(reserves[1]));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });