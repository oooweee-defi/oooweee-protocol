// scripts/clear-and-add-liquidity.js
async function main() {
  const [signer] = await ethers.getSigners();
  
  // Check for pending transactions
  const pendingNonce = await signer.getTransactionCount("pending");
  const confirmedNonce = await signer.getTransactionCount("latest");
  
  console.log("Pending nonce:", pendingNonce);
  console.log("Confirmed nonce:", confirmedNonce);
  
  if (pendingNonce > confirmedNonce) {
    console.log(`Clearing ${pendingNonce - confirmedNonce} pending transactions...`);
    const tx = await signer.sendTransaction({
      to: signer.address,
      value: 0,
      nonce: confirmedNonce,
      gasPrice: ethers.utils.parseUnits("50", "gwei")
    });
    await tx.wait();
    console.log("✅ Cleared!\n");
  }
  
  // Now add liquidity with clean slate
  console.log("Adding liquidity...");
  const tokenAddress = "0xD4eEa41F12FBb3e2030B17FDeaaF8b38c471B32a";
  const routerAddress = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008";
  
  const token = await ethers.getContractAt("OOOWEEEToken", tokenAddress);
  const router = await ethers.getContractAt([
    "function addLiquidityETH(address,uint,uint,uint,address,uint) payable returns(uint,uint,uint)"
  ], routerAddress);
  
  // Max approval
  console.log("Setting max approval...");
  await (await token.approve(routerAddress, "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")).wait();
  
  // Add liquidity
  console.log("Adding 0.1 ETH + 100,000 OOOWEEE...");
  const tx = await router.addLiquidityETH(
    tokenAddress,
    ethers.utils.parseEther("100000"),
    0, 0,
    signer.address,
    Math.floor(Date.now()/1000) + 3600,
    { value: ethers.utils.parseEther("0.1") }
  );
  
  await tx.wait();
  console.log("✅ LIQUIDITY ADDED SUCCESSFULLY!");
}

main().catch(console.error);