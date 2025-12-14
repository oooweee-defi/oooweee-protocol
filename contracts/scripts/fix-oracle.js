const hre = require("hardhat");

async function main() {
  const oracle = await hre.ethers.getContractAt(
    "SavingsPriceOracle",
    "0xBA6a77e90666Ae9fF4A88fE2DeC25662184AfAc0"
  );

  console.log("Fixing EUR price oracle...\n");

  // ETH price in EUR with 8 decimals
  // If ETH = ~$3500 and EUR/USD = ~1.05, then ETH ≈ €3333
  // 3333 * 10^8 = 333300000000
  const ethPriceEUR = "333300000000"; // €3333.00
  
  // Set default EUR price for ETH
  console.log("Setting default ETH price in EUR...");
  const tx1 = await oracle.setDefaultPrice(1, ethPriceEUR); // 1 = EUR
  await tx1.wait();
  console.log("✅ Default EUR price set to €3333.00 per ETH");

  // Verify
  const newEthPrice = await oracle.getETHPrice(1);
  console.log("\nVerification:");
  console.log("ETH price (EUR):", newEthPrice.toString());
  console.log("= €", newEthPrice.toString() / 1e8);

  // Check OOOWEEE price now
  const oooweeePrice = await oracle.getOooweeePriceView(1);
  console.log("\nOOOWEEE price (EUR raw):", oooweeePrice.toString());
  console.log("= €", oooweeePrice.toString() / 100, "cents");
}

main().catch(console.error);