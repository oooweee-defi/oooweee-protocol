const { ethers } = require("hardhat");

async function main() {
  const LP = "0xBc272df4181318ddF450C57d3aa906126Bdc68c3";

  const stability = await ethers.getContractAt("OOOWEEEStability", "0x965dF26Ec6B0FB39A0819C077c66e44b5d9D56D5");
  await (await stability.setLiquidityPair(LP)).wait();
  console.log("✅ Stability → LP");

  const token = await ethers.getContractAt("OOOWEEEToken", "0xA07ABfFC91f379B331E6a1d94B9f808CDc772A3B");
  await (await token.setLiquidityPair(LP, true)).wait();
  console.log("✅ Token → LP");

  const oracle = await ethers.getContractAt("SavingsPriceOracle", "0x0C1fA6ce3355BaF20b778aDe317887E51aBAe73E");
  await (await oracle.setOooweeePool(LP)).wait();
  console.log("✅ Oracle → LP");

  await (await token.enableTrading()).wait();
  console.log("✅ Trading ENABLED!");

  console.log("\n🚀 READY TO GO!");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });