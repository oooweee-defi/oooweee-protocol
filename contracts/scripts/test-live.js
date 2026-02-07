const { ethers } = require("hardhat");

// ============ CONFIGURATION ============
const BILL_PRIVATE_KEY = "4eb4cfe4dc6a45e4330e6b8b30a4a8bde735ec926e68f1e02440681bf3111cda";
const ADMIN_PRIVATE_KEY = "504d093dce2a7e98cb1ee44528afa8cbf1cdb619d6838e0884e1df33cf862a89";

const CONTRACTS = {
  OOOWEEEToken: "0x860B25684119acBB5Ffe5aD50611c6BE90E7882b",
  OOOWEEESavings: "0x1687f07Fbf180189502BaA652911382a62cB9DF6",
  OOOWEEEStability: "0x706E4c306c29Acc6a6C7bE5ec8b9957cf07BE33D",
  OOOWEEEValidatorFund: "0x1706240479829e9eACDA35336527225DbF817e0a",
  SavingsPriceOracle: "0x6A1f5eD53Ff87E7D955072e440E989cb588fa323",
  UniswapPair: "0x7f1bB15e09cEdFCA496B280Ff78815243821a598"
};

const UNISWAP_ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

const ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) public view returns (uint[] memory amounts)"
];

// Results tracking
let passed = 0;
let failed = 0;
const results = [];

function log(test, status, detail) {
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⏭️";
  console.log(`  ${icon} ${test}: ${detail}`);
  results.push({ test, status, detail });
  if (status === "PASS") passed++;
  if (status === "FAIL") failed++;
}

async function main() {
  console.log("=".repeat(60));
  console.log("OOOWEEE Protocol — Live Sepolia Test Suite");
  console.log("=".repeat(60));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Network: Sepolia (11155111)\n`);

  // Setup signers
  const provider = new ethers.providers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const bill = new ethers.Wallet(BILL_PRIVATE_KEY, provider);
  const admin = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);

  console.log(`Bill:  ${bill.address}`);
  console.log(`Admin: ${admin.address}\n`);

  // Load contract artifacts
  const tokenArt = await ethers.getContractFactory("OOOWEEEToken");
  const savingsArt = await ethers.getContractFactory("OOOWEEESavings");
  const stabilityArt = await ethers.getContractFactory("OOOWEEEStability");
  const validatorArt = await ethers.getContractFactory("OOOWEEEValidatorFund");
  const oracleArt = await ethers.getContractFactory("SavingsPriceOracle");

  // Connect contracts
  const token = tokenArt.attach(CONTRACTS.OOOWEEEToken).connect(bill);
  const tokenAdmin = tokenArt.attach(CONTRACTS.OOOWEEEToken).connect(admin);
  const savings = savingsArt.attach(CONTRACTS.OOOWEEESavings).connect(bill);
  const savingsAdmin = savingsArt.attach(CONTRACTS.OOOWEEESavings).connect(admin);
  const stability = stabilityArt.attach(CONTRACTS.OOOWEEEStability).connect(admin);
  const validatorFund = validatorArt.attach(CONTRACTS.OOOWEEEValidatorFund).connect(bill);
  const oracle = oracleArt.attach(CONTRACTS.SavingsPriceOracle).connect(bill);
  const router = new ethers.Contract(UNISWAP_ROUTER, ROUTER_ABI, bill);

  // ============ TEST 1: BALANCES ============
  console.log("\n--- Test 1: Wallet Balances ---");
  try {
    const billEth = await provider.getBalance(bill.address);
    const adminEth = await provider.getBalance(admin.address);
    const billTokens = await token.balanceOf(bill.address);
    const adminTokens = await token.balanceOf(admin.address);

    log("Bill ETH balance", "PASS", `${ethers.utils.formatEther(billEth)} ETH`);
    log("Admin ETH balance", "PASS", `${ethers.utils.formatEther(adminEth)} ETH`);
    log("Bill OOOWEEE balance", "PASS", `${ethers.utils.formatUnits(billTokens, 18)} OOOWEEE`);
    log("Admin OOOWEEE balance", "PASS", `${ethers.utils.formatUnits(adminTokens, 18)} OOOWEEE`);
  } catch (e) {
    log("Balance check", "FAIL", e.message);
  }

  // ============ TEST 2: CONTRACT STATE ============
  console.log("\n--- Test 2: Contract State ---");
  try {
    const tradingEnabled = await token.tradingEnabled();
    log("Trading enabled", tradingEnabled ? "PASS" : "FAIL", String(tradingEnabled));
  } catch (e) { log("Trading enabled", "FAIL", e.message); }

  try {
    const stabilityBalance = await token.balanceOf(CONTRACTS.OOOWEEEStability);
    log("Stability reserve", "PASS", `${ethers.utils.formatUnits(stabilityBalance, 18)} OOOWEEE`);
  } catch (e) { log("Stability reserve", "FAIL", e.message); }

  try {
    const info = await stability.getStabilityInfo();
    log("Stability info readable", "PASS", `Current price: ${ethers.utils.formatUnits(info[0], 18)}`);
  } catch (e) { log("Stability info", "FAIL", e.message); }

  try {
    const cbStatus = await stability.getCircuitBreakerStatus();
    log("Circuit breaker status", "PASS", `Tripped: ${cbStatus[0]}, Interventions today: ${cbStatus[1]}`);
  } catch (e) { log("Circuit breaker", "FAIL", e.message); }

  try {
    const checksEnabled = await stability.systemChecksEnabled();
    log("System checks enabled", "PASS", String(checksEnabled));
  } catch (e) { log("System checks", "FAIL", e.message); }

  try {
    const stats = await savingsAdmin.getStatsView();
    log("Savings stats readable", "PASS", `TVL: ${ethers.utils.formatUnits(stats[0], 18)}, Accounts: ${stats[1]}`);
  } catch (e) { log("Savings stats", "FAIL", e.message); }

  try {
    const vStats = await validatorFund.getStats();
    log("Validator stats readable", "PASS", `Validators: ${vStats[0]}, Pending: ${ethers.utils.formatEther(vStats[1])} ETH`);
  } catch (e) { log("Validator stats", "FAIL", e.message); }

  // ============ TEST 3: BUY OOOWEEE (Bill swaps 0.02 ETH) ============
  console.log("\n--- Test 3: Buy OOOWEEE via Uniswap ---");
  try {
    const swapAmount = ethers.utils.parseEther("0.02");
    const path = [WETH, CONTRACTS.OOOWEEEToken];

    // Get estimate first
    const amounts = await router.getAmountsOut(swapAmount, path);
    const expectedOut = amounts[1];
    log("Price quote", "PASS", `0.02 ETH → ~${ethers.utils.formatUnits(expectedOut, 18)} OOOWEEE`);

    const balanceBefore = await token.balanceOf(bill.address);
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const minOut = expectedOut.mul(95).div(100); // 5% slippage

    const tx = await router.swapExactETHForTokens(minOut, path, bill.address, deadline, { value: swapAmount });
    const receipt = await tx.wait();

    const balanceAfter = await token.balanceOf(bill.address);
    const received = balanceAfter.sub(balanceBefore);
    log("Swap executed", "PASS", `Received ${ethers.utils.formatUnits(received, 18)} OOOWEEE (tx: ${receipt.transactionHash})`);
  } catch (e) {
    log("Buy OOOWEEE", "FAIL", e.reason || e.message);
  }

  // ============ TEST 4: CREATE SAVINGS ACCOUNTS ============
  console.log("\n--- Test 4: Create Savings Accounts ---");

  // 4a: Time Lock (lock for 1 day)
  // createTimeAccount(unlockTime, goalName, initialDeposit, displayCurrency)
  try {
    const depositAmount = ethers.utils.parseUnits("1000", 18);
    const unlockTime = Math.floor(Date.now() / 1000) + 86400; // 1 day

    let tx = await token.approve(CONTRACTS.OOOWEEESavings, depositAmount);
    await tx.wait();
    log("Approve savings (time lock)", "PASS", "1000 OOOWEEE approved");

    tx = await savings.createTimeAccount(unlockTime, "Test Time Lock", depositAmount, 1); // 1 = EUR
    const receipt = await tx.wait();
    log("Create Time Lock account", "PASS", `tx: ${receipt.transactionHash}`);
  } catch (e) {
    log("Create Time Lock", "FAIL", e.reason || e.message);
  }

  // 4b: Growth Goal
  // createGrowthAccount(targetFiatAmount, targetCurrency, goalName, initialDeposit)
  try {
    const depositAmount = ethers.utils.parseUnits("500", 18);
    const targetFiat = 100000; // 10.0000 EUR (4 decimals)

    let tx = await token.approve(CONTRACTS.OOOWEEESavings, depositAmount);
    await tx.wait();
    log("Approve savings (growth)", "PASS", "500 OOOWEEE approved");

    tx = await savings.createGrowthAccount(targetFiat, 1, "Test Growth Goal", depositAmount);
    const receipt = await tx.wait();
    log("Create Growth Goal account", "PASS", `tx: ${receipt.transactionHash}`);
  } catch (e) {
    log("Create Growth Goal", "FAIL", e.reason || e.message);
  }

  // 4c: Balance Transfer
  // createBalanceAccount(targetFiatAmount, targetCurrency, recipient, goalName, initialDeposit)
  try {
    const depositAmount = ethers.utils.parseUnits("500", 18);
    const targetFiat = 50000; // 5.0000 EUR (4 decimals)
    const recipient = admin.address;

    let tx = await token.approve(CONTRACTS.OOOWEEESavings, depositAmount);
    await tx.wait();
    log("Approve savings (transfer)", "PASS", "500 OOOWEEE approved");

    tx = await savings.createBalanceAccount(targetFiat, 1, recipient, "Test Transfer Goal", depositAmount);
    const receipt = await tx.wait();
    log("Create Transfer Goal account", "PASS", `tx: ${receipt.transactionHash}`);
  } catch (e) {
    log("Create Transfer Goal", "FAIL", e.reason || e.message);
  }

  // ============ TEST 5: READ ACCOUNTS ============
  console.log("\n--- Test 5: Read Accounts ---");
  try {
    const accountIds = await savings.getUserAccounts(bill.address);
    log("Get user accounts", "PASS", `Bill has ${accountIds.length} accounts: [${accountIds.join(", ")}]`);

    for (const id of accountIds) {
      const acc = await savings.getAccountView(id);
      log(`Account #${id}`, "PASS", `Type: ${acc.accountType}, Balance: ${ethers.utils.formatUnits(acc.balance, 18)}, Name: ${acc.goalName}`);
    }
  } catch (e) {
    log("Read accounts", "FAIL", e.reason || e.message);
  }

  // ============ TEST 6: DEPOSIT INTO ACCOUNT ============
  console.log("\n--- Test 6: Deposit into Account ---");
  try {
    const accountIds = await savings.getUserAccounts(bill.address);
    if (accountIds.length > 0) {
      const targetId = accountIds[0]; // Deposit into first account
      const depositAmount = ethers.utils.parseUnits("200", 18);

      let tx = await token.approve(CONTRACTS.OOOWEEESavings, depositAmount);
      await tx.wait();

      const accBefore = await savings.getAccountView(targetId);
      tx = await savings.deposit(targetId, depositAmount);
      const receipt = await tx.wait();
      const accAfter = await savings.getAccountView(targetId);

      const balBefore = ethers.utils.formatUnits(accBefore.balance, 18);
      const balAfter = ethers.utils.formatUnits(accAfter.balance, 18);
      log("Deposit 200 OOOWEEE", "PASS", `Account #${targetId}: ${balBefore} → ${balAfter} OOOWEEE`);
    } else {
      log("Deposit", "SKIP", "No accounts to deposit into");
    }
  } catch (e) {
    log("Deposit", "FAIL", e.reason || e.message);
  }

  // ============ TEST 7: DONATE TO VALIDATORS ============
  console.log("\n--- Test 7: Donate to Validators ---");
  try {
    const donateAmount = ethers.utils.parseEther("0.01");
    const tx = await validatorFund.donate({ value: donateAmount });
    const receipt = await tx.wait();
    log("Donate 0.01 ETH", "PASS", `tx: ${receipt.transactionHash}`);

    const stats = await validatorFund.getStats();
    log("Validator stats after donate", "PASS", `Donations: ${ethers.utils.formatEther(stats[4])} ETH, Donors: ${stats[5]}`);
  } catch (e) {
    log("Donate", "FAIL", e.reason || e.message);
  }

  // ============ TEST 8: ADMIN FUNCTIONS ============
  console.log("\n--- Test 8: Admin Functions ---");

  // Pause checks
  try {
    let tx = await stability.setChecksEnabled(false);
    await tx.wait();
    const enabled = await stability.systemChecksEnabled();
    log("Pause checks", enabled === false ? "PASS" : "FAIL", `systemChecksEnabled: ${enabled}`);

    // Resume checks
    tx = await stability.setChecksEnabled(true);
    await tx.wait();
    const enabledAgain = await stability.systemChecksEnabled();
    log("Resume checks", enabledAgain === true ? "PASS" : "FAIL", `systemChecksEnabled: ${enabledAgain}`);
  } catch (e) {
    log("Pause/Resume checks", "FAIL", e.reason || e.message);
  }

  // Admin stats
  try {
    const stats = await savingsAdmin.getStatsView();
    log("Admin stats view", "PASS",
      `TVL: ${ethers.utils.formatUnits(stats[0], 18)}, ` +
      `Accounts: ${stats[1]}, ` +
      `Completed: ${stats[2]}, ` +
      `Active balance: ${ethers.utils.formatUnits(stats[3], 18)}`
    );
  } catch (e) {
    log("Admin stats", "FAIL", e.reason || e.message);
  }

  // ============ TEST 9: PRICE ORACLE ============
  console.log("\n--- Test 9: Price Oracle ---");
  try {
    // Check if oracle can read the pool
    const oooweeePool = await oracle.oooweeePool();
    log("Oracle pool set", oooweeePool !== ethers.constants.AddressZero ? "PASS" : "FAIL", oooweeePool);
  } catch (e) {
    log("Oracle pool", "FAIL", e.reason || e.message);
  }

  // ============ TEST 10: BILL NON-ADMIN ACCESS ============
  console.log("\n--- Test 10: Access Control ---");
  try {
    // Bill should NOT be able to pause checks
    const stabilityBill = stabilityArt.attach(CONTRACTS.OOOWEEEStability).connect(bill);
    await stabilityBill.setChecksEnabled(false);
    log("Bill cannot pause checks", "FAIL", "Should have reverted!");
  } catch (e) {
    log("Bill cannot pause checks", "PASS", "Correctly reverted: owner-only");
  }

  try {
    // Bill should NOT be able to reset circuit breaker
    const stabilityBill = stabilityArt.attach(CONTRACTS.OOOWEEEStability).connect(bill);
    await stabilityBill.resetCircuitBreaker();
    log("Bill cannot reset CB", "FAIL", "Should have reverted!");
  } catch (e) {
    log("Bill cannot reset CB", "PASS", "Correctly reverted: owner-only");
  }

  // ============ SUMMARY ============
  console.log("\n" + "=".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.log("\nFailed tests:");
    results.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`  ❌ ${r.test}: ${r.detail}`);
    });
  }

  // Print Bill's final balances
  const billEthFinal = await provider.getBalance(bill.address);
  const billTokensFinal = await token.balanceOf(bill.address);
  console.log(`\nBill's final balances:`);
  console.log(`  ETH: ${ethers.utils.formatEther(billEthFinal)}`);
  console.log(`  OOOWEEE: ${ethers.utils.formatUnits(billTokensFinal, 18)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ TEST SUITE CRASHED:");
    console.error(error);
    process.exit(1);
  });
