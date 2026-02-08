/**
 * OOOWEEE Protocol — Mainnet Chainlink Automation Setup
 *
 * Registers Savings Auto-Unlock upkeep with Chainlink Automation.
 * Funds with 5 LINK.
 *
 * Reads contract addresses from deployment.json.
 *
 * Prerequisites:
 *   - 5+ LINK in deployer wallet
 *   - deployment.json exists (from deploy.js)
 *
 * TODO: Before running, verify the Registrar and Registry addresses are current.
 *       Check https://docs.chain.link/chainlink-automation/overview/supported-networks
 *       for the latest mainnet v2.1 addresses.
 *
 * Usage: npx hardhat run scripts/setup-chainlink.js --network mainnet
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============ MAINNET CHAINLINK ADDRESSES ============
const LINK_TOKEN = "0x514910771AF9Ca656af840dff83E8264EcF986CA";

// TODO: Verify these are the current Chainlink Automation v2.1 addresses at deploy time.
// Check: https://docs.chain.link/chainlink-automation/overview/supported-networks#ethereum-mainnet
const AUTOMATION_REGISTRAR = "0x6B0B234fB2f380309D47A7E9391E29E9a179395a"; // v2.1 registrar
const AUTOMATION_REGISTRY = "0x6593c7De001fC8542bB1703532EE1E5aA0D458fD";  // v2.1 registry

const LINK_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)"
];

const REGISTRAR_ABI = [
  "function registerUpkeep(tuple(string name, bytes encryptedEmail, address upkeepContract, uint32 gasLimit, address adminAddress, uint8 triggerType, bytes checkData, bytes triggerConfig, bytes offchainConfig, uint96 amount) params) external returns (uint256)"
];

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("OOOWEEE Protocol — Chainlink Automation Setup");
  console.log("=".repeat(60));
  console.log("Deployer:", deployer.address);

  // Load deployment
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ deployment.json not found. Run deploy.js first.");
    process.exit(1);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const SAVINGS = deployment.contracts.OOOWEEESavings;

  console.log("Savings:", SAVINGS);

  // Check LINK balance
  const link = new ethers.Contract(LINK_TOKEN, LINK_ABI, deployer);
  const linkBalance = await link.balanceOf(deployer.address);
  const FUNDING_AMOUNT = ethers.utils.parseUnits("5", 18); // 5 LINK

  console.log(`LINK balance: ${ethers.utils.formatUnits(linkBalance, 18)} LINK`);

  if (linkBalance.lt(FUNDING_AMOUNT)) {
    console.error(`\n❌ Need at least 5 LINK. Current: ${ethers.utils.formatUnits(linkBalance, 18)} LINK`);
    console.error("   Buy LINK on Uniswap or transfer to deployer wallet.");
    process.exit(1);
  }

  // Step 1: Approve LINK for registrar
  console.log("\n--- Step 1: Approve LINK ---");
  const approveTx = await link.approve(AUTOMATION_REGISTRAR, FUNDING_AMOUNT);
  await approveTx.wait();
  console.log(`  ✓ Approved ${ethers.utils.formatUnits(FUNDING_AMOUNT, 18)} LINK for registrar`);

  // Step 2: Register Savings upkeep
  console.log("\n--- Step 2: Register Savings Auto-Unlock ---");
  const registrar = new ethers.Contract(AUTOMATION_REGISTRAR, REGISTRAR_ABI, deployer);

  const savingsParams = {
    name: "OOOWEEE Savings Auto-Unlock",
    encryptedEmail: "0x",
    upkeepContract: SAVINGS,
    gasLimit: 800000,
    adminAddress: deployer.address,
    triggerType: 0,       // Conditional
    checkData: "0x",
    triggerConfig: "0x",
    offchainConfig: "0x",
    amount: FUNDING_AMOUNT,
  };

  console.log(`Registering "${savingsParams.name}"...`);
  const regTx = await registrar.registerUpkeep(savingsParams, { gasLimit: 1000000 });
  console.log("  Register tx:", regTx.hash);
  const receipt = await regTx.wait();

  // Extract upkeep ID from logs
  let upkeepId;
  for (const log of receipt.logs) {
    try {
      if (log.topics.length > 1) {
        upkeepId = ethers.BigNumber.from(log.topics[1]);
        break;
      }
    } catch (e) {}
  }
  console.log(`  ✓ Savings upkeep registered! ID: ${upkeepId?.toString() || 'check Chainlink UI'}`);

  // Step 3: Set automation registry on Savings
  console.log("\n--- Step 3: Set Automation Registry ---");
  try {
    const savings = await ethers.getContractAt("OOOWEEESavings", SAVINGS, deployer);
    const currentReg = await savings.automationRegistry();
    if (currentReg === ethers.constants.AddressZero) {
      console.log("Setting automation registry on Savings...");
      const setRegTx = await savings.setAutomationRegistry(AUTOMATION_REGISTRY, { gasLimit: 100000 });
      await setRegTx.wait();
      console.log("  ✓ Automation registry set");
    } else {
      console.log(`  Registry already set: ${currentReg}`);
    }
  } catch (e) {
    console.log("  ⚠️  setAutomationRegistry:", e.reason || e.message);
  }

  // Update deployment file
  deployment.chainlinkAutomation = {
    timestamp: new Date().toISOString(),
    savingsUpkeepId: upkeepId?.toString() || null,
    registry: AUTOMATION_REGISTRY,
    funding: "5 LINK",
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  // Summary
  const linkAfter = await link.balanceOf(deployer.address);
  console.log("\n" + "=".repeat(60));
  console.log("CHAINLINK AUTOMATION SETUP COMPLETE");
  console.log("=".repeat(60));
  console.log(`Savings Upkeep ID: ${upkeepId?.toString() || 'N/A'}`);
  console.log(`Funding: 5 LINK`);
  console.log(`Remaining LINK: ${ethers.utils.formatUnits(linkAfter, 18)}`);
  console.log(`\nView at: https://automation.chain.link/mainnet`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ CHAINLINK SETUP FAILED:");
    console.error(error.reason || error.message);
    if (error.data) console.error("Data:", error.data);
    process.exit(1);
  });
