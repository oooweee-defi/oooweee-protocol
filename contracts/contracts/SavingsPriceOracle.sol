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
    }

    // ===== Core price accessors =====

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

    function _getChainlinkUniswapPrice(Currency currency)
        internal view returns (bool success, uint256 price)
    {
        uint256 ethPrice = getETHPrice(currency);
        if (ethPrice == 0) return (false, 0);
        if (oooweeePool == address(0)) return (false, 0);

        try IUniswapV2Pair(oooweeePool).getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 lastUpdate
        ) {
            if (uint256(lastUpdate) <= block.timestamp - PRICE_STALENESS_THRESHOLD) {
                return (false, 0);
            }
            if (reserve0 == 0 || reserve1 == 0) return (false, 0);

            address token0 = IUniswapV2Pair(oooweeePool).token0();
            if (token0 == uniswapRouter.WETH()) {
                uint256 priceInEth = (uint256(reserve0) * 1e18) / uint256(reserve1);
                return (true, (priceInEth * ethPrice) / 1e18);
            } else {
                uint256 priceInEth = (uint256(reserve1) * 1e18) / uint256(reserve0);
                return (true, (priceInEth * ethPrice) / 1e18);
            }
        } catch {
            return (false, 0);
        }
    }

    function _getUniswapTWAP(Currency /*currency*/)
        internal view returns (bool, uint256)
    {
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
                uint32 lastUpdate
            ) {
                if (uint256(lastUpdate) <= block.timestamp - PRICE_STALENESS_THRESHOLD) {
                    continue;
                }
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

                uint256 poolPrice = (priceInEth * ethPrice) / 1e18;
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
        if (currencyDecimals[currency] < 2) return true;

        uint256 minPrice = 10 ** (currencyDecimals[currency] - 4);
        uint256 maxPrice = 10 * (10 ** currencyDecimals[currency]);
        return price >= minPrice && price <= maxPrice;
    }

    function _getEmergencyPrice(Currency currency) internal view returns (uint256) {
        if (liquidityPools.length > 0) {
            uint256 lastGood = liquidityPools[0].lastValidPrice;
            if (
                lastGood > 0 &&
                block.timestamp < liquidityPools[0].lastValidTimestamp + 24 hours
            ) {
                return lastGood;
            }
        }

        uint256 fixedRate = emergencyFixedRates[currency];
        if (fixedRate > 0) return fixedRate;

        return 10 ** (currencyDecimals[currency] - 2);
    }

    // ===== Admin setters (kept minimal for now) =====

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
}
