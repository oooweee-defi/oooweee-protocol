async function main() {
  const tokenAddress = "0x42fc7b7175b5B9116c38bbBd5b88C1c968Dd7b77";
  const routerAddress = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
  const yourAddress = "0x335bB9E071F10a414308170045A5Bc614BcC97B6";
  
  const token = await ethers.getContractAt("OOOWEEEToken", tokenAddress);
  
  // First, fresh approval with max uint256
  console.log("Setting max approval...");
  const maxApproval = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  const approveTx = await token.approve(routerAddress, maxApproval);
  await approveTx.wait();
  console.log("✅ Max approval set");
  
  // Check allowance
  const allowance = await token.allowance(yourAddress, routerAddress);
  console.log("Allowance:", allowance.toString());
  
  // Now try the swap with minimal amount
  console.log("\nAttempting minimal swap (10 OOOWEEE)...");
  const router = await ethers.getContractAt([
    "function swapExactTokensForETH(uint,uint,address[],address,uint) returns(uint[])"
  ], routerAddress);
  
  try {
    const tx = await router.swapExactTokensForETH(
      ethers.utils.parseEther("10"), // Just 10 OOOWEEE
      "0", // min ETH out
      [tokenAddress, "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"],
      yourAddress,
      Math.floor(Date.now()/1000) + 3600,
      { gasLimit: 500000 } // Manual gas limit
    );
    
    const receipt = await tx.wait();
    console.log("✅ SWAP SUCCESSFUL!", receipt.transactionHash);
  } catch (error) {
    console.log("❌ Swap still failing");
    console.log("Error:", error.reason || error.message);
  }
}

main().catch(console.error);