const hre = require("hardhat");

async function main() {
  console.log("=== Deploying Updated Savings Contract ===\n");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  // Existing contract addresses
  const TOKEN_ADDRESS = "0x42fc7b7175b5B9116c38bbBd5b88C1c968Dd7b77";
  const UNISWAP_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"; // Sepolia V2 Router
  const VALIDATORS_ADDRESS = "0x4106F3f19f288C4455e7998C661Ec558dB4D0cc3";
  
  // Deploy new Savings contract
  console.log("Deploying OOOWEEESavings...");
  const Savings = await ethers.getContractFactory("OOOWEEESavings");
  const savings = await Savings.deploy(TOKEN_ADDRESS, UNISWAP_ROUTER);
  await savings.deployed();
  
  console.log("✅ Savings deployed to:", savings.address);
  
  // Set validator contract in Savings
  console.log("\nSetting validator contract...");
  await savings.setValidatorContract(VALIDATORS_ADDRESS);
  console.log("✅ Validator contract set");
  
  // WARNING: We need to update connections!
  console.log("\n⚠️  IMPORTANT MANUAL STEPS REQUIRED:");
  console.log("════════════════════════════════════");
  console.log("1. The RewardsReceiver (0xdF12e7A67Cee3E25b03E67e0a0157c52CB4486FF)");
  console.log("   needs to be updated to send rewards to:", savings.address);
  console.log("");
  console.log("2. If RewardsReceiver is not upgradeable, you may need to:");
  console.log("   - Deploy a new RewardsReceiver with the new Savings address");
  console.log("   - OR manually forward rewards from old to new Savings");
  console.log("");
  console.log("3. Update your frontend abis.js with:");
  console.log(`   savings: "${savings.address}"`);
  console.log("");
  console.log("4. Consider if you want to migrate existing accounts from old Savings");
  console.log("════════════════════════════════════");
  
  // Save addresses to file
  const fs = require('fs');
  const addresses = {
    token: TOKEN_ADDRESS,
    savings: savings.address,
    oldSavings: "0xBFB865389A907d35B540080d299ad70697dBdFF5",
    stability: "0xa4001E0E85502F0a3D7e6AE03e639B4d625a9C9c",
    validators: VALIDATORS_ADDRESS,
    rewardsReceiver: "0xdF12e7A67Cee3E25b03E67e0a0157c52CB4486FF",
    note: "RewardsReceiver needs updating to point to new Savings!"
  };
  
  fs.writeFileSync(
    'deployed-addresses-updated.json',
    JSON.stringify(addresses, null, 2)
  );
  
  console.log("\nAddresses saved to deployed-addresses-updated.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });