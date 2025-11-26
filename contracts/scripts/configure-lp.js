const { ethers } = require("hardhat");

async function main() {
  const LP = "0x0aBDAD2e438c539C2D443741D4861e7de0596002";

  const stability = await ethers.getContractAt("OOOWEEEStability", "0x6af645117Ea9E96fCBb910B8b2Bf31A622e3c7CD");
  await (await stability.setLiquidityPair(LP)).wait();
  console.log("✅ Stability → LP");

  const token = await ethers.getContractAt("OOOWEEEToken", "0xE9E1AbFa961A3967FB4daF22875521a3c9249a44");
  await (await token.setLiquidityPair(LP, true)).wait();
  console.log("✅ Token → LP");

  const oracle = await ethers.getContractAt("SavingsPriceOracle", "0x023E34b8BE60037f12E13e9C948c172e88651407");
  await (await oracle.setOooweeePool(LP)).wait();
  console.log("✅ Oracle → LP");

  await (await token.enableTrading()).wait();
  console.log("✅ Trading ENABLED!");

  await (await stability.updateBaselinePrice()).wait();
  console.log("✅ Baseline price SET!");

  console.log("\n🚀 READY TO TEST!");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });