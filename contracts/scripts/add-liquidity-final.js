// scripts/add-liquidity-final.js
async function main() {
  console.log("Adding liquidity to pool...\n");
  
  const tokenAddress = "0xD4eEa41F12FBb3e2030B17FDeaaF8b38c471B32a";
  const routerAddress = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
  
  const token = await ethers.getContractAt("OOOWEEEToken", tokenAddress);
  const router = await ethers.getContractAt([
    "function addLiquidityETH(address,uint,uint,uint,address,uint) payable returns(uint,uint,uint)"
  ], routerAddress);
  
  // Approve router
  console.log("Approving router...");
  await token.approve(routerAddress, ethers.utils.parseEther("100000"));
  
  // Add liquidity
  console.log("Adding 0.1 ETH + 100,000 OOOWEEE...");
  const tx = await router.addLiquidityETH(
    tokenAddress,
    ethers.utils.parseEther("100000"),
    0,
    0,
    "0x335bB9E071F10a414308170045A5Bc614BcC97B6",
    Math.floor(Date.now()/1000) + 3600,
    { value: ethers.utils.parseEther("0.1") }
  );
  
  await tx.wait();
  console.log("✅ Liquidity added!");
}

main().catch(console.error);