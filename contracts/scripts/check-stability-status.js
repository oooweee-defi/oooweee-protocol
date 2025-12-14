const hre = require("hardhat");

async function main() {
  const pair = await hre.ethers.getContractAt(
    "IUniswapV2Pair",
    "0x4FDc01f03d30a718854cE4105eBC77CDAC374073"
  );

  const router = await hre.ethers.getContractAt(
    "IUniswapV2Router02",
    "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"
  );

  console.log("=== Pool Check ===\n");

  const token0 = await pair.token0();
  const token1 = await pair.token1();
  const [reserve0, reserve1] = await pair.getReserves();
  const weth = await router.WETH();

  console.log("Token0:", token0);
  console.log("Token1:", token1);
  console.log("WETH:", weth);
  console.log("Reserve0:", hre.ethers.utils.formatEther(reserve0));
  console.log("Reserve1:", hre.ethers.utils.formatEther(reserve1));

  // Check if WETH matches
  console.log("\nWETH is token0:", token0.toLowerCase() === weth.toLowerCase());
  console.log("WETH is token1:", token1.toLowerCase() === weth.toLowerCase());

  // Try getAmountsOut with correct path
  const oooweee = "0x700732ca3B5F751775284C75a4f90D179c89d5ce";
  const testAmount = hre.ethers.utils.parseEther("1000");
  
  console.log("\n=== Testing Paths ===");
  
  // Path: OOOWEEE -> WETH
  try {
    const amounts = await router.getAmountsOut(testAmount, [oooweee, weth]);
    console.log("OOOWEEE -> WETH works:", hre.ethers.utils.formatEther(amounts[1]), "ETH");
  } catch (e) {
    console.log("OOOWEEE -> WETH failed:", e.reason || "unknown");
  }

  // Check factory
  const factory = await router.factory();
  console.log("\nFactory:", factory);
  
  const factoryContract = await hre.ethers.getContractAt(
    ["function getPair(address,address) view returns (address)"],
    factory
  );
  
  const registeredPair = await factoryContract.getPair(oooweee, weth);
  console.log("Registered pair for OOOWEEE/WETH:", registeredPair);
  console.log("Our pair address:", "0x4FDc01f03d30a718854cE4105eBC77CDAC374073");
  console.log("Match:", registeredPair.toLowerCase() === "0x4FDc01f03d30a718854cE4105eBC77CDAC374073".toLowerCase());
}

main().catch(console.error);