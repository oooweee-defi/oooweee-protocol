const { ethers } = require("hardhat");

async function main() {
  const routers = [
    "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
    "0x86dcd3293C53Cf8EFd7303B57beb2a3F671dDE98", 
    "0x425141165d3DE9FEC831896C016617a52363b687",
    "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E"
  ];
  
  for (const addr of routers) {
    try {
      const router = await ethers.getContractAt("IUniswapV2Router02", addr);
      const factory = await router.factory();
      const weth = await router.WETH();
      console.log("Router:", addr);
      console.log("  Factory:", factory);
      console.log("  WETH:", weth);
      if (factory === "0xF62c03E08ada871A0bEb309762E260a7a6a880E6") {
        console.log("  ✅ MATCH!");
      }
      console.log("");
    } catch (e) {
      console.log("Router " + addr + ": Failed");
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });