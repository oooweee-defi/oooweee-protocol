const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Testing V3 rewards with account:", deployer.address);

  const deploymentPath = path.join(__dirname, "..", "deployment-upgradeable.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const savingsAddr = deployment.contracts.OOOWEEESavings;
  const tokenAddr = deployment.contracts.OOOWEEEToken;

  const savings = await ethers.getContractAt("OOOWEEESavingsV3", savingsAddr);
  const token = await ethers.getContractAt("OOOWEEEToken", tokenAddr);

  console.log("\n=== V3 STATE ===");
  console.log("v3Initialized:", await savings.v3Initialized());
  console.log("totalDepositedBalance:", ethers.utils.formatUnits(await savings.totalDepositedBalance(), 18));
  console.log("v3RewardPerToken:", (await savings.v3RewardPerToken()).toString());
  console.log("Contract token balance:", ethers.utils.formatUnits(await token.balanceOf(savingsAddr), 18));

  // Check the "New Car" account (deployer, index 0)
  console.log("\n=== ACCOUNT CHECK ===");
  const details = await savings.getAccountDetails(deployer.address, 0);
  console.log(`"${details.goalName}" (Type ${details.accountType}):`);
  console.log("  Active:", details.isActive);
  console.log("  Balance:", ethers.utils.formatUnits(details.balance, 18), "OOOWEEE");
  console.log("  Target Fiat:", details.targetFiat.toString());

  const breakdown = await savings.getAccountBalanceBreakdown(deployer.address, 0);
  console.log("  Deposit:", ethers.utils.formatUnits(breakdown.depositBalance, 18));
  console.log("  Earned:", ethers.utils.formatUnits(breakdown.earnedRewards, 18));
  console.log("  Pending:", ethers.utils.formatUnits(breakdown.pendingAmt, 18));
  console.log("  Total:", ethers.utils.formatUnits(breakdown.totalBalance, 18));

  const progress = await savings.getAccountFiatProgressView(deployer.address, 0);
  console.log("  Current EUR:", (progress.currentValue / 100).toFixed(2));
  console.log("  Target EUR:", (progress.targetValue / 100).toFixed(2));
  console.log("  Percent:", progress.percentComplete.toString(), "%");

  // CRITICAL: Verify no phantom inflation
  const balNum = parseFloat(ethers.utils.formatUnits(details.balance, 18));
  const contractBal = parseFloat(ethers.utils.formatUnits(await token.balanceOf(savingsAddr), 18));
  console.log("\n=== CRITICAL VERIFICATION ===");
  console.log("Account balance:", balNum.toFixed(0), "OOOWEEE");
  console.log("Contract holds:", contractBal.toFixed(0), "OOOWEEE");
  if (balNum <= contractBal * 1.01) {
    console.log("PASS: Account balance <= contract balance (no phantom inflation)");
  } else {
    console.log("FAIL: Account balance exceeds contract balance!");
  }

  // Test deposit
  console.log("\n=== DEPOSIT TEST ===");
  const billPrivKey = "4eb4cfe4dc6a45e4330e6b8b30a4a8bde735ec926e68f1e02440681bf3111cda";
  const billWallet = new ethers.Wallet(billPrivKey, ethers.provider);
  const billBal = await token.balanceOf(billWallet.address);
  console.log("Bill's token balance:", ethers.utils.formatUnits(billBal, 18));

  if (billBal.gte(ethers.utils.parseUnits("1000", 18))) {
    const savingsAsBill = savings.connect(billWallet);
    const tokenAsBill = token.connect(billWallet);

    // Create a new test account under Bill's address
    console.log("Creating test account under Bill's wallet...");
    await (await tokenAsBill.approve(savingsAddr, ethers.utils.parseUnits("1000", 18))).wait();

    // Create a time-lock account with 500 OOOWEEE, 1 hour lock
    const unlockTime = Math.floor(Date.now() / 1000) + 3600;
    await (await savingsAsBill.createTimeAccount(
      unlockTime,
      "V3 Test Account",
      ethers.utils.parseUnits("500", 18),
      0 // USD currency
    )).wait();
    console.log("Created time-lock test account!");

    // Check the account
    const billDetails = await savings.getAccountDetails(billWallet.address, 0);
    console.log("  Name:", billDetails.goalName);
    console.log("  Balance:", ethers.utils.formatUnits(billDetails.balance, 18), "OOOWEEE");
    console.log("  Active:", billDetails.isActive);

    // Check breakdown
    const billBreakdown = await savings.getAccountBalanceBreakdown(billWallet.address, 0);
    console.log("  Deposit:", ethers.utils.formatUnits(billBreakdown.depositBalance, 18));
    console.log("  Earned:", ethers.utils.formatUnits(billBreakdown.earnedRewards, 18));
    console.log("  Total:", ethers.utils.formatUnits(billBreakdown.totalBalance, 18));

    // Deposit more
    console.log("\nDepositing 200 more OOOWEEE...");
    const preBal = await savings.getAccountDetails(billWallet.address, 0);
    await (await savingsAsBill.deposit(0, ethers.utils.parseUnits("200", 18))).wait();
    const postBal = await savings.getAccountDetails(billWallet.address, 0);

    console.log("  Pre-deposit:", ethers.utils.formatUnits(preBal.balance, 18));
    console.log("  Post-deposit:", ethers.utils.formatUnits(postBal.balance, 18));
    const increase = postBal.balance.sub(preBal.balance);
    console.log("  Increase:", ethers.utils.formatUnits(increase, 18), "(expected ~198 after 1% fee)");

    // Check totalDepositedBalance increased
    const newTotalDep = await savings.totalDepositedBalance();
    console.log("  New totalDepositedBalance:", ethers.utils.formatUnits(newTotalDep, 18));

    // Verify no inflation
    const newContractBal = await token.balanceOf(savingsAddr);
    const newTotalBal = parseFloat(ethers.utils.formatUnits(newTotalDep, 18));
    const newCBal = parseFloat(ethers.utils.formatUnits(newContractBal, 18));
    console.log("\n  Contract balance:", newCBal.toFixed(0));
    console.log("  Total deposited:", newTotalBal.toFixed(0));
    if (newTotalBal <= newCBal * 1.01) {
      console.log("  PASS: No inflation after deposit!");
    } else {
      console.log("  FAIL: Inflation detected!");
    }
  } else {
    console.log("Skipping deposit test - Bill needs >= 1000 OOOWEEE");
  }

  console.log("\n=== ALL TESTS COMPLETE ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
