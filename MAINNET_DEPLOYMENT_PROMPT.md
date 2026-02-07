# OOOWEEE Protocol — Mainnet Deployment Prompt

Use this prompt with Claude Code to deploy the OOOWEEE Protocol to Ethereum Mainnet. All contracts have been tested on Sepolia and are ready for production.

---

## Context

The OOOWEEE Protocol is a DeFi savings platform with 6 UUPS upgradeable proxy contracts. It has been fully deployed and tested on Sepolia (testnet). The codebase is at the current repo and all contracts are in `contracts/contracts/`. Deploy scripts exist in `contracts/scripts/` and were used for Sepolia — they need to be adapted for mainnet.

### Sepolia Deployment (Reference)
- OOOWEEEToken: `0xcbA9cDe50239cB7D89fc7a14b320184a48212dB8`
- SavingsPriceOracle: `0xAD8F21a0EE1611acaD347038F41f8af1f7dC497D`
- OOOWEEESavings: `0x0B09f4b01563198519b97da0d94f65f8231A0c6a`
- OOOWEEEValidatorFund: `0x5a584D73a1599A30173493088c50c7d6b50298eb`
- OOOWEEEStability: `0x9767D758d0bC527bEA0F712b6691Bac384b8Fd8f`
- DonorRegistry: `0x639553e621bE1b1aD927FA841a91cfA72e131C46`

---

## Task

Deploy the full OOOWEEE Protocol to Ethereum Mainnet. Follow the exact same process as Sepolia but with mainnet addresses and parameters.

### Pre-Deployment Checklist

Before running any scripts, verify:
1. **Deployer wallet** has sufficient ETH (~0.15 ETH for gas + liquidity ETH amount)
2. **Deployer wallet** has LINK tokens for Chainlink Automation (~5-10 LINK recommended)
3. **Private key** is set in `contracts/.env` as `PRIVATE_KEY`
4. **Mainnet RPC URL** is set in `contracts/.env` as `MAINNET_RPC_URL`
5. **Etherscan API key** is set in `contracts/.env` as `ETHERSCAN_API_KEY`
6. Add mainnet network to `hardhat.config.js`:
   ```js
   mainnet: {
     url: process.env.MAINNET_RPC_URL,
     accounts: [process.env.PRIVATE_KEY],
     chainId: 1,
   }
   ```

### Wallet Addresses (Confirm Before Deploy)
- **Operations Wallet**: [TO BE CONFIRMED — ideally a multisig like Gnosis Safe]
- **Founder Wallet**: `0x56384f1205659291ba5b949d641582af6ae7006b` [CONFIRM if same for mainnet]

---

## Step 1: Deploy All 6 Proxy Contracts

Deploy in this exact order using `upgrades.deployProxy(..., { kind: "uups" })`:

| # | Contract | Initialize Args |
|---|---|---|
| 1 | OOOWEEEToken | `(FOUNDER_WALLET, OPERATIONS_WALLET)` |
| 2 | SavingsPriceOracle | `(UNISWAP_ROUTER)` |
| 3 | OOOWEEESavings | `(token.address, oracle.address)` |
| 4 | OOOWEEEValidatorFund | `(UNISWAP_ROUTER, OPERATIONS_WALLET)` |
| 5 | OOOWEEEStability | `(token.address, UNISWAP_ROUTER, validatorFund.address)` |
| 6 | DonorRegistry | `()` — no args |

Token supply is fixed at 100M: 10M founder, 10M liquidity (to deployer), 80M stability reserve (held by token contract).

### External Addresses for Mainnet

| Dependency | Sepolia Address | **Mainnet Address** |
|---|---|---|
| Uniswap V2 Router | `0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3` | **`0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`** |
| Chainlink ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | **`0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`** |
| Chainlink EUR/USD | (used ETH/USD as placeholder) | **`0xb49f677943BC038e9857d61E7d053CaA2C1734C1`** |
| Chainlink GBP/USD | (used ETH/USD as placeholder) | **`0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5`** |
| LINK Token | `0x779877A7B0D9E8603169DdbD7836e478b4624789` | **`0x514910771AF9Ca656af840dff83E8264EcF986CA`** |
| Chainlink Automation Registry | `0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad` | **Look up current v2.1 mainnet address** |
| Chainlink Automation Registrar | `0xb0E49c5D0d05cbc241d68c05BC5BA1d1B7B72976` | **Look up current v2.1 mainnet address** |

---

## Step 2: Cross-Contract Wiring

Execute these transactions in order after all proxies are deployed:

```
// 2a. Token exemptions
token.setExemption(savings.address, true)
token.setExemption(validatorFund.address, true)
token.setExemption(stability.address, true)

// 2b. Transfer 80M stability reserve (ONE-TIME, IRREVERSIBLE)
token.setStabilityMechanism(stability.address)

// 2c. ValidatorFund wiring
validatorFund.setContracts(token.address, savings.address)
validatorFund.setStabilityContract(stability.address)

// 2d. Savings rewards distributor
savings.setRewardsDistributor(validatorFund.address)

// 2e. Oracle price feeds (use ACTUAL mainnet feeds, not placeholders)
oracle.setPriceFeed(0, MAINNET_ETH_USD_FEED)   // USD
oracle.setPriceFeed(1, MAINNET_EUR_USD_FEED)   // EUR
oracle.setPriceFeed(2, MAINNET_GBP_USD_FEED)   // GBP

// 2f. Oracle default prices (calibrate to expected launch price)
oracle.setDefaultPrice(0, 10)    // $0.001 — adjust based on actual launch price
oracle.setDefaultPrice(1, 9)     // €0.0009
oracle.setDefaultPrice(2, 8)     // £0.0008
oracle.setEmergencyFixedRate(0, 10)
oracle.setEmergencyFixedRate(1, 9)
oracle.setEmergencyFixedRate(2, 8)
```

---

## Step 3: Add Liquidity on Uniswap V2

This establishes the trading pair and sets the initial price.

```
// 3a. Approve router to spend 10M OOOWEEE
token.approve(UNISWAP_ROUTER, 10_000_000e18)

// 3b. Add liquidity (ADJUST ETH AMOUNT FOR TARGET PRICE)
router.addLiquidityETH(
    token.address,
    10_000_000e18,           // 10M OOOWEEE
    9_500_000e18,            // 5% slippage min
    ethAmount * 95 / 100,    // 5% slippage min
    deployer.address,        // LP tokens to deployer
    deadline,                // 20 min from now
    { value: TARGET_ETH }    // ← SET THIS: determines initial price
)
// Price = TARGET_ETH / 10,000,000
// Example: 5 ETH → price of 0.0000005 ETH per OOOWEEE
// Example: 10 ETH → price of 0.000001 ETH per OOOWEEE

// 3c. Wire the pair address
const pairAddress = await factory.getPair(token.address, WETH)
oracle.setOooweeePool(pairAddress)
stability.setLiquidityPair(pairAddress)
token.setLiquidityPair(pairAddress, true)

// 3d. Enable trading (ONE-TIME)
token.enableTrading()

// 3e. Initialize stability baseline (ONE-TIME, captures current price)
stability.initialiseBaseline()
```

**IMPORTANT**: Consider locking or burning LP tokens for mainnet to build trust.

---

## Step 4: Upgrade Savings to V2 (Group Savings + Auto-Unlock)

```
// 4a. Upgrade proxy implementation
upgrades.upgradeProxy(savings.address, OOOWEEESavingsV2)

// 4b. Initialize V2 features
savings.initializeV2(20)   // maxAutoProcessBatch = 20
```

---

## Step 5: Chainlink Automation Setup (Savings Auto-Unlock Only)

We only register the Savings auto-unlock upkeep. Stability monitoring is handled by the email monitor + manual intervention (cost-effective for early days).

```
// 5a. Approve LINK
link.approve(AUTOMATION_REGISTRAR, 5e18)   // 5 LINK (more than testnet!)

// 5b. Register Savings Auto-Unlock upkeep
registrar.registerUpkeep({
    name: "OOOWEEE Savings Auto-Unlock",
    upkeepContract: savings.address,
    gasLimit: 800000,
    adminAddress: deployer.address,
    triggerType: 0,          // Conditional
    checkData: "0x",
    triggerConfig: "0x",
    offchainConfig: "0x",
    amount: 5e18             // 5 LINK initial funding
})

// 5c. Set automation registry on savings
savings.setAutomationRegistry(AUTOMATION_REGISTRY)
```

**NOTE**: Do NOT register Stability for Chainlink automation. The email monitor handles this.

---

## Step 6: Update Frontend

Update `frontend/oooweee-app/src/contracts/abis.js`:

```js
export const CONTRACT_ADDRESSES = {
  OOOWEEEToken: "NEW_MAINNET_TOKEN_ADDRESS",
  OOOWEEESavings: "NEW_MAINNET_SAVINGS_ADDRESS",
  OOOWEEEValidatorFund: "NEW_MAINNET_VF_ADDRESS",
  OOOWEEEStability: "NEW_MAINNET_STABILITY_ADDRESS",
  SavingsPriceOracle: "NEW_MAINNET_ORACLE_ADDRESS",
  DonorRegistry: "NEW_MAINNET_DONOR_ADDRESS",
  UniswapPair: "NEW_MAINNET_PAIR_ADDRESS"
};
```

Also update any RPC/chain references in the frontend from Sepolia (chainId 11155111) to Mainnet (chainId 1).

---

## Step 7: Update Monitor

Update `contracts/scripts/monitor.js` ADDRESSES object with new mainnet addresses.

Update GitHub repo secrets:
- `SEPOLIA_RPC_URL` → rename or add `MAINNET_RPC_URL` with a mainnet RPC endpoint
- `ALERT_EMAIL_TO` / `ALERT_EMAIL_FROM` / `ALERT_EMAIL_PASS` — keep same

Update `.github/workflows/monitor.yml` to use the mainnet RPC URL.

---

## Step 8: Verify All Contracts on Etherscan

```bash
npx hardhat verify --network mainnet IMPLEMENTATION_ADDRESS
```

For each proxy, verify the implementation contract address (read from EIP-1967 storage slot).

---

## Step 9: Post-Deploy Verification

Run these checks to confirm everything is wired correctly:

```
stability.oooweeeToken() == token.address ✓
stability.uniswapRouter() == MAINNET_ROUTER ✓
stability.validatorFundWallet() == validatorFund.address ✓
stability.liquidityPair() == pair.address ✓
stability.systemChecksEnabled() == true ✓
stability.baselinePrice() != 0 ✓

validatorFund.oooweeeToken() == token.address ✓
validatorFund.savingsContract() == savings.address ✓
validatorFund.stabilityContract() == stability.address ✓

savings.tokenAddress() == token.address ✓
savings.rewardsDistributor() == validatorFund.address ✓
savings.automationRegistry() == MAINNET_REGISTRY ✓

token.tradingEnabled() == true ✓
token.stabilityMechanism() == stability.address ✓
token.isExempt(savings) == true ✓
token.isExempt(validatorFund) == true ✓
token.isExempt(stability) == true ✓

oracle.oooweeePool() == pair.address ✓
```

---

## Known Issues from Sepolia to Fix Before Mainnet

1. **ValidatorFund implementation is outdated** — deployed implementation is missing `failedSwapETH` field and retry logic that exists in source code. **Upgrade the ValidatorFund proxy** after deploy to get the latest implementation:
   ```
   upgrades.upgradeProxy(validatorFund.address, OOOWEEEValidatorFund)
   ```

2. **Stability gas usage** — `performUpkeep` uses ~600k gas. The 800k gasLimit is correct but monitor gas prices during high congestion.

3. **Oracle placeholder feeds** — On Sepolia, EUR/USD and GBP/USD feeds used the ETH/USD feed as a placeholder. Mainnet MUST use the actual separate feeds listed above.

---

## Cost Estimates

| Item | Estimated Cost |
|---|---|
| Deploy 6 implementations + 6 proxies | ~0.045-0.06 ETH |
| Wiring transactions (~15 txs) | ~0.015-0.02 ETH |
| Add liquidity | ~0.005 ETH gas + TARGET_ETH for liquidity |
| V2 upgrade + init | ~0.005 ETH |
| Chainlink registration | ~0.003 ETH gas + 5 LINK |
| **Total gas** | **~0.08-0.1 ETH + liquidity ETH + 5 LINK** |

Monthly operations:
| Item | Estimated Cost |
|---|---|
| Chainlink Savings Auto-Unlock | ~2-10 LINK/month |
| Email monitor (GitHub Actions) | $0 |
| Manual stability interventions | ~0.01-0.05 ETH per intervention |

---

## Security Reminders

- [ ] Use a **hardware wallet** for the deployer/owner
- [ ] Consider transferring ownership to a **multisig** (Gnosis Safe) after deploy
- [ ] **Lock or burn LP tokens** to prevent rug-pull perception
- [ ] **Do NOT share private keys** in any files committed to git
- [ ] Run the verification script (Step 9) before announcing launch
- [ ] **Rotate the Gmail App Password** if it was ever exposed
- [ ] Keep the `.env` file in `.gitignore` (already is)
