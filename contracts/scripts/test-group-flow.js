// Full Group Savings E2E Test Flow on Sepolia
// Operations wallet creates group, invites Bill, both deposit, then complete

const { ethers } = require("hardhat");

const ADDRESSES = {
  OOOWEEEToken: "0xcbA9cDe50239cB7D89fc7a14b320184a48212dB8",
  OOOWEEESavings: "0x0B09f4b01563198519b97da0d94f65f8231A0c6a",
  UniswapRouter: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
};

const BILL_PRIVATE_KEY = "4eb4cfe4dc6a45e4330e6b8b30a4a8bde735ec926e68f1e02440681bf3111cda";
const BILL_ADDRESS = "0xcE6f66Ead312072111d8b873b46C5B80406934C3";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) public view returns (uint[] memory amounts)"
];

const SAVINGS_ABI = [
  "function createGroupAccount(uint8 accountType, address destinationWallet, string memory goalName, uint256 targetFiat, uint8 currency, uint32 unlockTime, uint256 initialDeposit) external returns (uint256)",
  "function inviteMember(uint256 groupId, address member) external",
  "function acceptInvitation(uint256 groupId) external",
  "function depositToGroup(uint256 groupId, uint256 amount) external",
  "function processGroupAccount(uint256 groupId) external",
  "function groupCount() view returns (uint256)",
  "function getGroupDetails(uint256 groupId) view returns (address creator, address destinationWallet, uint8 accountType, bool isActive, uint256 totalBalance, uint256 targetFiat, uint8 targetCurrency, uint32 unlockTime, string memory goalName, uint256 memberCount)",
  "function getGroupMembers(uint256 groupId) view returns (address[] memory)",
  "function getGroupContribution(uint256 groupId, address member) view returns (uint256)",
  "function isGroupMember(uint256 groupId, address member) view returns (bool)",
  "function isGroupInvited(uint256 groupId, address member) view returns (bool)"
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");

  // Operations wallet (deployer)
  const ops = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  // Bill's wallet
  const bill = new ethers.Wallet(BILL_PRIVATE_KEY, provider);

  const token = new ethers.Contract(ADDRESSES.OOOWEEEToken, ERC20_ABI, provider);
  const savings = new ethers.Contract(ADDRESSES.OOOWEEESavings, SAVINGS_ABI, provider);
  const router = new ethers.Contract(ADDRESSES.UniswapRouter, ROUTER_ABI, provider);

  console.log("=== OOOWEEE Group Savings E2E Test ===\n");
  console.log("Operations wallet:", ops.address);
  console.log("Bill's wallet:    ", bill.address);

  // Check balances
  const opsEth = await provider.getBalance(ops.address);
  const billEth = await provider.getBalance(bill.address);
  const opsOoo = await token.balanceOf(ops.address);
  const billOoo = await token.balanceOf(bill.address);

  console.log(`\nOps  ETH: ${ethers.utils.formatEther(opsEth)} | OOOWEEE: ${ethers.utils.formatUnits(opsOoo, 18)}`);
  console.log(`Bill ETH: ${ethers.utils.formatEther(billEth)} | OOOWEEE: ${ethers.utils.formatUnits(billOoo, 18)}`);

  // ==========================================
  // STEP 1: Buy OOOWEEE (swap 0.05 ETH)
  // ==========================================
  console.log("\n--- STEP 1: Buy OOOWEEE (swap 0.05 ETH) ---");
  const swapAmount = ethers.utils.parseEther("0.05");
  const path = [ADDRESSES.WETH, ADDRESSES.OOOWEEEToken];

  const amountsOut = await router.getAmountsOut(swapAmount, path);
  console.log(`Expected OOOWEEE for 0.05 ETH: ${ethers.utils.formatUnits(amountsOut[1], 18)}`);

  const deadline = Math.floor(Date.now() / 1000) + 600;
  const swapTx = await router.connect(ops).swapExactETHForTokens(
    0, // accept any amount (testnet)
    path,
    ops.address,
    deadline,
    { value: swapAmount, gasLimit: 300000 }
  );
  console.log("Swap tx:", swapTx.hash);
  await swapTx.wait();

  const opsOooAfterSwap = await token.balanceOf(ops.address);
  console.log(`Ops OOOWEEE after swap: ${ethers.utils.formatUnits(opsOooAfterSwap, 18)}`);

  // ==========================================
  // STEP 2: Create Group Account
  // ==========================================
  console.log("\n--- STEP 2: Create Group Account ---");

  // accountType: 0 = Time, 1 = Balance, 2 = Growth
  // Using Time lock, unlock in 5 minutes
  const unlockTime = Math.floor(Date.now() / 1000) + 300; // 5 min from now
  const initialDeposit = ethers.utils.parseUnits("100000", 18); // 100k OOOWEEE

  // Approve tokens first
  console.log("Approving tokens for savings contract...");
  const approveTx1 = await token.connect(ops).approve(ADDRESSES.OOOWEEESavings, initialDeposit);
  await approveTx1.wait();
  console.log("Approved ✅");

  // Create group: Time lock, destination = ops wallet, "Test Group Fund", targetFiat=0, currency=EUR(1), unlock in 5 min
  console.log("Creating group account...");
  const createTx = await savings.connect(ops).createGroupAccount(
    0,              // Time lock
    ops.address,    // destination wallet
    "Test Group Fund",
    0,              // targetFiat (0 for time lock)
    1,              // EUR
    unlockTime,
    initialDeposit,
    { gasLimit: 500000 }
  );
  console.log("Create tx:", createTx.hash);
  const createReceipt = await createTx.wait();
  console.log("Group created ✅");

  const groupCount = await savings.groupCount();
  const groupId = groupCount.toNumber() - 1;
  console.log("Group ID:", groupId);

  const details = await savings.getGroupDetails(groupId);
  console.log(`  Name: ${details.goalName}`);
  console.log(`  Creator: ${details.creator}`);
  console.log(`  Active: ${details.isActive}`);
  console.log(`  Balance: ${ethers.utils.formatUnits(details.totalBalance, 18)} OOOWEEE`);
  console.log(`  Members: ${details.memberCount.toNumber()}`);
  console.log(`  Unlock: ${new Date(details.unlockTime * 1000).toISOString()}`);

  // ==========================================
  // STEP 3: Deposit more OOOWEEE to group
  // ==========================================
  console.log("\n--- STEP 3: Ops deposits more to group ---");
  const deposit2 = ethers.utils.parseUnits("50000", 18);

  const approveTx2 = await token.connect(ops).approve(ADDRESSES.OOOWEEESavings, deposit2);
  await approveTx2.wait();

  const depositTx = await savings.connect(ops).depositToGroup(groupId, deposit2, { gasLimit: 300000 });
  console.log("Deposit tx:", depositTx.hash);
  await depositTx.wait();
  console.log("Deposited 50,000 OOOWEEE ✅");

  const opsContribution = await savings.getGroupContribution(groupId, ops.address);
  console.log(`Ops total contribution: ${ethers.utils.formatUnits(opsContribution, 18)} OOOWEEE`);

  // ==========================================
  // STEP 4: Invite Bill to group
  // ==========================================
  console.log("\n--- STEP 4: Invite Bill to group ---");
  const inviteTx = await savings.connect(ops).inviteMember(groupId, BILL_ADDRESS, { gasLimit: 200000 });
  console.log("Invite tx:", inviteTx.hash);
  await inviteTx.wait();
  console.log("Bill invited ✅");

  const isInvited = await savings.isGroupInvited(groupId, BILL_ADDRESS);
  console.log("Bill isInvited:", isInvited);

  // ==========================================
  // STEP 5: Send Bill some OOOWEEE
  // ==========================================
  console.log("\n--- STEP 5: Send Bill 200,000 OOOWEEE ---");
  const sendAmount = ethers.utils.parseUnits("200000", 18);
  const sendTx = await token.connect(ops).transfer(BILL_ADDRESS, sendAmount, { gasLimit: 200000 });
  console.log("Transfer tx:", sendTx.hash);
  await sendTx.wait();
  console.log("Sent 200,000 OOOWEEE to Bill ✅");

  const billOooAfter = await token.balanceOf(bill.address);
  console.log(`Bill's OOOWEEE balance: ${ethers.utils.formatUnits(billOooAfter, 18)}`);

  // ==========================================
  // STEP 6: Bill needs ETH for gas - send some
  // ==========================================
  console.log("\n--- STEP 6: Send Bill gas money ---");
  if (billEth.lt(ethers.utils.parseEther("0.01"))) {
    const gasTx = await ops.sendTransaction({
      to: BILL_ADDRESS,
      value: ethers.utils.parseEther("0.05"),
      gasLimit: 21000
    });
    await gasTx.wait();
    console.log("Sent Bill 0.05 ETH for gas ✅");
  } else {
    console.log("Bill already has enough ETH for gas");
  }

  // ==========================================
  // STEP 7: Bill accepts invitation
  // ==========================================
  console.log("\n--- STEP 7: Bill accepts invitation ---");
  const acceptTx = await savings.connect(bill).acceptInvitation(groupId, { gasLimit: 200000 });
  console.log("Accept tx:", acceptTx.hash);
  await acceptTx.wait();
  console.log("Bill accepted invitation ✅");

  const isMember = await savings.isGroupMember(groupId, BILL_ADDRESS);
  console.log("Bill isMember:", isMember);

  const members = await savings.getGroupMembers(groupId);
  console.log("All members:", members);

  // ==========================================
  // STEP 8: Bill deposits OOOWEEE to group
  // ==========================================
  console.log("\n--- STEP 8: Bill deposits 100,000 OOOWEEE ---");
  const billDeposit = ethers.utils.parseUnits("100000", 18);

  const billApproveTx = await token.connect(bill).approve(ADDRESSES.OOOWEEESavings, billDeposit, { gasLimit: 100000 });
  await billApproveTx.wait();
  console.log("Bill approved tokens ✅");

  const billDepositTx = await savings.connect(bill).depositToGroup(groupId, billDeposit, { gasLimit: 300000 });
  console.log("Bill deposit tx:", billDepositTx.hash);
  await billDepositTx.wait();
  console.log("Bill deposited 100,000 OOOWEEE ✅");

  const billContribution = await savings.getGroupContribution(groupId, BILL_ADDRESS);
  console.log(`Bill's contribution: ${ethers.utils.formatUnits(billContribution, 18)} OOOWEEE`);

  // ==========================================
  // STEP 9: Check group status before completion
  // ==========================================
  console.log("\n--- STEP 9: Group status check ---");
  const detailsFinal = await savings.getGroupDetails(groupId);
  console.log(`  Name: ${detailsFinal.goalName}`);
  console.log(`  Active: ${detailsFinal.isActive}`);
  console.log(`  Total Balance: ${ethers.utils.formatUnits(detailsFinal.totalBalance, 18)} OOOWEEE`);
  console.log(`  Members: ${detailsFinal.memberCount.toNumber()}`);
  console.log(`  Unlock Time: ${new Date(detailsFinal.unlockTime * 1000).toISOString()}`);
  console.log(`  Current Time: ${new Date().toISOString()}`);

  const now = Math.floor(Date.now() / 1000);
  const timeLeft = detailsFinal.unlockTime - now;
  if (timeLeft > 0) {
    console.log(`\n⏳ Waiting ${timeLeft} seconds for unlock time...`);
    await new Promise(resolve => setTimeout(resolve, (timeLeft + 10) * 1000));
  }

  // ==========================================
  // STEP 10: Complete/close the group account
  // ==========================================
  console.log("\n--- STEP 10: Complete group account ---");
  const processTx = await savings.connect(ops).processGroupAccount(groupId, { gasLimit: 500000 });
  console.log("Process tx:", processTx.hash);
  await processTx.wait();
  console.log("Group account completed! 🎉");

  const detailsDone = await savings.getGroupDetails(groupId);
  console.log(`  Active: ${detailsDone.isActive}`);
  console.log(`  Final Balance: ${ethers.utils.formatUnits(detailsDone.totalBalance, 18)} OOOWEEE`);

  // Final balances
  const opsOooFinal = await token.balanceOf(ops.address);
  const billOooFinal = await token.balanceOf(bill.address);
  console.log(`\n=== Final Balances ===`);
  console.log(`Ops  OOOWEEE: ${ethers.utils.formatUnits(opsOooFinal, 18)}`);
  console.log(`Bill OOOWEEE: ${ethers.utils.formatUnits(billOooFinal, 18)}`);
  console.log("\n✅ Full group savings flow test complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error.message || error);
    if (error.reason) console.error("Reason:", error.reason);
    process.exit(1);
  });
