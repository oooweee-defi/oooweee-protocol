async function main() {
  const poolAddress = "0x68cccb84eef9de6f97451caf3219762e907e0dc7";
  const tokenAddress = "0x42fc7b7175b5B9116c38bbBd5b88C1c968Dd7b77";
  const wethAddress = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
  
  const pool = await ethers.getContractAt([
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function getReserves() view returns (uint112,uint112,uint32)"
  ], poolAddress);
  
  const token0 = await pool.token0();
  const token1 = await pool.token1();
  const reserves = await pool.getReserves();
  
  console.log("Pool Analysis:");
  console.log("Token0:", token0);
  console.log("Token1:", token1);
  console.log("");
  
  if (token0.toLowerCase() === tokenAddress.toLowerCase()) {
    console.log("Token0 is OOOWEEE (Reserve:", ethers.utils.formatEther(reserves[0]), ")");
    console.log("Token1 is WETH (Reserve:", ethers.utils.formatEther(reserves[1]), ")");
  } else {
    console.log("Token0 is WETH (Reserve:", ethers.utils.formatEther(reserves[0]), ")");
    console.log("Token1 is OOOWEEE (Reserve:", ethers.utils.formatEther(reserves[1]), ")");
  }
  
  console.log("\n⚠️  If WETH is token0, the reserves show OOOWEEE=0.1 and WETH=100000");
  console.log("This would be backwards and explain the swap failure!");
}

main().catch(console.error);