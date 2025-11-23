// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

interface IOOOWEEEToken {
    function operationsWallet() external view returns (address);
}

contract OOOWEEEStability is Ownable, ReentrancyGuard {
    IERC20 public immutable oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    IUniswapV2Pair public liquidityPair;
    
    address public validatorFundWallet;
    
    // System addresses for OP Stack integration (updated for testnet)
    address public constant SEQUENCER_ADDRESS = 0x0000000000000000000000000000000000000000; // No sequencer on testnet
    address public constant SYSTEM_ADDRESS = 0x0000000000000000000000000000000000000000;
    
    // Stealth parameters - private so not readable on-chain
    uint256 private seed;
    uint256 private baseThreshold;
    uint256 private thresholdRange;
    uint256 private baseCaptureRate;
    uint256 private captureRange;
    
    // Public tracking
    uint256 public lastSystemCheck;  // Block number of last system check
    uint256 public systemCheckInterval = 150; // ~5 minutes at 2s blocks
    uint256 public minSystemCheckInterval = 15; // 30 seconds minimum
    uint256 public maxSystemCheckInterval = 1800; // 1 hour maximum
    
    uint256 public lastCheckTime;
    uint256 public lastCheckPrice;
    uint256 public totalInterventions;
    uint256 public totalTokensUsed;
    uint256 public totalETHCaptured;
    uint256 public totalETHSentToValidators;
    
    // Price tracking for better intervention
    uint256 public baselinePrice;
    uint256 public lastInterventionPrice;
    uint256 public consecutiveSpikes;
    uint256 public recentVolatility;
    
    // Market conditions for adaptive checking
    struct MarketConditions {
        uint256 lastSpikeBlock;
        uint256 dailyInterventions;
        uint256 hourlyVolume;
        bool highVolatilityMode;
    }
    
    MarketConditions public market;
    
    // Circuit Breaker Variables
    uint256 public interventionsToday;
    uint256 public lastDayReset;
    uint256 public tokensUsedToday;
    uint256 public constant MAX_DAILY_INTERVENTIONS = 10;
    uint256 public constant MAX_DAILY_TOKEN_USE = 1_000_000 * 10**18;
    bool public circuitBreakerTripped = false;
    bool public systemChecksEnabled = true;
    
    // Configuration
    uint256 public constant MEASUREMENT_WINDOW = 1 days;
    uint256 public constant MAX_SELL_PERCENT = 15;
    uint256 public constant SLIPPAGE_TOLERANCE = 300; // 3%
    uint256 public constant BASELINE_UPDATE_THRESHOLD = 110;
    uint256 public constant CRITICAL_THRESHOLD = 50; // 50% spike = immediate action
    uint256 public constant HIGH_VOLATILITY_THRESHOLD = 30; // 30% = high volatility mode
    
    // Events
    event SystemCheck(
        uint256 indexed blockNumber,
        uint256 currentPrice,
        uint256 priceIncrease,
        bool interventionTriggered
    );
    
    event StabilityIntervention(
        uint256 tokensUsed,
        uint256 ethCaptured,
        uint256 oldPrice,
        uint256 newPrice,
        bool systemTriggered
    );
    
    event ETHSentToValidators(uint256 amount, uint256 timestamp);
    event CircuitBreakerTripped(string reason, uint256 timestamp);
    event CircuitBreakerReset(uint256 timestamp);
    event DailyLimitsReset(uint256 interventions, uint256 tokensUsed);
    event BaselineUpdated(uint256 oldBaseline, uint256 newBaseline);
    event SystemCheckIntervalUpdated(uint256 newInterval);
    event MarketConditionChanged(bool highVolatility, uint256 checkInterval);
    event EmergencyRecovery(uint256 amount, address to);
    
    constructor(
        address _oooweeeToken,
        address _uniswapRouter,
        address _validatorFundWallet
    ) Ownable(msg.sender) {
        oooweeeToken = IERC20(_oooweeeToken);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        validatorFundWallet = _validatorFundWallet;
        
        // Initialize stealth parameters
        seed = uint256(keccak256(abi.encode(block.timestamp, block.difficulty, msg.sender)));
        baseThreshold = 20;      // 20-40% range
        thresholdRange = 20;
        baseCaptureRate = 60;    // 60-80% range
        captureRange = 20;
        
        lastDayReset = block.timestamp;
        lastSystemCheck = block.number;
    }
    
    // ============ Emergency Recovery Functions ============
    
    /**
     * @notice Emergency function to recover all tokens to operations wallet
     * @dev Only sends to the operations wallet defined in the token contract for security
     */
    function emergencyRecoverTokens() external onlyOwner {
        // Get the operations wallet from the token contract
        address operationsWallet = IOOOWEEEToken(address(oooweeeToken)).operationsWallet();
        require(operationsWallet != address(0), "Operations wallet not set");
        
        uint256 balance = oooweeeToken.balanceOf(address(this));
        require(balance > 0, "No tokens to recover");
        
        require(oooweeeToken.transfer(operationsWallet, balance), "Transfer failed");
        
        emit EmergencyRecovery(balance, operationsWallet);
    }
    
    // ============ Modifiers ============
    
    modifier onlySystem() {
        require(
            msg.sender == SEQUENCER_ADDRESS || 
            msg.sender == SYSTEM_ADDRESS ||
            msg.sender == owner(),
            "Only system or owner"
        );
        _;
    }
    
    modifier circuitBreakerCheck() {
        require(!circuitBreakerTripped, "Circuit breaker is active");
        _;
    }
    
    // ============ System Integration Functions ============
    
    /**
     * @dev Called automatically by sequencer - no gas cost
     * This is the main entry point for automated stability checks
     */
    function systemStabilityCheck() external onlySystem {
        // Check if system checks are enabled
        if (!systemChecksEnabled) return;
        
        // Check if enough blocks have passed
        uint256 dynamicInterval = _calculateDynamicInterval();
        if (block.number < lastSystemCheck + dynamicInterval) return;
        
        lastSystemCheck = block.number;
        
        // Reset daily limits if needed
        _checkAndResetDailyLimits();
        
        // Get current price
        uint256 currentPrice = getCurrentPrice();
        if (currentPrice == 0) return; // Price oracle failure
        
        // Calculate price increase
        uint256 priceIncrease = _calculatePriceIncrease(currentPrice);
        
        emit SystemCheck(block.number, currentPrice, priceIncrease, false);
        
        // Check if intervention is needed
        if (_shouldIntervene(priceIncrease)) {
            _executeStabilityIntervention(currentPrice, priceIncrease, true);
        }
        
        // Update market conditions
        _updateMarketConditions(priceIncrease);
    }
    
    /**
     * @dev Manual stability check - anyone can call but must pay 0.01 ETH
     * Fee goes to the caller if intervention is triggered
     */
    function manualStabilityCheck() external payable nonReentrant circuitBreakerCheck {
        require(msg.value >= 0.01 ether, "Insufficient fee");
        require(systemChecksEnabled, "System checks disabled");
        
        // Reset daily limits if needed
        _checkAndResetDailyLimits();
        
        uint256 currentPrice = getCurrentPrice();
        require(currentPrice > 0, "Price oracle failure");
        
        uint256 priceIncrease = _calculatePriceIncrease(currentPrice);
        
        bool intervened = false;
        if (_shouldIntervene(priceIncrease)) {
            _executeStabilityIntervention(currentPrice, priceIncrease, false);
            intervened = true;
            
            // Reward the caller
            if (msg.value > 0) {
                (bool success,) = payable(msg.sender).call{value: msg.value}("");
                require(success, "Reward transfer failed");
            }
        } else {
            // Refund if no intervention
            if (msg.value > 0) {
                (bool success,) = payable(msg.sender).call{value: msg.value}("");
                require(success, "Refund failed");
            }
        }
        
        emit SystemCheck(block.number, currentPrice, priceIncrease, intervened);
    }
    
    // ============ Internal Functions ============
    
    function _calculateDynamicInterval() internal view returns (uint256) {
        // Critical conditions = check more frequently
        if (market.highVolatilityMode) {
            return minSystemCheckInterval; // 30 seconds
        }
        
        // Recent spike = check frequently
        if (block.number < market.lastSpikeBlock + 100) {
            return minSystemCheckInterval * 2; // 1 minute
        }
        
        // Multiple interventions today = monitor closely
        if (interventionsToday >= 3) {
            return systemCheckInterval / 2; // Half normal interval
        }
        
        // Low activity = check less frequently
        if (interventionsToday == 0 && block.number > market.lastSpikeBlock + 1000) {
            return systemCheckInterval * 2; // Double normal interval
        }
        
        // Normal conditions
        return systemCheckInterval;
    }
    
    function _updateMarketConditions(uint256 priceIncrease) internal {
        // Update volatility mode
        bool wasHighVolatility = market.highVolatilityMode;
        market.highVolatilityMode = priceIncrease >= HIGH_VOLATILITY_THRESHOLD;
        
        if (market.highVolatilityMode != wasHighVolatility) {
            emit MarketConditionChanged(market.highVolatilityMode, _calculateDynamicInterval());
        }
        
        // Update daily intervention count
        if (block.timestamp >= lastDayReset + MEASUREMENT_WINDOW) {
            market.dailyInterventions = interventionsToday;
        }
    }
    
    function _checkAndResetDailyLimits() internal {
        if (block.timestamp >= lastDayReset + MEASUREMENT_WINDOW) {
            emit DailyLimitsReset(interventionsToday, tokensUsedToday);
            interventionsToday = 0;
            tokensUsedToday = 0;
            lastDayReset = block.timestamp;
            
            // Reset circuit breaker
            if (circuitBreakerTripped) {
                circuitBreakerTripped = false;
                emit CircuitBreakerReset(block.timestamp);
            }
        }
    }
    
    function _calculatePriceIncrease(uint256 currentPrice) internal view returns (uint256) {
        if (baselinePrice == 0) {
            return 0; // First time, no increase
        }
        
        if (currentPrice <= baselinePrice) {
            return 0; // Price decreased or same
        }
        
        return ((currentPrice - baselinePrice) * 100) / baselinePrice;
    }
    
    function _shouldIntervene(uint256 priceIncreasePercent) internal view returns (bool) {
        if (priceIncreasePercent == 0) return false;
        if (interventionsToday >= MAX_DAILY_INTERVENTIONS) return false;
        if (tokensUsedToday >= MAX_DAILY_TOKEN_USE) return false;
        
        // Critical threshold = always intervene
        if (priceIncreasePercent >= CRITICAL_THRESHOLD) {
            return true;
        }
        
        // Dynamic threshold based on stealth parameters
        uint256 threshold = _getDynamicThreshold();
        return priceIncreasePercent >= threshold;
    }
    
    function _getDynamicThreshold() internal view returns (uint256) {
        // Use block number for unpredictability
        uint256 blockSeed = uint256(keccak256(abi.encode(block.number, seed)));
        
        // Generate threshold between baseThreshold and (baseThreshold + thresholdRange)
        uint256 threshold = baseThreshold + (blockSeed % thresholdRange);
        
        // Adjust based on market conditions
        if (market.highVolatilityMode) {
            threshold = threshold * 80 / 100; // Lower threshold by 20% in volatile markets
        }
        
        return threshold;
    }
    
    function _getCaptureRate() internal view returns (uint256) {
        // Use different seed for capture rate
        uint256 captureSeed = uint256(keccak256(abi.encode(block.timestamp, seed)));
        
        // Generate rate between baseCaptureRate and (baseCaptureRate + captureRange)
        uint256 rate = baseCaptureRate + (captureSeed % captureRange);
        
        // Ensure it doesn't exceed 100%
        if (rate > 100) rate = 100;
        
        return rate;
    }
    
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
        
        // Calculate token amount to sell
        uint256 tokenBalance = oooweeeToken.balanceOf(address(this));
        if (tokenBalance == 0) return;
        
        uint256 captureRate = _getCaptureRate();
        uint256 tokensToSell = (tokenBalance * captureRate * priceIncreasePercent) / 10000;
        
        // Apply max sell limit
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
        
        // Update baseline if price is relatively stable
        if (newPrice > 0 && !market.highVolatilityMode) {
            uint256 changeFromBaseline = baselinePrice > 0 
                ? (newPrice * 100) / baselinePrice 
                : 100;
                
            if (changeFromBaseline <= BASELINE_UPDATE_THRESHOLD) {
                uint256 oldBaseline = baselinePrice;
                baselinePrice = newPrice;
                emit BaselineUpdated(oldBaseline, baselinePrice);
            }
        }
    }
    
    function _swapTokensForETH(uint256 tokenAmount) internal returns (uint256) {
        if (tokenAmount == 0) return 0;
        
        // Approve router
        oooweeeToken.approve(address(uniswapRouter), tokenAmount);
        
        address[] memory path = new address[](2);
        path[0] = address(oooweeeToken);
        path[1] = uniswapRouter.WETH();
        
        uint256 initialETHBalance = address(this).balance;
        
        // Get expected output for slippage protection
        uint256[] memory amounts = uniswapRouter.getAmountsOut(tokenAmount, path);
        uint256 minETH = (amounts[1] * (10000 - SLIPPAGE_TOLERANCE)) / 10000;
        
        // Execute swap
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
        
        // Calculate price in ETH terms (ETH per OOOWEEE * 1e18)
        if (token0 == address(oooweeeToken)) {
            return (uint256(reserve1) * 1e18) / uint256(reserve0);
        } else {
            return (uint256(reserve0) * 1e18) / uint256(reserve1);
        }
    }
    
    function getTokenBalance() external view returns (uint256) {
        return oooweeeToken.balanceOf(address(this));
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
        tokenBalance = oooweeeToken.balanceOf(address(this));
        totalInterventionsCount = totalInterventions;
        totalTokensSold = totalTokensUsed;
        totalETHEarned = totalETHCaptured;
        totalETHToValidators = totalETHSentToValidators;
        baseline = baselinePrice;
        priceIncrease = _calculatePriceIncrease(currentPrice);
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
        remainingInterventions = MAX_DAILY_INTERVENTIONS - interventionsToday;
        remainingTokens = MAX_DAILY_TOKEN_USE - tokensUsedToday;
    }
    
    function getMarketConditions() external view returns (
        bool highVolatility,
        uint256 currentCheckInterval,
        uint256 blocksSinceLastSpike,
        uint256 dailyInterventionCount
    ) {
        highVolatility = market.highVolatilityMode;
        currentCheckInterval = _calculateDynamicInterval();
        blocksSinceLastSpike = block.number - market.lastSpikeBlock;
        dailyInterventionCount = market.dailyInterventions;
    }
    
    // ============ Admin Functions ============
    
    function setLiquidityPair(address _pair) external onlyOwner {
        require(_pair != address(0), "Invalid pair");
        liquidityPair = IUniswapV2Pair(_pair);
        
        // Initialize baseline price
        if (baselinePrice == 0) {
            baselinePrice = getCurrentPrice();
        }
    }
    
    function setValidatorFundWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid address");
        validatorFundWallet = _wallet;
    }
    
    function setSystemCheckInterval(uint256 _interval) external onlyOwner {
        require(_interval >= minSystemCheckInterval, "Below minimum");
        require(_interval <= maxSystemCheckInterval, "Above maximum");
        systemCheckInterval = _interval;
        emit SystemCheckIntervalUpdated(_interval);
    }
    
    function toggleSystemChecks() external onlyOwner {
        systemChecksEnabled = !systemChecksEnabled;
    }
    
    function resetCircuitBreaker() external onlyOwner {
        circuitBreakerTripped = false;
        emit CircuitBreakerReset(block.timestamp);
    }
    
    function updateBaselinePrice() external onlyOwner {
        uint256 currentPrice = getCurrentPrice();
        require(currentPrice > 0, "Invalid price");
        
        uint256 oldBaseline = baselinePrice;
        baselinePrice = currentPrice;
        emit BaselineUpdated(oldBaseline, baselinePrice);
    }
    
    function updateStealthParameters(
        uint256 _baseThreshold,
        uint256 _thresholdRange,
        uint256 _baseCaptureRate,
        uint256 _captureRange
    ) external onlyOwner {
        require(_baseThreshold >= 10 && _baseThreshold <= 50, "Invalid base threshold");
        require(_thresholdRange <= 30, "Invalid threshold range");
        require(_baseCaptureRate >= 30 && _baseCaptureRate <= 80, "Invalid base capture");
        require(_captureRange <= 40, "Invalid capture range");
        
        baseThreshold = _baseThreshold;
        thresholdRange = _thresholdRange;
        baseCaptureRate = _baseCaptureRate;
        captureRange = _captureRange;
        
        // Update seed for unpredictability
        seed = uint256(keccak256(abi.encode(block.timestamp, block.number, msg.sender)));
    }
    
    // Emergency withdrawal of ETH
    function emergencyWithdrawETH(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH");
        
        (bool success,) = payable(to).call{value: balance}("");
        require(success, "Transfer failed");
    }
    
    // Receive ETH
    receive() external payable {}
}
