// scripts/update-router.js
const { ethers } = require("hardhat");

async function main() {
  const NEW_ROUTER = "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3";
  
  // Update Stability
  const stability = await ethers.getContractAt("OOOWEEEStability", "0xDA9FFC0a6Af6624FB660ca39131A7C2F1BE5e43e");
  await (await stability.setRouter(NEW_ROUTER)).wait();
  console.log("✅ Stability router updated");
  
  // Update Savings
  const savings = await ethers.getContractAt("OOOWEEESavings", "0xCf43fd0A7fAa69f0058DA6a940379D62C98566a4");
  await (await savings.setRouter(NEW_ROUTER)).wait();
  console.log("✅ Savings router updated");
  
  // Update Oracle
  const oracle = await ethers.getContractAt("SavingsPriceOracle", "0xd836ab9C012a98A4Cd56EC7c4BbF42a6a771556e");
  await (await oracle.setRouter(NEW_ROUTER)).wait();
  console.log("✅ Oracle router updated");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });