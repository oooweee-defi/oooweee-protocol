// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

/**
 * @title OOOWEEEStability
 * @notice L1 stability mechanism — suppresses price spikes to protect savers
 * @dev Uses Chainlink Automation for periodic checks, deterministic capture rates,
 *      and a time-weighted baseline that allows gradual organic growth while blocking pumps.
 *
 * How it works:
 * 1. Chainlink Automation calls checkUpkeep() every block (off-chain, free)
 * 2. If price is >10% above the weighted baseline, checkUpkeep returns true
 * 3. Chainlink calls performUpkeep() on-chain (gas paid from LINK balance)
 * 4. Contract sells tokens from 80M reserve into Uniswap, pushing price back down
 * 5. ETH captured from the swap is sent to ValidatorFund
 * 6. Capture rate scales with spike severity: 60% for small spikes, 85% for large
 *
 * The baseline drifts upward over time, allowing sustainable price growth.
 * A 20% spike gets 70% captured. A 50% spike gets 85% captured.
 * The rules are public and deterministic — no randomness to manipulate.
 */
contract OOOWEEEStability is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable, AutomationCompatibleInterface {
    IERC20 public oooweeeToken;
    IUniswapV2Router02 public uniswapRouter;
    IUniswapV2Pair public liquidityPair;

    address public validatorFundWallet;

    // ============ Baseline (Time-Weighted) ============

    uint256 public baselinePrice;
    uint256 public baselineTimestamp;

    // Smoothing: 80% old price, 20% new price after intervention
    uint256 public constant BASELINE_SMOOTHING = 80;
    // Baseline drifts to current price over this period if no intervention
    uint256 public constant BASELINE_DECAY_PERIOD = 48 hours;

    // Rate-of-change limit after full baseline decay
    uint256 public decayedBaselinePrice;
    uint256 public decayedBaselineTimestamp;
    uint256 public constant MAX_BASELINE_DRIFT_PER_HOUR = 5; // 5% per hour max drift

    // ============ Deterministic Capture Rates ============
    //
    // Bigger spikes get more aggressively captured.
    // The only way to reduce your capture rate is to spike the price less,
    // which is exactly what we want.

    uint256 public constant CAPTURE_LOW = 60;       // 10-19% spike → capture 60%
    uint256 public constant CAPTURE_MEDIUM = 70;    // 20-29% spike → capture 70%
    uint256 public constant CAPTURE_HIGH = 75;      // 30-49% spike → capture 75%
    uint256 public constant CAPTURE_CRITICAL = 85;  // 50%+ spike   → capture 85%

    // ============ Thresholds ============

    uint256 public constant INTERVENTION_THRESHOLD = 10;   // 10% above baseline
    uint256 public constant HIGH_VOLATILITY_THRESHOLD = 30;

    // ============ Circuit Breakers ============

    uint256 public constant MAX_DAILY_INTERVENTIONS = 10;
    uint256 public constant MAX_DAILY_TOKEN_USE = 5_000_000 * 10**18;  // 5M tokens/day
    uint256 public constant MAX_SELL_PERCENT = 5;  // Max 5% of reserves per intervention
    uint256 public constant MEASUREMENT_WINDOW = 24 hours;
    uint256 public constant SLIPPAGE_TOLERANCE = 500; // 5%

    // ============ Daily Tracking ============

    uint256 public interventionsToday;
    uint256 public tokensUsedToday;
    uint256 public lastDayReset;

    // ============ Statistics ============

    uint256 public totalInterventions;
    uint256 public totalTokensUsed;
    uint256 public totalETHCaptured;
    uint256 public totalETHSentToValidators;
    uint256 public lastInterventionPrice;

    // ============ State ============

    bool public circuitBreakerTripped;
    bool public systemChecksEnabled;

    // Chainlink Automation registry (restrict performUpkeep caller)
    address public chainlinkRegistry;

    struct MarketState {
        bool highVolatilityMode;
        uint256 lastSpikeBlock;
        uint256 consecutiveSpikes;
    }
    MarketState public market;

    // Intervention history (ring buffer)
    struct InterventionRecord {
        uint64 timestamp;
        uint256 priceBefore;
        uint256 priceAfter;
        uint256 tokensInjected;
        uint256 ethCaptured;
    }
    InterventionRecord[] public interventionHistory;
    uint256 public constant MAX_HISTORY = 50;
    uint256 public historyIndex;

    // ============ Events ============

    event StabilityIntervention(
        uint256 tokensInjected,
        uint256 ethCaptured,
        uint256 priceBefore,
        uint256 priceAfter,
        uint256 captureRate
    );
    event BaselineUpdated(uint256 oldBaseline, uint256 newBaseline);
    event CircuitBreakerTripped(string reason, uint256 timestamp);
    event CircuitBreakerReset(uint256 timestamp);
    event SystemCheck(uint256 blockNumber, uint256 currentPrice, uint256 priceIncrease, bool intervened);
    event DailyLimitsReset(uint256 timestamp);
    event ETHSentToValidators(uint256 amount, uint256 timestamp);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _oooweeeToken,
        address _uniswapRouter,
        address _validatorFund
    ) public initializer {
        require(_oooweeeToken != address(0), "Invalid token");
        require(_uniswapRouter != address(0), "Invalid router");
        require(_validatorFund != address(0), "Invalid fund");

        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        oooweeeToken = IERC20(_oooweeeToken);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        validatorFundWallet = _validatorFund;
        lastDayReset = block.timestamp;
        systemChecksEnabled = true;
    }

    receive() external payable {}

    // ============ Chainlink Automation ============

    /**
     * @notice Called off-chain by Chainlink nodes every block — zero gas cost
     * @dev Returns true if the price spike exceeds threshold and intervention is needed
     */
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        if (!systemChecksEnabled) return (false, "");
        if (circuitBreakerTripped) return (false, "");
        if (address(liquidityPair) == address(0)) return (false, "");

        uint256 currentPrice = getCurrentPrice();
        if (currentPrice == 0) return (false, "");

        // Check if daily limits need resetting
        bool needsReset = block.timestamp >= lastDayReset + MEASUREMENT_WINDOW;

        // Calculate spike against time-weighted baseline
        uint256 effectiveBaseline = _getEffectiveBaseline();
        uint256 priceIncrease = _calculatePriceIncreaseFrom(currentPrice, effectiveBaseline);

        bool needsIntervention = _shouldIntervene(priceIncrease);

        upkeepNeeded = needsReset || needsIntervention;
        performData = abi.encode(currentPrice, priceIncrease, needsReset);
    }

    /**
     * @notice Called on-chain by Chainlink when checkUpkeep returns true
     * @dev Gas paid from your LINK upkeep balance. Re-validates everything on-chain.
     */
    function performUpkeep(bytes calldata /* performData */) external override nonReentrant {
        // Optionally restrict to Chainlink registry
        if (chainlinkRegistry != address(0)) {
            require(msg.sender == chainlinkRegistry, "Only Chainlink");
        }
        require(systemChecksEnabled, "Checks disabled");

        _checkAndResetDailyLimits();

        uint256 currentPrice = getCurrentPrice();
        if (currentPrice == 0) return;

        uint256 effectiveBaseline = _getEffectiveBaseline();
        _updateDecayedBaseline();

        uint256 priceIncrease = _calculatePriceIncreaseFrom(currentPrice, effectiveBaseline);

        bool intervened = false;
        if (_shouldIntervene(priceIncrease)) {
            _executeStabilityIntervention(currentPrice, priceIncrease);
            intervened = true;
        }

        _updateMarketConditions(priceIncrease);

        emit SystemCheck(block.number, currentPrice, priceIncrease, intervened);
    }

    // ============ Manual Check (anyone can trigger) ============

    /**
     * @notice Anyone can trigger a stability check by paying 0.01 ETH
     * @dev Useful if Chainlink is down or as a community safety valve
     */
    function manualStabilityCheck() external payable nonReentrant {
        require(msg.value >= 0.01 ether, "Min 0.01 ETH required");
        require(systemChecksEnabled, "Checks disabled");

        _checkAndResetDailyLimits();

        uint256 currentPrice = getCurrentPrice();
        require(currentPrice > 0, "Cannot get price");

        uint256 effectiveBaseline = _getEffectiveBaseline();
        _updateDecayedBaseline();

        uint256 priceIncrease = _calculatePriceIncreaseFrom(currentPrice, effectiveBaseline);
        bool intervened = false;

        if (_shouldIntervene(priceIncrease)) {
            _executeStabilityIntervention(currentPrice, priceIncrease);
            intervened = true;
        }

        _updateMarketConditions(priceIncrease);
        emit SystemCheck(block.number, currentPrice, priceIncrease, intervened);

        // Refund excess ETH — AUDIT FIX L-6 NEW: use call instead of transfer (2300 gas limit)
        if (msg.value > 0.01 ether) {
            (bool refundSuccess,) = payable(msg.sender).call{value: msg.value - 0.01 ether}("");
            require(refundSuccess, "Refund failed");
        }
    }

    // ============ Baseline ============

    /**
     * @notice Get the effective baseline price, accounting for time decay
     * @dev If no intervention has happened for BASELINE_DECAY_PERIOD, the baseline
     *      drifts toward current price but is capped at a maximum drift rate
     *      of MAX_BASELINE_DRIFT_PER_HOUR to prevent slow-pump-then-spike attacks.
     *
     *      Within the decay period, time-weighted linear interpolation is used
     *      to gradually blend toward the current price.
     *
     *      Example: Price doubles over 3 months with no spikes. The baseline
     *      gradually follows it up. No interventions triggered.
     *      Then someone pumps 20% in an hour — that triggers intervention
     *      because the spike is relative to the current (drifted) baseline.
     */
    function _getEffectiveBaseline() internal view returns (uint256) {
        if (baselinePrice == 0) return 0;

        uint256 currentPrice = getCurrentPrice();
        if (currentPrice == 0) return baselinePrice;

        uint256 elapsed = block.timestamp - baselineTimestamp;
        if (elapsed >= BASELINE_DECAY_PERIOD) {
            // Baseline fully decayed — cap drift rate to prevent slow-pump attacks.
            // Use the price at decay completion as anchor.
            uint256 anchor = decayedBaselinePrice > 0 ? decayedBaselinePrice : baselinePrice;
            uint256 anchorTime = decayedBaselineTimestamp > 0
                ? decayedBaselineTimestamp
                : baselineTimestamp + BASELINE_DECAY_PERIOD;

            uint256 hoursSinceAnchor = (block.timestamp - anchorTime) / 1 hours;
            if (hoursSinceAnchor == 0) hoursSinceAnchor = 1;

            // Max allowed baseline = anchor * (1 + maxRate * hours)
            uint256 maxAllowed = anchor + (anchor * MAX_BASELINE_DRIFT_PER_HOUR * hoursSinceAnchor) / 100;

            if (currentPrice <= maxAllowed) {
                return currentPrice;
            }
            return maxAllowed;
        }

        // Time-weighted linear interpolation toward current price
        uint256 weight = (elapsed * 100) / BASELINE_DECAY_PERIOD;
        return (baselinePrice * (100 - weight) + currentPrice * weight) / 100;
    }

    /**
     * @notice Record the price when full baseline decay is first detected
     * @dev Called from performUpkeep and manualStabilityCheck. Captures
     *      the anchor point for rate-of-change limiting.
     */
    function _updateDecayedBaseline() internal {
        if (baselinePrice > 0 &&
            block.timestamp - baselineTimestamp >= BASELINE_DECAY_PERIOD &&
            decayedBaselinePrice == 0) {
            decayedBaselinePrice = getCurrentPrice();
            decayedBaselineTimestamp = block.timestamp;
        }
    }

    /**
     * @notice Update baseline using weighted smoothing after intervention
     * @dev 80% old baseline + 20% new price. This allows the baseline to
     *      ratchet upward gradually with sustained demand.
     */
    function _updateBaseline(uint256 newPrice) internal {
        uint256 oldBaseline = baselinePrice;

        if (baselinePrice == 0) {
            baselinePrice = newPrice;
        } else {
            baselinePrice = (baselinePrice * BASELINE_SMOOTHING + newPrice * (100 - BASELINE_SMOOTHING)) / 100;
        }

        baselineTimestamp = block.timestamp;

        // Reset decay tracking since we just did an intervention
        decayedBaselinePrice = 0;
        decayedBaselineTimestamp = 0;

        emit BaselineUpdated(oldBaseline, baselinePrice);
    }

    // ============ Deterministic Capture Rates ============

    /**
     * @notice Get capture rate based on spike severity
     * @dev Deterministic — no randomness. The rules are public:
     *      - 10-19% spike: 60% captured
     *      - 20-29% spike: 70% captured
     *      - 30-49% spike: 75% captured
     *      - 50%+ spike:   85% captured
     *
     *      The only way to get a lower capture rate is to spike less.
     *      That's exactly the behaviour we want to incentivise.
     */
    function _getCaptureRate(uint256 priceIncreasePercent) internal pure returns (uint256) {
        if (priceIncreasePercent >= 50) return CAPTURE_CRITICAL;  // 85%
        if (priceIncreasePercent >= 30) return CAPTURE_HIGH;      // 75%
        if (priceIncreasePercent >= 20) return CAPTURE_MEDIUM;    // 70%
        return CAPTURE_LOW;                                        // 60%
    }

    // ============ Core Intervention Logic ============

    function _checkAndResetDailyLimits() internal {
        if (block.timestamp >= lastDayReset + MEASUREMENT_WINDOW) {
            interventionsToday = 0;
            tokensUsedToday = 0;
            lastDayReset = block.timestamp;

            if (circuitBreakerTripped) {
                circuitBreakerTripped = false;
                emit CircuitBreakerReset(block.timestamp);
            }

            emit DailyLimitsReset(block.timestamp);
        }
    }

    function _calculatePriceIncreaseFrom(uint256 currentPrice, uint256 baseline) internal pure returns (uint256) {
        if (baseline == 0 || currentPrice <= baseline) return 0;
        return ((currentPrice - baseline) * 100) / baseline;
    }

    function _updateMarketConditions(uint256 priceIncrease) internal {
        if (priceIncrease >= HIGH_VOLATILITY_THRESHOLD) {
            market.consecutiveSpikes++;
        } else {
            market.consecutiveSpikes = 0;
        }
        market.highVolatilityMode = priceIncrease >= HIGH_VOLATILITY_THRESHOLD;
    }

    function _shouldIntervene(uint256 priceIncreasePercent) internal view returns (bool) {
        if (priceIncreasePercent == 0) return false;
        if (circuitBreakerTripped) return false;
        if (!systemChecksEnabled) return false;
        if (tokensUsedToday >= MAX_DAILY_TOKEN_USE) return false;
        if (interventionsToday >= MAX_DAILY_INTERVENTIONS) return false;

        uint256 threshold = INTERVENTION_THRESHOLD; // 10%

        // Lower threshold by 20% during volatile periods
        if (market.highVolatilityMode) {
            threshold = (threshold * 80) / 100; // 8%
        }

        return priceIncreasePercent >= threshold;
    }

    /**
     * @notice Execute stability intervention using AMM math
     * @dev Calculates exact tokens needed to reduce spike by captureRate%,
     *      sells them into Uniswap, sends captured ETH to ValidatorFund
     */
    function _executeStabilityIntervention(
        uint256 currentPrice,
        uint256 priceIncreasePercent
    ) internal {
        // Circuit breaker check
        if (interventionsToday >= MAX_DAILY_INTERVENTIONS) {
            circuitBreakerTripped = true;
            emit CircuitBreakerTripped("Max daily interventions", block.timestamp);
            return;
        }

        uint256 tokenBalance = oooweeeToken.balanceOf(address(this));
        if (tokenBalance == 0) return;

        // Deterministic capture rate based on spike severity
        uint256 captureRate = _getCaptureRate(priceIncreasePercent);

        // Calculate tokens to sell using AMM constant product math
        uint256 tokensToSell = _calculateTokensForSpikeReduction(currentPrice, captureRate);
        if (tokensToSell == 0) return;

        // Cap at 5% of reserves per intervention
        uint256 maxSell = (tokenBalance * MAX_SELL_PERCENT) / 100;
        if (tokensToSell > maxSell) {
            tokensToSell = maxSell;
        }

        // Check daily token limit
        if (tokensUsedToday + tokensToSell > MAX_DAILY_TOKEN_USE) {
            tokensToSell = MAX_DAILY_TOKEN_USE - tokensUsedToday;
            if (tokensToSell == 0) {
                circuitBreakerTripped = true;
                emit CircuitBreakerTripped("Max daily token use", block.timestamp);
                return;
            }
        }

        // Execute swap on Uniswap
        uint256 ethCaptured = _swapTokensForETH(tokensToSell);

        // Update tracking
        totalInterventions++;
        interventionsToday++;
        totalTokensUsed += tokensToSell;
        tokensUsedToday += tokensToSell;
        totalETHCaptured += ethCaptured;
        lastInterventionPrice = currentPrice;
        market.lastSpikeBlock = block.number;

        // Send captured ETH to ValidatorFund
        if (ethCaptured > 0 && validatorFundWallet != address(0)) {
            (bool success,) = payable(validatorFundWallet).call{value: ethCaptured}("");
            if (success) {
                totalETHSentToValidators += ethCaptured;
                emit ETHSentToValidators(ethCaptured, block.timestamp);
            }
        }

        uint256 newPrice = getCurrentPrice();

        emit StabilityIntervention(
            tokensToSell,
            ethCaptured,
            currentPrice,
            newPrice,
            captureRate
        );

        _recordIntervention(currentPrice, newPrice, tokensToSell, ethCaptured);

        // Update baseline using weighted smoothing (gradual shift, not instant reset)
        if (newPrice > 0) {
            _updateBaseline(newPrice);
        }
    }

    /**
     * @notice Calculate tokens needed to reduce price spike by captureRate%
     * @dev Uses Uniswap V2 constant product formula: k = x * y
     *
     * Given:
     * - spike = currentPrice - effectiveBaseline
     * - targetReduction = spike * captureRate / 100
     * - targetPrice = currentPrice - targetReduction
     *
     * For Uniswap V2:
     * - k = reserveToken * reserveETH (constant)
     * - targetPrice = k / targetReserveToken²
     * - targetReserveToken = sqrt(k / targetPrice)
     * - tokensToSell = targetReserveToken - currentReserveToken
     *
     * Uses Math.mulDiv for overflow-safe multiplication and Math.sqrt
     * for the square root. Accounts for Uniswap V2's 0.3% swap fee.
     */
    function _calculateTokensForSpikeReduction(
        uint256 currentPrice,
        uint256 captureRate
    ) internal view returns (uint256) {
        if (address(liquidityPair) == address(0)) return 0;

        uint256 effectiveBaseline = _getEffectiveBaseline();
        if (effectiveBaseline == 0 || currentPrice <= effectiveBaseline) return 0;

        (uint112 reserve0, uint112 reserve1,) = liquidityPair.getReserves();
        if (reserve0 == 0 || reserve1 == 0) return 0;

        address token0 = liquidityPair.token0();
        uint256 reserveToken;
        uint256 reserveETH;

        if (token0 == address(oooweeeToken)) {
            reserveToken = uint256(reserve0);
            reserveETH = uint256(reserve1);
        } else {
            reserveToken = uint256(reserve1);
            reserveETH = uint256(reserve0);
        }

        // Calculate target price after spike reduction
        uint256 spike = currentPrice - effectiveBaseline;
        uint256 targetReduction = (spike * captureRate) / 100;
        uint256 targetPrice = currentPrice - targetReduction;

        // Sanity: don't push below baseline
        if (targetPrice < effectiveBaseline) {
            targetPrice = effectiveBaseline;
        }

        // Constant product: k = reserveToken * reserveETH
        // targetReserveToken = sqrt(k * 1e18 / targetPrice)
        // Use Math.mulDiv for overflow-safe (reserveToken * reserveETH * 1e18) / targetPrice
        uint256 targetReserveTokenSquared = Math.mulDiv(reserveToken * reserveETH, 1e18, targetPrice);
        uint256 targetReserveToken = Math.sqrt(targetReserveTokenSquared);

        if (targetReserveToken <= reserveToken) return 0;

        uint256 tokensNeeded = targetReserveToken - reserveToken;

        // Account for Uniswap V2 0.3% fee: actual output is 99.7% of ideal.
        // Sell slightly more tokens to compensate and hit the target capture rate.
        tokensNeeded = (tokensNeeded * 1000) / 997;

        return tokensNeeded;
    }

    function _recordIntervention(
        uint256 priceBefore,
        uint256 priceAfter,
        uint256 tokensInjected,
        uint256 ethCaptured
    ) internal {
        InterventionRecord memory record = InterventionRecord({
            timestamp: uint64(block.timestamp),
            priceBefore: priceBefore,
            priceAfter: priceAfter,
            tokensInjected: tokensInjected,
            ethCaptured: ethCaptured
        });

        if (interventionHistory.length < MAX_HISTORY) {
            interventionHistory.push(record);
        } else {
            interventionHistory[historyIndex] = record;
            historyIndex = (historyIndex + 1) % MAX_HISTORY;
        }
    }

    function _swapTokensForETH(uint256 tokenAmount) internal returns (uint256) {
        if (tokenAmount == 0) return 0;

        oooweeeToken.approve(address(uniswapRouter), tokenAmount);

        address[] memory path = new address[](2);
        path[0] = address(oooweeeToken);
        path[1] = uniswapRouter.WETH();

        uint256 initialETHBalance = address(this).balance;

        uint256[] memory amounts = uniswapRouter.getAmountsOut(tokenAmount, path);
        uint256 minETH = (amounts[1] * (10000 - SLIPPAGE_TOLERANCE)) / 10000;

        uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            minETH,
            path,
            address(this),
            block.timestamp + 300
        );

        return address(this).balance - initialETHBalance;
    }

    // ============ View Functions ============

    function getCurrentPrice() public view returns (uint256) {
        if (address(liquidityPair) == address(0)) return 0;

        (uint112 reserve0, uint112 reserve1,) = liquidityPair.getReserves();
        if (reserve0 == 0 || reserve1 == 0) return 0;

        address token0 = liquidityPair.token0();

        if (token0 == address(oooweeeToken)) {
            return (uint256(reserve1) * 1e18) / uint256(reserve0);
        } else {
            return (uint256(reserve0) * 1e18) / uint256(reserve1);
        }
    }

    function getEffectiveBaseline() external view returns (uint256) {
        return _getEffectiveBaseline();
    }

    function getStabilityStatus() external view returns (
        uint256 currentPrice,
        uint256 baseline,
        uint256 effectiveBaseline,
        uint256 priceIncrease,
        bool needsIntervention,
        uint256 captureRate,
        uint256 remainingInterventions,
        uint256 remainingTokens
    ) {
        currentPrice = getCurrentPrice();
        baseline = baselinePrice;
        effectiveBaseline = _getEffectiveBaseline();
        priceIncrease = _calculatePriceIncreaseFrom(currentPrice, effectiveBaseline);
        needsIntervention = _shouldIntervene(priceIncrease);
        captureRate = priceIncrease > 0 ? _getCaptureRate(priceIncrease) : 0;
        remainingInterventions = interventionsToday >= MAX_DAILY_INTERVENTIONS
            ? 0
            : MAX_DAILY_INTERVENTIONS - interventionsToday;
        remainingTokens = tokensUsedToday >= MAX_DAILY_TOKEN_USE
            ? 0
            : MAX_DAILY_TOKEN_USE - tokensUsedToday;
    }

    function getStabilityInfo() external view returns (
        uint256 currentPrice,
        uint256 tokenBalance,
        uint256 totalInterventionsCount,
        uint256 totalTokensSold,
        uint256 totalETHEarned,
        uint256 totalETHToValidators,
        uint256 baseline,
        uint256 priceIncrease
    ) {
        currentPrice = getCurrentPrice();
        uint256 effectiveBaseline = _getEffectiveBaseline();
        tokenBalance = oooweeeToken.balanceOf(address(this));
        totalInterventionsCount = totalInterventions;
        totalTokensSold = totalTokensUsed;
        totalETHEarned = totalETHCaptured;
        totalETHToValidators = totalETHSentToValidators;
        baseline = effectiveBaseline;
        priceIncrease = _calculatePriceIncreaseFrom(currentPrice, effectiveBaseline);
    }

    function getCircuitBreakerStatus() external view returns (
        bool tripped,
        uint256 dailyInterventions,
        uint256 dailyTokensUsed,
        uint256 remainingInterventions,
        uint256 remainingTokens
    ) {
        tripped = circuitBreakerTripped;
        dailyInterventions = interventionsToday;
        dailyTokensUsed = tokensUsedToday;
        remainingInterventions = interventionsToday >= MAX_DAILY_INTERVENTIONS
            ? 0
            : MAX_DAILY_INTERVENTIONS - interventionsToday;
        remainingTokens = tokensUsedToday >= MAX_DAILY_TOKEN_USE
            ? 0
            : MAX_DAILY_TOKEN_USE - tokensUsedToday;
    }

    function getMarketConditions() external view returns (
        bool highVolatility,
        uint256 blocksSinceLastSpike,
        uint256 dailyInterventionCount,
        uint256 consecutiveSpikes
    ) {
        highVolatility = market.highVolatilityMode;
        blocksSinceLastSpike = market.lastSpikeBlock > 0 ? block.number - market.lastSpikeBlock : 0;
        dailyInterventionCount = interventionsToday;
        consecutiveSpikes = market.consecutiveSpikes;
    }

    function getTokenBalance() external view returns (uint256) {
        return oooweeeToken.balanceOf(address(this));
    }

    function getInterventionHistory() external view returns (InterventionRecord[] memory) {
        uint256 len = interventionHistory.length;
        InterventionRecord[] memory ordered = new InterventionRecord[](len);

        if (len < MAX_HISTORY) {
            // Array not yet full — already in chronological order
            for (uint256 i = 0; i < len; i++) {
                ordered[i] = interventionHistory[i];
            }
        } else {
            // Ring buffer — reorder from oldest to newest
            for (uint256 i = 0; i < len; i++) {
                ordered[i] = interventionHistory[(historyIndex + i) % MAX_HISTORY];
            }
        }
        return ordered;
    }

    function getRecentInterventions(uint256 count) external view returns (InterventionRecord[] memory) {
        uint256 len = interventionHistory.length;
        if (count > len) count = len;
        InterventionRecord[] memory recent = new InterventionRecord[](count);

        if (len < MAX_HISTORY) {
            // Array not yet full — simple tail read
            for (uint256 i = 0; i < count; i++) {
                recent[i] = interventionHistory[len - count + i];
            }
        } else {
            // Ring buffer — read backwards from most recent entry
            for (uint256 i = 0; i < count; i++) {
                uint256 idx = (historyIndex + MAX_HISTORY - count + i) % MAX_HISTORY;
                recent[i] = interventionHistory[idx];
            }
        }
        return recent;
    }

    function needsDailyReset() public view returns (bool) {
        return block.timestamp >= lastDayReset + MEASUREMENT_WINDOW;
    }

    // ============ Admin Functions ============

    function setLiquidityPair(address _pair) external onlyOwner {
        require(_pair != address(0), "Invalid pair");
        liquidityPair = IUniswapV2Pair(_pair);
    }

    function setValidatorFund(address _fund) external onlyOwner {
        require(_fund != address(0), "Invalid fund");
        validatorFundWallet = _fund;
    }

    function setChainlinkRegistry(address _registry) external onlyOwner {
        chainlinkRegistry = _registry;
    }

    /**
     * @notice Initialise baseline at current market price
     * @dev Call once after liquidity pool is created and trading is live
     */
    function initialiseBaseline() external onlyOwner {
        uint256 currentPrice = getCurrentPrice();
        require(currentPrice > 0, "Cannot get price");
        require(baselinePrice == 0, "Already initialised");

        baselinePrice = currentPrice;
        baselineTimestamp = block.timestamp;
        emit BaselineUpdated(0, baselinePrice);
    }

    /**
     * @notice Force baseline update (emergency only)
     */
    function forceBaselineUpdate() external onlyOwner {
        uint256 currentPrice = getCurrentPrice();
        require(currentPrice > 0, "Cannot get price");

        uint256 oldBaseline = baselinePrice;
        baselinePrice = currentPrice;
        baselineTimestamp = block.timestamp;

        // Reset decay tracking
        decayedBaselinePrice = 0;
        decayedBaselineTimestamp = 0;

        emit BaselineUpdated(oldBaseline, baselinePrice);
    }

    function resetCircuitBreaker() external onlyOwner {
        circuitBreakerTripped = false;
        emit CircuitBreakerReset(block.timestamp);
    }

    function setChecksEnabled(bool _enabled) external onlyOwner {
        systemChecksEnabled = _enabled;
    }

    function forceDailyReset() external onlyOwner {
        require(block.timestamp >= lastDayReset + MEASUREMENT_WINDOW, "Reset not needed yet");
        interventionsToday = 0;
        tokensUsedToday = 0;
        lastDayReset = block.timestamp;
        if (circuitBreakerTripped) {
            circuitBreakerTripped = false;
            emit CircuitBreakerReset(block.timestamp);
        }
        emit DailyLimitsReset(block.timestamp);
    }

    /**
     * @notice Recover tokens to operations wallet (for contract upgrades)
     */
    function emergencyRecoverTokens() external onlyOwner {
        uint256 balance = oooweeeToken.balanceOf(address(this));
        require(balance > 0, "No tokens to recover");
        oooweeeToken.transfer(owner(), balance);
    }

    /**
     * @notice Recover stuck ETH
     */
    function emergencyWithdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH");
        // AUDIT FIX L-3 R2: Use call instead of transfer (2300 gas limit fails for multisig)
        (bool success,) = payable(owner()).call{value: balance}("");
        require(success, "ETH transfer failed");
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function renounceOwnership() public virtual override {
        revert("Renounce disabled");
    }

    uint256[50] private __gap;
}
