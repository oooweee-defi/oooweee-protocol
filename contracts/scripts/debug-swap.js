async function main() {
  console.log("=== DEBUGGING SWAP ISSUE ===\n");
  
  const routerAddress = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
  const tokenAddress = "0x42fc7b7175b5B9116c38bbBd5b88C1c968Dd7b77";
  const yourAddress = "0x335bB9E071F10a414308170045A5Bc614BcC97B6";
  
  const token = await ethers.getContractAt("OOOWEEEToken", tokenAddress);
  
  // Check 1: Your balance
  const balance = await token.balanceOf(yourAddress);
  console.log("Your OOOWEEE balance:", ethers.utils.formatEther(balance));
  
  // Check 2: Current allowance
  const allowance = await token.allowance(yourAddress, routerAddress);
  console.log("Current router allowance:", ethers.utils.formatEther(allowance));
  
  // Check 3: Trading enabled?
  const tradingEnabled = await token.tradingEnabled();
  console.log("Trading enabled:", tradingEnabled);
  
  // Check 4: Try approval
  console.log("\nApproving router...");
  const approveTx = await token.approve(routerAddress, ethers.utils.parseEther("1000"));
  await approveTx.wait();
  console.log("Approval tx:", approveTx.hash);
  
  // Check 5: Verify new allowance
  const newAllowance = await token.allowance(yourAddress, routerAddress);
  console.log("New allowance:", ethers.utils.formatEther(newAllowance));
  
  // Check 6: Try a simple transfer first
  console.log("\nTesting direct transfer...");
  try {
    const transferTx = await token.transfer(routerAddress, ethers.utils.parseEther("1"));
    await transferTx.wait();
    console.log("✅ Direct transfer works!");
  } catch (e) {
    console.log("❌ Direct transfer failed:", e.message);
  }
  
  // Check 7: Pool reserves
  const poolAddress = "0x68cccb84eef9de6f97451caf3219762e907e0dc7";
  const pool = await ethers.getContractAt([
    "function getReserves() view returns (uint112,uint112,uint32)"
  ], poolAddress);
  const reserves = await pool.getReserves();
  console.log("\nPool reserves:");
  console.log("Reserve 0:", ethers.utils.formatEther(reserves[0]));
  console.log("Reserve 1:", ethers.utils.formatEther(reserves[1]));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });