// Execute stability intervention with proper gas limit
const { ethers } = require("hardhat");

const STABILITY = "0x9767D758d0bC527bEA0F712b6691Bac384b8Fd8f";
const VF = "0x5a584D73a1599A30173493088c50c7d6b50298eb";

const STABILITY_ABI = [
  "function checkUpkeep(bytes) view returns (bool, bytes memory)",
  "function performUpkeep(bytes) external",
  "function manualStabilityCheck() external payable",
  "function getEffectiveBaseline() view returns (uint256)",
  "function getCurrentPrice() view returns (uint256)",
  "function totalInterventions() view returns (uint256)",
  "function totalTokensUsed() view returns (uint256)",
  "function totalETHCaptured() view returns (uint256)",
  "function totalETHSentToValidators() view returns (uint256)",
  "function interventionsToday() view returns (uint256)",
  "function getTokenBalance() view returns (uint256)"
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
  const ops = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const stability = new ethers.Contract(STABILITY, STABILITY_ABI, provider);

  console.log("=== Running Stability Intervention ===\n");

  // Pre-state
  const baseline = await stability.getEffectiveBaseline();
  const price0 = await stability.getCurrentPrice();
  const vfBal0 = await provider.getBalance(VF);
  const tokenBal0 = await stability.getTokenBalance();

  console.log(`Effective baseline: ${ethers.utils.formatUnits(baseline, 18)} ETH`);
  console.log(`Current price:      ${ethers.utils.formatUnits(price0, 18)} ETH`);
  console.log(`VF ETH balance:     ${ethers.utils.formatEther(vfBal0)}`);
  console.log(`Stability tokens:   ${ethers.utils.formatUnits(tokenBal0, 18)}`);

  const [upkeepNeeded] = await stability.checkUpkeep("0x");
  console.log(`Upkeep needed:      ${upkeepNeeded}`);

  if (!upkeepNeeded) {
    console.log("No intervention needed. Exiting.");
    return;
  }

  // Run performUpkeep with enough gas
  console.log("\n--- Executing performUpkeep ---");
  const tx = await stability.connect(ops).performUpkeep("0x", { gasLimit: 800000 });
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);
  console.log("Status:", receipt.status === 1 ? "✅ SUCCESS" : "❌ FAILED");

  // Post-state
  const price1 = await stability.getCurrentPrice();
  const vfBal1 = await provider.getBalance(VF);
  const tokenBal1 = await stability.getTokenBalance();
  const totalIntv = await stability.totalInterventions();
  const totalSold = await stability.totalTokensUsed();
  const totalCaptured = await stability.totalETHCaptured();
  const totalSentVF = await stability.totalETHSentToValidators();

  console.log(`\n--- Post-Intervention ---`);
  console.log(`Price after:        ${ethers.utils.formatUnits(price1, 18)} ETH`);
  console.log(`Price change:       ${ethers.utils.formatUnits(price0, 18)} → ${ethers.utils.formatUnits(price1, 18)}`);
  console.log(`VF ETH balance:     ${ethers.utils.formatEther(vfBal1)} (gained ${ethers.utils.formatEther(vfBal1.sub(vfBal0))})`);
  console.log(`Stability tokens:   ${ethers.utils.formatUnits(tokenBal1, 18)} (sold ${ethers.utils.formatUnits(tokenBal0.sub(tokenBal1), 18)})`);
  console.log(`Total interventions: ${totalIntv.toString()}`);
  console.log(`Total tokens sold:   ${ethers.utils.formatUnits(totalSold, 18)}`);
  console.log(`Total ETH captured:  ${ethers.utils.formatEther(totalCaptured)}`);
  console.log(`Total ETH to VF:     ${ethers.utils.formatEther(totalSentVF)}`);

  // Check if another intervention is needed
  const [upkeepNeeded2] = await stability.checkUpkeep("0x");
  console.log(`\nAnother intervention needed: ${upkeepNeeded2}`);

  if (upkeepNeeded2) {
    console.log("Running second intervention...");
    const tx2 = await stability.connect(ops).performUpkeep("0x", { gasLimit: 800000 });
    console.log("Tx2:", tx2.hash);
    const receipt2 = await tx2.wait();
    console.log("Status:", receipt2.status === 1 ? "✅ SUCCESS" : "❌ FAILED");

    const price2 = await stability.getCurrentPrice();
    console.log(`Price after 2nd:    ${ethers.utils.formatUnits(price2, 18)} ETH`);
  }

  console.log("\n✅ Stability intervention complete!");
}

main().then(() => process.exit(0)).catch(e => { console.error("ERROR:", e.reason || e.message); process.exit(1); });
