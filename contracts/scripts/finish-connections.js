async function main() {
  console.log("\n🔧 Finishing Contract Connections...\n");

  const [signer] = await ethers.getSigners();
  
  // Clear any pending transactions first
  const pendingNonce = await signer.getTransactionCount("pending");
  const confirmedNonce = await signer.getTransactionCount("latest");
  
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

  // Your deployed addresses
  const TOKEN = "0xD4eEa41F12FBb3e2030B17FDeaaF8b38c471B32a";
  const SAVINGS = "0x08292751eDBedF6e4A09eD1d133FA6b28af49Fc8";
  const VALIDATORS = "0xC0E5434c7086b4A5cb1Ff86Ba9372a171CA178Ae";
  const STABILITY = "0xBf12716D81F55A9105Fef47816D67Fa84bCd6373";
  const REWARDS = "0x609413Ac27E1c55474d2D8A5721F887d4c8bEdED";

  // Connect everything
  const token = await ethers.getContractAt("OOOWEEEToken", TOKEN);
  const savings = await ethers.getContractAt("OOOWEEESavings", SAVINGS);
  const validators = await ethers.getContractAt("OOOWEEEValidators", VALIDATORS);

  console.log("Setting stability mechanism...");
  await (await token.setStabilityMechanism(STABILITY)).wait();
  
  console.log("Setting validator in savings...");
  await (await savings.setValidatorContract(VALIDATORS)).wait();
  
  console.log("Setting rewards receiver...");
  await (await validators.setRewardsReceiver(REWARDS)).wait();
  
  console.log("\n✅ ALL CONNECTED!\n");
  
  console.log("📋 Your Final Addresses:");
  console.log("Token:          ", TOKEN);
  console.log("Savings:        ", SAVINGS);
  console.log("Validators:     ", VALIDATORS);
  console.log("Stability:      ", STABILITY);
  console.log("RewardsReceiver:", REWARDS);
  
  console.log("\n🚀 Next: Create pool & enable trading!");
}

main().catch(console.error);