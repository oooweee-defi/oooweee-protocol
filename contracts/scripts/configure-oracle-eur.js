const hre = require("hardhat");

async function main() {
  const ORACLE_ADDRESS = "0x36D185F2B7815A82f8794E38DAe6cE772869CFD7";
  const UNISWAP_PAIR_ADDRESS = hre.ethers.utils.getAddress("0xcf841ff4380189c394388d685947ac4c8abd545b");
  const EUR_CURRENCY_ID = 1; // SavingsPriceOracle.Currency.EUR

  // Latest ETH price in EUR from CoinGecko (fetched just before running this script)
  const ETH_PRICE_EUR = "2567.57";

  const oracle = await hre.ethers.getContractAt("SavingsPriceOracle", ORACLE_ADDRESS);

  const priceWith8Decimals = hre.ethers.utils.parseUnits(ETH_PRICE_EUR, 8);
  const emergencyRate = priceWith8Decimals.add(50000).div(100000); // Divide by 1e5 to account for 0.00001 ETH per token

  console.log("Setting Oooweee pool to:", UNISWAP_PAIR_ADDRESS);
  let tx = await oracle.setOooweeePool(UNISWAP_PAIR_ADDRESS);
  await tx.wait();
  console.log("✓ Pool updated");

  console.log(`Setting default EUR price to ${ETH_PRICE_EUR} (8 decimals)`);
  tx = await oracle.setDefaultPrice(EUR_CURRENCY_ID, priceWith8Decimals);
  await tx.wait();
  console.log("✓ Default price updated");

  console.log("Setting emergency fixed rate (EUR per $OOOWEEE):", hre.ethers.utils.formatUnits(emergencyRate, 8));
  tx = await oracle.setEmergencyFixedRate(EUR_CURRENCY_ID, emergencyRate);
  await tx.wait();
  console.log("✓ Emergency fixed rate updated");

  console.log("Setting EUR currency decimals to 8");
  tx = await oracle.setCurrencyDecimals(EUR_CURRENCY_ID, 8);
  await tx.wait();
  console.log("✓ Currency decimals updated");

  console.log("All oracle settings applied successfully ✔️");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
