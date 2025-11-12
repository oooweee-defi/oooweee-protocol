// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract OOOWEEEStability is Ownable {
    IERC20 public immutable oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    IUniswapV2Pair public liquidityPair;
    
    address public immutable validatorPurchaseWallet;
    
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
    
    // Configuration
    uint256 public constant MIN_CHECK_INTERVAL = 4 hours;
    uint256 public constant MEASUREMENT_WINDOW = 7 days;
    uint256 public constant MAX_SELL_PERCENT = 10; // Max 10% of reserves per intervention
    uint256 public constant SLIPPAGE_TOLERANCE = 200; // 2% slippage protection (98/100)
    
    event StabilityCheck(uint256 priceIncrease, bool interventionTriggered);
    event StabilityIntervention(
        uint256 tokensUsed,
        uint256 ethCaptured,
        uint256 oldPrice,
        uint256 newPrice
    );
    
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
        baseThreshold = 15;      // 15-35% range
        thresholdRange = 20;
        baseCaptureRate = 50;    // 50-70% range
        captureRange = 20;
    }
    
    function setLiquidityPair(address _pair) external onlyOwner {
        require(address(liquidityPair) == address(0), "Already set");
        liquidityPair = IUniswapV2Pair(_pair);
        lastCheckPrice = getCurrentPrice();
        lastCheckTime = block.timestamp;
    }
    
    function checkStability() external {
        require(address(liquidityPair) != address(0), "Pair not set");
        require(block.timestamp >= lastCheckTime + MIN_CHECK_INTERVAL, "Too soon");
        
        uint256 currentPrice = getCurrentPrice();
        uint256 priceIncrease = 0;
        
        if (currentPrice > lastCheckPrice && lastCheckPrice > 0) {
            priceIncrease = ((currentPrice - lastCheckPrice) * 100) / lastCheckPrice;
        }
        
        // Generate pseudo-random threshold for this check
        uint256 threshold = baseThreshold + (seed % thresholdRange);
        
        bool shouldIntervene = priceIncrease > threshold;
        
        emit StabilityCheck(priceIncrease, shouldIntervene);
        
        if (shouldIntervene) {
            // Generate pseudo-random capture rate
            uint256 captureRate = baseCaptureRate + (seed % captureRange);
            
            _performStabilization(currentPrice, lastCheckPrice, captureRate);
            
            // Update seed for next time
            seed = uint256(keccak256(abi.encode(seed, block.timestamp, currentPrice)));
        }
        
        // Update checkpoint
        if (block.timestamp > lastCheckTime + MEASUREMENT_WINDOW) {
            lastCheckPrice = currentPrice;
        }
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
            // Token0 is OOOWEEE, Token1 is ETH/WETH
            tokensToSell = calculateExactTokensToSell(
                uint256(reserve0),  // OOOWEEE reserves
                uint256(reserve1),  // ETH reserves
                targetPrice
            );
        } else {
            // Token0 is ETH/WETH, Token1 is OOOWEEE
            tokensToSell = calculateExactTokensToSell(
                uint256(reserve1),  // OOOWEEE reserves
                uint256(reserve0),  // ETH reserves
                targetPrice
            );
        }
        
        // Safety check - don't sell more than 10% of our reserves in one go
        uint256 maxSell = oooweeeToken.balanceOf(address(this)) * MAX_SELL_PERCENT / 100;
        if (tokensToSell > maxSell) {
            tokensToSell = maxSell;
        }
        
        // Ensure we have tokens and amount is reasonable
        require(tokensToSell > 0, "No tokens to sell");
        require(tokensToSell <= oooweeeToken.balanceOf(address(this)), "Insufficient tokens");
        
        // Execute the swap
        _executeSwap(tokensToSell);
    }
    
    /**
     * @dev Calculate exact tokens needed to reach target price using Uniswap V2 math
     * Based on constant product formula: x * y = k
     * 
     * When we sell Δx tokens, we get Δy ETH
     * New reserves: (x + Δx) * (y - Δy) = k
     * New price = (y - Δy) / (x + Δx) = targetPrice
     * 
     * Solving for Δx (tokens to sell):
     * Δx = sqrt(x * y / targetPrice) - x
     */
    function calculateExactTokensToSell(
        uint256 tokenReserve,
        uint256 ethReserve,
        uint256 targetPrice  // Target price in wei per token (scaled by 1e18)
    ) internal pure returns (uint256) {
        // Current price = ethReserve / tokenReserve (scaled)
        uint256 currentPrice = (ethReserve * 1e18) / tokenReserve;
        
        // If target price is higher than current, we can't sell to increase price
        if (targetPrice >= currentPrice) {
            return 0;
        }
        
        // Calculate k (constant product)
        uint256 k = tokenReserve * ethReserve;
        
        // Using the constant product formula and target price:
        // After selling tokens, we want: newEthReserve / newTokenReserve = targetPrice
        // And: newTokenReserve * newEthReserve = k
        // 
        // Solving: newTokenReserve = sqrt(k * 1e18 / targetPrice)
        uint256 newTokenReserve = sqrt((k * 1e18) / targetPrice);
        
        // Tokens to sell = newTokenReserve - currentTokenReserve
        if (newTokenReserve <= tokenReserve) {
            return 0; // Safety check
        }
        
        uint256 tokensToSellBeforeFee = newTokenReserve - tokenReserve;
        
        // Adjust for Uniswap's 0.3% fee (need to sell slightly more)
        // Actual amount considering fee: amount / 0.997
        uint256 tokensToSell = (tokensToSellBeforeFee * 1000) / 997;
        
        return tokensToSell;
    }
    
    /**
     * @dev Babylonian method for square root calculation
     * Gas efficient and accurate for large numbers
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
    
    function _executeSwap(uint256 tokensToSell) internal {
        // Approve router to spend tokens
        oooweeeToken.approve(address(uniswapRouter), tokensToSell);
        
        // Set up swap path
        address[] memory path = new address[](2);
        path[0] = address(oooweeeToken);
        path[1] = uniswapRouter.WETH();
        
        // Calculate minimum ETH out with slippage protection
        uint256 expectedETH = getExpectedETHOut(tokensToSell);
        uint256 minETHOut = (expectedETH * (10000 - SLIPPAGE_TOLERANCE)) / 10000;
        
        uint256 ethBefore = address(this).balance;
        
        // Execute swap with slippage protection
        uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokensToSell,
            minETHOut,  // Minimum ETH to receive (slippage protection)
            path,
            address(this),
            block.timestamp + 300
        );
        
        uint256 ethCaptured = address(this).balance - ethBefore;
        
        // Send 100% to validators - NO EXTRACTION
        (bool success, ) = validatorPurchaseWallet.call{value: ethCaptured}("");
        require(success, "ETH transfer failed");
        
        // Update statistics
        totalTokensUsed += tokensToSell;
        totalETHCaptured += ethCaptured;
        totalInterventions++;
        
        // Get new price after swap
        uint256 newPrice = getCurrentPrice();
        
        emit StabilityIntervention(
            tokensToSell,
            ethCaptured,
            lastCheckPrice,
            newPrice
        );
    }
    
    /**
     * @dev Calculate expected ETH output for given token input
     * Uses Uniswap V2 formula accounting for 0.3% fee
     */
    function getExpectedETHOut(uint256 tokensIn) public view returns (uint256) {
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
        
        // Uniswap V2 output calculation with 0.3% fee
        uint256 tokensInWithFee = tokensIn * 997;
        uint256 numerator = tokensInWithFee * ethReserve;
        uint256 denominator = (tokenReserve * 1000) + tokensInWithFee;
        
        return numerator / denominator;
    }
    
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
    
    /**
     * @dev Simulate what price would be after selling X tokens
     * Useful for testing and monitoring
     */
    function simulatePriceAfterSell(uint256 tokensToSell) external view returns (uint256) {
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
        
        // Calculate new reserves after swap
        uint256 tokensInWithFee = tokensToSell * 997;
        uint256 ethOut = (tokensInWithFee * ethReserve) / ((tokenReserve * 1000) + tokensInWithFee);
        
        uint256 newTokenReserve = tokenReserve + tokensToSell;
        uint256 newEthReserve = ethReserve - ethOut;
        
        // Return new price
        return (newEthReserve * 1e18) / newTokenReserve;
    }
    
    // View functions for monitoring
    function getStabilityInfo() external view returns (
        uint256 currentPrice,
        uint256 tokenBalance,
        uint256 interventions,
        uint256 tokensUsed,
        uint256 ethCaptured,
        uint256 timeSinceLastCheck
    ) {
        return (
            getCurrentPrice(),
            oooweeeToken.balanceOf(address(this)),
            totalInterventions,
            totalTokensUsed,
            totalETHCaptured,
            block.timestamp - lastCheckTime
        );
    }
    
    // Emergency functions
    function withdrawTokens() external onlyOwner {
        uint256 balance = oooweeeToken.balanceOf(address(this));
        oooweeeToken.transfer(owner(), balance);
    }
    
    function updateStealthParameters(
        uint256 _baseThreshold,
        uint256 _thresholdRange,
        uint256 _baseCaptureRate,
        uint256 _captureRange
    ) external onlyOwner {
        require(_baseThreshold >= 10 && _baseThreshold <= 30, "Invalid base threshold");
        require(_thresholdRange <= 30, "Invalid threshold range");
        require(_baseCaptureRate >= 30 && _baseCaptureRate <= 70, "Invalid base capture");
        require(_captureRange <= 40, "Invalid capture range");
        
        baseThreshold = _baseThreshold;
        thresholdRange = _thresholdRange;
        baseCaptureRate = _baseCaptureRate;
        captureRange = _captureRange;
    }
    
    receive() external payable {}
}