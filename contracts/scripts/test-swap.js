async function main() {
  console.log("Testing OOOWEEE -> ETH swap...");
  
// Test swap OOOWEEE -> ETH
const routerAddress = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"
const tokenAddress = "0x42fc7b7175b5B9116c38bbBd5b88C1c968Dd7b77"

// First approve router
const token = await ethers.getContractAt("OOOWEEEToken", tokenAddress)
await token.approve(routerAddress, "1000000000000000000000") // 1000 OOOWEEE

// Setup swap
const router = await ethers.getContractAt([
  "function swapExactTokensForETH(uint,uint,address[],address,uint) returns(uint[])"
], routerAddress)

const path = [tokenAddress, "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"] // OOOWEEE -> WETH

// Execute swap
const tx = await router.swapExactTokensForETH(
  "1000000000000000000000", // 1000 OOOWEEE
  "0", // min ETH out
  path,
  "0x335bB9E071F10a414308170045A5Bc614BcC97B6", // your address
  Math.floor(Date.now()/1000) + 3600
)

await tx.wait()
console.log("Swap successful! Check your ETH balance")
  
  console.log("All tests passed!");
}

main().catch(console.error);