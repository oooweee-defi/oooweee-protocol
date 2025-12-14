const hre = require("hardhat");

async function main() {
  const savings = await hre.ethers.getContractAt(
    "OOOWEEESavings",
    "0xaABe5E9510157AFf6fb02Bd7D65ED4E093Cda863"
  );
  
  const oracle = await hre.ethers.getContractAt(
    "SavingsPriceOracle",
    "0xD0E81C3a5cb59f58133Ae2573F89ff7A08448d38"
  );

  console.log("=== Oracle Check ===");
  const price = await oracle.getOooweeePriceView(1); // EUR
  console.log("Oracle price (raw):", price.toString());
  console.log("Per token: €" + (price.toNumber() / 10000).toFixed(6));

  console.log("\n=== Savings Contract Check ===");
  const tokens = hre.ethers.utils.parseEther("15024");
  const fiatValue = await savings.getBalanceInFiatView(tokens, 1);
  console.log("15024 tokens fiat value (raw):", fiatValue.toString());
  console.log("Divided by 10000 (4 dec): €" + (fiatValue.toNumber() / 10000).toFixed(4));
  console.log("Divided by 100 (2 dec): €" + (fiatValue.toNumber() / 100).toFixed(2));

  console.log("\n=== Expected ===");
  const expected = 15024 * price.toNumber();
  console.log("Expected raw (tokens × price):", expected);
}

main().catch(console.error);