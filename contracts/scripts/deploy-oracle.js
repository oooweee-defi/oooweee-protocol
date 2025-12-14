const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  // Deploy new oracle
  console.log("Deploying new SavingsPriceOracle...");
  const Oracle = await hre.ethers.getContractFactory("SavingsPriceOracle");
  const oracle = await Oracle.deploy("0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"); // Sepolia router
  await oracle.deployed();
  console.log("✅ Oracle deployed:", oracle.address);

  // Set pool address
  console.log("\nConfiguring oracle...");
  await (await oracle.setOooweeePool("0x4FDc01f03d30a718854cE4105eBC77CDAC374073")).wait();
  console.log("✅ Pool set");

  // Set USD Chainlink feed
  await (await oracle.setPriceFeed(0, "0x694AA1769357215DE4FAC081bf1f309aDC325306")).wait();
  console.log("✅ USD feed set");

  // Set default ETH prices for EUR/GBP (no Chainlink feeds on Sepolia)
  await (await oracle.setDefaultPrice(1, "333300000000")).wait(); // EUR ~€3333
  await (await oracle.setDefaultPrice(2, "280000000000")).wait(); // GBP ~£2800
  console.log("✅ Default prices set");

  // Update Savings contract to use new oracle
  const savings = await hre.ethers.getContractAt(
    "OOOWEEESavings",
    "0xaABe5E9510157AFf6fb02Bd7D65ED4E093Cda863"
  );
  await (await savings.setPriceOracle(oracle.address)).wait();
  console.log("✅ Savings contract updated to use new oracle");

  // Verify
  const price = await oracle.getOooweeePriceView(1);
  console.log("\n=== Verification ===");
  console.log("OOOWEEE price (EUR):", price.toString(), "cents");
  console.log("= €", (price.toNumber() / 100).toFixed(4));
}

main().catch(console.error);