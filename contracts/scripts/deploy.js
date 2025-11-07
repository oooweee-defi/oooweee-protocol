async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying OOOWEEE Protocol!");
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Deploy Token
  console.log("\n🪙 Deploying OOOWEEE Token...");
  const Token = await ethers.getContractFactory("OOOWEEEToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("✅ Token deployed to:", tokenAddress);

  // Deploy Savings
  console.log("\n🏦 Deploying OOOWEEE Savings...");
  const Savings = await ethers.getContractFactory("OOOWEEESavings");
  const savings = await Savings.deploy(tokenAddress);
  await savings.waitForDeployment();
  const savingsAddress = await savings.getAddress();
  console.log("✅ Savings deployed to:", savingsAddress);

  // Save addresses to file
  const fs = require('fs');
  const addresses = {
    token: tokenAddress,
    savings: savingsAddress,
    deployer: deployer.address,
    network: network.name,
    ticker: "OOOWEEE"
  };
  
  fs.writeFileSync(
    './deployed-addresses.json',
    JSON.stringify(addresses, null, 2)
  );
  
  console.log("\n🎉 OOOWEEE! Deployment complete!");
  console.log("📄 Addresses saved to deployed-addresses.json");
  
  // Verify you received tokens
  const balance = await token.balanceOf(deployer.address);
  console.log("\n💰 Your balance:", ethers.formatUnits(balance, 18), "OOOWEEE");
  console.log("🎬 Rick would be proud! OOOWEEE!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
