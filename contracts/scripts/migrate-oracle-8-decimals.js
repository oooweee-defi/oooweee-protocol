/**
 * Migrate Oracle from 4 to 8 decimal precision
 *
 * Problem: At 4 decimals (10000 = €1.00), a token price of €0.0003 truncates to 1 (€0.0001).
 * Fix: Change to 8 decimals (100000000 = €1.00), so €0.0003 = 30000 — accurate.
 *
 * This script calls existing admin functions on the oracle — no contract upgrade needed.
 *
 * WARNING: Existing accounts with targetFiat stored in 4-decimal units will break.
 * On Sepolia there's only 1 account — withdraw and recreate after this migration.
 */

const hre = require("hardhat");

const ORACLE_ADDRESS = "0xAD8F21a0EE1611acaD347038F41f8af1f7dC497D";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Running oracle decimal migration with:", deployer.address);

  const oracle = await hre.ethers.getContractAt("SavingsPriceOracle", ORACLE_ADDRESS);

  // Verify current state
  console.log("\n--- Current State ---");
  const usdDecimals = await oracle.currencyDecimals(0);
  const eurDecimals = await oracle.currencyDecimals(1);
  const gbpDecimals = await oracle.currencyDecimals(2);
  console.log(`USD decimals: ${usdDecimals}`);
  console.log(`EUR decimals: ${eurDecimals}`);
  console.log(`GBP decimals: ${gbpDecimals}`);

  try {
    const currentPrice = await oracle.getOooweeePriceView(1); // EUR
    console.log(`Current EUR price (4 dec): ${currentPrice} (${currentPrice / 10000} EUR)`);
  } catch (e) {
    console.log("Could not read current price:", e.message);
  }

  // Step 1: Change currency decimals from 4 to 8
  console.log("\n--- Step 1: Update currency decimals to 8 ---");

  console.log("Setting USD decimals to 8...");
  await (await oracle.setCurrencyDecimals(0, 8)).wait();

  console.log("Setting EUR decimals to 8...");
  await (await oracle.setCurrencyDecimals(1, 8)).wait();

  console.log("Setting GBP decimals to 8...");
  await (await oracle.setCurrencyDecimals(2, 8)).wait();

  // Step 2: Scale default prices (multiply by 10000 to go from 4-dec to 8-dec)
  console.log("\n--- Step 2: Scale default prices ---");

  // Old: 10 ($0.001 at 4 dec) → New: 100000 ($0.001 at 8 dec)
  console.log("Setting USD default price to 100000...");
  await (await oracle.setDefaultPrice(0, 100000)).wait();

  console.log("Setting EUR default price to 90000...");
  await (await oracle.setDefaultPrice(1, 90000)).wait();

  console.log("Setting GBP default price to 80000...");
  await (await oracle.setDefaultPrice(2, 80000)).wait();

  // Step 3: Scale emergency fixed rates
  console.log("\n--- Step 3: Scale emergency fixed rates ---");

  console.log("Setting USD emergency rate to 100000...");
  await (await oracle.setEmergencyFixedRate(0, 100000)).wait();

  console.log("Setting EUR emergency rate to 90000...");
  await (await oracle.setEmergencyFixedRate(1, 90000)).wait();

  console.log("Setting GBP emergency rate to 80000...");
  await (await oracle.setEmergencyFixedRate(2, 80000)).wait();

  // Verify new state
  console.log("\n--- New State ---");
  const newUsdDecimals = await oracle.currencyDecimals(0);
  const newEurDecimals = await oracle.currencyDecimals(1);
  const newGbpDecimals = await oracle.currencyDecimals(2);
  console.log(`USD decimals: ${newUsdDecimals}`);
  console.log(`EUR decimals: ${newEurDecimals}`);
  console.log(`GBP decimals: ${newGbpDecimals}`);

  try {
    const newPrice = await oracle.getOooweeePriceView(1); // EUR
    console.log(`New EUR price (8 dec): ${newPrice} (${newPrice / 100000000} EUR)`);
  } catch (e) {
    console.log("Could not read new price:", e.message);
  }

  console.log("\n✅ Oracle decimal migration complete!");
  console.log("⚠️  Existing accounts with targetFiat in 4-decimal format are now broken.");
  console.log("   Withdraw from them and recreate with correct values.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
