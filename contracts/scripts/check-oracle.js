const hre = require("hardhat");

async function main() {
  const oracle = await hre.ethers.getContractAt(
    "SavingsPriceOracle",
    "0xBA6a77e90666Ae9fF4A88fE2DeC25662184AfAc0"
  );

  console.log("\n=== Oracle Debug ===\n");

  // EUR = 1 in Currency enum
  const priceEUR = await oracle.getOooweeePriceView(1);
  const ethPriceEUR = await oracle.getETHPrice(1);
  
  console.log("OOOWEEE price (raw):", priceEUR.toString());
  console.log("ETH price (raw):", ethPriceEUR.toString());
  
  // Assuming 8 decimals for fiat
  console.log("\n1 OOOWEEE = €", priceEUR.toString() / 1e8);
  console.log("1 ETH = €", ethPriceEUR.toString() / 1e8);
  
  // Test: What does 1800 tokens convert to?
  const tokens = hre.ethers.utils.parseEther("1800");
  const savings = await hre.ethers.getContractAt(
    "OOOWEEESavings", 
    "0xaABe5E9510157AFf6fb02Bd7D65ED4E093Cda863"
  );
  
  const fiatValue = await savings.getBalanceInFiatView(tokens, 1);
  console.log("\n1800 OOOWEEE = €", fiatValue.toString() / 100, "(in cents:", fiatValue.toString(), ")");
  
  // Check pool price
  const pool = await oracle.oooweeePool();
  console.log("\nPool address:", pool);
}

main().catch(console.error);