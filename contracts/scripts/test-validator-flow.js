// Full Validator Fund + Stability E2E Test on Sepolia
// Tests: donate, receive rewards, distribute rewards (33/33/34 split),
//        stability mechanism, and reward flow to savers

const { ethers } = require("hardhat");

const ADDRESSES = {
  OOOWEEEToken: "0xcbA9cDe50239cB7D89fc7a14b320184a48212dB8",
  OOOWEEESavings: "0x0B09f4b01563198519b97da0d94f65f8231A0c6a",
  OOOWEEEValidatorFund: "0x5a584D73a1599A30173493088c50c7d6b50298eb",
  OOOWEEEStability: "0x9767D758d0bC527bEA0F712b6691Bac384b8Fd8f",
  SavingsPriceOracle: "0xAD8F21a0EE1611acaD347038F41f8af1f7dC497D",
  UniswapRouter: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
  UniswapPair: "0xd0F4Ae7c575918B7Bccd67EB4F04D317C97B07C2",
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
};

const BILL_PRIVATE_KEY = "4eb4cfe4dc6a45e4330e6b8b30a4a8bde735ec926e68f1e02440681bf3111cda";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)"
];

const VALIDATOR_FUND_ABI = [
  "function donate() external payable",
  "function receiveValidatorRewards() external payable",
  "function distributeRewards() external",
  "function retryFailedSwaps() external",
  "function provisionValidator() external",
  "function confirmValidatorActive() external",
  "function setContracts(address _oooweeeToken, address _savingsContract) external",
  "function setStabilityContract(address _stability) external",
  "function pendingRewards() view returns (uint256)",
  // failedSwapETH not in deployed implementation yet
  // "function failedSwapETH() view returns (uint256)",
  "function totalETHReceived() view returns (uint256)",
  "function totalETHFromStability() view returns (uint256)",
  "function totalETHFromDonations() view returns (uint256)",
  "function totalETHFromRewards() view returns (uint256)",
  "function totalETHToOperations() view returns (uint256)",
  "function totalETHToSavers() view returns (uint256)",
  "function totalOOOWEEEToSavers() view returns (uint256)",
  "function totalDistributions() view returns (uint256)",
  "function validatorsProvisioned() view returns (uint256)",
  "function validatorsActive() view returns (uint256)",
  "function availableForValidators() view returns (uint256)",
  "function operationsWallet() view returns (address)",
  "function oooweeeToken() view returns (address)",
  "function savingsContract() view returns (address)",
  "function stabilityContract() view returns (address)",
  "function getStats() view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256)",
  "function getDistributionStats() view returns (uint256, uint256, uint256, uint256, uint256, uint256)"
];

const SAVINGS_ABI = [
  "function globalRewardPerToken() view returns (uint256)",
  "function totalRewardsDistributed() view returns (uint256)",
  "function totalActiveBalance() view returns (uint256)",
  "function rewardsDistributor() view returns (address)",
  "function pendingRewards() view returns (uint256)",
  "function claimRewards(uint256 accountId) external",
  "function accountCount() view returns (uint256)",
  "function getUserAccounts(address) view returns (uint256[] memory activeIds)",
  "function getAccountDetails(uint256) view returns (address, uint8, bool, uint256, uint256, uint256, uint32, string memory, uint256, uint256, uint8, address)"
];

const STABILITY_ABI = [
  "function checkUpkeep(bytes) view returns (bool, bytes memory)",
  "function performUpkeep(bytes) external",
  "function manualStabilityCheck() external payable",
  "function getEffectiveBaseline() view returns (uint256)",
  "function getCurrentPrice() view returns (uint256)",
  "function totalInterventions() view returns (uint256)",
  "function totalTokensUsed() view returns (uint256)",
  "function totalETHCaptured() view returns (uint256)",
  "function systemChecksEnabled() view returns (bool)",
  "function circuitBreakerTripped() view returns (bool)",
  "function liquidityPair() view returns (address)",
  "function validatorFundWallet() view returns (address)",
  "function interventionsToday() view returns (uint256)",
  "function tokensUsedToday() view returns (uint256)",
  "function baselinePrice() view returns (uint256)"
];

const ORACLE_ABI = [
  "function getOOOWEEEPrice() view returns (uint256)",
  "function getETHPrice() view returns (uint256)"
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
  const ops = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const bill = new ethers.Wallet(BILL_PRIVATE_KEY, provider);

  const token = new ethers.Contract(ADDRESSES.OOOWEEEToken, ERC20_ABI, provider);
  const validatorFund = new ethers.Contract(ADDRESSES.OOOWEEEValidatorFund, VALIDATOR_FUND_ABI, provider);
  const savings = new ethers.Contract(ADDRESSES.OOOWEEESavings, SAVINGS_ABI, provider);
  const stability = new ethers.Contract(ADDRESSES.OOOWEEEStability, STABILITY_ABI, provider);
  const oracle = new ethers.Contract(ADDRESSES.SavingsPriceOracle, ORACLE_ABI, provider);

  console.log("=== OOOWEEE Validator Fund + Stability E2E Test ===\n");
  console.log("Operations wallet:", ops.address);
  console.log("Bill's wallet:    ", bill.address);

  // ==========================================
  // CHECK: Contract wiring
  // ==========================================
  console.log("\n--- CHECK: Contract Wiring ---");
  const vfToken = await validatorFund.oooweeeToken();
  const vfSavings = await validatorFund.savingsContract();
  const vfStability = await validatorFund.stabilityContract();
  const vfOps = await validatorFund.operationsWallet();
  const savingsDistributor = await savings.rewardsDistributor();

  console.log(`VF -> Token:     ${vfToken} ${vfToken === ADDRESSES.OOOWEEEToken ? '✅' : '❌ MISMATCH'}`);
  console.log(`VF -> Savings:   ${vfSavings} ${vfSavings === ADDRESSES.OOOWEEESavings ? '✅' : '❌ MISMATCH'}`);
  console.log(`VF -> Stability: ${vfStability} ${vfStability === ADDRESSES.OOOWEEEStability ? '✅' : '❌ MISMATCH'}`);
  console.log(`VF -> Ops:       ${vfOps}`);
  console.log(`Savings -> Distributor: ${savingsDistributor} ${savingsDistributor === ADDRESSES.OOOWEEEValidatorFund ? '✅' : '❌ MISMATCH'}`);

  // ==========================================
  // CHECK: Stability contract state
  // ==========================================
  console.log("\n--- CHECK: Stability State ---");
  const stabilityEnabled = await stability.systemChecksEnabled();
  const cbTripped = await stability.circuitBreakerTripped();
  const liqPair = await stability.liquidityPair();
  const vfWallet = await stability.validatorFundWallet();
  console.log(`Enabled:          ${stabilityEnabled}`);
  console.log(`Circuit Breaker:  ${cbTripped}`);
  console.log(`Liquidity Pair:   ${liqPair} ${liqPair === ADDRESSES.UniswapPair ? '✅' : '❌'}`);
  console.log(`VF Wallet:        ${vfWallet}`);

  // ==========================================
  // CHECK: Prices
  // ==========================================
  console.log("\n--- CHECK: Prices ---");
  try {
    const oooPrice = await oracle.getOOOWEEEPrice();
    const ethPrice = await oracle.getETHPrice();
    console.log(`OOOWEEE price: ${ethers.utils.formatUnits(oooPrice, 18)} ETH`);
    console.log(`ETH price:     $${ethers.utils.formatUnits(ethPrice, 8)}`);
  } catch (e) {
    console.log("Oracle price check failed:", e.message);
  }

  try {
    const baselinePrice = await stability.baselinePrice();
    const effectiveBaseline = await stability.getEffectiveBaseline();
    const currentPrice = await stability.getCurrentPrice();
    console.log(`Stability baseline (raw):       ${ethers.utils.formatUnits(baselinePrice, 18)} ETH`);
    console.log(`Stability baseline (effective):  ${ethers.utils.formatUnits(effectiveBaseline, 18)} ETH`);
    console.log(`Stability current price:         ${ethers.utils.formatUnits(currentPrice, 18)} ETH`);
    if (effectiveBaseline.gt(0)) {
      const deviation = currentPrice.sub(effectiveBaseline).mul(10000).div(effectiveBaseline);
      console.log(`Price deviation: ${deviation.toNumber() / 100}% from effective baseline`);
    }
  } catch (e) {
    console.log("Stability price check failed:", e.message);
  }

  // ==========================================
  // CHECK: Starting balances
  // ==========================================
  console.log("\n--- CHECK: Starting Balances ---");
  const vfBalance = await provider.getBalance(ADDRESSES.OOOWEEEValidatorFund);
  const opsEth = await provider.getBalance(ops.address);
  const pending = await validatorFund.pendingRewards();

  console.log(`VF contract ETH:    ${ethers.utils.formatEther(vfBalance)}`);
  console.log(`VF pending rewards: ${ethers.utils.formatEther(pending)}`);
  console.log(`Ops ETH balance:    ${ethers.utils.formatEther(opsEth)}`);

  // Pre-distribution stats
  const [totalETHToOps0, totalETHToVals0, totalETHToSavers0, totalOOOToSavers0, lastDist0, totalDists0] = await validatorFund.getDistributionStats();
  const savingsRewards0 = await savings.totalRewardsDistributed();
  console.log(`\nPre-test distribution stats:`);
  console.log(`  Total ETH to operations: ${ethers.utils.formatEther(totalETHToOps0)}`);
  console.log(`  Total ETH to validators: ${ethers.utils.formatEther(totalETHToVals0)}`);
  console.log(`  Total ETH to savers:     ${ethers.utils.formatEther(totalETHToSavers0)}`);
  console.log(`  Total OOOWEEE to savers: ${ethers.utils.formatUnits(totalOOOToSavers0, 18)}`);
  console.log(`  Total distributions:     ${totalDists0.toString()}`);
  console.log(`  Savings total rewards:   ${ethers.utils.formatUnits(savingsRewards0, 18)}`);

  // ==========================================
  // STEP 1: Donate ETH to ValidatorFund
  // ==========================================
  console.log("\n--- STEP 1: Donate 0.1 ETH to ValidatorFund ---");
  const donateTx = await validatorFund.connect(ops).donate({
    value: ethers.utils.parseEther("0.1"),
    gasLimit: 200000
  });
  console.log("Donate tx:", donateTx.hash);
  await donateTx.wait();
  console.log("Donated 0.1 ETH ✅");

  const vfBalAfterDonate = await provider.getBalance(ADDRESSES.OOOWEEEValidatorFund);
  const availAfterDonate = await validatorFund.availableForValidators();
  console.log(`VF balance: ${ethers.utils.formatEther(vfBalAfterDonate)}`);
  console.log(`Available for validators: ${ethers.utils.formatEther(availAfterDonate)}`);

  // ==========================================
  // STEP 2: Simulate validator rewards (send ETH directly)
  // ==========================================
  console.log("\n--- STEP 2: Simulate validator rewards (0.2 ETH) ---");
  const rewardTx = await validatorFund.connect(ops).receiveValidatorRewards({
    value: ethers.utils.parseEther("0.2"),
    gasLimit: 200000
  });
  console.log("Rewards tx:", rewardTx.hash);
  await rewardTx.wait();
  console.log("Sent 0.2 ETH as validator rewards ✅");

  const pendingAfterRewards = await validatorFund.pendingRewards();
  console.log(`Pending rewards: ${ethers.utils.formatEther(pendingAfterRewards)}`);

  // ==========================================
  // STEP 3: Distribute rewards (33/33/34 split)
  // ==========================================
  console.log("\n--- STEP 3: Distribute rewards ---");
  console.log("This will split pending rewards:");
  console.log(`  33% (${ethers.utils.formatEther(pendingAfterRewards.mul(3300).div(10000))}) → operations (ETH)`);
  console.log(`  33% (${ethers.utils.formatEther(pendingAfterRewards.mul(3300).div(10000))}) → validator fund (stays)`);
  console.log(`  34% (${ethers.utils.formatEther(pendingAfterRewards.mul(3400).div(10000))}) → swap to OOOWEEE for savers`);

  const opsEthBefore = await provider.getBalance(ops.address);

  const distTx = await validatorFund.connect(ops).distributeRewards({ gasLimit: 500000 });
  console.log("Distribute tx:", distTx.hash);
  const distReceipt = await distTx.wait();
  console.log("Distribution complete ✅");

  const opsEthAfter = await provider.getBalance(ops.address);
  const gasCost = distReceipt.gasUsed.mul(distReceipt.effectiveGasPrice);
  const opsEthGain = opsEthAfter.sub(opsEthBefore).add(gasCost);
  console.log(`\nOps ETH received: ${ethers.utils.formatEther(opsEthGain)}`);

  const pendingAfterDist = await validatorFund.pendingRewards();
  console.log(`Pending rewards after: ${ethers.utils.formatEther(pendingAfterDist)}`);

  // Check if savers received OOOWEEE rewards
  const [totalETHToOps1, totalETHToVals1, totalETHToSavers1, totalOOOToSavers1, lastDist1, totalDists1] = await validatorFund.getDistributionStats();
  const savingsRewards1 = await savings.totalRewardsDistributed();
  console.log(`\nPost-distribution stats:`);
  console.log(`  ETH to operations: ${ethers.utils.formatEther(totalETHToOps1)} (delta: ${ethers.utils.formatEther(totalETHToOps1.sub(totalETHToOps0))})`);
  console.log(`  ETH to savers:     ${ethers.utils.formatEther(totalETHToSavers1)} (delta: ${ethers.utils.formatEther(totalETHToSavers1.sub(totalETHToSavers0))})`);
  console.log(`  OOOWEEE to savers: ${ethers.utils.formatUnits(totalOOOToSavers1, 18)} (delta: ${ethers.utils.formatUnits(totalOOOToSavers1.sub(totalOOOToSavers0), 18)})`);
  console.log(`  Total distributions: ${totalDists1.toString()}`);
  console.log(`  Savings rewards distributed: ${ethers.utils.formatUnits(savingsRewards1, 18)} (delta: ${ethers.utils.formatUnits(savingsRewards1.sub(savingsRewards0), 18)})`);

  // Note: failedSwapETH and retryFailedSwaps not in deployed implementation yet

  // ==========================================
  // STEP 4: Check stability mechanism
  // ==========================================
  console.log("\n--- STEP 4: Check Stability Mechanism ---");
  try {
    const [upkeepNeeded, performData] = await stability.checkUpkeep("0x");
    console.log(`Upkeep needed: ${upkeepNeeded}`);

    if (upkeepNeeded) {
      console.log("Stability intervention needed! Executing...");
      const perfTx = await stability.connect(ops).performUpkeep(performData, { gasLimit: 500000 });
      console.log("performUpkeep tx:", perfTx.hash);
      await perfTx.wait();
      console.log("Stability intervention executed ✅");
    } else {
      console.log("No stability intervention needed (price within range)");
    }
  } catch (e) {
    console.log("Stability check failed:", e.reason || e.message);
  }

  // Manual stability check test
  console.log("\nTesting manual stability check (0.01 ETH)...");
  try {
    const manualTx = await stability.connect(ops).manualStabilityCheck({
      value: ethers.utils.parseEther("0.01"),
      gasLimit: 500000
    });
    console.log("Manual check tx:", manualTx.hash);
    await manualTx.wait();
    console.log("Manual stability check executed ✅");
  } catch (e) {
    console.log("Manual stability check result:", e.reason || e.message);
  }

  const intervCount = await stability.totalInterventions();
  const totalSold = await stability.totalTokensUsed();
  const totalCaptured = await stability.totalETHCaptured();
  console.log(`Total interventions: ${intervCount.toString()}`);
  console.log(`Total tokens sold:   ${ethers.utils.formatUnits(totalSold, 18)}`);
  console.log(`Total ETH captured:  ${ethers.utils.formatEther(totalCaptured)}`);

  // ==========================================
  // STEP 5: Check if Bill's savings account got rewards
  // ==========================================
  console.log("\n--- STEP 5: Check Saver Rewards ---");
  const totalActive = await savings.totalActiveBalance();
  const globalReward = await savings.globalRewardPerToken();
  console.log(`Savings total active balance: ${ethers.utils.formatUnits(totalActive, 18)} OOOWEEE`);
  console.log(`Global reward per token:      ${ethers.utils.formatUnits(globalReward, 18)}`);

  // Check active accounts for rewards
  const savingsPendingPool = await savings.pendingRewards();
  console.log(`Savings pending reward pool: ${ethers.utils.formatUnits(savingsPendingPool, 18)} OOOWEEE`);

  // Check ops accounts
  try {
    const opsAccounts = await savings.getUserAccounts(ops.address);
    console.log(`Ops active accounts: ${opsAccounts.length}`);
    for (const accId of opsAccounts) {
      try {
        const details = await savings.getAccountDetails(accId);
        const balance = details[3];
        const goalName = details[7];
        const unclaimedRewards = details[8]; // pendingRewards field in struct
        console.log(`  Account #${accId} "${goalName}": balance ${ethers.utils.formatUnits(balance, 18)}, unclaimed rewards: ${ethers.utils.formatUnits(unclaimedRewards, 18)} OOOWEEE`);

        if (unclaimedRewards.gt(0)) {
          console.log(`  → Claiming rewards for account #${accId}...`);
          const claimTx = await savings.connect(ops).claimRewards(accId, { gasLimit: 200000 });
          await claimTx.wait();
          console.log(`  → Rewards claimed ✅`);
        }
      } catch (e) {
        console.log(`  Account #${accId} error:`, e.reason || e.message);
      }
    }
  } catch (e) {
    console.log("Ops accounts check:", e.reason || e.message);
  }

  // Check Bill's accounts
  try {
    const billAccounts = await savings.getUserAccounts(bill.address);
    console.log(`Bill active accounts: ${billAccounts.length}`);
    for (const accId of billAccounts) {
      try {
        const details = await savings.getAccountDetails(accId);
        const balance = details[3];
        const goalName = details[7];
        const unclaimedRewards = details[8];
        console.log(`  Account #${accId} "${goalName}": balance ${ethers.utils.formatUnits(balance, 18)}, unclaimed rewards: ${ethers.utils.formatUnits(unclaimedRewards, 18)} OOOWEEE`);
      } catch (e) {
        console.log(`  Account #${accId} error:`, e.reason || e.message);
      }
    }
  } catch (e) {
    console.log("Bill accounts check:", e.reason || e.message);
  }

  // ==========================================
  // FINAL: Summary
  // ==========================================
  console.log("\n=== FINAL SUMMARY ===");
  const [totalRecv, fromStab, fromDon, fromRewards, pending2, avail2, vProv, vActive, totalDist, donorCount] = await validatorFund.getStats();
  console.log(`ValidatorFund Stats:`);
  console.log(`  Total ETH received:   ${ethers.utils.formatEther(totalRecv)}`);
  console.log(`  From stability:       ${ethers.utils.formatEther(fromStab)}`);
  console.log(`  From donations:       ${ethers.utils.formatEther(fromDon)}`);
  console.log(`  From rewards:         ${ethers.utils.formatEther(fromRewards)}`);
  console.log(`  Pending rewards:      ${ethers.utils.formatEther(pending2)}`);
  console.log(`  Available for validators: ${ethers.utils.formatEther(avail2)}`);
  console.log(`  Validators provisioned:   ${vProv.toString()}`);
  console.log(`  Validators active:        ${vActive.toString()}`);
  console.log(`  Total distributions:      ${totalDist.toString()}`);
  console.log(`  Donor count:              ${donorCount.toString()}`);

  const vfFinalBal = await provider.getBalance(ADDRESSES.OOOWEEEValidatorFund);
  console.log(`  Contract ETH balance:     ${ethers.utils.formatEther(vfFinalBal)}`);

  console.log("\n✅ Validator Fund + Stability test complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message || error);
    if (error.reason) console.error("Reason:", error.reason);
    if (error.data) console.error("Data:", error.data);
    process.exit(1);
  });
