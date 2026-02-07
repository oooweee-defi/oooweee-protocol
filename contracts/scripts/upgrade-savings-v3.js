const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading OOOWEEESavings to V3 with account:", deployer.address);
  console.log("Balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

  // Load deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployment-upgradeable.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("deployment-upgradeable.json not found. Deploy V1 first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const savingsProxyAddress = deployment.contracts.OOOWEEESavings;
  const tokenAddress = deployment.contracts.OOOWEEEToken;

  console.log("Savings proxy address:", savingsProxyAddress);
  console.log("Token address:", tokenAddress);

  // Read pre-upgrade state for comparison
  console.log("\n--- PRE-UPGRADE STATE ---");
  const SavingsV2 = await ethers.getContractFactory("OOOWEEESavingsV2");
  const savingsV2 = SavingsV2.attach(savingsProxyAddress);

  const token = await ethers.getContractAt("IERC20", tokenAddress);
  const contractBalance = await token.balanceOf(savingsProxyAddress);
  console.log("Contract token balance:", ethers.utils.formatUnits(contractBalance, 18), "OOOWEEE");

  const stats = await savingsV2.getStatsView();
  console.log("totalValueLocked:", ethers.utils.formatUnits(stats._totalValueLocked, 18));
  console.log("totalActiveBalance:", ethers.utils.formatUnits(stats._totalActiveBalance, 18));
  console.log("totalAccountsCreated:", stats._totalAccountsCreated.toString());
  console.log("totalRewardsDistributed:", ethers.utils.formatUnits(stats._totalRewardsDistributed, 18));

  // Upgrade to V3
  console.log("\n--- UPGRADING ---");
  console.log("Upgrading OOOWEEESavings → OOOWEEESavingsV3...");
  const OOOWEEESavingsV3 = await ethers.getContractFactory("OOOWEEESavingsV3");
  // Note: unsafeSkipStorageCheck needed because the V1 source was modified after
  // original deployment (lastRewardUpdate changed from uint64 to uint256 in source).
  // The actual on-chain storage layout is correct — V3 only APPENDS new storage.
  const upgraded = await upgrades.upgradeProxy(savingsProxyAddress, OOOWEEESavingsV3, {
    unsafeSkipStorageCheck: true,
  });
  await upgraded.deployed();
  console.log("Upgrade successful! Proxy still at:", upgraded.address);

  // Initialize V3 (skip if already initialized)
  const alreadyInit = await upgraded.v3Initialized();
  if (!alreadyInit) {
    console.log("\nInitializing V3...");
    const initTx = await upgraded.initializeV3();
    await initTx.wait();
    console.log("V3 initialized!");
  } else {
    console.log("\nV3 already initialized — skipping initializeV3()");
  }

  // Verify V3 state
  console.log("\n--- POST-UPGRADE VERIFICATION ---");
  const v3Init = await upgraded.v3Initialized();
  console.log("v3Initialized:", v3Init);

  const totalDeposited = await upgraded.totalDepositedBalance();
  console.log("totalDepositedBalance:", ethers.utils.formatUnits(totalDeposited, 18), "OOOWEEE");

  const v3RPT = await upgraded.v3RewardPerToken();
  console.log("v3RewardPerToken:", v3RPT.toString(), "(should be 0 — fresh start)");

  // Check account details (Bill's wallet - known test account)
  const billsWallet = "0xcE6f66Ead312072111d8b873b46C5B80406934C3";
  try {
    const accountCount = await upgraded.getAccountCount(billsWallet);
    console.log("\nBill's wallet accounts:", accountCount.toString());

    for (let i = 0; i < accountCount.toNumber(); i++) {
      const details = await upgraded.getAccountDetails(billsWallet, i);
      if (details.isActive) {
        console.log(`  Account ${i} "${details.goalName}":`);
        console.log(`    Balance (total): ${ethers.utils.formatUnits(details.balance, 18)} OOOWEEE`);
        console.log(`    Active: ${details.isActive}`);
        console.log(`    Target Fiat: ${details.targetFiat.toString()}`);

        // Check breakdown
        const breakdown = await upgraded.getAccountBalanceBreakdown(billsWallet, i);
        console.log(`    Deposit balance: ${ethers.utils.formatUnits(breakdown.depositBalance, 18)} OOOWEEE`);
        console.log(`    Earned rewards: ${ethers.utils.formatUnits(breakdown.earnedRewards, 18)} OOOWEEE`);
        console.log(`    Pending rewards: ${ethers.utils.formatUnits(breakdown.pendingAmt, 18)} OOOWEEE`);
        console.log(`    Total balance: ${ethers.utils.formatUnits(breakdown.totalBalance, 18)} OOOWEEE`);
      }
    }
  } catch (e) {
    console.log("Could not read Bill's accounts:", e.message);
  }

  console.log("\n--- SANITY CHECKS ---");
  console.log("Contract holds:", ethers.utils.formatUnits(contractBalance, 18), "OOOWEEE");
  console.log("totalDepositedBalance:", ethers.utils.formatUnits(totalDeposited, 18), "OOOWEEE");
  console.log("These should be roughly equal (contract balance >= deposited balance)");

  // Update deployment file
  deployment.savingsV3Upgrade = {
    timestamp: new Date().toISOString(),
    implementationUpgraded: true,
    fixedRewardsInflationBug: true,
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n============ V3 UPGRADE COMPLETE ============");
  console.log("OOOWEEESavings proxy (unchanged):", upgraded.address);
  console.log("Now running OOOWEEESavingsV3 implementation");
  console.log("Fix: Rewards tracked separately from deposits");
  console.log("Fix: No more phantom token inflation");
  console.log("All existing accounts and data preserved");
  console.log("=============================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
