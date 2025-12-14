// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract SavingsPriceOracle is Ownable, ReentrancyGuard {
    // NOTE: These enums must match OOOWEEESavings
    enum Currency {
        USD, EUR, GBP, JPY, CNY, CAD, AUD, CHF, INR, KRW
    }

    enum PriceSource {
        CHAINLINK_UNISWAP,
        UNISWAP_TWAP,
        MANUAL_ORACLE,
        FIXED_RATE,
        MULTI_POOL_AVERAGE
    }

    struct LiquidityPoolInfo {
        address pool;
        uint256 weight;
        uint256 lastValidPrice;
        uint256 lastValidTimestamp;
    }

    uint256 public constant PRICE_STALENESS_THRESHOLD = 1 hours;
    uint256 public constant CHAINLINK_DECIMALS = 8; // Chainlink uses 8 decimals

    IUniswapV2Router02 public immutable uniswapRouter;
    address public oooweeePool;

    mapping(Currency => address) public priceFeeds;
    mapping(Currency => uint8) public currencyDecimals;
    mapping(Currency => uint256) public defaultPrices;
    mapping(Currency => uint256) public emergencyFixedRates;

    PriceSource public activePriceSource = PriceSource.CHAINLINK_UNISWAP;
    bool public emergencyPriceMode;

    LiquidityPoolInfo[] public liquidityPools;

    event PriceFeedUpdated(Currency currency, address feed);
    event PriceSourceChanged(PriceSource oldSource, PriceSource newSource);
    event EmergencyPriceModeActivated(string reason);
    event ManualPriceSet(Currency currency, uint256 price);
    event PoolAdded(address pool, uint256 weight);
    event PoolDeactivated(address pool, string reason);
    event PoolAddressSet(address indexed pool);

    constructor(address _uniswapRouter) Ownable() {
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        
        // Initialize currency decimals (smallest unit representation)
        // UPDATED: Using 4 decimals for sub-cent precision
        // This allows prices like 0.33 cents (33 in 4-decimal format) to be represented
        // Without this, sub-cent prices round to 0 and break the oracle
        currencyDecimals[Currency.USD] = 4;  // 10000 = $1.00
        currencyDecimals[Currency.EUR] = 4;  // 10000 = €1.00
        currencyDecimals[Currency.GBP] = 4;  // 10000 = £1.00
        currencyDecimals[Currency.JPY] = 2;  // 100 = ¥1 (Yen has no subdivision, but use 2 for sub-yen)
        currencyDecimals[Currency.CNY] = 4;  // 10000 = ¥1.00
        currencyDecimals[Currency.CAD] = 4;  // 10000 = C$1.00
        currencyDecimals[Currency.AUD] = 4;  // 10000 = A$1.00
        currencyDecimals[Currency.CHF] = 4;  // 10000 = CHF1.00
        currencyDecimals[Currency.INR] = 4;  // 10000 = ₹1.00
        currencyDecimals[Currency.KRW] = 2;  // 100 = ₩1 (Won has no subdivision)
    }

    // ===== Core price accessors =====

    /**
     * @notice Get ETH price in fiat from Chainlink (8 decimals)
     * @param currency The target currency
     * @return Price with 8 decimals (e.g., 185000000000 = $1850.00)
     */
    function getETHPrice(Currency currency) public view returns (uint256) {
        address feedAddress = priceFeeds[currency];
        if (feedAddress == address(0)) {
            return defaultPrices[currency];
        }

        AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
        try priceFeed.latestRoundData() returns (
            uint80,
            int256 price,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            // Staleness check is appropriate for Chainlink feeds
            if (updatedAt <= block.timestamp - PRICE_STALENESS_THRESHOLD) {
                return defaultPrices[currency];
            }
            if (price <= 0) {
                return defaultPrices[currency];
            }
            return uint256(price);
        } catch {
            return defaultPrices[currency];
        }
    }

    /**
     * @notice Get OOOWEEE price in fiat (state-changing version)
     * @dev Updates lastValidPrice cache - use for contract logic
     * @param currency The target currency
     * @return Price in smallest currency unit (4 decimals: 10000 = $1.00)
     */
    function getOooweeePrice(Currency currency) public returns (uint256) {
        (bool success, uint256 primaryPrice) = _tryPriceSource(activePriceSource, currency);
        uint256 fallbackPrice;

        if (success && _isPriceReasonable(primaryPrice, currency)) {
            if (liquidityPools.length > 0) {
                liquidityPools[0].lastValidPrice = primaryPrice;
                liquidityPools[0].lastValidTimestamp = block.timestamp;
            }
            return primaryPrice;
        }

        (success, fallbackPrice) = _tryPriceSource(PriceSource.FIXED_RATE, currency);

        if (success && _isPriceReasonable(fallbackPrice, currency)) {
            return fallbackPrice;
        }

        return _getEmergencyPrice(currency);
    }

    /**
     * @notice Get OOOWEEE price in fiat (view version for frontend)
     * @dev Does NOT update lastValidPrice cache - safe for read-only calls
     * @param currency The target currency
     * @return Price in smallest currency unit (4 decimals: 10000 = $1.00)
     */
    function getOooweeePriceView(Currency currency) public view returns (uint256) {
        (bool success, uint256 primaryPrice) = _tryPriceSourceView(activePriceSource, currency);
        uint256 fallbackPrice;

        if (success && _isPriceReasonable(primaryPrice, currency)) {
            return primaryPrice;
        }

        (success, fallbackPrice) = _tryPriceSourceView(PriceSource.FIXED_RATE, currency);

        if (success && _isPriceReasonable(fallbackPrice, currency)) {
            return fallbackPrice;
        }

        return _getEmergencyPrice(currency);
    }

    // ===== Internal price source handlers =====

    function _tryPriceSource(PriceSource source, Currency currency)
        internal view returns (bool success, uint256 price)
    {
        if (source == PriceSource.CHAINLINK_UNISWAP) {
            return _getChainlinkUniswapPrice(currency);
        } else if (source == PriceSource.UNISWAP_TWAP) {
            return _getUniswapTWAPPrice(currency);
        } else if (source == PriceSource.MANUAL_ORACLE) {
            return _getManualPrice(currency);
        } else if (source == PriceSource.FIXED_RATE) {
            return _getFixedRate(currency);
        } else if (source == PriceSource.MULTI_POOL_AVERAGE) {
            return _getMultiPoolAverage(currency);
        }
        return (false, 0);
    }

    function _tryPriceSourceView(PriceSource source, Currency currency)
        internal view returns (bool success, uint256 price)
    {
        // Same as _tryPriceSource - all internal functions are already view
        return _tryPriceSource(source, currency);
    }

    /**
     * @notice Calculate OOOWEEE price using Chainlink ETH price and Uniswap reserves
     * @dev FIXED: Removed staleness check for Uniswap reserves - they are always current state
     *      Using 4 decimal precision to capture sub-cent prices accurately
     * @param currency The target currency
     * @return success Whether price was successfully retrieved
     * @return price Price in smallest currency unit (4 decimals for most currencies)
     */
    function _getChainlinkUniswapPrice(Currency currency)
        internal view returns (bool success, uint256 price)
    {
        uint256 ethPrice = getETHPrice(currency); // 8 decimals from Chainlink
        if (ethPrice == 0) return (false, 0);
        if (oooweeePool == address(0)) return (false, 0);

        try IUniswapV2Pair(oooweeePool).getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 /* lastUpdate - intentionally ignored */
        ) {
            // NOTE: No staleness check for Uniswap reserves!
            // Uniswap reserves are ALWAYS the current state of the pool.
            
            if (reserve0 == 0 || reserve1 == 0) return (false, 0);

            address token0 = IUniswapV2Pair(oooweeePool).token0();
            uint256 priceInEth; // 18 decimals
            
            if (token0 == uniswapRouter.WETH()) {
                // WETH is token0, OOOWEEE is token1
                // priceInEth = ETH per OOOWEEE = reserve0 / reserve1
                priceInEth = (uint256(reserve0) * 1e18) / uint256(reserve1);
            } else {
                // OOOWEEE is token0, WETH is token1
                // priceInEth = ETH per OOOWEEE = reserve1 / reserve0
                priceInEth = (uint256(reserve1) * 1e18) / uint256(reserve0);
            }
            
            // Calculate final price in currency's smallest unit
            // priceInEth has 18 decimals
            // ethPrice has 8 decimals (Chainlink standard)
            // We want result in currencyDecimals (now 4 for most currencies)
            //
            // Formula: (priceInEth * ethPrice) / 10^(18 + 8 - targetDecimals)
            
            uint8 targetDecimals = currencyDecimals[currency];
            // Safety: ensure we have valid decimals
            if (targetDecimals == 0) {
                targetDecimals = 4; // Default to 4 decimals
            }
            
            // divisor = 10^(18 + 8 - targetDecimals) = 10^(26 - targetDecimals)
            uint256 divisor = 10 ** (18 + CHAINLINK_DECIMALS - targetDecimals);
            uint256 calculatedPrice = (priceInEth * ethPrice) / divisor;
            
            return (true, calculatedPrice);
        } catch {
            return (false, 0);
        }
    }

    function _getUniswapTWAP(Currency /*currency*/)
        internal view returns (bool, uint256)
    {
        // TWAP implementation placeholder
        return (false, 0);
    }

    function _getUniswapTWAPPrice(Currency currency)
        internal view returns (bool, uint256)
    {
        return _getUniswapTWAP(currency);
    }

    function _getManualPrice(Currency currency)
        internal view returns (bool, uint256)
    {
        uint256 price = defaultPrices[currency];
        if (price == 0) return (false, 0);
        return (true, price);
    }

    function _getFixedRate(Currency currency)
        internal view returns (bool, uint256)
    {
        uint256 price = emergencyFixedRates[currency];
        if (price == 0) return (false, 0);
        return (true, price);
    }

    /**
     * @notice Calculate weighted average price from multiple liquidity pools
     * @dev FIXED: Removed staleness check for Uniswap reserves
     */
    function _getMultiPoolAverage(Currency currency)
        internal view returns (bool, uint256)
    {
        if (liquidityPools.length == 0) return (false, 0);

        uint256 totalWeightedPrice;
        uint256 totalWeight;

        for (uint256 i = 0; i < liquidityPools.length; i++) {
            LiquidityPoolInfo storage poolInfo = liquidityPools[i];
            if (poolInfo.pool == address(0) || poolInfo.weight == 0) continue;

            try IUniswapV2Pair(poolInfo.pool).getReserves() returns (
                uint112 reserve0,
                uint112 reserve1,
                uint32 /* lastUpdate - intentionally ignored */
            ) {
                // NOTE: No staleness check - Uniswap reserves are always current
                if (reserve0 == 0 || reserve1 == 0) continue;

                address token0 = IUniswapV2Pair(poolInfo.pool).token0();
                uint256 priceInEth;
                if (token0 == uniswapRouter.WETH()) {
                    priceInEth = (uint256(reserve0) * 1e18) / uint256(reserve1);
                } else {
                    priceInEth = (uint256(reserve1) * 1e18) / uint256(reserve0);
                }

                uint256 ethPrice = getETHPrice(currency);
                if (ethPrice == 0) continue;

                uint8 targetDecimals = currencyDecimals[currency];
                if (targetDecimals == 0) {
                    targetDecimals = 4;
                }
                uint256 divisor = 10 ** (18 + CHAINLINK_DECIMALS - targetDecimals);
                uint256 poolPrice = (priceInEth * ethPrice) / divisor;

                totalWeightedPrice += poolPrice * poolInfo.weight;
                totalWeight += poolInfo.weight;
            } catch {
                continue;
            }
        }

        if (totalWeight == 0) return (false, 0);
        return (true, totalWeightedPrice / totalWeight);
    }

    function _isPriceReasonable(uint256 price, Currency currency)
        internal view returns (bool)
    {
        if (price == 0) return false;
        
        uint8 decimals = currencyDecimals[currency];
        if (decimals == 0) {
            decimals = 4; // Default
        }
        
        // For currencies with 2 decimals (JPY, KRW), allow broader range
        if (decimals == 2) {
            // Price should be between 0.01 and 10000 units
            return price >= 1 && price <= 1000000;
        }
        
        // For currencies with 4 decimals
        // Price should be between 0.0001 (1 unit) and $1000 (10000000 units) per token
        uint256 minPrice = 1; // 0.0001 of currency unit
        uint256 maxPrice = 1000 * (10 ** decimals); // $1000 maximum per token
        
        return price >= minPrice && price <= maxPrice;
    }

    function _getEmergencyPrice(Currency currency) internal view returns (uint256) {
        // Try cached price first
        if (liquidityPools.length > 0) {
            uint256 lastGood = liquidityPools[0].lastValidPrice;
            if (
                lastGood > 0 &&
                block.timestamp < liquidityPools[0].lastValidTimestamp + 24 hours
            ) {
                return lastGood;
            }
        }

        // Try fixed emergency rate
        uint256 fixedRate = emergencyFixedRates[currency];
        if (fixedRate > 0) return fixedRate;

        // Last resort: return a very small default price
        uint8 decimals = currencyDecimals[currency];
        if (decimals == 0) {
            decimals = 4;
        }
        
        // Return ~$0.001 equivalent in smallest units (10 for 4 decimals = $0.001)
        return 10;
    }

    // ===== Admin setters =====

    function setOooweeePool(address _pool) external onlyOwner {
        oooweeePool = _pool;
        emit PoolAddressSet(_pool);
    }

    function setPriceFeed(Currency currency, address feed) external onlyOwner {
        priceFeeds[currency] = feed;
        emit PriceFeedUpdated(currency, feed);
    }

    function setDefaultPrice(Currency currency, uint256 price) external onlyOwner {
        defaultPrices[currency] = price;
        emit ManualPriceSet(currency, price);
    }

    function setEmergencyFixedRate(Currency currency, uint256 rate) external onlyOwner {
        emergencyFixedRates[currency] = rate;
    }

    function setCurrencyDecimals(Currency currency, uint8 decimals_) external onlyOwner {
        currencyDecimals[currency] = decimals_;
    }

    function setActivePriceSource(PriceSource source) external onlyOwner {
        PriceSource old = activePriceSource;
        activePriceSource = source;
        emit PriceSourceChanged(old, source);
    }

    function setEmergencyMode(bool enabled, string calldata reason) external onlyOwner {
        emergencyPriceMode = enabled;
        if (enabled) {
            emit EmergencyPriceModeActivated(reason);
        }
    }

    function addLiquidityPool(address pool, uint256 weight) external onlyOwner {
        liquidityPools.push(
            LiquidityPoolInfo({
                pool: pool,
                weight: weight,
                lastValidPrice: 0,
                lastValidTimestamp: 0
            })
        );
        emit PoolAdded(pool, weight);
    }

    function removeLiquidityPool(uint256 index) external onlyOwner {
        require(index < liquidityPools.length, "Invalid index");
        
        address pool = liquidityPools[index].pool;
        
        // Move last element to deleted position and pop
        liquidityPools[index] = liquidityPools[liquidityPools.length - 1];
        liquidityPools.pop();
        
        emit PoolDeactivated(pool, "Removed by admin");
    }

    // ===== View helpers =====

    function getLiquidityPoolCount() external view returns (uint256) {
        return liquidityPools.length;
    }

    function getCurrencyDecimals(Currency currency) external view returns (uint8) {
        return currencyDecimals[currency];
    }
}
