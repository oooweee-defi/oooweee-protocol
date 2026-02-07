const { ethers } = require("hardhat");

async function main() {
  const [admin] = await ethers.getSigners();
  const Stability = await ethers.getContractFactory("OOOWEEEStability");
  const stability = Stability.attach("0x706E4c306c29Acc6a6C7bE5ec8b9957cf07BE33D").connect(admin);

  const registry = "0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad";
  console.log("Setting Chainlink registry to:", registry);
  const tx = await stability.setChainlinkRegistry(registry);
  await tx.wait();

  const set = await stability.chainlinkRegistry();
  console.log("Registry set to:", set);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
