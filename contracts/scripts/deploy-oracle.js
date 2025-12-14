const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying new SavingsPriceOracle (4 decimal precision)...");
  const Oracle = await hre.ethers.getContractFactory("SavingsPriceOracle");
  const oracle = await Oracle.deploy("0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008");
  await oracle.deployed();
  console.log("✅ Oracle deployed:", oracle.address);

  // Configure
  await (await oracle.setOooweeePool("0x4FDc01f03d30a718854cE4105eBC77CDAC374073")).wait();
  console.log("✅ Pool set");

  await (await oracle.setPriceFeed(0, "0x694AA1769357215DE4FAC081bf1f309aDC325306")).wait();
  console.log("✅ USD feed set");

  // Default ETH prices (8 decimals from Chainlink)
  await (await oracle.setDefaultPrice(1, "333300000000")).wait(); // EUR
  await (await oracle.setDefaultPrice(2, "280000000000")).wait(); // GBP
  console.log("✅ Default prices set");

  // Update Savings contract
  const savings = await hre.ethers.getContractAt(
    "OOOWEEESavings",
    "0xaABe5E9510157AFf6fb02Bd7D65ED4E093Cda863"
  );
  await (await savings.setPriceOracle(oracle.address)).wait();
  console.log("✅ Savings updated");

  // Verify - should show ~33 for 4 decimals (€0.0033)
  const price = await oracle.getOooweeePriceView(1);
  console.log("\nOOOWEEE price (EUR):", price.toString(), "= €" + (price / 10000).toFixed(4));
}

main().catch(console.error);