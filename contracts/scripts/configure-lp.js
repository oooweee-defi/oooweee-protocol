const { ethers } = require("hardhat");

async function main() {
  const LP = "0x7C7abc858F7B06a9547e1dc33Db46F896C4BE6a8";

  // 1. Set LP on Stability
  const stability = await ethers.getContractAt("OOOWEEEStability", "0xDA9FFC0a6Af6624FB660ca39131A7C2F1BE5e43e");
  await (await stability.setLiquidityPair(LP)).wait();
  console.log("✅ Stability → LP");

  // 2. Set LP on Token
  const token = await ethers.getContractAt("OOOWEEEToken", "0xC217a455152AE581Ee2306A3fd9625f86599DEeE");
  await (await token.setLiquidityPair(LP, true)).wait();
  console.log("✅ Token → LP");

  // 3. Set pool on Oracle
  const oracle = await ethers.getContractAt("SavingsPriceOracle", "0xd836ab9C012a98A4Cd56EC7c4BbF42a6a771556e");
  await (await oracle.setOooweeePool(LP)).wait();
  console.log("✅ Oracle → LP");

  // 4. Enable trading
  await (await token.enableTrading()).wait();
  console.log("✅ Trading ENABLED!");

  console.log("\n🚀 DEPLOYMENT COMPLETE!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });