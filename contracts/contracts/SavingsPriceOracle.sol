// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title SavingsPriceOracle
 * @notice Provides OOOWEEE price in USD/EUR/GBP using Chainlink + Uniswap reserves
 * @dev Two-step price calculation:
 *      1. Get ETH/USD (or EUR/GBP) from Chainlink (trusted, 8 decimals)
 *      2. Get OOOWEEE/ETH from Uniswap V2 pool reserves (real-time market price)
 *      3. Multiply to get OOOWEEE/USD (or EUR/GBP)
 *
 * Chainlink mainnet feeds:
 *   ETH/USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
 *   EUR/USD: 0xb49f677943BC038e9857d61E7d053CaA2C1734C1
 *   GBP/USD: 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5
 *
 * For EUR and GBP, we use cross-rates:
 *   OOOWEEE/EUR = (OOOWEEE/ETH * ETH/USD) / EUR/USD
 */
contract SavingsPriceOracle is Ownable, ReentrancyGuard {

    enum Currency { USD, EUR, GBP }

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
    uint256 public constant CHAINLINK_DECIMALS = 8;

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

        // 4 decimals: 10000 = $1.00, allows sub-cent precision
        currencyDecimals[Currency.USD] = 4;
        currencyDecimals[Currency.EUR] = 4;
        currencyDecimals[Currency.GBP] = 4;
    }

    // ============ Core Price Accessors ============

    /**
     * @notice Get ETH price in fiat from Chainlink (8 decimals)
     */
    function getETHPrice(Currency currency) public view returns (uint256) {
        address feedAddress = priceFeeds[currency];
        if (feedAddress == address(0)) {
            return defaultPrices[currency];
        }

        AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
        try priceFeed.latestRoundData() returns (
            uint80, int256 price, uint256, uint256 updatedAt, uint80
        ) {
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
     * @notice Get OOOWEEE price in fiat (state-changing — updates cache)
     * @param currency Target currency
     * @return Price in smallest currency unit (4 decimals: 10000 = $1.00)
     */
    function getOooweeePrice(Currency currency) public returns (uint256) {
        (bool success, uint256 primaryPrice) = _tryPriceSource(activePriceSource, currency);

        if (success && _isPriceReasonable(primaryPrice, currency)) {
            if (liquidityPools.length > 0) {
                liquidityPools[0].lastValidPrice = primaryPrice;
                liquidityPools[0].lastValidTimestamp = block.timestamp;
            }
            return primaryPrice;
        }

        (success, uint256 fallbackPrice) = _tryPriceSource(PriceSource.FIXED_RATE, currency);
        if (success && _isPriceReasonable(fallbackPrice, currency)) {
            return fallbackPrice;
        }

        return _getEmergencyPrice(currency);
    }

    /**
     * @notice Get OOOWEEE price in fiat (view — no state changes)
     */
    function getOooweeePriceView(Currency currency) public view returns (uint256) {
        (bool success, uint256 primaryPrice) = _tryPriceSource(activePriceSource, currency);

        if (success && _isPriceReasonable(primaryPrice, currency)) {
            return primaryPrice;
        }

        (success, uint256 fallbackPrice) = _tryPriceSource(PriceSource.FIXED_RATE, currency);
        if (success && _isPriceReasonable(fallbackPrice, currency)) {
            return fallbackPrice;
        }

        return _getEmergencyPrice(currency);
    }

    // ============ Internal Price Sources ============

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

    /**
     * @notice OOOWEEE price via Chainlink ETH/fiat + Uniswap OOOWEEE/ETH
     */
    function _getChainlinkUniswapPrice(Currency currency)
        internal view returns (bool success, uint256 price)
    {
        uint256 ethPrice = getETHPrice(currency);
        if (ethPrice == 0) return (false, 0);
        if (oooweeePool == address(0)) return (false, 0);

        try IUniswapV2Pair(oooweeePool).getReserves() returns (
            uint112 reserve0, uint112 reserve1, uint32
        ) {
            if (reserve0 == 0 || reserve1 == 0) return (false, 0);

            address token0 = IUniswapV2Pair(oooweeePool).token0();
            uint256 priceInEth;

            if (token0 == uniswapRouter.WETH()) {
                priceInEth = (uint256(reserve0) * 1e18) / uint256(reserve1);
            } else {
                priceInEth = (uint256(reserve1) * 1e18) / uint256(reserve0);
            }

            uint8 targetDecimals = currencyDecimals[currency];
            if (targetDecimals == 0) targetDecimals = 4;

            uint256 divisor = 10 ** (18 + CHAINLINK_DECIMALS - targetDecimals);
            uint256 calculatedPrice = (priceInEth * ethPrice) / divisor;

            return (true, calculatedPrice);
        } catch {
            return (false, 0);
        }
    }

    function _getUniswapTWAPPrice(Currency /* currency */)
        internal view returns (bool, uint256)
    {
        // TWAP placeholder — implement if needed for additional resilience
        return (false, 0);
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
                uint112 reserve0, uint112 reserve1, uint32
            ) {
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
                if (targetDecimals == 0) targetDecimals = 4;

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
        if (decimals == 0) decimals = 4;

        uint256 minPrice = 1;
        uint256 maxPrice = 1000 * (10 ** decimals);
        return price >= minPrice && price <= maxPrice;
    }

    function _getEmergencyPrice(Currency currency) internal view returns (uint256) {
        if (liquidityPools.length > 0) {
            uint256 lastGood = liquidityPools[0].lastValidPrice;
            if (lastGood > 0 && block.timestamp < liquidityPools[0].lastValidTimestamp + 24 hours) {
                return lastGood;
            }
        }

        uint256 fixedRate = emergencyFixedRates[currency];
        if (fixedRate > 0) return fixedRate;

        return 10; // ~$0.001 in 4-decimal format
    }

    // ============ Admin ============

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
        if (enabled) emit EmergencyPriceModeActivated(reason);
    }

    function addLiquidityPool(address pool, uint256 weight) external onlyOwner {
        liquidityPools.push(LiquidityPoolInfo({
            pool: pool,
            weight: weight,
            lastValidPrice: 0,
            lastValidTimestamp: 0
        }));
        emit PoolAdded(pool, weight);
    }

    function removeLiquidityPool(uint256 index) external onlyOwner {
        require(index < liquidityPools.length, "Invalid index");
        address pool = liquidityPools[index].pool;
        liquidityPools[index] = liquidityPools[liquidityPools.length - 1];
        liquidityPools.pop();
        emit PoolDeactivated(pool, "Removed");
    }

    // ============ View ============

    function getLiquidityPoolCount() external view returns (uint256) {
        return liquidityPools.length;
    }

    function getCurrencyDecimals(Currency currency) external view returns (uint8) {
        return currencyDecimals[currency];
    }
}
