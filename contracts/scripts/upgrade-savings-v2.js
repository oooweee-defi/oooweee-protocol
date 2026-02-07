const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading OOOWEEESavings to V2 with account:", deployer.address);

  // Load deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployment-upgradeable.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("deployment-upgradeable.json not found. Deploy V1 first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const savingsProxyAddress = deployment.contracts.OOOWEEESavings;

  console.log("Savings proxy address:", savingsProxyAddress);

  // Upgrade to V2
  console.log("\nUpgrading OOOWEEESavings → OOOWEEESavingsV2...");
  const OOOWEEESavingsV2 = await ethers.getContractFactory("OOOWEEESavingsV2");
  const upgraded = await upgrades.upgradeProxy(savingsProxyAddress, OOOWEEESavingsV2);
  await upgraded.deployed();

  console.log("Upgrade successful! Proxy still at:", upgraded.address);

  // Initialize V2 features
  console.log("\nInitializing V2 features...");
  await (await upgraded.initializeV2(20)).wait();
  console.log("   V2 initialized with maxAutoProcessBatch = 20");

  // Verify existing data is preserved
  console.log("\nVerifying existing data...");
  const stats = await upgraded.getStatsView();
  console.log("   Total Value Locked:", ethers.utils.formatUnits(stats._totalValueLocked, 18), "OOOWEEE");
  console.log("   Total Accounts Created:", stats._totalAccountsCreated.toString());
  console.log("   Total Goals Completed:", stats._totalGoalsCompleted.toString());

  // Verify new functions exist
  console.log("\nVerifying V2 functions...");
  const groupCount = await upgraded.groupCount();
  console.log("   Group count:", groupCount.toString());
  const activeCount = await upgraded.getActiveAccountCount();
  console.log("   Active account refs:", activeCount.toString());
  const batch = await upgraded.maxAutoProcessBatch();
  console.log("   Max auto process batch:", batch.toString());

  // Update deployment file
  deployment.savingsV2Upgrade = {
    timestamp: new Date().toISOString(),
    implementationUpgraded: true,
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n============ UPGRADE COMPLETE ============");
  console.log("OOOWEEESavings proxy (unchanged):", upgraded.address);
  console.log("Now running OOOWEEESavingsV2 implementation");
  console.log("All existing accounts and data preserved");
  console.log("New features: Auto-unlock, Group Savings");
  console.log("==========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
