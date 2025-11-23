// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract OOOWEEEStability is Ownable, ReentrancyGuard {
    IERC20 public immutable oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    IUniswapV2Pair public liquidityPair;
    
    address public validatorFundWallet;
    
    // System addresses for OP Stack integration
    address public constant SEQUENCER_ADDRESS = 0x4200000000000000000000000000000000000011;
    address public constant SYSTEM_ADDRESS = 0x4200000000000000000000000000000000000013;
    
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
        
        // Check circuit breaker
        if (circuitBreakerTripped) {
            _resetDailyLimits(); // Try to reset if new day
            if (circuitBreakerTripped) return; // Still tripped, exit
        }
        
        // Check if we have liquidity pair set
        if (address(liquidityPair) == address(0)) return;
        
        // Get current price
        uint256 currentPrice = getCurrentPrice();
        if (currentPrice == 0) return;
        
        // Calculate price metrics
        uint256 priceIncrease = _calculatePriceIncrease(currentPrice);
        
        // Update market conditions
        _updateMarketConditions(priceIncrease);
        
        // Determine if intervention is needed
        bool shouldIntervene = _shouldIntervene(priceIncrease, block.number);
        
        // Emit check event
        emit SystemCheck(block.number, currentPrice, priceIncrease, shouldIntervene);
        
        // Execute intervention if needed
        if (shouldIntervene) {
            _executeSystemIntervention(currentPrice, priceIncrease);
        }
        
        // Update baseline if market is stable
        if (priceIncrease < 5 && block.timestamp > lastInterventionPrice + 1 hours) {
            _updateBaseline(currentPrice);
        }
        
        lastCheckTime = block.timestamp;
        lastCheckPrice = currentPrice;
    }
    
    /**
     * @dev Manual intervention trigger - anyone can call but pays gas
     */
    function manualStabilityCheck() external nonReentrant circuitBreakerCheck {
        require(systemChecksEnabled, "System checks disabled");
        require(block.timestamp >= lastCheckTime + 60, "Too soon"); // 1 minute minimum
        
        uint256 currentPrice = getCurrentPrice();
        require(currentPrice > 0, "Invalid price");
        
        uint256 priceIncrease = _calculatePriceIncrease(currentPrice);
        
        // Require significant spike for manual intervention
        require(priceIncrease >= baseThreshold, "Price increase too low");
        
        _executeSystemIntervention(currentPrice, priceIncrease);
        
        // Reward caller with small gas refund
        if (address(this).balance >= 0.01 ether) {
            payable(msg.sender).transfer(0.01 ether);
        }
    }
    
    // ============ Internal System Functions ============
    
    function _calculateDynamicInterval() private view returns (uint256) {
        // Critical mode: very frequent checks
        if (market.highVolatilityMode) {
            return minSystemCheckInterval;
        }
        
        // Recent spike: stay alert
        if (block.number - market.lastSpikeBlock < 900) { // ~30 minutes
            return minSystemCheckInterval * 2;
        }
        
        // High daily activity: more frequent
        if (market.dailyInterventions > 3) {
            return systemCheckInterval / 2;
        }
        
        // Low activity: less frequent
        if (market.hourlyVolume < 1000 * 10**18) {
            return maxSystemCheckInterval;
        }
        
        return systemCheckInterval;
    }
    
    function _updateMarketConditions(uint256 priceIncrease) private {
        // Update volatility mode
        bool wasHighVolatility = market.highVolatilityMode;
        market.highVolatilityMode = priceIncrease >= HIGH_VOLATILITY_THRESHOLD;
        
        // Track spike timing
        if (priceIncrease >= baseThreshold) {
            market.lastSpikeBlock = block.number;
        }
        
        // Update daily interventions (reset handled elsewhere)
        if (block.timestamp >= lastDayReset + 1 days) {
            market.dailyInterventions = 0;
        }
        
        // Estimate hourly volume (simplified)
        market.hourlyVolume = totalTokensUsed * 3600 / (block.timestamp - lastDayReset);
        
        // Emit event if conditions changed
        if (wasHighVolatility != market.highVolatilityMode) {
            uint256 newInterval = _calculateDynamicInterval();
            emit MarketConditionChanged(market.highVolatilityMode, newInterval);
        }
    }
    
    function _shouldIntervene(uint256 priceIncrease, uint256 blockNum) private view returns (bool) {
        // Critical spike: always intervene
        if (priceIncrease >= CRITICAL_THRESHOLD) {
            return true;
        }
        
        // Below minimum threshold: never intervene
        if (priceIncrease < baseThreshold) {
            return false;
        }
        
        // Use deterministic randomness for threshold
        uint256 threshold = _getDeterministicThreshold(blockNum);
        return priceIncrease >= threshold;
    }
    
    function _getDeterministicThreshold(uint256 blockNum) private view returns (uint256) {
        // Create deterministic but unpredictable threshold
        uint256 hash = uint256(keccak256(abi.encode(
            blockNum,
            address(this),
            seed
        )));
        uint256 variance = hash % thresholdRange;
        return baseThreshold + variance; // Returns 20-40%
    }
    
    function _calculatePriceIncrease(uint256 currentPrice) private view returns (uint256) {
        if (currentPrice <= baselinePrice || baselinePrice == 0) {
            return 0;
        }
        return ((currentPrice - baselinePrice) * 100) / baselinePrice;
    }
    
    function _executeSystemIntervention(
        uint256 currentPrice,
        uint256 priceIncrease
    ) private {
        // Reset daily limits if needed
        _resetDailyLimits();
        
        // Calculate intervention parameters
        uint256 captureRate = _getDynamicCaptureRate(priceIncrease);
        uint256 targetPrice = baselinePrice + (baselinePrice * BASELINE_UPDATE_THRESHOLD / 100);
        
        // Ensure we're not overshooting
        if (targetPrice > currentPrice) {
            targetPrice = currentPrice * 95 / 100; // Target 5% reduction
        }
        
        // Calculate tokens needed
        uint256 tokensToSell = _calculateTokensForTargetPrice(currentPrice, targetPrice);
        
        // Apply circuit breaker checks
        if (!_preInterventionChecks(tokensToSell)) {
            return;
        }
        
        // Execute the swap
        uint256 ethCaptured = _executeSwap(tokensToSell);
        
        // Update state
        totalInterventions++;
        interventionsToday++;
        market.dailyInterventions++;
        tokensUsedToday += tokensToSell;
        totalTokensUsed += tokensToSell;
        totalETHCaptured += ethCaptured;
        
        // Send ETH to validators
        if (ethCaptured > 0 && validatorFundWallet != address(0)) {
            (bool success,) = payable(validatorFundWallet).call{value: ethCaptured}("");
            if (success) {
                totalETHSentToValidators += ethCaptured;
                emit ETHSentToValidators(ethCaptured, block.timestamp);
            }
        }
        
        uint256 newPrice = getCurrentPrice();
        lastInterventionPrice = newPrice;
        
        emit StabilityIntervention(
            tokensToSell,
            ethCaptured,
            currentPrice,
            newPrice,
            true // system triggered
        );
    }
    
    function _getDynamicCaptureRate(uint256 priceIncrease) private view returns (uint256) {
        if (priceIncrease >= CRITICAL_THRESHOLD) {
            return 90; // Maximum capture for critical spikes
        }
        
        // Use stealth capture rate
        uint256 hash = uint256(keccak256(abi.encode(block.timestamp, priceIncrease)));
        uint256 variance = hash % captureRange;
        return baseCaptureRate + variance; // 60-80%
    }
    
    function _calculateTokensForTargetPrice(
        uint256 currentPrice,
        uint256 targetPrice
    ) private view returns (uint256) {
        (uint112 reserve0, uint112 reserve1,) = liquidityPair.getReserves();
        
        uint256 tokenReserve;
        uint256 ethReserve;
        
        if (liquidityPair.token0() == address(oooweeeToken)) {
            tokenReserve = uint256(reserve0);
            ethReserve = uint256(reserve1);
        } else {
            tokenReserve = uint256(reserve1);
            ethReserve = uint256(reserve0);
        }
        
        if (targetPrice >= currentPrice || tokenReserve == 0) {
            return 0;
        }
        
        // Calculate exact tokens needed for target price
        uint256 k = tokenReserve * ethReserve;
        uint256 newTokenReserve = sqrt((k * 1e18) / targetPrice);
        
        if (newTokenReserve <= tokenReserve) {
            return 0;
        }
        
        uint256 tokensToSellBeforeFee = newTokenReserve - tokenReserve;
        uint256 tokensToSell = (tokensToSellBeforeFee * 1000) / 997; // Account for 0.3% fee
        
        // Apply safety limits
        uint256 ourBalance = oooweeeToken.balanceOf(address(this));
        uint256 maxSell = ourBalance * MAX_SELL_PERCENT / 100;
        
        if (tokensToSell > maxSell) {
            tokensToSell = maxSell;
        }
        
        return tokensToSell;
    }
    
    function _preInterventionChecks(uint256 tokensToSell) private returns (bool) {
        // Check daily intervention limit
        if (interventionsToday >= MAX_DAILY_INTERVENTIONS) {
            circuitBreakerTripped = true;
            emit CircuitBreakerTripped("Max daily interventions reached", block.timestamp);
            return false;
        }
        
        // Check daily token limit
        if (tokensUsedToday + tokensToSell > MAX_DAILY_TOKEN_USE) {
            circuitBreakerTripped = true;
            emit CircuitBreakerTripped("Max daily token use exceeded", block.timestamp);
            return false;
        }
        
        // Check minimum intervention size
        uint256 minTokens = (100 * 1e18) / getCurrentPrice();
        if (tokensToSell < minTokens) {
            return false;
        }
        
        // Check we have enough tokens
        if (tokensToSell > oooweeeToken.balanceOf(address(this))) {
            return false;
        }
        
        return true;
    }
    
    // ============ Circuit Breaker Functions ============
    
    function _resetDailyLimits() internal {
        if (block.timestamp >= lastDayReset + 1 days) {
            emit DailyLimitsReset(interventionsToday, tokensUsedToday);
            interventionsToday = 0;
            tokensUsedToday = 0;
            market.dailyInterventions = 0;
            lastDayReset = block.timestamp;
            
            if (circuitBreakerTripped) {
                circuitBreakerTripped = false;
                emit CircuitBreakerReset(block.timestamp);
            }
        }
    }
    
    function resetCircuitBreaker() external onlyOwner {
        circuitBreakerTripped = false;
        emit CircuitBreakerReset(block.timestamp);
    }
    
    // ============ Admin Functions ============
    
    function setLiquidityPair(address _pair) external onlyOwner {
        require(address(liquidityPair) == address(0), "Already set");
        liquidityPair = IUniswapV2Pair(_pair);
        uint256 currentPrice = getCurrentPrice();
        lastCheckPrice = currentPrice;
        baselinePrice = currentPrice;
        lastInterventionPrice = currentPrice;
        lastCheckTime = block.timestamp;
    }
    
    function setValidatorFundWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid address");
        validatorFundWallet = _wallet;
    }
    
    function setSystemCheckInterval(uint256 _interval) external onlyOwner {
        require(_interval >= minSystemCheckInterval, "Too frequent");
        require(_interval <= maxSystemCheckInterval, "Too infrequent");
        systemCheckInterval = _interval;
        emit SystemCheckIntervalUpdated(_interval);
    }
    
    function setSystemCheckLimits(uint256 _min, uint256 _max) external onlyOwner {
        require(_min >= 10, "Minimum too low"); // At least 20 seconds
        require(_max <= 3600, "Maximum too high"); // At most 2 hours
        require(_min < _max, "Invalid range");
        minSystemCheckInterval = _min;
        maxSystemCheckInterval = _max;
    }
    
    function toggleSystemChecks() external onlyOwner {
        systemChecksEnabled = !systemChecksEnabled;
    }
    
    function updateStealthParameters(
        uint256 _baseThreshold,
        uint256 _thresholdRange,
        uint256 _baseCaptureRate,
        uint256 _captureRange
    ) external onlyOwner {
        require(_baseThreshold >= 10 && _baseThreshold <= 50, "Invalid base threshold");
        require(_thresholdRange <= 30, "Range too wide");
        require(_baseCaptureRate >= 30 && _baseCaptureRate <= 90, "Invalid capture rate");
        require(_captureRange <= 30, "Capture range too wide");
        
        baseThreshold = _baseThreshold;
        thresholdRange = _thresholdRange;
        baseCaptureRate = _baseCaptureRate;
        captureRange = _captureRange;
        
        seed = uint256(keccak256(abi.encode(block.timestamp, msg.sender)));
    }
    
    function depositTokens(uint256 amount) external {
        require(amount > 0, "Amount must be positive");
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
    }
    
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
    
    // ============ Internal Helper Functions ============
    
    function _updateBaseline(uint256 newPrice) private {
        uint256 oldBaseline = baselinePrice;
        baselinePrice = newPrice;
        consecutiveSpikes = 0;
        emit BaselineUpdated(oldBaseline, newPrice);
    }
    
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
    
    function _executeSwap(uint256 tokensToSell) internal returns (uint256) {
        // Approve router
        oooweeeToken.approve(address(uniswapRouter), tokensToSell);
        
        // Set up swap path
        address[] memory path = new address[](2);
        path[0] = address(oooweeeToken);
        path[1] = uniswapRouter.WETH();
        
        // Calculate minimum ETH with slippage protection
        uint256[] memory amounts = uniswapRouter.getAmountsOut(tokensToSell, path);
        uint256 minETHOut = (amounts[1] * (10000 - SLIPPAGE_TOLERANCE)) / 10000;
        
        uint256 ethBefore = address(this).balance;
        
        // Execute swap
        try uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokensToSell,
            minETHOut,
            path,
            address(this),
            block.timestamp + 300
        ) {
            uint256 ethCaptured = address(this).balance - ethBefore;
            return ethCaptured;
        } catch {
            // Swap failed, reset approval
            oooweeeToken.approve(address(uniswapRouter), 0);
            return 0;
        }
    }
    
    // ============ View Functions ============
    
    function getCurrentPrice() public view returns (uint256) {
        if (address(liquidityPair) == address(0)) return 0;
        
        (uint112 reserve0, uint112 reserve1,) = liquidityPair.getReserves();
        
        if (liquidityPair.token0() == address(oooweeeToken)) {
            if (reserve0 == 0) return 0;
            return (uint256(reserve1) * 1e18) / uint256(reserve0);
        } else {
            if (reserve1 == 0) return 0;
            return (uint256(reserve0) * 1e18) / uint256(reserve1);
        }
    }
    
    function getStabilityInfo() external view returns (
        uint256 currentPrice,
        uint256 tokenBalance,
        uint256 interventions,
        uint256 tokensUsed,
        uint256 ethCaptured,
        uint256 ethSentToValidators,
        uint256 blocksSinceCheck,
        uint256 priceIncreaseFromBaseline
    ) {
        currentPrice = getCurrentPrice();
        uint256 priceIncrease = _calculatePriceIncrease(currentPrice);
        
        return (
            currentPrice,
            oooweeeToken.balanceOf(address(this)),
            totalInterventions,
            totalTokensUsed,
            totalETHCaptured,
            totalETHSentToValidators,
            block.number - lastSystemCheck,
            priceIncrease
        );
    }
    
    function getMarketConditions() external view returns (
        bool highVolatility,
        uint256 currentCheckInterval,
        uint256 blocksSinceLastSpike,
        uint256 dailyInterventionCount,
        uint256 estimatedHourlyVolume
    ) {
        return (
            market.highVolatilityMode,
            _calculateDynamicInterval(),
            block.number - market.lastSpikeBlock,
            market.dailyInterventions,
            market.hourlyVolume
        );
    }
    
    receive() external payable {}
}