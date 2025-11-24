const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const deploymentData = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf8"));
  const validatorFundAddress = deploymentData.contracts.validatorFund;
  const validatorFund = await hre.ethers.getContractAt("OOOWEEEValidatorFund", validatorFundAddress);

  const balance = await hre.ethers.provider.getBalance(validatorFundAddress);
  console.log("Validator Fund Balance:", hre.ethers.utils.formatEther(balance));

  const stats = await validatorFund.getStats();
  console.log("Stats:", stats);
  
  const totalRewards = await validatorFund.totalValidatorRewards();
  console.log("Total Rewards:", hre.ethers.utils.formatEther(totalRewards));
}

main().catch(console.error);