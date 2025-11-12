async function main() {
  console.log("\n🔍 Checking & Finishing Connections...\n");

  // Your deployed addresses
  const TOKEN = "0xD4eEa41F12FBb3e2030B17FDeaaF8b38c471B32a";
  const SAVINGS = "0x08292751eDBedF6e4A09eD1d133FA6b28af49Fc8";
  const VALIDATORS = "0xC0E5434c7086b4A5cb1Ff86Ba9372a171CA178Ae";
  const STABILITY = "0xBf12716D81F55A9105Fef47816D67Fa84bCd6373";
  const REWARDS = "0x609413Ac27E1c55474d2D8A5721F887d4c8bEdED";

  const token = await ethers.getContractAt("OOOWEEEToken", TOKEN);
  const savings = await ethers.getContractAt("OOOWEEESavings", SAVINGS);
  const validators = await ethers.getContractAt("OOOWEEEValidators", VALIDATORS);

  // Check what's already set
  const currentStability = await token.stabilityMechanism();
  const currentValidatorInSavings = await savings.validatorContract();
  const currentRewardsReceiver = await validators.rewardsReceiver();

  console.log("Current connections:");
  console.log("  Token->Stability:", currentStability);
  console.log("  Savings->Validator:", currentValidatorInSavings);
  console.log("  Validators->Rewards:", currentRewardsReceiver);
  console.log("");

  // Only set what's not set
  if (currentStability === "0x0000000000000000000000000000000000000000") {
    console.log("Setting stability mechanism...");
    await (await token.setStabilityMechanism(STABILITY)).wait();
  } else {
    console.log("✅ Stability already set");
  }

  if (currentValidatorInSavings === "0x0000000000000000000000000000000000000000") {
    console.log("Setting validator in savings...");
    await (await savings.setValidatorContract(VALIDATORS)).wait();
  } else {
    console.log("✅ Validator already set in savings");
  }

  if (currentRewardsReceiver === "0x0000000000000000000000000000000000000000") {
    console.log("Setting rewards receiver...");
    await (await validators.setRewardsReceiver(REWARDS)).wait();
  } else {
    console.log("✅ Rewards receiver already set");
  }

  console.log("\n🎉 DEPLOYMENT COMPLETE!\n");
  console.log("📋 Your Final Addresses:");
  console.log("Token:          ", TOKEN);
  console.log("Savings:        ", SAVINGS);
  console.log("Validators:     ", VALIDATORS);
  console.log("Stability:      ", STABILITY);
  console.log("RewardsReceiver:", REWARDS);
  
  console.log("\n🚀 Next Steps:");
  console.log("1. Create Uniswap pool");
  console.log("2. Set pool in Stability");
  console.log("3. Enable trading");
  console.log("4. Update frontend!");
}

main().catch(console.error);