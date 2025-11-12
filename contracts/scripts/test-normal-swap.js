// scripts/test-normal-swap.js
async function main() {
  console.log("Testing swap with exact approval (not max)...\n");
  
  const tokenAddress = "0xD4eEa41F12FBb3e2030B17FDeaaF8b38c471B32a";
  const routerAddress = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
  const poolAddress = "0x038aeAca2A06269Fe81246c7eb483c6d3419D7B2";
  
  const token = await ethers.getContractAt("OOOWEEEToken", tokenAddress);
  const router = await ethers.getContractAt([
    "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint,uint,address[],address,uint)"
  ], routerAddress);
  
  // Test amount: 100 OOOWEEE
  const swapAmount = ethers.utils.parseEther("100");
  
  // EXACT approval (not max)
  console.log("Approving exact amount: 100 OOOWEEE");
  await (await token.approve(routerAddress, swapAmount)).wait();
  
  // Check approval
  const allowance = await token.allowance("0x335bB9E071F10a414308170045A5Bc614BcC97B6", routerAddress);
  console.log("Approved:", ethers.utils.formatEther(allowance));
  
  // Perform swap
  console.log("\nSwapping 100 OOOWEEE for ETH...");
  const path = [tokenAddress, "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"]; // token -> WETH
  
  const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
    swapAmount,
    0,
    path,
    "0x335bB9E071F10a414308170045A5Bc614BcC97B6",
    Math.floor(Date.now()/1000) + 3600
  );
  
  await tx.wait();
  console.log("✅ SWAP SUCCESSFUL WITH EXACT APPROVAL!");
  console.log("\nYour pool is working perfectly with normal approvals!");
}

main().catch(console.error);