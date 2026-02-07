// OOOWEEE Protocol Monitor
// Checks stability + savings maturity and sends email alerts
// Run: node scripts/monitor.js
// Deploy: GitHub Actions cron, Railway, Render, or any Node.js host
//
// Environment variables:
//   SEPOLIA_RPC_URL     - Sepolia RPC endpoint
//   ALERT_EMAIL_TO      - Email to receive alerts
//   ALERT_EMAIL_FROM    - Gmail address to send from
//   ALERT_EMAIL_PASS    - Gmail app password (not your regular password)
//   ALERT_THRESHOLD     - Price deviation % to trigger alert (default: 8)
//   CHECK_INTERVAL_MS   - Check interval in ms (default: 300000 = 5 min)

require("dotenv").config();
const { ethers } = require("ethers");
const nodemailer = require("nodemailer");

// ==========================================
// Configuration
// ==========================================
const CONFIG = {
  rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  alertThreshold: parseInt(process.env.ALERT_THRESHOLD || "8"), // % above baseline
  checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || "300000"), // 5 minutes
  email: {
    to: process.env.ALERT_EMAIL_TO,
    from: process.env.ALERT_EMAIL_FROM,
    pass: process.env.ALERT_EMAIL_PASS,
  },
  // Cooldown: don't re-alert for same condition within this window
  alertCooldownMs: 30 * 60 * 1000, // 30 minutes
};

// ==========================================
// Contract addresses (Sepolia)
// ==========================================
const ADDRESSES = {
  OOOWEEEStability: "0x9767D758d0bC527bEA0F712b6691Bac384b8Fd8f",
  OOOWEEESavings: "0x0B09f4b01563198519b97da0d94f65f8231A0c6a",
  OOOWEEEValidatorFund: "0x5a584D73a1599A30173493088c50c7d6b50298eb",
  OOOWEEEToken: "0xcbA9cDe50239cB7D89fc7a14b320184a48212dB8",
};

// ==========================================
// ABIs (minimal)
// ==========================================
const STABILITY_ABI = [
  "function checkUpkeep(bytes) view returns (bool, bytes memory)",
  "function getEffectiveBaseline() view returns (uint256)",
  "function getCurrentPrice() view returns (uint256)",
  "function systemChecksEnabled() view returns (bool)",
  "function circuitBreakerTripped() view returns (bool)",
  "function interventionsToday() view returns (uint256)",
  "function tokensUsedToday() view returns (uint256)",
  "function totalInterventions() view returns (uint256)",
  "function getTokenBalance() view returns (uint256)",
];

const SAVINGS_ABI = [
  "function checkUpkeep(bytes) view returns (bool, bytes memory)",
  "function totalActiveBalance() view returns (uint256)",
  "function groupCount() view returns (uint256)",
];

const VF_ABI = [
  "function pendingRewards() view returns (uint256)",
];

const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

// ==========================================
// State tracking
// ==========================================
let lastAlerts = {
  stability: 0,
  savings: 0,
  circuitBreaker: 0,
  lowTokens: 0,
  pendingRewards: 0,
};
let checkCount = 0;
let alertCount = 0;

// ==========================================
// Email setup
// ==========================================
function createTransporter() {
  if (!CONFIG.email.from || !CONFIG.email.pass) {
    return null;
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: CONFIG.email.from,
      pass: CONFIG.email.pass,
    },
  });
}

async function sendAlert(subject, body) {
  const transporter = createTransporter();
  const timestamp = new Date().toISOString();
  const fullBody = `${body}\n\n---\nTimestamp: ${timestamp}\nCheck #${checkCount} | Alert #${++alertCount}`;

  console.log(`\n🚨 ALERT: ${subject}`);
  console.log(fullBody);

  if (!transporter) {
    console.log("⚠️  No email configured — alert logged to console only");
    return;
  }

  if (!CONFIG.email.to) {
    console.log("⚠️  No ALERT_EMAIL_TO set — alert logged to console only");
    return;
  }

  try {
    await transporter.sendMail({
      from: `"OOOWEEE Monitor" <${CONFIG.email.from}>`,
      to: CONFIG.email.to,
      subject: `[OOOWEEE] ${subject}`,
      text: fullBody,
    });
    console.log(`📧 Email sent to ${CONFIG.email.to}`);
  } catch (err) {
    console.error("❌ Email failed:", err.message);
  }
}

function canAlert(key) {
  const now = Date.now();
  if (now - lastAlerts[key] < CONFIG.alertCooldownMs) {
    return false;
  }
  lastAlerts[key] = now;
  return true;
}

// ==========================================
// Stability Monitor
// ==========================================
async function checkStability(stability) {
  const results = { alerts: [] };

  try {
    // Check if system is enabled
    const enabled = await stability.systemChecksEnabled();
    const cbTripped = await stability.circuitBreakerTripped();

    if (cbTripped && canAlert("circuitBreaker")) {
      results.alerts.push({
        subject: "🔴 Circuit Breaker TRIPPED",
        body: "The stability circuit breaker has been tripped.\nManual intervention required.\nCheck contract state and reset if appropriate.",
      });
    }

    if (!enabled) {
      results.status = "DISABLED";
      return results;
    }

    // Get prices
    const baseline = await stability.getEffectiveBaseline();
    const currentPrice = await stability.getCurrentPrice();

    if (baseline.eq(0)) {
      results.status = "NO_BASELINE";
      return results;
    }

    // Calculate deviation
    const deviationBps = currentPrice.sub(baseline).mul(10000).div(baseline);
    const deviationPct = deviationBps.toNumber() / 100;
    results.deviation = deviationPct;
    results.currentPrice = ethers.utils.formatUnits(currentPrice, 18);
    results.baseline = ethers.utils.formatUnits(baseline, 18);

    // Check if upkeep is needed (contract's own logic, threshold is 10%)
    const [upkeepNeeded] = await stability.checkUpkeep("0x");
    results.upkeepNeeded = upkeepNeeded;

    // Alert at our threshold (default 8%, before the 10% intervention threshold)
    if (deviationPct >= CONFIG.alertThreshold && canAlert("stability")) {
      const interventionsToday = await stability.interventionsToday();
      const tokensToday = await stability.tokensUsedToday();
      const tokenBalance = await stability.getTokenBalance();

      results.alerts.push({
        subject: `⚠️ Price ${deviationPct.toFixed(1)}% above baseline${upkeepNeeded ? " — INTERVENTION NEEDED" : ""}`,
        body: [
          `Current price:  ${results.currentPrice} ETH`,
          `Baseline:       ${results.baseline} ETH`,
          `Deviation:      ${deviationPct.toFixed(2)}%`,
          `Upkeep needed:  ${upkeepNeeded}`,
          ``,
          `Interventions today: ${interventionsToday.toString()}`,
          `Tokens used today:   ${ethers.utils.formatUnits(tokensToday, 18)}`,
          `Token balance:       ${ethers.utils.formatUnits(tokenBalance, 18)}`,
          ``,
          upkeepNeeded
            ? `ACTION: Run 'npx hardhat run scripts/run-stability.js --network sepolia'`
            : `Approaching threshold. Monitor closely.`,
        ].join("\n"),
      });
    }

    // Check low token balance (< 100k tokens)
    const tokenBalance = await stability.getTokenBalance();
    const lowThreshold = ethers.utils.parseUnits("100000", 18);
    if (tokenBalance.lt(lowThreshold) && canAlert("lowTokens")) {
      results.alerts.push({
        subject: "⚠️ Low Stability Token Balance",
        body: `Stability contract token balance is low: ${ethers.utils.formatUnits(tokenBalance, 18)} OOOWEEE\nRefill needed to continue interventions.`,
      });
    }

    results.status = "OK";
    return results;
  } catch (err) {
    results.status = "ERROR";
    results.error = err.message;
    return results;
  }
}

// ==========================================
// Savings Maturity Monitor
// ==========================================
async function checkSavings(savings) {
  const results = { alerts: [] };

  try {
    const [upkeepNeeded, performData] = await savings.checkUpkeep("0x");
    results.upkeepNeeded = upkeepNeeded;

    const totalActive = await savings.totalActiveBalance();
    results.totalActive = ethers.utils.formatUnits(totalActive, 18);

    let groupCount = "N/A";
    try {
      groupCount = (await savings.groupCount()).toString();
    } catch (e) {}
    results.groupCount = groupCount;

    if (upkeepNeeded && canAlert("savings")) {
      results.alerts.push({
        subject: "📦 Savings Accounts Ready for Auto-Unlock",
        body: [
          `One or more savings accounts have matured and can be processed.`,
          ``,
          `Total active balance: ${ethers.utils.formatUnits(totalActive, 18)} OOOWEEE`,
          `Group accounts: ${groupCount}`,
          ``,
          `Chainlink Automation should handle this automatically.`,
          `If not processed within 10 minutes, run manually:`,
          `npx hardhat run scripts/process-matured.js --network sepolia`,
        ].join("\n"),
      });
    }

    results.status = "OK";
    return results;
  } catch (err) {
    results.status = "ERROR";
    results.error = err.message;
    return results;
  }
}

// ==========================================
// Pending Rewards Check
// ==========================================
async function checkPendingRewards(validatorFund) {
  const results = { alerts: [] };

  try {
    const pending = await validatorFund.pendingRewards();
    results.pending = ethers.utils.formatEther(pending);

    // Alert if > 0.1 ETH pending (should be distributed)
    const threshold = ethers.utils.parseEther("0.1");
    if (pending.gt(threshold) && canAlert("pendingRewards")) {
      results.alerts.push({
        subject: "💰 Pending Validator Rewards Ready",
        body: [
          `ValidatorFund has ${ethers.utils.formatEther(pending)} ETH in pending rewards.`,
          ``,
          `Consider distributing to operations/validators/savers.`,
          `Run: npx hardhat run scripts/distribute-rewards.js --network sepolia`,
        ].join("\n"),
      });
    }

    results.status = "OK";
    return results;
  } catch (err) {
    results.status = "ERROR";
    results.error = err.message;
    return results;
  }
}

// ==========================================
// Main check loop
// ==========================================
async function runCheck() {
  checkCount++;
  const provider = new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);

  const stability = new ethers.Contract(ADDRESSES.OOOWEEEStability, STABILITY_ABI, provider);
  const savings = new ethers.Contract(ADDRESSES.OOOWEEESavings, SAVINGS_ABI, provider);
  const validatorFund = new ethers.Contract(ADDRESSES.OOOWEEEValidatorFund, VF_ABI, provider);

  const timestamp = new Date().toLocaleTimeString();

  // Run all checks in parallel
  const [stabResult, savResult, vfResult] = await Promise.all([
    checkStability(stability),
    checkSavings(savings),
    checkPendingRewards(validatorFund),
  ]);

  // Log summary
  const deviation = stabResult.deviation !== undefined ? `${stabResult.deviation.toFixed(2)}%` : stabResult.status;
  console.log(
    `[${timestamp}] #${checkCount} | ` +
    `Stability: ${deviation}${stabResult.upkeepNeeded ? " ⚠️" : ""} | ` +
    `Savings: ${savResult.upkeepNeeded ? "MATURED ⚠️" : "OK"} (${savResult.totalActive || "0"} active) | ` +
    `VF pending: ${vfResult.pending || "?"} ETH`
  );

  // Send any alerts
  const allAlerts = [
    ...stabResult.alerts,
    ...savResult.alerts,
    ...vfResult.alerts,
  ];

  for (const alert of allAlerts) {
    await sendAlert(alert.subject, alert.body);
  }

  return allAlerts.length;
}

// ==========================================
// Entry point
// ==========================================
async function main() {
  console.log("=== OOOWEEE Protocol Monitor ===\n");
  console.log(`Network:        Sepolia`);
  console.log(`Stability:      ${ADDRESSES.OOOWEEEStability}`);
  console.log(`Savings:        ${ADDRESSES.OOOWEEESavings}`);
  console.log(`ValidatorFund:  ${ADDRESSES.OOOWEEEValidatorFund}`);
  console.log(`Alert threshold: ${CONFIG.alertThreshold}% above baseline`);
  console.log(`Check interval:  ${CONFIG.checkIntervalMs / 1000}s`);
  console.log(`Email alerts:    ${CONFIG.email.to ? `→ ${CONFIG.email.to}` : "DISABLED (set ALERT_EMAIL_TO)"}`);
  console.log(`Alert cooldown:  ${CONFIG.alertCooldownMs / 60000} minutes`);
  console.log("");

  // Single run mode (for cron jobs / GitHub Actions)
  if (process.argv.includes("--once")) {
    console.log("Running single check...\n");
    try {
      const alertCount = await runCheck();
      process.exit(alertCount > 0 ? 1 : 0); // Exit 1 if alerts fired (useful for CI)
    } catch (err) {
      console.error("Check failed:", err.message);
      process.exit(2);
    }
  }

  // Continuous mode
  console.log("Starting continuous monitoring...\n");

  // Initial check
  try {
    await runCheck();
  } catch (err) {
    console.error("Initial check failed:", err.message);
  }

  // Schedule recurring checks
  setInterval(async () => {
    try {
      await runCheck();
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Check error:`, err.message);
    }
  }, CONFIG.checkIntervalMs);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
