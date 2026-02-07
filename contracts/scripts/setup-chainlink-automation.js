// Register OOOWEEE contracts with Chainlink Automation on Sepolia
// Registers: (1) OOOWEEEStability (2) OOOWEEESavingsV2

const { ethers } = require("hardhat");

// Chainlink Sepolia addresses
const LINK_TOKEN = "0x779877A7B0D9E8603169DdbD7836e478b4624789";
const AUTOMATION_REGISTRAR = "0xb0E49c5D0d05cbc241d68c05BC5BA1d1B7B72976";
const AUTOMATION_REGISTRY = "0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad";

// OOOWEEE contract addresses
const STABILITY = "0x9767D758d0bC527bEA0F712b6691Bac384b8Fd8f";
const SAVINGS = "0x0B09f4b01563198519b97da0d94f65f8231A0c6a";

const LINK_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "function transfer(address, uint256) returns (bool)"
];

const REGISTRAR_ABI = [
  "function registerUpkeep(tuple(string name, bytes encryptedEmail, address upkeepContract, uint32 gasLimit, address adminAddress, uint8 triggerType, bytes checkData, bytes triggerConfig, bytes offchainConfig, uint96 amount) params) external returns (uint256)"
];

const SAVINGS_V2_ABI = [
  "function initializeV2(uint256 _maxAutoProcessBatch) external",
  "function setAutomationRegistry(address _registry) external",
  "function maxAutoProcessBatch() view returns (uint256)",
  "function automationRegistry() view returns (address)",
  "function checkUpkeep(bytes) view returns (bool, bytes memory)"
];

const STABILITY_ABI = [
  "function setChainlinkRegistry(address _registry) external",
  "function chainlinkRegistry() view returns (address)",
  "function checkUpkeep(bytes) view returns (bool, bytes memory)"
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
  const ops = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const link = new ethers.Contract(LINK_TOKEN, LINK_ABI, provider);
  const registrar = new ethers.Contract(AUTOMATION_REGISTRAR, REGISTRAR_ABI, provider);
  const savings = new ethers.Contract(SAVINGS, SAVINGS_V2_ABI, provider);
  const stability = new ethers.Contract(STABILITY, STABILITY_ABI, provider);

  console.log("=== Chainlink Automation Setup ===\n");
  console.log("Ops wallet:", ops.address);

  // Check LINK balance
  const linkBalance = await link.balanceOf(ops.address);
  console.log(`LINK balance: ${ethers.utils.formatUnits(linkBalance, 18)} LINK`);

  const FUNDING_PER_UPKEEP = ethers.utils.parseUnits("2", 18); // 2 LINK each
  const TOTAL_LINK_NEEDED = FUNDING_PER_UPKEEP.mul(2); // 4 LINK total

  if (linkBalance.lt(TOTAL_LINK_NEEDED)) {
    console.log(`\n❌ Need at least ${ethers.utils.formatUnits(TOTAL_LINK_NEEDED, 18)} LINK.`);
    console.log(`   Current: ${ethers.utils.formatUnits(linkBalance, 18)} LINK`);
    console.log(`   Get LINK from: https://faucets.chain.link/sepolia`);
    return;
  }

  // ==========================================
  // STEP 1: Initialize SavingsV2 if needed
  // ==========================================
  console.log("\n--- STEP 1: Initialize SavingsV2 ---");
  const currentBatch = await savings.maxAutoProcessBatch();
  if (currentBatch.eq(0)) {
    console.log("Initializing V2 with batch size 20...");
    const initTx = await savings.connect(ops).initializeV2(20, { gasLimit: 200000 });
    await initTx.wait();
    console.log("V2 initialized ✅");
  } else {
    console.log(`V2 already initialized (batch: ${currentBatch.toString()})`);
  }

  // ==========================================
  // STEP 2: Approve LINK for registrar
  // ==========================================
  console.log("\n--- STEP 2: Approve LINK ---");
  const approveTx = await link.connect(ops).approve(AUTOMATION_REGISTRAR, TOTAL_LINK_NEEDED);
  await approveTx.wait();
  console.log(`Approved ${ethers.utils.formatUnits(TOTAL_LINK_NEEDED, 18)} LINK for registrar ✅`);

  // ==========================================
  // STEP 3: Register Stability upkeep
  // ==========================================
  console.log("\n--- STEP 3: Register Stability Upkeep ---");
  const stabilityParams = {
    name: "OOOWEEE Stability Monitor",
    encryptedEmail: "0x",
    upkeepContract: STABILITY,
    gasLimit: 800000,
    adminAddress: ops.address,
    triggerType: 0,       // Conditional (custom logic)
    checkData: "0x",
    triggerConfig: "0x",
    offchainConfig: "0x",
    amount: FUNDING_PER_UPKEEP
  };

  console.log(`Registering ${stabilityParams.name}...`);
  const stabRegTx = await registrar.connect(ops).registerUpkeep(stabilityParams, { gasLimit: 1000000 });
  console.log("Register tx:", stabRegTx.hash);
  const stabReceipt = await stabRegTx.wait();

  // Extract upkeep ID from logs
  let stabilityUpkeepId;
  for (const log of stabReceipt.logs) {
    try {
      if (log.topics.length > 1) {
        // RegistrationRequested or UpkeepRegistered event
        stabilityUpkeepId = ethers.BigNumber.from(log.topics[1]);
        break;
      }
    } catch (e) {}
  }
  console.log(`Stability upkeep registered ✅ ID: ${stabilityUpkeepId?.toString() || 'check Chainlink UI'}`);

  // ==========================================
  // STEP 4: Register Savings upkeep
  // ==========================================
  console.log("\n--- STEP 4: Register Savings Upkeep ---");
  const savingsParams = {
    name: "OOOWEEE Savings Auto-Unlock",
    encryptedEmail: "0x",
    upkeepContract: SAVINGS,
    gasLimit: 800000,
    adminAddress: ops.address,
    triggerType: 0,
    checkData: "0x",
    triggerConfig: "0x",
    offchainConfig: "0x",
    amount: FUNDING_PER_UPKEEP
  };

  console.log(`Registering ${savingsParams.name}...`);
  const savRegTx = await registrar.connect(ops).registerUpkeep(savingsParams, { gasLimit: 1000000 });
  console.log("Register tx:", savRegTx.hash);
  const savReceipt = await savRegTx.wait();

  let savingsUpkeepId;
  for (const log of savReceipt.logs) {
    try {
      if (log.topics.length > 1) {
        savingsUpkeepId = ethers.BigNumber.from(log.topics[1]);
        break;
      }
    } catch (e) {}
  }
  console.log(`Savings upkeep registered ✅ ID: ${savingsUpkeepId?.toString() || 'check Chainlink UI'}`);

  // ==========================================
  // STEP 5: Set automation registry on contracts (optional - for access control)
  // ==========================================
  console.log("\n--- STEP 5: Set Automation Registry ---");

  // Set on Stability contract
  try {
    const currentStabReg = await stability.chainlinkRegistry();
    if (currentStabReg === ethers.constants.AddressZero) {
      console.log("Setting Chainlink registry on Stability...");
      const setRegTx = await stability.connect(ops).setChainlinkRegistry(AUTOMATION_REGISTRY, { gasLimit: 100000 });
      await setRegTx.wait();
      console.log("Stability registry set ✅");
    } else {
      console.log(`Stability registry already set: ${currentStabReg}`);
    }
  } catch (e) {
    console.log("Stability setChainlinkRegistry:", e.reason || e.message);
  }

  // Set on Savings V2 contract
  try {
    const currentSavReg = await savings.automationRegistry();
    if (currentSavReg === ethers.constants.AddressZero) {
      console.log("Setting automation registry on Savings...");
      const setRegTx = await savings.connect(ops).setAutomationRegistry(AUTOMATION_REGISTRY, { gasLimit: 100000 });
      await setRegTx.wait();
      console.log("Savings registry set ✅");
    } else {
      console.log(`Savings registry already set: ${currentSavReg}`);
    }
  } catch (e) {
    console.log("Savings setAutomationRegistry:", e.reason || e.message);
  }

  // ==========================================
  // STEP 6: Verify
  // ==========================================
  console.log("\n--- STEP 6: Verification ---");

  // Check Stability upkeep
  const [stabUpkeep] = await stability.checkUpkeep("0x");
  console.log(`Stability checkUpkeep: ${stabUpkeep}`);

  // Check Savings upkeep
  const [savUpkeep] = await savings.checkUpkeep("0x");
  console.log(`Savings checkUpkeep: ${savUpkeep}`);

  const linkAfter = await link.balanceOf(ops.address);
  console.log(`\nRemaining LINK: ${ethers.utils.formatUnits(linkAfter, 18)}`);

  console.log("\n=== Summary ===");
  console.log(`Stability Upkeep ID: ${stabilityUpkeepId?.toString() || 'N/A'}`);
  console.log(`Savings Upkeep ID:   ${savingsUpkeepId?.toString() || 'N/A'}`);
  console.log(`Funding: ${ethers.utils.formatUnits(FUNDING_PER_UPKEEP, 18)} LINK each`);
  console.log(`View at: https://automation.chain.link/sepolia`);
  console.log("\n✅ Chainlink Automation setup complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.reason || error.message);
    if (error.data) console.error("Data:", error.data);
    process.exit(1);
  });
