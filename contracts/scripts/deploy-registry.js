const { ethers } = require("hardhat");

async function main() {
  const provider = new ethers.providers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("Deploying DonorRegistry...");
  console.log(`Deployer: ${deployer.address}`);

  const balance = await provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.utils.formatEther(balance)} ETH\n`);

  const DonorRegistry = await ethers.getContractFactory("DonorRegistry", deployer);
  const registry = await DonorRegistry.deploy();
  await registry.deployed();

  console.log(`DonorRegistry deployed: ${registry.address}`);
  console.log("Done!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
