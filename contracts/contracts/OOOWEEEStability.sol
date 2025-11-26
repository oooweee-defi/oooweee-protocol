// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

/**
 * @title OOOWEEEStability
 * @notice Stability mechanism that removes 60-80% of price spikes using AMM math
 */
contract OOOWEEEStability is Ownable, ReentrancyGuard {
    IERC20 public immutable oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    IUniswapV2Pair public liquidityPair;
    
    address public validatorFundWallet;
    address public systemAddress;
    
    // Baseline tracking
    uint256 public baselinePrice;
    uint256 public baselineTimestamp;
    
    // Capture rate configuration (60-80% of spike to remove)
    uint256 private baseCaptureRate;
    uint256 private captureRange;
    
    // Thresholds
    uint256 public constant INTERVENTION_THRESHOLD = 10;  // 10% above baseline triggers intervention
    uint256 public constant CRITICAL_THRESHOLD = 50;      // 50% for urgent intervention
    uint256 public constant HIGH_VOLATILITY_THRESHOLD = 30;
    uint256 public constant BASELINE_UPDATE_THRESHOLD = 115; // Update baseline if within 15% of previous
    
    // Circuit breakers
    uint256 public constant MAX_DAILY_INTERVENTIONS = 10;
    uint256 public constant MAX_DAILY_TOKEN_USE = 5_000_000 * 10**18;  // 5M tokens per day max
    uint256 public constant MAX_SELL_PERCENT = 5;  // Max 5% of reserves per intervention
    uint256 public constant MEASUREMENT_WINDOW = 24 hours;
    uint256 public constant SLIPPAGE_TOLERANCE = 500; // 5%
    
    // Daily tracking
    uint256 public interventionsToday;
    uint256 public tokensUsedToday;
    uint256 public lastDayReset;
    
    // Statistics
    uint256 public totalInterventions;
    uint256 public totalTokensUsed;
    uint256 public totalETHCaptured;
    uint256 public totalETHSentToValidators;
    uint256 public lastInterventionPrice;
    
    // Circuit breaker state
    bool public circuitBreakerTripped;
    bool public checksEnabled = true;
    
    // Market conditions
    struct MarketState {
        bool highVolatilityMode;
        uint256 lastSpikeBlock;
        uint256 consecutiveSpikes;
    }
    MarketState public market;
    
    // Intervention history
    struct InterventionRecord {
        uint64 timestamp;
        uint256 priceBefore;
        uint256 priceAfter;
        uint256 tokensInjected;
        uint256 ethCaptured;
        bool systemTriggered;
    }
    InterventionRecord[] public interventionHistory;
    uint256 public constant MAX_HISTORY = 50;
    
    // Events
    event StabilityIntervention(
        uint256 tokensInjected,
        uint256 ethCaptured,
        uint256 priceBefore,
        uint256 priceAfter,
        bool systemTriggered
    );
    event BaselineUpdated(uint256 oldBaseline, uint256 newBaseline);
    event CircuitBreakerTripped(string reason, uint256 timestamp);
    event CircuitBreakerReset(uint256 timestamp);
    event SystemCheck(uint256 blockNumber, uint256 currentPrice, uint256 priceIncrease, bool intervened);
    event DailyLimitsReset(uint256 timestamp);
    event ETHSentToValidators(uint256 amount, uint256 timestamp);
    event ForceDailyReset(uint256 timestamp, address triggeredBy);
    event TargetPriceCalculated(uint256 currentPrice, uint256 baselinePrice, uint256 targetPrice, uint256 tokensToSell);
    
    constructor(
        address _oooweeeToken,
        address _uniswapRouter,
        address _validatorFund
    ) {
        oooweeeToken = IERC20(_oooweeeToken);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        validatorFundWallet = _validatorFund;
        
        baseCaptureRate = 60;    // 60% minimum spike removal
        captureRange = 20;       // Up to 80% (60 + 20)
        
        lastDayReset = block.timestamp;
    }
    
    receive() external payable {}
    
    // ============ Core Functions ============
    
    /**
     * @notice Manual stability check (anyone can trigger by paying 0.01 ETH)
     */
    function manualStabilityCheck() external payable nonReentrant {
        require(msg.value >= 0.01 ether, "Min 0.01 ETH required");
        require(checksEnabled, "Checks disabled");
        
        _checkAndResetDailyLimits();
        
        uint256 currentPrice = getCurrentPrice();
        require(currentPrice > 0, "Cannot get price");
        
        uint256 priceIncrease = _calculatePriceIncrease(currentPrice);
        bool intervened = false;
        
        if (_shouldIntervene(priceIncrease)) {
            _executeStabilityIntervention(currentPrice, priceIncrease, false);
            intervened = true;
        }
        
        _updateMarketConditions(priceIncrease);
        
        emit SystemCheck(block.number, currentPrice, priceIncrease, intervened);
        
        // Refund excess ETH
        if (msg.value > 0.01 ether) {
            payable(msg.sender).transfer(msg.value - 0.01 ether);
        }
    }
    
    /**
     * @notice System-triggered stability check (automated keeper)
     */
    function systemStabilityCheck() external nonReentrant {
        require(msg.sender == systemAddress, "Only system");
        require(checksEnabled, "Checks disabled");
        
        _checkAndResetDailyLimits();
        
        uint256 currentPrice = getCurrentPrice();
        if (currentPrice == 0) return;
        
        uint256 priceIncrease = _calculatePriceIncrease(currentPrice);
        
        emit SystemCheck(block.number, currentPrice, priceIncrease, false);
        
        if (_shouldIntervene(priceIncrease)) {
            _executeStabilityIntervention(currentPrice, priceIncrease, true);
        }
        
        _updateMarketConditions(priceIncrease);
    }
    
    // ============ Internal Functions ============
    
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
    
    function _calculatePriceIncrease(uint256 currentPrice) internal view returns (uint256) {
        if (baselinePrice == 0 || currentPrice <= baselinePrice) return 0;
        return ((currentPrice - baselinePrice) * 100) / baselinePrice;
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
        if (!checksEnabled) return false;
        if (tokensUsedToday >= MAX_DAILY_TOKEN_USE) return false;
        
        if (priceIncreasePercent >= CRITICAL_THRESHOLD) {
            return true;
        }
        
        uint256 threshold = _getEffectiveThreshold();
        return priceIncreasePercent >= threshold;
    }
    
    function _getEffectiveThreshold() internal view returns (uint256) {
        uint256 threshold = INTERVENTION_THRESHOLD;
        
        if (market.highVolatilityMode) {
            threshold = threshold * 80 / 100;  // Lower threshold by 20% in volatile markets
        }
        
        return threshold;
    }
    
    function _getCaptureRate() internal view returns (uint256) {
        // Generate pseudo-random rate between baseCaptureRate and (baseCaptureRate + captureRange)
        uint256 captureSeed = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            totalInterventions
        )));
        
        return baseCaptureRate + (captureSeed % captureRange);
    }
    
    /**
     * @notice Execute stability intervention using AMM math
     * @dev Calculates exact tokens needed to reduce spike by captureRate%
     */
    function _executeStabilityIntervention(
        uint256 currentPrice, 
        uint256 priceIncreasePercent,
        bool systemTriggered
    ) internal {
        // Check circuit breakers
        if (interventionsToday >= MAX_DAILY_INTERVENTIONS) {
            circuitBreakerTripped = true;
            emit CircuitBreakerTripped("Max daily interventions reached", block.timestamp);
            return;
        }
        
        uint256 tokenBalance = oooweeeToken.balanceOf(address(this));
        if (tokenBalance == 0) return;
        
        // Get capture rate (60-80%)
        uint256 captureRate = _getCaptureRate();
        
        // Calculate tokens to sell using AMM math
        uint256 tokensToSell = _calculateTokensForSpikeReduction(currentPrice, captureRate);
        
        if (tokensToSell == 0) return;
        
        // Apply max sell limit (5% of stability reserves per intervention)
        uint256 maxSell = (tokenBalance * MAX_SELL_PERCENT) / 100;
        if (tokensToSell > maxSell) {
            tokensToSell = maxSell;
        }
        
        // Check daily token limit
        if (tokensUsedToday + tokensToSell > MAX_DAILY_TOKEN_USE) {
            tokensToSell = MAX_DAILY_TOKEN_USE - tokensUsedToday;
            if (tokensToSell == 0) {
                circuitBreakerTripped = true;
                emit CircuitBreakerTripped("Max daily token use reached", block.timestamp);
                return;
            }
        }
        
        // Execute swap
        uint256 ethCaptured = _swapTokensForETH(tokensToSell);
        
        // Update tracking
        totalInterventions++;
        interventionsToday++;
        totalTokensUsed += tokensToSell;
        tokensUsedToday += tokensToSell;
        totalETHCaptured += ethCaptured;
        lastInterventionPrice = currentPrice;
        market.lastSpikeBlock = block.number;
        
        // Send ETH to validators
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
            systemTriggered
        );
        
        // Store intervention record
        _recordIntervention(currentPrice, newPrice, tokensToSell, ethCaptured, systemTriggered);
        
        // Update baseline to new stable price
        if (newPrice > 0) {
            uint256 oldBaseline = baselinePrice;
            baselinePrice = newPrice;
            emit BaselineUpdated(oldBaseline, baselinePrice);
        }
    }
    
    /**
     * @notice Calculate tokens needed to reduce price spike by captureRate%
     * @dev Uses Uniswap V2 constant product formula: k = x * y
     * 
     * Given:
     * - currentPrice = reserveETH / reserveToken
     * - baselinePrice = target stable price
     * - spike = currentPrice - baselinePrice  
     * - targetPrice = currentPrice - (spike * captureRate / 100)
     * 
     * For Uniswap V2 AMM:
     * - k = reserveToken * reserveETH (constant)
     * - After selling X tokens: newReserveToken = reserveToken + X
     * - newReserveETH = k / newReserveToken
     * - newPrice = newReserveETH / newReserveToken = k / newReserveToken²
     * 
     * Solving for X:
     * - targetPrice = k / (reserveToken + X)²
     * - (reserveToken + X)² = k / targetPrice
     * - reserveToken + X = sqrt(k / targetPrice)
     * - X = sqrt(k / targetPrice) - reserveToken
     */
    function _calculateTokensForSpikeReduction(
        uint256 currentPrice,
        uint256 captureRate
    ) internal view returns (uint256) {
        if (address(liquidityPair) == address(0)) return 0;
        if (baselinePrice == 0 || currentPrice <= baselinePrice) return 0;
        
        // Get current reserves
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
        
        // Calculate spike and target price
        // spike = currentPrice - baselinePrice (in 1e18 format)
        uint256 spike = currentPrice - baselinePrice;
        
        // targetReduction = spike * captureRate / 100
        uint256 targetReduction = (spike * captureRate) / 100;
        
        // targetPrice = currentPrice - targetReduction
        uint256 targetPrice = currentPrice - targetReduction;
        
        // Ensure target price is above baseline (sanity check)
        if (targetPrice < baselinePrice) {
            targetPrice = baselinePrice;
        }
        
        // Calculate k (constant product)
        // k = reserveToken * reserveETH
        uint256 k = reserveToken * reserveETH;
        
        // Calculate target reserve token using: targetPrice = k / targetReserveToken²
        // targetReserveToken = sqrt(k * 1e18 / targetPrice)
        // Note: price is in 1e18 format, so we need to adjust
        
        // k * 1e18 / targetPrice gives us targetReserveToken²
        uint256 targetReserveTokenSquared = (k * 1e18) / targetPrice;
        
        // Square root to get targetReserveToken
        uint256 targetReserveToken = sqrt(targetReserveTokenSquared);
        
        // Tokens to sell = targetReserveToken - currentReserveToken
        if (targetReserveToken <= reserveToken) {
            return 0;  // Price already at or below target
        }
        
        uint256 tokensToSell = targetReserveToken - reserveToken;
        
        emit TargetPriceCalculated(currentPrice, baselinePrice, targetPrice, tokensToSell);
        
        return tokensToSell;
    }
    
    /**
     * @notice Babylonian square root
     */
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        
        return y;
    }
    
    function _recordIntervention(
        uint256 priceBefore,
        uint256 priceAfter,
        uint256 tokensInjected,
        uint256 ethCaptured,
        bool systemTriggered
    ) internal {
        if (interventionHistory.length >= MAX_HISTORY) {
            for (uint256 i = 0; i < interventionHistory.length - 1; i++) {
                interventionHistory[i] = interventionHistory[i + 1];
            }
            interventionHistory.pop();
        }
        
        interventionHistory.push(InterventionRecord({
            timestamp: uint64(block.timestamp),
            priceBefore: priceBefore,
            priceAfter: priceAfter,
            tokensInjected: tokensInjected,
            ethCaptured: ethCaptured,
            systemTriggered: systemTriggered
        }));
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
    
    function getStabilityStatus() external view returns (
        uint256 currentPrice,
        uint256 baseline,
        uint256 priceIncrease,
        bool needsIntervention,
        uint256 remainingInterventions,
        uint256 remainingTokens
    ) {
        currentPrice = getCurrentPrice();
        baseline = baselinePrice;
        priceIncrease = _calculatePriceIncrease(currentPrice);
        needsIntervention = _shouldIntervene(priceIncrease);
        remainingInterventions = interventionsToday >= MAX_DAILY_INTERVENTIONS 
            ? 0 
            : MAX_DAILY_INTERVENTIONS - interventionsToday;
        remainingTokens = tokensUsedToday >= MAX_DAILY_TOKEN_USE 
            ? 0 
            : MAX_DAILY_TOKEN_USE - tokensUsedToday;
    }
    
    function needsDailyReset() public view returns (bool) {
        return block.timestamp >= lastDayReset + MEASUREMENT_WINDOW;
    }
    
    function timeUntilDailyReset() public view returns (uint256) {
        if (block.timestamp >= lastDayReset + MEASUREMENT_WINDOW) {
            return 0;
        }
        return (lastDayReset + MEASUREMENT_WINDOW) - block.timestamp;
    }
    
    function getInterventionHistory() external view returns (InterventionRecord[] memory) {
        return interventionHistory;
    }
    
    function getRecentInterventions(uint256 count) external view returns (InterventionRecord[] memory) {
        uint256 len = interventionHistory.length;
        if (count > len) count = len;
        
        InterventionRecord[] memory recent = new InterventionRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = interventionHistory[len - count + i];
        }
        return recent;
    }
    
    function getInterventionHistoryCount() external view returns (uint256) {
        return interventionHistory.length;
    }
    
    // ============ Admin Functions ============
    
    function setLiquidityPair(address _pair) external onlyOwner {
        liquidityPair = IUniswapV2Pair(_pair);
    }
    
    function setValidatorFund(address _fund) external onlyOwner {
        validatorFundWallet = _fund;
    }
    
    function setSystemAddress(address _system) external onlyOwner {
        systemAddress = _system;
    }
    
    function updateBaselinePrice() external onlyOwner {
        uint256 currentPrice = getCurrentPrice();
        require(currentPrice > 0, "Cannot get price");
        
        uint256 oldBaseline = baselinePrice;
        baselinePrice = currentPrice;
        baselineTimestamp = block.timestamp;
        
        emit BaselineUpdated(oldBaseline, baselinePrice);
    }
    
    function resetCircuitBreaker() external onlyOwner {
        circuitBreakerTripped = false;
        emit CircuitBreakerReset(block.timestamp);
    }
    
    function setChecksEnabled(bool _enabled) external onlyOwner {
        checksEnabled = _enabled;
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
        emit ForceDailyReset(block.timestamp, msg.sender);
    }
    
    function setCaptureRates(
        uint256 _baseCaptureRate,
        uint256 _captureRange
    ) external onlyOwner {
        require(_baseCaptureRate >= 30 && _baseCaptureRate <= 80, "Invalid base capture");
        require(_captureRange <= 40, "Invalid capture range");
        require(_baseCaptureRate + _captureRange <= 95, "Combined rate too high");
        
        baseCaptureRate = _baseCaptureRate;
        captureRange = _captureRange;
    }
    
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
}
