const hre = require("hardhat");

async function main() {
  const ORACLE_ADDRESS = "0x36D185F2B7815A82f8794E38DAe6cE772869CFD7";
  
  console.log("Fixing Oracle Decimals at:", ORACLE_ADDRESS);
  
  const oracle = await hre.ethers.getContractAt("SavingsPriceOracle", ORACLE_ADDRESS);
  
  // Currency Enum:
  // USD=0, EUR=1, GBP=2, JPY=3, CNY=4, CAD=5, AUD=6, CHF=7, INR=8, KRW=9
  
  // We need to set decimals such that:
  // 1. _isPriceReasonable doesn't crash (decimals >= 4)
  // 2. _getEmergencyPrice returns a reasonable fallback (10 ** (decimals - 2))
  
  // For 2-decimal currencies (USD, EUR, etc):
  // Set to 4.
  // Emergency Price = 10^(4-2) = 100 (1.00 unit)
  // Min Price check = 10^(4-4) = 1
  
  // For 0-decimal currencies (JPY, KRW):
  // Set to 4.
  // Emergency Price = 10^(4-2) = 100 (100 units)
  // Min Price check = 10^(4-4) = 1
  
  const currencies = [
    { id: 0, name: "USD", decimals: 4 },
    { id: 1, name: "EUR", decimals: 4 },
    { id: 2, name: "GBP", decimals: 4 },
    { id: 3, name: "JPY", decimals: 4 },
    { id: 4, name: "CNY", decimals: 4 },
    { id: 5, name: "CAD", decimals: 4 },
    { id: 6, name: "AUD", decimals: 4 },
    { id: 7, name: "CHF", decimals: 4 },
    { id: 8, name: "INR", decimals: 4 },
    { id: 9, name: "KRW", decimals: 4 }
  ];
  
  for (const currency of currencies) {
    console.log(`Setting ${currency.name} (${currency.id}) to ${currency.decimals} decimals...`);
    try {
      const tx = await oracle.setCurrencyDecimals(currency.id, currency.decimals);
      await tx.wait();
      console.log(`✅ ${currency.name} updated`);
    } catch (e) {
      console.log(`❌ Failed to update ${currency.name}:`, e.message);
    }
  }
  
  console.log("Done!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
