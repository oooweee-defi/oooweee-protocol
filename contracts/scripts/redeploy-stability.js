const { ethers } = require("hardhat");

async function main() {
  const OLD_STABILITY = "0x6af645117Ea9E96fCBb910B8b2Bf31A622e3c7CD";
  const TOKEN = "0xE9E1AbFa961A3967FB4daF22875521a3c9249a44";
  const ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
  const VALIDATOR_FUND = "0xbBD33434C727953ce371c7B4Dc8073da05BE7F57";
  const LP = "0x0aBDAD2e438c539C2D443741D4861e7de0596002";
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1. Recover tokens from old stability using emergencyWithdraw
  console.log("\n1. Recovering tokens from old Stability...");
  const oldStability = await ethers.getContractAt("OOOWEEEStability", OLD_STABILITY);
  const tokenContract2 = await ethers.getContractAt("IERC20", TOKEN);
  const oldBalance = await tokenContract2.balanceOf(OLD_STABILITY);
  console.log("   Old stability balance:", ethers.utils.formatEther(oldBalance), "OOOWEEE");
  
  // Use emergencyWithdraw(token, amount)
  const recoverTx = await oldStability.emergencyWithdraw(TOKEN, oldBalance);
  await recoverTx.wait();
  console.log("   ✅ Tokens recovered to deployer");

  // 2. Deploy new Stability
  console.log("\n2. Deploying new OOOWEEEStability...");
  const Stability = await ethers.getContractFactory("OOOWEEEStability");
  const newStability = await Stability.deploy(TOKEN, ROUTER, VALIDATOR_FUND);
  await newStability.deployed();
  console.log("   ✅ New Stability:", newStability.address);

  // 3. Transfer tokens to new Stability
  console.log("\n3. Transferring tokens to new Stability...");
  const token = await ethers.getContractAt("IERC20", TOKEN);
  const balance = await token.balanceOf(deployer.address);
  console.log("   Deployer balance:", ethers.utils.formatEther(balance), "OOOWEEE");
  
  // Only transfer the stability reserve (should be ~89M)
  const transferTx = await token.transfer(newStability.address, balance);
  await transferTx.wait();
  console.log("   ✅ Tokens transferred to new stability");

  // 4. Update Token to point to new Stability (if needed)
  console.log("\n4. Updating Token → new Stability...");
  const tokenContract = await ethers.getContractAt("OOOWEEEToken", TOKEN);
  try {
    const updateTx = await tokenContract.updateStabilityMechanism(newStability.address);
    await updateTx.wait();
    console.log("   ✅ Token updated");
  } catch (e) {
    console.log("   ⚠️ Could not update token (may not have this function):", e.message);
  }

  // 5. Update ValidatorFund to point to new Stability
  console.log("\n5. Updating ValidatorFund → new Stability...");
  const validatorFund = await ethers.getContractAt("OOOWEEEValidatorFund", VALIDATOR_FUND);
  const vfTx = await validatorFund.setStabilityContract(newStability.address);
  await vfTx.wait();
  console.log("   ✅ ValidatorFund updated");

  // 6. Configure new Stability
  console.log("\n6. Configuring new Stability...");
  const lpTx = await newStability.setLiquidityPair(LP);
  await lpTx.wait();
  console.log("   ✅ LP set");
  
  const baselineTx = await newStability.updateBaselinePrice();
  await baselineTx.wait();
  console.log("   ✅ Baseline set");

  // 7. Set exemption for new stability on token
  console.log("\n7. Setting exemption...");
  try {
    const exemptTx = await tokenContract.setExemption(newStability.address, true);
    await exemptTx.wait();
    console.log("   ✅ Exemption set");
  } catch (e) {
    console.log("   ⚠️ Could not set exemption:", e.message);
  }

  // Verify
  console.log("\n" + "=".repeat(50));
  console.log("🚀 STABILITY REDEPLOYED!");
  console.log("=".repeat(50));
  console.log("New Stability:", newStability.address);
  console.log("\nUpdate abis.js:");
  console.log(`  OOOWEEEStability: "${newStability.address}"`);
  
  // Test the new functions
  console.log("\n📊 Testing new contract...");
  const info = await newStability.getStabilityInfo();
  console.log("   getStabilityInfo() works! Price:", info.currentPrice.toString());
  const status = await newStability.getCircuitBreakerStatus();
  console.log("   getCircuitBreakerStatus() works! Tripped:", status.tripped);
  const balance2 = await newStability.getTokenBalance();
  console.log("   getTokenBalance() works! Balance:", ethers.utils.formatEther(balance2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
