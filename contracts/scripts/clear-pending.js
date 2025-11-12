// scripts/clear-pending.js
async function main() {
  const [signer] = await ethers.getSigners();
  
  // Get current nonce (including pending)
  const pendingNonce = await signer.getTransactionCount("pending");
  const confirmedNonce = await signer.getTransactionCount("latest");
  
  console.log("Pending nonce:", pendingNonce);
  console.log("Confirmed nonce:", confirmedNonce);
  
  if (pendingNonce > confirmedNonce) {
    console.log(`You have ${pendingNonce - confirmedNonce} pending transactions`);
    console.log("Sending cancel transaction with higher gas...");
    
    // Send 0 ETH to yourself with higher gas to clear pending
    const tx = await signer.sendTransaction({
      to: signer.address,
      value: 0,
      nonce: confirmedNonce,
      gasPrice: ethers.utils.parseUnits("50", "gwei") // High gas to replace
    });
    
    await tx.wait();
    console.log("Cleared!");
  } else {
    console.log("No pending transactions");
  }
}

main().catch(console.error);