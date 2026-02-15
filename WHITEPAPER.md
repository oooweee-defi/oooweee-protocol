# OOOWEEE Protocol Whitepaper

**A DeFi Savings Protocol with Built-In Price Stability**

Version 1.0 — February 2026

Website: [https://oooweee.io](https://oooweee.io)
GitHub: [https://github.com/oooweee-defi/oooweee-protocol](https://github.com/oooweee-defi/oooweee-protocol)
Contact: support@oooweee.io

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Problem Statement](#2-problem-statement)
3. [Protocol Overview](#3-protocol-overview)
4. [The OOOWEEE Token](#4-the-oooweee-token)
5. [Goal-Based Savings Accounts](#5-goal-based-savings-accounts)
6. [Group Savings](#6-group-savings)
7. [Price Stability Mechanism](#7-price-stability-mechanism)
8. [Validator Fund & Staking Yield](#8-validator-fund--staking-yield)
9. [Price Oracle System](#9-price-oracle-system)
10. [Fee Structure](#10-fee-structure)
11. [Rewards Distribution](#11-rewards-distribution)
12. [Automation & Auto-Unlock](#12-automation--auto-unlock)
13. [Security & Auditing](#13-security--auditing)
14. [Smart Contract Architecture](#14-smart-contract-architecture)
15. [Deployed Contracts](#15-deployed-contracts)
16. [Roadmap](#16-roadmap)
17. [Team](#17-team)

---

## 1. Abstract

OOOWEEE is a decentralised savings protocol deployed on Ethereum that enables users to create goal-based savings accounts denominated in fiat currencies (USD, EUR, GBP). The protocol introduces a novel price stability mechanism that suppresses speculative price spikes, redirecting captured value into Ethereum validator staking. Staking rewards are then distributed back to savers, creating a sustainable yield loop that does not rely on inflation or unsustainable emissions.

The protocol is designed around a simple premise: cryptocurrency savings should behave more like traditional savings accounts — with predictable value growth, clear goals, and protection from volatility — while retaining the transparency, self-custody, and permissionless access of DeFi.

---

## 2. Problem Statement

Existing DeFi savings and yield protocols face several challenges that limit mainstream adoption:

**Price Volatility**: Most DeFi tokens are subject to speculative pumps and dumps. Users who deposit tokens into savings are exposed to sudden price swings that can wipe out months of progress toward a savings goal.

**Unsustainable Yield**: Many yield protocols rely on token emissions (inflation) or complex leverage strategies that are unsustainable long-term. When the emissions end or strategies unwind, yields collapse.

**Fiat Disconnect**: Users think in fiat currencies — dollars, euros, pounds. Most DeFi protocols operate entirely in token-denominated terms, making it difficult for everyday users to set and track real-world savings goals.

**Complexity**: DeFi savings products typically require users to understand liquidity pools, impermanent loss, farming strategies, and complex tokenomics. This creates a barrier to entry for non-technical users.

OOOWEEE addresses these problems through an integrated protocol that combines goal-based savings, automated price stability, fiat-denominated tracking via Chainlink oracles, and real yield from Ethereum validator staking.

---

## 3. Protocol Overview

The OOOWEEE Protocol consists of six interconnected smart contracts deployed on Ethereum mainnet:

| Contract | Purpose |
|---|---|
| **OOOWEEEToken** | ERC-20 token with fixed 100M supply |
| **OOOWEEESavings** | Goal-based savings accounts (individual and group) |
| **OOOWEEEStability** | Automated price spike suppression mechanism |
| **OOOWEEEValidatorFund** | ETH accumulation and validator staking management |
| **SavingsPriceOracle** | Chainlink + Uniswap price feeds for fiat conversion |
| **DonorRegistry** | Tracks community donations to the validator fund |

These contracts form a closed-loop economic system:

1. Users deposit OOOWEEE tokens into savings accounts with fiat-denominated goals
2. The stability mechanism suppresses price spikes, capturing ETH from sell-side interventions
3. Captured ETH flows to the Validator Fund, which provisions Ethereum validators
4. Validator staking rewards are split three ways: operations, more validators, and saver rewards
5. Saver rewards are swapped to OOOWEEE tokens and distributed proportionally to depositors

---

## 4. The OOOWEEE Token

**Contract**: `OOOWEEEToken.sol`
**Standard**: ERC-20 (OpenZeppelin, UUPS Upgradeable)
**Name**: OOOWEEE
**Symbol**: OOOWEEE
**Total Supply**: 100,000,000 (fixed, no minting capability)
**Decimals**: 18

### 4.1 Token Distribution

| Allocation | Amount | Percentage | Purpose |
|---|---|---|---|
| Stability Reserve | 80,000,000 | 80% | Held by the Stability contract for price interventions |
| Founder | 10,000,000 | 10% | Team allocation — lockup with scheduled tranche sales |
| Operations | 9,000,000 | 9% | Operational costs, sold privately to bootstrap first validators |
| Initial Liquidity | 1,000,000 | 1% | Paired with ETH on Uniswap V2 to establish trading |

### 4.2 Design Principles

- **Fixed Supply**: No minting function exists. The 100M cap is immutable.
- **Zero Transfer Tax**: There are no buy or sell taxes on token transfers. Fees are only collected at the savings contract level.
- **Trading Controls**: Trading can be enabled by the owner (one-time, irreversible). Before trading is enabled, only exempt addresses (protocol contracts, founder, operations) can transfer tokens.
- **Ownership Safeguard**: The `renounceOwnership()` function is disabled to prevent accidental loss of upgrade authority.

### 4.3 Stability Reserve

80% of the total supply is transferred to the OOOWEEEStability contract at deployment. This reserve is the primary tool for price stability interventions. It is not circulating supply — tokens only enter circulation when the stability mechanism sells them to suppress price spikes, and the ETH captured from those sales funds Ethereum validators.

### 4.4 Operations Allocation

9% of the supply is allocated to the operations wallet to cover protocol running costs and to be sold privately to bootstrap the first Ethereum validators. This allocation funds the initial infrastructure needed to begin generating staking yield for savers.

### 4.5 Initial Liquidity

1% of the supply (1,000,000 tokens) was paired with ETH on Uniswap V2 to establish the initial trading pair and provide market liquidity at launch.

---

## 5. Goal-Based Savings Accounts

**Contract**: `OOOWEEESavings.sol`

The savings contract allows users to create individual savings accounts with specific goals and conditions. Each account locks OOOWEEE tokens until the goal condition is met.

### 5.1 Account Types

#### Time Account
- Tokens are locked until a specified future date
- The user sets an unlock timestamp at creation
- Once the unlock time passes, the user (or Chainlink Automation) can withdraw
- Maximum lock duration: 100 years

#### Growth Account
- Tokens are locked until they reach a target fiat value
- The user sets a target amount in USD, EUR, or GBP
- The account unlocks when the oracle-reported value of the deposited tokens meets or exceeds the target
- Tokens are returned to the account owner upon completion

#### Balance Account
- Similar to Growth, but with a designated recipient
- When the fiat target is reached (plus a 1% buffer), the target amount is transferred to the recipient
- Any remainder above the target is returned to the account owner
- Useful for gifting, bill payments, or directed savings

### 5.2 Fiat-Denominated Goals

All account types can display values in USD, EUR, or GBP. Growth and Balance accounts use fiat-denominated targets, meaning the unlock condition is based on the real-world value of the tokens, not just the token quantity. This is powered by the SavingsPriceOracle, which combines Chainlink price feeds with Uniswap V2 pool data.

### 5.3 Deposits

Users can make additional deposits into active accounts at any time. Each deposit incurs a small fee (see [Fee Structure](#10-fee-structure)), with the remainder added to the account balance. Deposits are tracked separately from rewards to ensure clean accounting.

---

## 6. Group Savings

The protocol supports collaborative savings through group accounts, enabling multiple users to pool funds toward a shared goal.

### 6.1 How Group Savings Work

1. A creator opens a group account, setting the goal type (Time, Growth, or Balance), target, and a destination wallet
2. The creator invites members by wallet address
3. Invited members accept the invitation and can then deposit tokens
4. Each member's contributions are tracked individually
5. When the goal condition is met, the creator or admin processes the account, sending funds (minus fees) to the destination wallet

### 6.2 Group Cancellation

Groups include safety mechanisms for cancellation:

- **Sole creator**: Can cancel immediately if they are the only member
- **Multi-member groups**: The creator can cancel after a timeout period (1 year past unlock time for Time accounts, 2 years past creation for others)
- **Admin**: The protocol owner can cancel any group at any time as a safety measure

On cancellation, contributions are returned proportionally to each member.

### 6.3 Reward Isolation

Group deposits are excluded from the individual reward pool (`totalDepositedBalance`) to prevent dilution of individual saver rewards. Group accounts do not earn staking rewards.

---

## 7. Price Stability Mechanism

**Contract**: `OOOWEEEStability.sol`

The stability mechanism is the core innovation of the OOOWEEE Protocol. It suppresses speculative price spikes to protect savers from volatility, while converting the captured value into productive Ethereum validator stakes.

### 7.1 How It Works

1. The system continuously monitors the OOOWEEE/ETH price on Uniswap V2
2. A time-weighted baseline price tracks the organic market value
3. When the current price exceeds the baseline by more than 10%, the system intervenes
4. The mechanism sells tokens from the 80M stability reserve into the Uniswap pool
5. This pushes the price back down toward the baseline
6. The ETH captured from the sale is sent to the Validator Fund

### 7.2 Deterministic Capture Rates

The capture rate — how much of a spike is suppressed — scales with severity:

| Spike Severity | Capture Rate |
|---|---|
| 10–19% above baseline | 60% |
| 20–29% above baseline | 70% |
| 30–49% above baseline | 75% |
| 50%+ above baseline | 85% |

These rates are deterministic and publicly visible in the smart contract. There is no randomness — the only way to reduce the capture rate is to spike the price less, which is exactly the behaviour the protocol incentivises.

### 7.3 Time-Weighted Baseline

The baseline is not a fixed price — it drifts upward over time to accommodate organic growth:

- After each intervention, the baseline is updated using weighted smoothing (80% old baseline + 20% new price)
- If no intervention occurs for 48 hours, the baseline gradually decays toward the current market price
- A maximum drift rate of 5% per hour prevents slow-pump-then-spike attacks
- This means sustainable, gradual price increases are permitted, while sudden spikes are captured

### 7.4 Circuit Breakers

The system includes safety limits to prevent excessive interventions:

- **Maximum 10 interventions per 24-hour period**
- **Maximum 5,000,000 tokens sold per 24-hour period**
- **Maximum 5% of remaining reserves per single intervention**
- Circuit breakers automatically reset every 24 hours

### 7.5 Triggering

Stability checks can be triggered in two ways:

1. **Chainlink Automation**: Off-chain monitoring checks every block (zero gas cost), triggering on-chain intervention only when needed
2. **Manual check**: Anyone can trigger a stability check by sending 0.01 ETH, acting as a community safety valve

### 7.6 Token Swap Mechanics

The contract uses Uniswap V2's constant product formula to calculate the exact number of tokens needed to reduce a spike by the target capture rate. This includes compensation for the 0.3% Uniswap swap fee and a 5% slippage tolerance.

---

## 8. Validator Fund & Staking Yield

**Contract**: `OOOWEEEValidatorFund.sol`

The Validator Fund accumulates ETH from stability interventions and community donations, using it to provision Ethereum validators that generate sustainable yield for the protocol.

### 8.1 ETH Sources

- **Stability interventions**: ETH captured when the stability mechanism sells tokens into price spikes
- **Community donations**: Anyone can contribute ETH via the `donate()` function

### 8.2 Validator Provisioning

When the fund accumulates 4 ETH (the Rocketpool megapool minimum), the protocol owner can provision a new validator:

1. 4 ETH is released to the operations wallet
2. The operations wallet deposits into a Rocketpool megapool validator
3. The validator's withdrawal address is set to the Validator Fund contract
4. Validator consensus-layer rewards flow back to the contract as plain ETH transfers

### 8.3 Reward Distribution (33/33/34 Split)

When validator rewards accumulate, the owner calls `distributeRewards()` to split them:

| Share | Percentage | Destination |
|---|---|---|
| Operations | 33% | Sent as ETH to the operations wallet for running costs |
| Validators | 33% | Remains in the fund, accumulating toward more validators |
| Savers | 34% | Swapped to OOOWEEE tokens on Uniswap, sent to the Savings contract |

The savers' share creates a sustainable yield loop: ETH from staking rewards is swapped for OOOWEEE on the open market and distributed proportionally to all active individual savings accounts.

### 8.4 Compounding Effect

The 33% validator share stays in the fund, compounding over time. As more validators are provisioned, more rewards flow in, accelerating the provisioning of additional validators. This creates an expanding base of productive assets backing the protocol.

---

## 9. Price Oracle System

**Contract**: `SavingsPriceOracle.sol`

The oracle provides accurate OOOWEEE prices in USD, EUR, and GBP by combining on-chain data from two sources.

### 9.1 Price Calculation

For USD:
```
OOOWEEE/USD = OOOWEEE/ETH (Uniswap V2 reserves) × ETH/USD (Chainlink)
```

For EUR and GBP (cross-rate):
```
OOOWEEE/EUR = OOOWEEE/USD ÷ EUR/USD (Chainlink)
OOOWEEE/GBP = OOOWEEE/USD ÷ GBP/USD (Chainlink)
```

### 9.2 Chainlink Feeds (Mainnet)

| Feed | Address | Heartbeat |
|---|---|---|
| ETH/USD | `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419` | 1 hour |
| EUR/USD | `0xb49f677943BC038e9857d61E7d053CaA2C1734C1` | 24 hours |
| GBP/USD | `0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5` | 24 hours |

### 9.3 TWAP Protection

For withdrawal validation, the oracle uses a Time-Weighted Average Price (TWAP) calculated from Uniswap V2's built-in cumulative price accumulators over a 30-minute window. When the spot price and TWAP diverge by more than 10%, the TWAP is used instead of the spot price. This prevents flash loan attacks from artificially inflating token value to trigger premature withdrawals.

### 9.4 Fallback Hierarchy

The oracle uses a multi-tier fallback system:

1. **Primary**: Chainlink + Uniswap spot price
2. **Fallback**: Emergency fixed rates (set by admin)
3. **Emergency**: Last valid cached price (within 24 hours)
4. **Final fallback**: Hardcoded minimum value

---

## 10. Fee Structure

The protocol charges two types of fees, both capped at a maximum of 5%:

| Fee Type | Rate | Applied When |
|---|---|---|
| Creation/Deposit Fee | 1% | When creating an account or making a deposit |
| Withdrawal Fee | 1% | When withdrawing from a completed account |

Fees are collected in OOOWEEE tokens and sent to the designated fee collector address. There are no transfer taxes, no buy/sell taxes, and no hidden fees. The fee rates can be adjusted by the owner but cannot exceed 5%.

---

## 11. Rewards Distribution

Rewards are distributed to individual savings accounts proportionally based on their deposited balance.

### 11.1 Mechanism

- A global `rewardPerToken` accumulator tracks the cumulative rewards per deposited token
- When rewards arrive from the Validator Fund, `rewardPerToken` increases by `rewards / totalDepositedBalance`
- Each account's earned rewards are calculated as `balance × (currentRewardPerToken − lastCheckpoint)`
- Rewards are tracked separately from deposits and never merge into the account balance
- A solvency check ensures earned rewards never exceed the contract's available token balance

### 11.2 Claiming

Rewards can be claimed at any time through:
- Claiming for a single account
- Batch claiming for up to 20 accounts per transaction
- Automatic claiming during withdrawals

---

## 12. Automation & Auto-Unlock

The savings contract integrates with Chainlink Automation to automatically process matured accounts.

### 12.1 How It Works

1. Chainlink nodes call `checkUpkeep()` off-chain every block (zero gas cost)
2. If any accounts have met their withdrawal conditions, `checkUpkeep` returns the list
3. Chainlink calls `performUpkeep()` on-chain to process up to 20 matured accounts per batch
4. Time accounts are auto-unlocked when the timestamp passes
5. Growth and Balance accounts are auto-processed when their fiat targets are reached

### 12.2 Public Processing

Anyone can also call `processMaturedAccounts()` to trigger auto-unlock without Chainlink, ensuring the system works even if automation is temporarily unavailable.

---

## 13. Security & Auditing

### 13.1 Smart Contract Security

All contracts use established security patterns:

- **UUPS Upgradeable Proxies**: All six contracts use OpenZeppelin's UUPS proxy pattern, allowing bug fixes while maintaining state
- **ReentrancyGuard**: All state-changing functions that transfer tokens are protected against reentrancy attacks
- **Ownership Controls**: Critical functions are restricted to the contract owner. `renounceOwnership()` is disabled on all contracts to prevent accidental lockout
- **Storage Gaps**: All contracts include 50-slot storage gaps for safe future upgrades

### 13.2 Audit Fixes Implemented

The codebase incorporates fixes for multiple audit findings:

- **C-1**: Reward checkpoint at account creation prevents first-depositor reward theft
- **C-2**: Clean separation of deposits and rewards prevents double-counting during withdrawals
- **H-1**: View functions used during creation checks prevent state-change side effects
- **H-2**: Group account processing restricted to creator/owner with TWAP-validated pricing
- **M-1**: Consistent fee application across individual and group deposits
- **M-2**: Group deposits excluded from reward calculations to prevent dilution
- **M-3**: Group cancellation with proportional refunds and solvency-aware reward calculations
- **L-6**: `renounceOwnership()` disabled to protect upgradeability

### 13.3 TWAP Validation

All withdrawal condition checks for fiat-denominated accounts use TWAP-validated prices rather than spot prices, preventing flash loan manipulation of the Uniswap pool to trigger premature withdrawals.

---

## 14. Smart Contract Architecture

All contracts are deployed as UUPS upgradeable proxies behind ERC-1967 proxy contracts.

```
User
 │
 ├──► OOOWEEEToken (ERC-20)
 │       └── 80M reserve ──► OOOWEEEStability
 │                               │
 │                               │ sells tokens into Uniswap on spikes
 │                               │ sends captured ETH ▼
 │                               │
 ├──► OOOWEEESavings ◄────── OOOWEEEValidatorFund
 │       │                       │
 │       │ deposits/withdraws    │ provisions validators
 │       │ earns rewards         │ distributes rewards (33/33/34)
 │       │                       │
 │       └── SavingsPriceOracle  └── Rocketpool Megapool Validators
 │               │
 │               ├── Chainlink ETH/USD
 │               ├── Chainlink EUR/USD
 │               ├── Chainlink GBP/USD
 │               └── Uniswap V2 OOOWEEE/ETH Pool
 │
 └──► DonorRegistry (tracks community donations)
```

### 14.1 Contract Interactions

| From | To | Interaction |
|---|---|---|
| User | Token | Transfer, approve |
| User | Savings | Create accounts, deposit, withdraw |
| User | ValidatorFund | Donate ETH |
| Stability | Uniswap | Sell tokens for ETH during interventions |
| Stability | ValidatorFund | Send captured ETH |
| ValidatorFund | Uniswap | Swap ETH for OOOWEEE (savers' share) |
| ValidatorFund | Savings | Send reward tokens via `receiveRewards()` |
| Savings | Oracle | Query fiat-denominated prices |
| Chainlink Automation | Savings | Auto-unlock matured accounts |

---

## 15. Deployed Contracts

### Ethereum Mainnet (Chain ID: 1)

| Contract | Address |
|---|---|
| OOOWEEEToken | `0xFb46B3eED3590eE5049bCbDA084D5582f2c14D35` |
| SavingsPriceOracle | `0x0C7b62E985D3Fb2c930a545C32D23d3920961354` |
| OOOWEEESavings | `0x6D95790b279045FeAC6DEde30600B7E3890d2018` |
| OOOWEEEValidatorFund | `0xFC67Cb8e45408690029fEd391BD23861C46C92F2` |
| OOOWEEEStability | `0x3797B40625db2eE5dB78E6C7757D701d28865890` |
| DonorRegistry | `0xF726DA5DE29469DC73a1d75ebc8BAd0d3C92AAB2` |
| Uniswap V2 Pair | `0x5Ad308657372C25Ae5C4F75140b3811F3314b8a4` |

### External Dependencies

| Dependency | Address |
|---|---|
| Uniswap V2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |
| Chainlink ETH/USD | `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419` |
| Chainlink EUR/USD | `0xb49f677943BC038e9857d61E7d053CaA2C1734C1` |
| Chainlink GBP/USD | `0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5` |

All contracts are verified on Etherscan. Source code is open source at [https://github.com/oooweee-defi/oooweee-protocol](https://github.com/oooweee-defi/oooweee-protocol).

Deployed: February 11, 2026

---

## 16. Roadmap

### Phase 1 — Foundation (Complete)
- Smart contract development and testing (Sepolia testnet)
- Security audit and remediation
- Mainnet deployment
- Web application launch at oooweee.io
- Uniswap V2 liquidity establishment

### Phase 2 — Growth
- Chainlink Automation for savings auto-unlock
- First Ethereum validator provisioned via Rocketpool
- Community donation programme
- Etherscan token information and branding
- Fiat on/off ramp integration

### Phase 3 — Expansion
- Additional fiat currency support
- Mobile-optimised experience
- Multi-validator staking infrastructure

### Phase 4 — Maturity
- Cross-chain expansion
- Institutional savings products

---

## 17. Team

**Ryan Heapes** — Founder & Developer

---

## Disclaimer

This document is for informational purposes only and does not constitute financial advice. OOOWEEE is an experimental DeFi protocol. Users should conduct their own research and understand the risks before interacting with any smart contracts. The protocol's smart contracts are upgradeable, meaning the owner retains the ability to modify contract logic. All code is open source and verifiable on Etherscan.

---

*OOOWEEE Protocol — Saving, Stabilised.*
