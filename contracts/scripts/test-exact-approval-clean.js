// scripts/test-exact-approval-clean.js
async function main() {
  const tokenAddress = "0x42fc7b7175b5B9116c38bbBd5b88C1c968Dd7b77";
  const routerAddress = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
  
  const token = await ethers.getContractAt("OOOWEEEToken", tokenAddress);
  
  // Fresh start - reset approval to 0
  console.log("Resetting approval to 0...");
  await (await token.approve(routerAddress, 0)).wait();
  
  // Now try exact amount
  const testAmount = ethers.utils.parseEther("10");
  console.log("Approving exact amount: 10 OOOWEEE");
  await (await token.approve(routerAddress, testAmount)).wait();
  
  // Check what was actually approved
  const [signer] = await ethers.getSigners();
  const actualApproval = await token.allowance(signer.address, routerAddress);
  console.log("Actual approval:", ethers.utils.formatEther(actualApproval));
  
  // Now try swap
  const router = await ethers.getContractAt([
    "function swapExactTokensForETH(uint,uint,address[],address,uint) returns(uint[])"
  ], routerAddress);
  
  try {
    console.log("Attempting swap...");
    const tx = await router.swapExactTokensForETH(
      testAmount,
      0,
      [tokenAddress, "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"],
      signer.address,
      Math.floor(Date.now()/1000) + 3600,
      { gasLimit: 500000 }
    );
    await tx.wait();
    console.log("✅ EXACT APPROVAL WORKS!");
  } catch (error) {
    console.log("❌ Failed:", error.reason);
  }
}

main().catch(console.error);