// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

contract OOOWEEEStability is Ownable, ReentrancyGuard, AutomationCompatibleInterface {
    IERC20 public immutable oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    IUniswapV2Pair public liquidityPair;
    
    address public validatorFundWallet; // Renamed for clarity
    
    // Stealth parameters - private so not readable on-chain
    uint256 private seed;
    uint256 private baseThreshold;
    uint256 private thresholdRange;
    uint256 private baseCaptureRate;
    uint256 private captureRange;
    
    // Public tracking
    uint256 public lastCheckTime;
    uint256 public lastCheckPrice;
    uint256 public totalInterventions;
    uint256 public totalTokensUsed;
    uint256 public totalETHCaptured;
    uint256 public totalETHSentToValidators;
    
    // Price tracking for better intervention
    uint256 public baselinePrice;      // Long-term baseline
    uint256 public lastInterventionPrice;
    uint256 public consecutiveSpikes;
    
    // Circuit Breaker Variables
    uint256 public interventionsToday;
    uint256 public lastDayReset;
    uint256 public tokensUsedToday;
    uint256 public constant MAX_DAILY_INTERVENTIONS = 10;
    uint256 public constant MAX_DAILY_TOKEN_USE = 1_000_000 * 10**18; // 1M tokens max per day
    bool public circuitBreakerTripped = false;
    
    // Adjustable Configuration
    uint256 public minCheckInterval = 15 minutes;  // Can be changed by owner
    uint256 public constant MIN_INTERVAL_LIMIT = 5 minutes;   // Safety floor
    uint256 public constant MAX_INTERVAL_LIMIT = 24 hours;    // Safety ceiling
    
    uint256 public constant MEASUREMENT_WINDOW = 1 days;
    uint256 public constant MAX_SELL_PERCENT = 15;
    uint256 public constant SLIPPAGE_TOLERANCE = 300; // 3%
    uint256 public constant BASELINE_UPDATE_THRESHOLD = 110;
    
    // Events
    event StabilityCheck(
        uint256 currentPrice,
        uint256 priceIncrease,
        bool interventionTriggered,
        uint256 threshold
    );
    
    event StabilityIntervention(
        uint256 tokensUsed,
        uint256 ethCaptured,
        uint256 oldPrice,
        uint256 newPrice
    );
    
    event ETHSentToValidators(
        uint256 amount,
        uint256 timestamp
    );
    
    event CircuitBreakerTripped(string reason, uint256 timestamp);
    event CircuitBreakerReset(uint256 timestamp);
    event DailyLimitsReset(uint256 interventions, uint256 tokensUsed);
    
    event BaselineUpdated(uint256 oldBaseline, uint256 newBaseline);
    event TokensDeposited(address indexed from, uint256 amount);
    event CheckIntervalUpdated(uint256 newInterval);
    event LiquidityPairSet(address indexed pair);
    event ValidatorFundWalletSet(address indexed wallet);
    event StealthParametersUpdated();
    
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
    }
    
    // ============ Circuit Breaker Functions ============
    
    modifier circuitBreakerCheck() {
        require(!circuitBreakerTripped, "Circuit breaker is active");
        _;
    }
    
    function _resetDailyLimits() internal {
        if (block.timestamp >= lastDayReset + 1 days) {
            emit DailyLimitsReset(interventionsToday, tokensUsedToday);
            interventionsToday = 0;
            tokensUsedToday = 0;
            lastDayReset = block.timestamp;
            
            // Auto-reset circuit breaker after daily reset
            if (circuitBreakerTripped) {
                circuitBreakerTripped = false;
                emit CircuitBreakerReset(block.timestamp);
            }
        }
    }
    
    function _checkCircuitBreaker(uint256 tokensToUse) internal {
        _resetDailyLimits();
        
        if (interventionsToday >= MAX_DAILY_INTERVENTIONS) {
            circuitBreakerTripped = true;
            emit CircuitBreakerTripped("Max daily interventions reached", block.timestamp);
            revert("Daily intervention limit reached");
        }
        
        if (tokensUsedToday + tokensToUse > MAX_DAILY_TOKEN_USE) {
            circuitBreakerTripped = true;
            emit CircuitBreakerTripped("Max daily token use exceeded", block.timestamp);
            revert("Daily token limit exceeded");
        }
    }
    
    function resetCircuitBreaker() external onlyOwner {
        circuitBreakerTripped = false;
        emit CircuitBreakerReset(block.timestamp);
    }
    
    // ============ Chainlink Automation Functions ============
    
    /**
     * @dev Chainlink Automation check - runs off-chain to determine if intervention needed
     */
    function checkUpkeep(bytes calldata /* checkData */) 
        external 
        view 
        override 
        returns (bool upkeepNeeded, bytes memory /* performData */) 
    {
        // Check circuit breaker
        if (circuitBreakerTripped) {
            return (false, "");
        }
        
        // Check if basic conditions are met
        if (address(liquidityPair) == address(0)) {
            return (false, "");
        }
        
        if (block.timestamp < lastCheckTime + minCheckInterval) {
            return (false, "");
        }
        
        uint256 balance = oooweeeToken.balanceOf(address(this));
        if (balance == 0) {
            return (false, "");
        }
        
        // Check price increase
        uint256 currentPrice = getCurrentPrice();
        if (currentPrice == 0) {
            return (false, "");
        }
        
        uint256 priceIncrease = 0;
        if (currentPrice > baselinePrice && baselinePrice > 0) {
            priceIncrease = ((currentPrice - baselinePrice) * 100) / baselinePrice;
        }
        
        // Use minimum threshold for check (actual threshold is random)
        upkeepNeeded = priceIncrease >= baseThreshold;
    }
    
    /**
     * @dev Chainlink Automation execution - called when checkUpkeep returns true
     */
    function performUpkeep(bytes calldata /* performData */) 
        external 
        override 
        nonReentrant
        circuitBreakerCheck
    {
        _doStabilityCheck();
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
        emit LiquidityPairSet(_pair);
    }
    
    function setValidatorFundWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid address");
        validatorFundWallet = _wallet;
        emit ValidatorFundWalletSet(_wallet);
    }
    
    /**
     * @dev Adjust check frequency - owner can change based on market conditions
     */
    function setCheckInterval(uint256 _newInterval) external onlyOwner {
        require(_newInterval >= MIN_INTERVAL_LIMIT, "Too frequent");
        require(_newInterval <= MAX_INTERVAL_LIMIT, "Too infrequent");
        minCheckInterval = _newInterval;
        emit CheckIntervalUpdated(_newInterval);
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
        
        emit StealthParametersUpdated();
    }
    
    function resetBaseline() external onlyOwner {
        uint256 oldBaseline = baselinePrice;
        baselinePrice = getCurrentPrice();
        emit BaselineUpdated(oldBaseline, baselinePrice);
    }
    
    // ============ Public Functions ============
    
    /**
     * @dev Deposit tokens for stability operations (anyone can donate)
     */
    function depositTokens(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        emit TokensDeposited(msg.sender, amount);
    }
    
    /**
     * @dev Manual stability check - can be called by anyone
     * NO REWARD - all ETH goes to validators
     */
    function checkStability() external nonReentrant circuitBreakerCheck {
        _doStabilityCheck();
    }
    
    // ============ Internal Functions ============
    
    function _doStabilityCheck() internal {
        require(address(liquidityPair) != address(0), "Pair not set");
        require(block.timestamp >= lastCheckTime + minCheckInterval, "Too soon");
        
        // Reset daily limits if needed
        _resetDailyLimits();
        
        uint256 currentPrice = getCurrentPrice();
        require(currentPrice > 0, "Invalid price");
        
        // Calculate price increase from baseline
        uint256 priceIncrease = 0;
        if (currentPrice > baselinePrice && baselinePrice > 0) {
            priceIncrease = ((currentPrice - baselinePrice) * 100) / baselinePrice;
        }
        
        // Generate pseudo-random threshold for this check
        uint256 threshold = baseThreshold + (uint256(keccak256(abi.encode(seed, block.timestamp))) % thresholdRange);
        
        // Lower threshold if we've had consecutive spikes
        if (consecutiveSpikes > 0) {
            threshold = threshold * (100 - (consecutiveSpikes * 5)) / 100;
            if (threshold < 15) threshold = 15;
        }
        
        bool shouldIntervene = priceIncrease >= threshold;
        
        emit StabilityCheck(currentPrice, priceIncrease, shouldIntervene, threshold);
        
        if (shouldIntervene) {
            // Track consecutive spikes
            if (block.timestamp - lastCheckTime < MEASUREMENT_WINDOW) {
                consecutiveSpikes++;
            } else {
                consecutiveSpikes = 1;
            }
            
            // Generate random capture percent
            uint256 capturePercent = baseCaptureRate + (uint256(keccak256(abi.encode(seed, currentPrice))) % captureRange);
            
            // Perform the intervention
            _performStabilization(currentPrice, baselinePrice, capturePercent);
            
            // Update baseline if this was a significant move
            if (priceIncrease > BASELINE_UPDATE_THRESHOLD - 100) {
                uint256 oldBaseline = baselinePrice;
                baselinePrice = (baselinePrice * 90 + currentPrice * 10) / 100;
                emit BaselineUpdated(oldBaseline, baselinePrice);
            }
            
            lastInterventionPrice = currentPrice;
            
            // Mix in more entropy
            seed = uint256(keccak256(abi.encode(seed, currentPrice, block.timestamp)));
        } else {
            // Reset consecutive spikes if no intervention
            if (block.timestamp - lastCheckTime > MEASUREMENT_WINDOW) {
                consecutiveSpikes = 0;
            }
        }
        
        // Update checkpoint
        lastCheckPrice = currentPrice;
        lastCheckTime = block.timestamp;
    }
    
    function _performStabilization(
        uint256 currentPrice,
        uint256 basePrice,
        uint256 capturePercent
    ) internal {
        // Calculate target price after capturing X% of spike
        uint256 spike = currentPrice - basePrice;
        uint256 targetCaptureAmount = (spike * capturePercent) / 100;
        uint256 targetPrice = currentPrice - targetCaptureAmount;
        
        // Get current reserves
        (uint112 reserve0, uint112 reserve1,) = liquidityPair.getReserves();
        
        uint256 tokensToSell;
        
        if (liquidityPair.token0() == address(oooweeeToken)) {
            tokensToSell = calculateExactTokensToSell(
                uint256(reserve0),
                uint256(reserve1),
                targetPrice
            );
        } else {
            tokensToSell = calculateExactTokensToSell(
                uint256(reserve1),
                uint256(reserve0),
                targetPrice
            );
        }
        
        // Safety checks
        uint256 ourBalance = oooweeeToken.balanceOf(address(this));
        uint256 maxSell = ourBalance * MAX_SELL_PERCENT / 100;
        
        if (tokensToSell > maxSell) {
            tokensToSell = maxSell;
        }
        
        if (tokensToSell > ourBalance) {
            tokensToSell = ourBalance;
        }
        
        // Check circuit breaker before executing
        _checkCircuitBreaker(tokensToSell);
        
        // Minimum intervention size
        uint256 minTokens = (100 * 1e18) / currentPrice;
        
        if (tokensToSell > minTokens && tokensToSell <= ourBalance) {
            _executeSwap(tokensToSell);
            
            // Update circuit breaker counters
            interventionsToday++;
            tokensUsedToday += tokensToSell;
        }
    }
    
    function calculateExactTokensToSell(
        uint256 tokenReserve,
        uint256 ethReserve,
        uint256 targetPrice
    ) internal pure returns (uint256) {
        uint256 currentPrice = (ethReserve * 1e18) / tokenReserve;
        
        if (targetPrice >= currentPrice) {
            return 0;
        }
        
        uint256 k = tokenReserve * ethReserve;
        uint256 newTokenReserve = sqrt((k * 1e18) / targetPrice);
        
        if (newTokenReserve <= tokenReserve) {
            return 0;
        }
        
        uint256 tokensToSellBeforeFee = newTokenReserve - tokenReserve;
        uint256 tokensToSell = (tokensToSellBeforeFee * 1000) / 997;
        
        return tokensToSell;
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
    
    function _executeSwap(uint256 tokensToSell) internal {
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
            
            // Update statistics
            totalTokensUsed += tokensToSell;
            totalETHCaptured += ethCaptured;
            totalInterventions++;
            
            uint256 newPrice = getCurrentPrice();
            
            emit StabilityIntervention(
                tokensToSell,
                ethCaptured,
                lastCheckPrice,
                newPrice
            );
            
            // CRITICAL FIX: Transfer captured ETH to validator fund
            if (ethCaptured > 0 && validatorFundWallet != address(0)) {
                (bool success,) = payable(validatorFundWallet).call{value: ethCaptured}("");
                require(success, "ETH transfer to validators failed");
                
                totalETHSentToValidators += ethCaptured;
                emit ETHSentToValidators(ethCaptured, block.timestamp);
            }
        } catch {
            // Swap failed, reset approval
            oooweeeToken.approve(address(uniswapRouter), 0);
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
        uint256 timeSinceLastCheck,
        uint256 priceIncreaseFromBaseline
    ) {
        currentPrice = getCurrentPrice();
        uint256 priceIncrease = 0;
        if (currentPrice > baselinePrice && baselinePrice > 0) {
            priceIncrease = ((currentPrice - baselinePrice) * 100) / baselinePrice;
        }
        
        return (
            currentPrice,
            oooweeeToken.balanceOf(address(this)),
            totalInterventions,
            totalTokensUsed,
            totalETHCaptured,
            totalETHSentToValidators,
            block.timestamp - lastCheckTime,
            priceIncrease
        );
    }
    
    function getCircuitBreakerStatus() external view returns (
        bool tripStatus,
        uint256 dailyInterventions,
        uint256 dailyTokensUsed,
        uint256 maxInterventions,
        uint256 maxTokens,
        uint256 timeUntilReset
    ) {
        uint256 resetTime = 0;
        if (block.timestamp < lastDayReset + 1 days) {
            resetTime = (lastDayReset + 1 days) - block.timestamp;
        }
        
        return (
            circuitBreakerTripped,
            interventionsToday,
            tokensUsedToday,
            MAX_DAILY_INTERVENTIONS,
            MAX_DAILY_TOKEN_USE,
            resetTime
        );
    }
    
    function canIntervene() external view returns (bool ready, string memory reason) {
        if (circuitBreakerTripped) {
            return (false, "Circuit breaker active");
        }
        
        if (address(liquidityPair) == address(0)) {
            return (false, "Pair not set");
        }
        
        if (block.timestamp < lastCheckTime + minCheckInterval) {
            return (false, "Too soon to check");
        }
        
        uint256 balance = oooweeeToken.balanceOf(address(this));
        if (balance == 0) {
            return (false, "No tokens to sell");
        }
        
        if (interventionsToday >= MAX_DAILY_INTERVENTIONS) {
            return (false, "Daily intervention limit reached");
        }
        
        uint256 currentPrice = getCurrentPrice();
        uint256 priceIncrease = 0;
        if (currentPrice > baselinePrice && baselinePrice > 0) {
            priceIncrease = ((currentPrice - baselinePrice) * 100) / baselinePrice;
        }
        
        if (priceIncrease < baseThreshold) {
            return (false, "Price increase below minimum threshold");
        }
        
        return (true, "Ready to check stability");
    }
    
    receive() external payable {}
}