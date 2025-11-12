async function main() {
  const factoryAddress = "0x7E0987E5b3a30e3f2828572Bb659A548460a3003";
  const factory = await ethers.getContractAt(
    ["function createPair(address,address) returns (address)"],
    factoryAddress
  );
  
  const tx = await factory.createPair(
    "0x42fc7b7175b5B9116c38bbBd5b88C1c968Dd7b77",
    "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"
  );
  
  console.log("Creating pool...");
  const receipt = await tx.wait();
  console.log("Pool created!", receipt.transactionHash);
}

main().catch(console.error);