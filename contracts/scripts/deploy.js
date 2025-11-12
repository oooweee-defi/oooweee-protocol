const hre = require("hardhat");

async function main() {
  console.log("Deploying OOOWEEE Protocol to Sepolia...");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  
  // Deploy Token
  const Token = await hre.ethers.getContractFactory("OOOWEEEToken");
  const token = await Token.deploy(
    deployer.address,  // founder wallet
    deployer.address   // liquidity wallet
  );
  await token.deployed();
  console.log("Token deployed to:", token.address);
  
  // Deploy Savings (with Uniswap Router)
  const UNISWAP_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"; // Sepolia Uniswap V2 Router
  const Savings = await hre.ethers.getContractFactory("OOOWEEESavings");
  const savings = await Savings.deploy(
    token.address,
    UNISWAP_ROUTER
  );
  await savings.deployed();
  console.log("Savings deployed to:", savings.address);
  
  // Deploy Validators
  const Validators = await hre.ethers.getContractFactory("OOOWEEEValidators");
  const validators = await Validators.deploy(
    token.address,
    UNISWAP_ROUTER,
    deployer.address  // founder wallet
  );
  await validators.deployed();
  console.log("Validators deployed to:", validators.address);
  
  // Deploy Stability
  const Stability = await hre.ethers.getContractFactory("OOOWEEEStability");
  const stability = await Stability.deploy(
    token.address,
    UNISWAP_ROUTER,
    validators.address  // validators receive ETH
  );
  await stability.deployed();
  console.log("Stability deployed to:", stability.address);
  
  // Setup connections
  console.log("\nSetting up contract connections...");
  
  // Set stability mechanism in token
  await token.setStabilityMechanism(stability.address);
  console.log("✓ Stability mechanism set in token");
  
  // Set savings contract in validators
  await validators.setSavingsContract(savings.address);
  console.log("✓ Savings contract set in validators");
  
  // Set validator contract in savings
  await savings.setValidatorContract(validators.address);
  console.log("✓ Validator contract set in savings");
  
  console.log("\n=== Deployment Complete ===");
  console.log("Token:", token.address);
  console.log("Savings:", savings.address);
  console.log("Validators:", validators.address);
  console.log("Stability:", stability.address);
  console.log("\nSave these addresses for your frontend!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
