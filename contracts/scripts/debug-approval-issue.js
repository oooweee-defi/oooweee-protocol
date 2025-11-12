async function main() {
  console.log("=== DEBUGGING WHY EXACT APPROVAL FAILS ===\n");
  
  const tokenAddress = "0x42fc7b7175b5B9116c38bbBd5b88C1c968Dd7b77";
  const routerAddress = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
  const yourAddress = "0x335bB9E071F10a414308170045A5Bc614BcC97B6";
  
  const token = await ethers.getContractAt("OOOWEEEToken", tokenAddress);
  const router = await ethers.getContractAt([
    "function swapExactTokensForETH(uint,uint,address[],address,uint) returns(uint[])"
  ], routerAddress);
  
  // Test 1: Try exact approval
  console.log("TEST 1: Exact amount approval");
  const exactAmount = ethers.utils.parseEther("100");
  
  await token.approve(routerAddress, exactAmount);
  const allowance1 = await token.allowance(yourAddress, routerAddress);
  console.log("Approved:", ethers.utils.formatEther(allowance1));
  console.log("Balance:", ethers.utils.formatEther(await token.balanceOf(yourAddress)));
  
  try {
    const tx = await router.swapExactTokensForETH(
      exactAmount,
      0,
      [tokenAddress, "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"],
      yourAddress,
      Math.floor(Date.now()/1000) + 3600,
      { gasLimit: 500000 }
    );
    console.log("✅ Exact approval worked!");
  } catch (error) {
    console.log("❌ Exact approval failed:", error.reason);
    
    // Test 2: Try with 10% buffer
    console.log("\nTEST 2: Approval with 10% buffer");
    const bufferAmount = exactAmount.mul(110).div(100);
    await token.approve(routerAddress, bufferAmount);
    
    try {
      const tx = await router.swapExactTokensForETH(
        exactAmount,
        0,
        [tokenAddress, "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"],
        yourAddress,
        Math.floor(Date.now()/1000) + 3600,
        { gasLimit: 500000 }
      );
      console.log("✅ 10% buffer worked!");
    } catch (error) {
      console.log("❌ 10% buffer failed:", error.reason);
      
      // Test 3: Try double the amount
      console.log("\nTEST 3: Double approval");
      const doubleAmount = exactAmount.mul(2);
      await token.approve(routerAddress, doubleAmount);
      
      try {
        const tx = await router.swapExactTokensForETH(
          exactAmount,
          0,
          [tokenAddress, "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"],
          yourAddress,
          Math.floor(Date.now()/1000) + 3600,
          { gasLimit: 500000 }
        );
        console.log("✅ Double approval worked!");
      } catch (error) {
        console.log("❌ Double approval failed:", error.reason);
        console.log("\n🔴 Only max approval works - this suggests a Uniswap V2 quirk");
      }
    }
  }
  
  // Test 4: Check if it's about fee-on-transfer detection
  console.log("\n=== CHECKING FEE-ON-TRANSFER DETECTION ===");
  console.log("Uniswap might be testing with max transfers to detect fees...");
  
  // Reset approval
  await token.approve(routerAddress, 0);
}

main().catch(console.error);