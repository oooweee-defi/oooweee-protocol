# OOOWEEE L1 Architecture & Deployment Guide

## Contract Overview (5 contracts, all on Ethereum L1)

```
OOOWEEEToken
│  100M supply: 10M founder, 10M liquidity, 80M stability
│
├── 10M sent to operations wallet → paired with ETH on Uniswap V2
│
└── 80M sent to OOOWEEEStability
       │
       │  Chainlink Automation calls checkUpkeep() every block (free)
       │  When price spike detected → performUpkeep() sells tokens (gas from LINK)
       │  Captured ETH sent to ↓
       │
       OOOWEEEValidatorFund
       │
       │  Accumulates ETH from stability + donations
       │  At 32 ETH → owner provisions validator
       │  Validator withdrawal address = this contract
       │
       │  When validator rewards arrive:
       │  ├── 33% → operations wallet (ETH)
       │  ├── 33% → stays in fund (more validators)
       │  └── 34% → swap to OOOWEEE → OOOWEEESavings
       │
       OOOWEEESavings
       │  Users deposit OOOWEEE, set fiat targets
       │  User calls manualWithdraw() when target hit (self-paid gas)
       │  Rewards auto-compound into balances
       │
       SavingsPriceOracle
          Chainlink ETH/USD + Uniswap reserves → OOOWEEE/USD price
```

## What Changed from L2 Version

| Component | L2 Version | L1 Version |
|-----------|-----------|------------|
| Contracts | 7 (split across L1+L2) | 5 (all L1) |
| ValidatorFund | L2, bridged ETH to L1 | L1 native, no bridging |
| ValidatorCollector | Separate L1 contract | Merged into ValidatorFund |
| RewardsDistribution | L2, received from L1 bridge | Merged into ValidatorFund |
| Stability automation | Custom sequencer sidecar | Chainlink Automation |
| Stability capture rate | Random 60-80% | Deterministic by severity |
| Stability baseline | Instant reset after intervention | EMA with time decay |
| Savings withdrawal | Auto-check on deposit/claim | User-initiated manualWithdraw() |
| Infrastructure | AX102 server, op-geth, op-node, etc. | None — just contracts |

## Deployment Order

### Step 1: Deploy SavingsPriceOracle
```
Constructor args:
  _uniswapRouter: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D (Uniswap V2 mainnet)

After deploy, configure:
  setPriceFeed(USD, 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419)  // Chainlink ETH/USD
  setPriceFeed(EUR, 0xb49f677943BC038e9857d61E7d053CaA2C1734C1)  // Chainlink EUR/USD
  setPriceFeed(GBP, 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5)  // Chainlink GBP/USD
```

### Step 2: Deploy OOOWEEEToken
```
Constructor args:
  _founderWallet: YOUR_FOUNDER_ADDRESS
  _operationsWallet: YOUR_OPS_ADDRESS

10M minted to founder, 10M to operations, 80M held in token contract
```

### Step 3: Deploy OOOWEEEValidatorFund
```
Constructor args:
  _uniswapRouter: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
  _operationsWallet: YOUR_OPS_ADDRESS

After deploy, configure:
  setContracts(TOKEN_ADDRESS, SAVINGS_ADDRESS)  // after savings deployed
  setStabilityContract(STABILITY_ADDRESS)        // after stability deployed
```

### Step 4: Deploy OOOWEEEStability
```
Constructor args:
  _oooweeeToken: TOKEN_ADDRESS
  _uniswapRouter: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
  _validatorFund: VALIDATOR_FUND_ADDRESS

After deploy, configure:
  setLiquidityPair(UNISWAP_PAIR_ADDRESS)  // after LP created
  setChainlinkRegistry(CHAINLINK_REGISTRY) // after automation registered
```

### Step 5: Deploy OOOWEEESavings
```
Constructor args:
  _tokenAddress: TOKEN_ADDRESS
  _priceOracle: ORACLE_ADDRESS

After deploy, configure:
  setRewardsDistributor(VALIDATOR_FUND_ADDRESS)
  setFeeCollector(YOUR_FEE_ADDRESS)
```

### Step 6: Wire Everything Together
```
// Transfer 80M stability reserve
OOOWEEEToken.setStabilityMechanism(STABILITY_ADDRESS)

// Set cross-references
OOOWEEEValidatorFund.setContracts(TOKEN_ADDRESS, SAVINGS_ADDRESS)
OOOWEEEValidatorFund.setStabilityContract(STABILITY_ADDRESS)

// Set oracle pool
SavingsPriceOracle.setOooweeePool(UNISWAP_PAIR_ADDRESS)
```

### Step 7: Create Uniswap Liquidity
```
// From operations wallet:
// 1. Approve Uniswap Router to spend 10M OOOWEEE
// 2. Add liquidity: 10M OOOWEEE + X ETH
//    - 10 ETH = $0.0025 starting price
//    - 20 ETH = $0.005 starting price
// 3. Note the pair address for configuration
```

### Step 8: Initialise & Enable
```
OOOWEEEStability.initialiseBaseline()  // Sets baseline to current price
OOOWEEEToken.enableTrading()            // Opens public trading
```

### Step 9: Register Chainlink Automation
```
1. Go to automation.chain.link
2. Register new upkeep:
   - Trigger: Custom logic
   - Target: STABILITY_ADDRESS
   - Gas limit: 500000
   - Fund with LINK (start with 10-20 LINK)
3. Save the registry address
4. Call: OOOWEEEStability.setChainlinkRegistry(REGISTRY_ADDRESS)
```

## Ongoing Operations

### Weekly
- Call ValidatorFund.distributeRewards() to split accumulated validator rewards
- Check Chainlink Automation LINK balance, top up if needed

### At 32 ETH Threshold
- Call ValidatorFund.provisionValidator() to release 32 ETH
- Set up validator node with withdrawal address = ValidatorFund contract
- Call ValidatorFund.confirmValidatorActive() once beacon chain confirms

### Monitoring
- Watch Etherscan for StabilityIntervention events
- Monitor circuit breaker status via getCircuitBreakerStatus()
- Track validator fund progress via progressToNextValidator()

## Gas Cost Summary

| Operation | Who Pays | Est. Gas | Est. Cost (30 gwei) |
|-----------|----------|----------|---------------------|
| Stability intervention | Your LINK balance | ~370k | ~$2.80 |
| No intervention needed | Nobody (off-chain) | 0 | $0 |
| Create savings account | User | ~200k | ~$1.50 |
| Deposit to account | User | ~80k | ~$0.60 |
| Manual withdraw | User | ~150k | ~$1.13 |
| Claim rewards | User | ~100k | ~$0.75 |
| Distribute rewards | You (owner) | ~250k | ~$1.88 |
| Provision validator | You (owner) | ~50k | ~$0.38 |
