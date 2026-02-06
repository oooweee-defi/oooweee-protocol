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
 *      2. Get OOOWEEE/ETH from Uniswap V2 pool reserves (spot or TWAP)
 *      3. Multiply to get OOOWEEE/USD (or EUR/GBP)
 *
 * Chainlink mainnet feeds:
 *   ETH/USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
 *   EUR/USD: 0xb49f677943BC038e9857d61E7d053CaA2C1734C1
 *   GBP/USD: 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5
 *
 * For EUR and GBP, we use cross-rates:
 *   OOOWEEE/EUR = (OOOWEEE/ETH * ETH/USD) / EUR/USD
 *
 * TWAP is used for withdrawal validation to prevent flash loan manipulation.
 */
contract SavingsPriceOracle is Ownable, ReentrancyGuard {

    enum Currency { USD, EUR, GBP }

    enum PriceSource {
        CHAINLINK_UNISWAP,
        UNISWAP_TWAP,
        FIXED_RATE
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

    // ============ Price Cache ============

    uint256 public lastValidPrice;
    uint256 public lastValidPriceTimestamp;

    // ============ TWAP State ============

    uint256 public twapPrice0CumulativeLast;
    uint256 public twapPrice1CumulativeLast;
    uint32 public twapTimestampLast;
    uint256 public twapPriceAverage;           // OOOWEEE price in ETH, scaled by 1e18
    uint256 public constant TWAP_PERIOD = 30 minutes;

    // ============ Events ============

    event PriceFeedUpdated(Currency currency, address feed);
    event PriceSourceChanged(PriceSource oldSource, PriceSource newSource);
    event EmergencyPriceModeActivated(string reason);
    event ManualPriceSet(Currency currency, uint256 price);
    event PoolAddressSet(address indexed pool);
    event TWAPUpdated(uint256 twapPriceAverage, uint32 timestamp);

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
            lastValidPrice = primaryPrice;
            lastValidPriceTimestamp = block.timestamp;
            return primaryPrice;
        }

        uint256 fallbackPrice;
        (success, fallbackPrice) = _tryPriceSource(PriceSource.FIXED_RATE, currency);
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

        uint256 fallbackPrice;
        (success, fallbackPrice) = _tryPriceSource(PriceSource.FIXED_RATE, currency);
        if (success && _isPriceReasonable(fallbackPrice, currency)) {
            return fallbackPrice;
        }

        return _getEmergencyPrice(currency);
    }

    /**
     * @notice Get OOOWEEE price validated against TWAP to prevent flash loan manipulation
     * @dev Returns the lower of spot and TWAP, or TWAP alone if >10% divergence.
     *      Used by OOOWEEESavings for withdrawal checks.
     * @param currency Target currency
     * @return Price in smallest currency unit
     */
    function getValidatedOooweeePrice(Currency currency) public returns (uint256) {
        updateTWAP();

        (bool spotSuccess, uint256 spotPrice) = _getChainlinkUniswapPrice(currency);
        (bool twapSuccess, uint256 twapPrice) = _getUniswapTWAPPrice(currency);

        if (spotSuccess && twapSuccess) {
            uint256 lower = spotPrice < twapPrice ? spotPrice : twapPrice;
            uint256 higher = spotPrice >= twapPrice ? spotPrice : twapPrice;

            // If divergence > 10%, use TWAP (more manipulation-resistant)
            if (higher > (lower * 110) / 100) {
                return twapPrice;
            }
            return lower;
        }

        if (twapSuccess) return twapPrice;
        if (spotSuccess) return spotPrice;

        return _getEmergencyPrice(currency);
    }

    /**
     * @notice View version of getValidatedOooweeePrice
     */
    function getValidatedOooweeePriceView(Currency currency) public view returns (uint256) {
        (bool spotSuccess, uint256 spotPrice) = _getChainlinkUniswapPrice(currency);
        (bool twapSuccess, uint256 twapPrice) = _getUniswapTWAPPrice(currency);

        if (spotSuccess && twapSuccess) {
            uint256 lower = spotPrice < twapPrice ? spotPrice : twapPrice;
            uint256 higher = spotPrice >= twapPrice ? spotPrice : twapPrice;

            if (higher > (lower * 110) / 100) {
                return twapPrice;
            }
            return lower;
        }

        if (twapSuccess) return twapPrice;
        if (spotSuccess) return spotPrice;

        return _getEmergencyPrice(currency);
    }

    // ============ TWAP ============

    /**
     * @notice Update the TWAP accumulator snapshot
     * @dev Uses Uniswap V2's built-in price0CumulativeLast/price1CumulativeLast.
     *      Can be called by anyone. Must be called at least every TWAP_PERIOD
     *      for the TWAP to remain fresh.
     *
     *      Uniswap V2 cumulative prices use intentional uint256 overflow,
     *      so subtraction is done in an unchecked block (correct modulo 2^256).
     */
    function updateTWAP() public {
        if (oooweeePool == address(0)) return;

        IUniswapV2Pair pair = IUniswapV2Pair(oooweeePool);

        uint256 price0Cumulative = pair.price0CumulativeLast();
        uint256 price1Cumulative = pair.price1CumulativeLast();
        (, , uint32 blockTimestampLast) = pair.getReserves();

        // Use pair's last sync timestamp for accuracy
        uint32 timeElapsed = blockTimestampLast - twapTimestampLast;
        if (timeElapsed < uint32(TWAP_PERIOD) && twapTimestampLast != 0) return;

        if (twapTimestampLast != 0 && timeElapsed > 0) {
            address token0 = pair.token0();

            // Uniswap V2 cumulative prices overflow intentionally — unchecked is correct
            unchecked {
                if (token0 == uniswapRouter.WETH()) {
                    // token0 = WETH, token1 = OOOWEEE
                    // price1CumulativeLast = cumulative(reserve0 / reserve1) = cumulative(WETH/OOOWEEE)
                    uint256 delta = price1Cumulative - twapPrice1CumulativeLast;
                    twapPriceAverage = (delta * 1e18) / (uint256(timeElapsed) << 112);
                } else {
                    // token0 = OOOWEEE, token1 = WETH
                    // price0CumulativeLast = cumulative(reserve1 / reserve0) = cumulative(WETH/OOOWEEE)
                    uint256 delta = price0Cumulative - twapPrice0CumulativeLast;
                    twapPriceAverage = (delta * 1e18) / (uint256(timeElapsed) << 112);
                }
            }

            emit TWAPUpdated(twapPriceAverage, blockTimestampLast);
        }

        twapPrice0CumulativeLast = price0Cumulative;
        twapPrice1CumulativeLast = price1Cumulative;
        twapTimestampLast = blockTimestampLast;
    }

    // ============ Internal Price Sources ============

    function _tryPriceSource(PriceSource source, Currency currency)
        internal view returns (bool success, uint256 price)
    {
        if (source == PriceSource.CHAINLINK_UNISWAP) {
            return _getChainlinkUniswapPrice(currency);
        } else if (source == PriceSource.UNISWAP_TWAP) {
            return _getUniswapTWAPPrice(currency);
        } else if (source == PriceSource.FIXED_RATE) {
            return _getFixedRate(currency);
        }
        return (false, 0);
    }

    /**
     * @notice OOOWEEE price via Chainlink ETH/fiat + Uniswap OOOWEEE/ETH spot
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

    /**
     * @notice OOOWEEE price via Chainlink ETH/fiat + Uniswap V2 TWAP
     */
    function _getUniswapTWAPPrice(Currency currency)
        internal view returns (bool, uint256)
    {
        if (twapPriceAverage == 0) return (false, 0);

        // Check TWAP freshness
        uint32 currentTimestamp = uint32(block.timestamp % 2**32);
        uint32 twapAge = currentTimestamp - twapTimestampLast;
        if (twapAge > uint32(PRICE_STALENESS_THRESHOLD)) {
            return (false, 0);
        }

        uint256 ethPrice = getETHPrice(currency);
        if (ethPrice == 0) return (false, 0);

        uint8 targetDecimals = currencyDecimals[currency];
        if (targetDecimals == 0) targetDecimals = 4;

        uint256 divisor = 10 ** (18 + CHAINLINK_DECIMALS - targetDecimals);
        uint256 twapFiatPrice = (twapPriceAverage * ethPrice) / divisor;

        return (true, twapFiatPrice);
    }

    function _getFixedRate(Currency currency)
        internal view returns (bool, uint256)
    {
        uint256 price = emergencyFixedRates[currency];
        if (price == 0) return (false, 0);
        return (true, price);
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
        if (lastValidPrice > 0 && block.timestamp < lastValidPriceTimestamp + 24 hours) {
            return lastValidPrice;
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

    // ============ View ============

    function getCurrencyDecimals(Currency currency) external view returns (uint8) {
        return currencyDecimals[currency];
    }
}
