const { ethers } = require("hardhat");

async function main() {
  const implSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

  const proxies = {
    OOOWEEEToken: "0xcbA9cDe50239cB7D89fc7a14b320184a48212dB8",
    OOOWEEESavings: "0x0B09f4b01563198519b97da0d94f65f8231A0c6a",
    OOOWEEEValidatorFund: "0x5a584D73a1599A30173493088c50c7d6b50298eb",
    OOOWEEEStability: "0x9767D758d0bC527bEA0F712b6691Bac384b8Fd8f",
    SavingsPriceOracle: "0xAD8F21a0EE1611acaD347038F41f8af1f7dC497D",
    DonorRegistry: "0x639553e621bE1b1aD927FA841a91cfA72e131C46"
  };

  for (const [name, addr] of Object.entries(proxies)) {
    const raw = await ethers.provider.getStorageAt(addr, implSlot);
    const impl = '0x' + raw.slice(26);
    const code = await ethers.provider.getCode(impl);
    console.log(`${name}: proxy=${addr} impl=${impl} hasCode=${code.length > 2}`);
  }

  // Try raw call to failedSwapETH on VF
  console.log("\n--- Raw calls to ValidatorFund ---");
  const vfAddr = proxies.OOOWEEEValidatorFund;

  // failedSwapETH() selector
  const selectors = {
    'failedSwapETH()': ethers.utils.id('failedSwapETH()').slice(0, 10),
    'pendingRewards()': ethers.utils.id('pendingRewards()').slice(0, 10),
    'totalETHReceived()': ethers.utils.id('totalETHReceived()').slice(0, 10),
    'operationsWallet()': ethers.utils.id('operationsWallet()').slice(0, 10),
  };

  for (const [name, sel] of Object.entries(selectors)) {
    try {
      const result = await ethers.provider.call({ to: vfAddr, data: sel });
      console.log(`${name} [${sel}]: ${result}`);
    } catch (e) {
      console.log(`${name} [${sel}]: ERROR - ${e.message}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
