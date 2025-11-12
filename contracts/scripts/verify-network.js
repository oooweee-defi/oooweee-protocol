const hre = require("hardhat");

async function main() {
  try {
    const [deployer] = await hre.ethers.getSigners();
    const balance = await deployer.getBalance();
    
    console.log("Network:", hre.network.name);
    console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);
    console.log("Deployer address:", deployer.address);
    console.log("Deployer balance:", hre.ethers.utils.formatEther(balance), "ETH");
    
    if (balance.eq(0)) {
      console.log("❌ WARNING: Deployer has no ETH! Please fund the account.");
      process.exit(1);
    }
    
    // Estimate deployment cost (rough estimate)
    const estimatedGas = 15000000; // ~15M gas for all contracts
    const gasPrice = await hre.ethers.provider.getGasPrice();
    const estimatedCost = gasPrice.mul(estimatedGas);
    
    console.log("Estimated deployment cost:", hre.ethers.utils.formatEther(estimatedCost), "ETH");
    
    if (balance.lt(estimatedCost)) {
      console.log("⚠️  WARNING: May not have enough ETH for deployment");
    } else {
      console.log("✅ Sufficient ETH for deployment");
    }
    
  } catch (error) {
    console.error("❌ Network verification failed:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });