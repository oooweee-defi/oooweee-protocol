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
    
    address public validatorPurchaseWallet;
    
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
    
    // Price tracking for better intervention
    uint256 public baselinePrice;      // Long-term baseline
    uint256 public lastInterventionPrice;
    uint256 public consecutiveSpikes;
    
    // Adjustable Configuration
    uint256 public minCheckInterval = 15 minutes;  // Can be changed by owner
    uint256 public constant MIN_INTERVAL_LIMIT = 5 minutes;   // Safety floor
    uint256 public constant MAX_INTERVAL_LIMIT = 24 hours;    // Safety ceiling
    
    uint256 public constant MEASUREMENT_WINDOW = 1 days;
    uint256 public constant MAX_SELL_PERCENT = 15;
    uint256 public constant SLIPPAGE_TOLERANCE = 300;
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
    
    event BaselineUpdated(uint256 oldBaseline, uint256 newBaseline);
    event TokensDeposited(address indexed from, uint256 amount);
    event CheckIntervalUpdated(uint256 newInterval);
    
    constructor(
        address _oooweeeToken,
        address _uniswapRouter,
        address _validatorPurchaseWallet
    ) Ownable(msg.sender) {
        oooweeeToken = IERC20(_oooweeeToken);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        validatorPurchaseWallet = _validatorPurchaseWallet;
        
        // Initialize stealth parameters
        seed = uint256(keccak256(abi.encode(block.timestamp, block.difficulty, msg.sender)));
        baseThreshold = 20;      // 20-40% range
        thresholdRange = 20;
        baseCaptureRate = 60;    // 60-80% range
        captureRange = 20;
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
    }
    
    function setValidatorWallet(address _wallet) external onlyOwner {
        validatorPurchaseWallet = _wallet;
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
    function checkStability() external nonReentrant {
        _doStabilityCheck();
    }
    
    // ============ Internal Functions ============
    
    function _doStabilityCheck() internal {
        require(address(liquidityPair) != address(0), "Pair not set");
        require(block.timestamp >= lastCheckTime + minCheckInterval, "Too soon");
        
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
        
        bool shouldIntervene = priceIncrease > threshold && 
                              oooweeeToken.balanceOf(address(this)) > 0;
        
        emit StabilityCheck(currentPrice, priceIncrease, shouldIntervene, threshold);
        
        if (shouldIntervene) {
            consecutiveSpikes++;
            
            // Generate pseudo-random capture rate
            uint256 captureRate = baseCaptureRate + 
                (uint256(keccak256(abi.encode(seed, currentPrice))) % captureRange);
            
            // Increase capture rate for larger spikes
            if (priceIncrease > 100) {
                captureRate = captureRate * 120 / 100;
                if (captureRate > 90) captureRate = 90;
            }
            
            uint256 ethBefore = address(this).balance;
            _performStabilization(currentPrice, baselinePrice, captureRate);
            uint256 ethCaptured = address(this).balance - ethBefore;
            
            // Send ALL captured ETH to validators - NO REWARDS
            if (ethCaptured > 0 && validatorPurchaseWallet != address(0)) {
                (bool success, ) = validatorPurchaseWallet.call{value: ethCaptured}("");
                require(success, "ETH transfer failed");
            }
            
            lastInterventionPrice = currentPrice;
            
            // Update seed for next time
            seed = uint256(keccak256(abi.encode(seed, block.timestamp, currentPrice, tx.origin)));
        } else {
            // Reset consecutive spikes if no intervention
            if (priceIncrease < threshold / 2) {
                consecutiveSpikes = 0;
            }
            
            // Update baseline if price has stabilized at a higher level
            if (currentPrice > baselinePrice * BASELINE_UPDATE_THRESHOLD / 100 &&
                currentPrice < baselinePrice * 150 / 100 &&
                block.timestamp > lastCheckTime + MEASUREMENT_WINDOW) {
                uint256 oldBaseline = baselinePrice;
                baselinePrice = (baselinePrice + currentPrice) / 2;
                emit BaselineUpdated(oldBaseline, baselinePrice);
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
        
        // Minimum intervention size
        uint256 minTokens = (100 * 1e18) / currentPrice;
        
        if (tokensToSell > minTokens && tokensToSell <= ourBalance) {
            _executeSwap(tokensToSell);
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
            block.timestamp - lastCheckTime,
            priceIncrease
        );
    }
    
    function canIntervene() external view returns (bool ready, string memory reason) {
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
    
    // ============ Emergency Functions ============
    
    /**
     * @dev Emergency manual intervention - owner can force a specific sell amount
     */
    function emergencyIntervene(uint256 tokensToSell) external onlyOwner nonReentrant {
        require(tokensToSell > 0, "Invalid amount");
        require(tokensToSell <= oooweeeToken.balanceOf(address(this)), "Insufficient balance");
        _executeSwap(tokensToSell);
    }
    
    function withdrawTokens() external onlyOwner {
        uint256 balance = oooweeeToken.balanceOf(address(this));
        oooweeeToken.transfer(owner(), balance);
    }
    
    function withdrawETH() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
    
    receive() external payable {}
}