const hre = require("hardhat");

async function main() {
  try {
    const oracle = await hre.ethers.getContractAt(
      "SavingsPriceOracle",
      "0xBA6a77e90666Ae9fF4A88fE2DeC25662184AfAc0"
    );

    console.log("Oracle found at:", oracle.address);

    // Check configured price feeds
    const usdFeed = await oracle.priceFeeds(0);
    console.log("USD feed:", usdFeed);
    
    const eurFeed = await oracle.priceFeeds(1);
    console.log("EUR feed:", eurFeed);
    
    const gbpFeed = await oracle.priceFeeds(2);
    console.log("GBP feed:", gbpFeed);
    
    // Check default prices
    const defUsd = await oracle.defaultPrices(0);
    console.log("Default USD:", defUsd.toString());
    
    const defEur = await oracle.defaultPrices(1);
    console.log("Default EUR:", defEur.toString());
    
    // Check emergency mode
    const emergency = await oracle.emergencyPriceMode();
    console.log("Emergency mode:", emergency);
    
    const source = await oracle.activePriceSource();
    console.log("Active source:", source.toString());
    
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main().then(() => process.exit(0));