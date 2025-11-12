// scripts/create-or-find-pool.js
async function main() {
  try {
    console.log("Checking for existing pool...");
    
    const factoryAddress = "0x7E0987E5b3a30e3f2828572Bb659A548460a3003";
    const tokenAddress = "0xD4eEa41F12FBb3e2030B17FDeaaF8b38c471B32a";
    const wethAddress = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
    
    const factory = await ethers.getContractAt([
      "function getPair(address,address) view returns (address)",
      "function createPair(address,address) returns (address)"
    ], factoryAddress);
    
    let poolAddress = await factory.getPair(tokenAddress, wethAddress);
    
    if (poolAddress === "0x0000000000000000000000000000000000000000") {
      console.log("No pool exists, creating new one...");
      const tx = await factory.createPair(tokenAddress, wethAddress);
      const receipt = await tx.wait();
      console.log("Pool created! Tx:", receipt.transactionHash);
    } else {
      console.log("Pool already exists at:", poolAddress);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main().then(() => process.exit(0)).catch(console.error);