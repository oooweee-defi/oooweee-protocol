const { ethers } = require("hardhat");

// ============ CONFIGURATION ============
const BILL_PRIVATE_KEY = "4eb4cfe4dc6a45e4330e6b8b30a4a8bde735ec926e68f1e02440681bf3111cda";

const CONTRACTS = {
  OOOWEEEToken: "0x860B25684119acBB5Ffe5aD50611c6BE90E7882b",
  OOOWEEESavings: "0x1687f07Fbf180189502BaA652911382a62cB9DF6",
  SavingsPriceOracle: "0x6A1f5eD53Ff87E7D955072e440E989cb588fa323"
};

let passed = 0;
let failed = 0;
const results = [];

function log(test, status, detail) {
  const icon = status === "PASS" ? "+" : status === "FAIL" ? "x" : "-";
  console.log(`  [${icon}] ${test}: ${detail}`);
  results.push({ test, status, detail });
  if (status === "PASS") passed++;
  if (status === "FAIL") failed++;
}

async function main() {
  console.log("=".repeat(60));
  console.log("OOOWEEE Protocol — Account Unlock/Withdraw Tests");
  console.log("=".repeat(60));
  console.log(`Time: ${new Date().toISOString()}\n`);

  const provider = new ethers.providers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const bill = new ethers.Wallet(BILL_PRIVATE_KEY, provider);
  console.log(`Bill: ${bill.address}\n`);

  const tokenArt = await ethers.getContractFactory("OOOWEEEToken");
  const savingsArt = await ethers.getContractFactory("OOOWEEESavings");

  const token = tokenArt.attach(CONTRACTS.OOOWEEEToken).connect(bill);
  const savings = savingsArt.attach(CONTRACTS.OOOWEEESavings).connect(bill);

  // ============ TEST 1: READ EXISTING ACCOUNTS ============
  console.log("--- Test 1: Read existing accounts ---\n");

  const accountCount = await savings.getUserAccountCount(bill.address);
  console.log(`  Bill has ${accountCount.total} accounts (${accountCount.active} active)\n`);

  const accountIds = await savings.getUserAccounts(bill.address);
  for (let i = 0; i < accountCount.total.toNumber(); i++) {
    try {
      const details = await savings.getAccountDetails(bill.address, i);
      const typeNames = ["Time", "Growth", "Balance"];
      const canW = await savings.canWithdraw(bill.address, i);
      console.log(`  Account #${i}: ${typeNames[details.accountType]} | active=${details.isActive} | balance=${ethers.utils.formatUnits(details.balance, 18)} | goal="${details.goalName}" | canWithdraw=${canW}`);
      if (details.accountType === 0) { // Time
        const unlockDate = new Date(details.unlockTime.toNumber() * 1000);
        console.log(`    Unlock time: ${unlockDate.toISOString()} (${details.unlockTime.toNumber() > Math.floor(Date.now()/1000) ? "LOCKED" : "UNLOCKED"})`);
      }
      if (details.targetFiat.gt(0)) {
        const progress = await savings.getAccountFiatProgressView(bill.address, i);
        console.log(`    Fiat progress: ${progress.currentValue}/${progress.targetValue} (${progress.percentComplete}%) withdrawable=${progress.withdrawable}`);
      }
    } catch (e) {
      console.log(`  Account #${i}: Error reading — ${e.reason || e.message}`);
    }
  }

  // ============ TEST 2: EARLY WITHDRAWAL SHOULD FAIL ============
  console.log("\n--- Test 2: Early withdrawal on Time Lock (should fail) ---\n");

  try {
    await savings.callStatic.manualWithdraw(0); // Account 0 = Time Lock (1 day)
    log("Early withdraw rejected", "FAIL", "Should have reverted but didn't");
  } catch (e) {
    if (e.reason && e.reason.includes("Still locked")) {
      log("Early withdraw rejected", "PASS", `Correctly reverted: "${e.reason}"`);
    } else if (e.message && e.message.includes("Still locked")) {
      log("Early withdraw rejected", "PASS", `Correctly reverted: "Still locked"`);
    } else {
      log("Early withdraw rejected", "FAIL", `Wrong revert reason: ${e.reason || e.message}`);
    }
  }

  // ============ TEST 3: CREATE SHORT TIME LOCK (60s) ============
  console.log("\n--- Test 3: Create short Time Lock (60s) for unlock test ---\n");

  let shortLockAccountId;
  try {
    const depositAmount = ethers.utils.parseUnits("500", 18);
    const unlockTime = Math.floor(Date.now() / 1000) + 65; // 65 seconds from now

    let tx = await token.approve(CONTRACTS.OOOWEEESavings, depositAmount);
    await tx.wait();
    log("Approve 500 OOOWEEE", "PASS", "Approved");

    tx = await savings.createTimeAccount(unlockTime, "Quick Unlock Test", depositAmount, 0); // 0 = USD
    const receipt = await tx.wait();

    // Get account ID from event
    const event = receipt.events.find(e => e.event === "AccountCreated");
    shortLockAccountId = event ? event.args.accountId.toNumber() : accountCount.total.toNumber();
    log("Create 60s Time Lock", "PASS", `Account #${shortLockAccountId}, unlocks at ${new Date(unlockTime * 1000).toISOString()}`);
  } catch (e) {
    log("Create 60s Time Lock", "FAIL", e.reason || e.message);
  }

  // ============ TEST 4: WAIT AND WITHDRAW TIME LOCK ============
  if (shortLockAccountId !== undefined) {
    console.log("\n--- Test 4: Wait for unlock then withdraw ---\n");

    // Check canWithdraw before
    const canBefore = await savings.canWithdraw(bill.address, shortLockAccountId);
    log("canWithdraw before unlock", "PASS", `${canBefore} (expected: false)`);
    if (canBefore) {
      log("canWithdraw timing", "FAIL", "Should be false before unlock time");
    }

    // Wait for unlock
    console.log("  Waiting 70 seconds for unlock...");
    const startTime = Date.now();
    while (Date.now() - startTime < 70000) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      process.stdout.write(`\r  Waiting... ${elapsed}s / 70s`);
      await new Promise(r => setTimeout(r, 5000));
    }
    console.log("");

    // Check canWithdraw after
    const canAfter = await savings.canWithdraw(bill.address, shortLockAccountId);
    log("canWithdraw after unlock", canAfter ? "PASS" : "FAIL", `${canAfter} (expected: true)`);

    // Get balance before withdrawal
    const balanceBefore = await token.balanceOf(bill.address);

    // Withdraw
    try {
      const tx = await savings.manualWithdraw(shortLockAccountId, { gasLimit: 300000 });
      const receipt = await tx.wait();

      const balanceAfter = await token.balanceOf(bill.address);
      const received = balanceAfter.sub(balanceBefore);
      log("Withdraw Time Lock", "PASS", `Received ${ethers.utils.formatUnits(received, 18)} OOOWEEE (tx: ${receipt.transactionHash})`);

      // Check account is now inactive
      const details = await savings.getAccountDetails(bill.address, shortLockAccountId);
      log("Account closed", details.isActive ? "FAIL" : "PASS", `isActive=${details.isActive}, balance=${ethers.utils.formatUnits(details.balance, 18)}`);
    } catch (e) {
      log("Withdraw Time Lock", "FAIL", e.reason || e.message);
    }
  }

  // ============ TEST 5: GROWTH ACCOUNT — DEPOSIT TO REACH TARGET ============
  console.log("\n--- Test 5: Growth account — check fiat target progress ---\n");

  // Account 1 is Growth with target 10 EUR, started with 500 OOOWEEE
  try {
    const progress = await savings.getAccountFiatProgressView(bill.address, 1);
    console.log(`  Growth account progress: ${progress.currentValue}/${progress.targetValue} (${progress.percentComplete}%)`);

    if (progress.withdrawable) {
      log("Growth target reached", "PASS", "Target already met — withdrawing");
      const balanceBefore = await token.balanceOf(bill.address);
      const tx = await savings.manualWithdraw(1, { gasLimit: 300000 });
      const receipt = await tx.wait();
      const balanceAfter = await token.balanceOf(bill.address);
      const received = balanceAfter.sub(balanceBefore);
      log("Withdraw Growth", "PASS", `Received ${ethers.utils.formatUnits(received, 18)} OOOWEEE`);
    } else {
      log("Growth target not yet reached", "PASS", `${progress.percentComplete}% — need more deposits or price increase`);

      // Try early withdraw — should fail
      try {
        await savings.callStatic.manualWithdraw(1);
        log("Growth early withdraw rejected", "FAIL", "Should have reverted");
      } catch (e) {
        log("Growth early withdraw rejected", "PASS", `Correctly reverted: "${e.reason || e.message}"`);
      }
    }
  } catch (e) {
    log("Growth account check", "FAIL", e.reason || e.message);
  }

  // ============ TEST 6: BALANCE TRANSFER — CHECK PROGRESS ============
  console.log("\n--- Test 6: Balance Transfer account — check progress ---\n");

  // Account 2 is Balance Transfer with target 5 EUR to admin
  try {
    const progress = await savings.getAccountFiatProgressView(bill.address, 2);
    console.log(`  Balance Transfer progress: ${progress.currentValue}/${progress.targetValue} (${progress.percentComplete}%)`);

    if (progress.withdrawable) {
      log("Balance target reached", "PASS", "Target met — executing transfer");
      const balanceBefore = await token.balanceOf(bill.address);
      const tx = await savings.manualWithdraw(2, { gasLimit: 300000 });
      const receipt = await tx.wait();
      const balanceAfter = await token.balanceOf(bill.address);
      const received = balanceAfter.sub(balanceBefore);
      log("Execute Balance Transfer", "PASS", `Bill received remainder: ${ethers.utils.formatUnits(received, 18)} OOOWEEE`);
    } else {
      log("Balance target not yet reached", "PASS", `${progress.percentComplete}% — need more deposits or price increase`);

      // Try early withdraw — should fail
      try {
        await savings.callStatic.manualWithdraw(2);
        log("Balance early withdraw rejected", "FAIL", "Should have reverted");
      } catch (e) {
        log("Balance early withdraw rejected", "PASS", `Correctly reverted: "${e.reason || e.message}"`);
      }
    }
  } catch (e) {
    log("Balance Transfer check", "FAIL", e.reason || e.message);
  }

  // ============ TEST 7: CLAIM REWARDS ============
  console.log("\n--- Test 7: Claim rewards ---\n");

  try {
    const balanceBefore = await token.balanceOf(bill.address);
    const tx = await savings["claimAllRewards()"]({ gasLimit: 300000 });
    const receipt = await tx.wait();
    const balanceAfter = await token.balanceOf(bill.address);
    const rewardsClaimed = balanceAfter.sub(balanceBefore);
    log("Claim all rewards", "PASS", `Rewards: ${ethers.utils.formatUnits(rewardsClaimed, 18)} OOOWEEE (tx: ${receipt.transactionHash})`);
  } catch (e) {
    log("Claim all rewards", "FAIL", e.reason || e.message);
  }

  // ============ SUMMARY ============
  console.log("\n" + "=".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  const billFinalTokens = await token.balanceOf(bill.address);
  const billFinalETH = await provider.getBalance(bill.address);
  console.log(`\nBill final: ${ethers.utils.formatUnits(billFinalTokens, 18)} OOOWEEE / ${ethers.utils.formatEther(billFinalETH)} ETH`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nTEST FAILED:");
    console.error(error);
    process.exit(1);
  });
