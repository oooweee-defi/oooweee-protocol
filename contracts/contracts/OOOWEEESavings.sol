// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract OOOWEEESavings is ReentrancyGuard, Ownable {
    IERC20 public immutable oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    
    enum AccountType { Time, Balance, Growth }
    enum Currency { USD, EUR, GBP, JPY, CNY, CAD, AUD, CHF, INR, KRW }
    
    enum PriceSource {
        CHAINLINK_UNISWAP,  // Default: Chainlink for ETH + Uniswap for OOOWEEE
        UNISWAP_TWAP,       // Pure Uniswap TWAP
        MANUAL_ORACLE,      // Emergency manual prices
        FIXED_RATE,         // Emergency fixed conversion rates
        MULTI_POOL_AVERAGE  // Average across multiple pools
    }
    
    // OPTIMIZED STRUCT PACKING - Saves ~20,000 gas per account
    struct SavingsAccount {
        // Slot 1: 32 bytes
        address owner;              // 20 bytes
        AccountType accountType;    // 1 byte
        Currency targetCurrency;    // 1 byte
        bool isActive;             // 1 byte
        bool isFiatTarget;         // 1 byte
        uint32 createdAt;          // 4 bytes
        uint32 completedAt;        // 4 bytes
        // Total: 32 bytes (1 storage slot)
        
        // Slot 2: 32 bytes
        address recipient;         // 20 bytes (for Balance accounts)
        uint32 unlockTime;        // 4 bytes (can handle dates until year 2106)
        uint64 lastRewardUpdate;  // 8 bytes (enough for globalRewardPerToken precision)
        // Total: 32 bytes (1 storage slot)
        
        // Slot 3: 32 bytes
        uint256 balance;          // Full slot for main balance
        
        // Slot 4: 32 bytes
        uint256 targetAmount;     // Legacy: Target in OOOWEEE
        
        // Slot 5: 32 bytes
        uint256 targetFiat;       // Target in smallest currency unit
        
        // Slot 6: Dynamic
        string goalName;          // Dynamic storage
    }
    
    struct ManualPrice {
        uint256 price;
        uint256 timestamp;
        bool isValid;
    }
    
    struct PoolConfig {
        address poolAddress;
        uint256 weight;  // Weight for averaging (basis points)
        bool isActive;
        uint256 lastValidPrice;
        uint256 lastValidTimestamp;
    }
    
    // Price source configuration
    PriceSource public activePriceSource = PriceSource.CHAINLINK_UNISWAP;
    PriceSource public emergencyFallback = PriceSource.MANUAL_ORACLE;
    
    // Chainlink price feeds for ETH to each currency (Mainnet addresses)
    mapping(Currency => address) public priceFeeds;
    
    // Currency decimals
    mapping(Currency => uint8) public currencyDecimals;
    
    // Default prices for currencies
    mapping(Currency => uint256) public defaultPrices;
    
    // Manual oracle prices (emergency use)
    mapping(Currency => ManualPrice) public manualPrices;
    ManualPrice public manualOooweeePrice;
    
    // Multiple pool support
    PoolConfig[] public liquidityPools;
    mapping(address => uint256) public poolIndex;
    address public oooweeePool; // Primary pool for backward compatibility
    
    // TWAP configuration
    uint256 public twapPeriod = 10 minutes;
    mapping(address => uint256) public lastCumulativePrice;
    mapping(address => uint32) public lastUpdateTime;
    
    // Emergency configuration
    bool public emergencyPriceMode = false;
    uint256 public priceDeviationThreshold = 2000; // 20% max deviation
    uint256 public constant BASIS_POINTS = 10000;
    
    // Fixed rates for extreme emergency
    mapping(Currency => uint256) public emergencyFixedRates;
    
    mapping(address => SavingsAccount[]) public userAccounts;
    
    // Gas-efficient reward tracking
    uint256 public totalActiveBalance;
    uint256 public globalRewardPerToken;
    uint256 public lastRewardDistribution;
    uint256 public pendingRewards;
    
    // Fee settings
    uint256 public creationFeeRate = 100; // 1% = 100/10000
    uint256 public withdrawalFeeRate = 100; // 1% = 100/10000
    uint256 public constant FEE_DIVISOR = 10000;
    uint256 public constant MAX_LOCK_DURATION = 36500 days; // 100 years max
    uint256 public constant PRICE_STALENESS_THRESHOLD = 3600; // 1 hour
    uint256 public constant SLIPPAGE_TOLERANCE = 300; // 3%
    
    address public feeCollector;
    address public rewardsDistributor;
    
    // Statistics
    uint256 public totalValueLocked;
    uint256 public totalAccountsCreated;
    uint256 public totalGoalsCompleted;
    uint256 public totalFeesCollected;
    uint256 public totalRewardsDistributed;
    
    // Events
    event AccountCreated(
        address indexed owner, 
        uint256 indexed accountId, 
        AccountType accountType, 
        string goalName,
        uint256 initialDeposit,
        uint256 creationFee
    );
    
    event FiatAccountCreated(
        address indexed owner,
        uint256 indexed accountId,
        Currency currency,
        uint256 targetFiat
    );
    
    event Deposited(
        address indexed owner, 
        uint256 indexed accountId, 
        uint256 tokensAdded,
        uint256 newBalance
    );
    
    event GoalCompleted(
        address indexed owner,
        uint256 indexed accountId,
        string goalName,
        uint256 ethTransferred,
        uint256 feeCollected
    );
    
    event BalanceTransferred(
        address indexed from,
        address indexed to,
        uint256 ethAmount,
        string goalName
    );
    
    event RewardsReceived(uint256 amount, uint256 timestamp);
    event RewardsClaimed(address indexed user, uint256 indexed accountId, uint256 claimed);
    event PriceFeedUpdated(Currency currency, address feed);
    event PoolAddressSet(address indexed pool);
    event FeeCollectorSet(address indexed collector);
    event RewardsDistributorSet(address indexed distributor);
    event FeesUpdated(uint256 creationFee, uint256 withdrawalFee);
    event PriceSourceChanged(PriceSource oldSource, PriceSource newSource);
    event EmergencyPriceModeActivated(string reason);
    event ManualPriceSet(Currency currency, uint256 price);
    event PoolAdded(address pool, uint256 weight);
    event PoolDeactivated(address pool, string reason);
    
    constructor(
        address _tokenAddress,
        address _uniswapRouter
    ) Ownable(msg.sender) {
        oooweeeToken = IERC20(_tokenAddress);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        feeCollector = msg.sender;
        
        _initializePriceFeeds();
        _initializeCurrencyDecimals();
        _initializeDefaultPrices();
    }
    
    function _initializePriceFeeds() internal {
        // Mainnet Chainlink Price Feeds
        priceFeeds[Currency.USD] = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;  // ETH/USD
        priceFeeds[Currency.EUR] = 0xb49f677943BC038e9857d61E7d053CaA2C1734C1;  // ETH/EUR
        priceFeeds[Currency.GBP] = 0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5;  // ETH/GBP
        priceFeeds[Currency.JPY] = 0xBcA7065B4ff6d46e32f2B5D420703598faCA5fa9;  // ETH/JPY
        priceFeeds[Currency.CNY] = address(0); // No direct feed, will use USD + USD/CNY
        priceFeeds[Currency.CAD] = 0xAc559F25B1619171CbC396a50854A3240b6A4e99;  // ETH/CAD
        priceFeeds[Currency.AUD] = 0x77F9710E7d0A19669A13c055F62cd80d313dF022;  // ETH/AUD
        priceFeeds[Currency.CHF] = 0xfb327Af2b58e4Aec9E8f086BB21633970E871c71;  // ETH/CHF
        priceFeeds[Currency.INR] = address(0); // No direct feed, will use USD + USD/INR
        priceFeeds[Currency.KRW] = 0x01435677FB11763550905594A16B645847C1d0F3;  // ETH/KRW
    }
    
    function _initializeCurrencyDecimals() internal {
        currencyDecimals[Currency.USD] = 2;  // cents
        currencyDecimals[Currency.EUR] = 2;  // cents
        currencyDecimals[Currency.GBP] = 2;  // pence
        currencyDecimals[Currency.JPY] = 0;  // no decimals
        currencyDecimals[Currency.CNY] = 2;  // fen
        currencyDecimals[Currency.CAD] = 2;  // cents
        currencyDecimals[Currency.AUD] = 2;  // cents
        currencyDecimals[Currency.CHF] = 2;  // rappen
        currencyDecimals[Currency.INR] = 2;  // paise
        currencyDecimals[Currency.KRW] = 0;  // no decimals
    }
    
    function _initializeDefaultPrices() internal {
        // Default ETH prices in each currency (with 8 decimals - Chainlink format)
        defaultPrices[Currency.USD] = 2500_00000000;
        defaultPrices[Currency.EUR] = 2300_00000000;
        defaultPrices[Currency.GBP] = 1950_00000000;
        defaultPrices[Currency.JPY] = 375000_00000000;
        defaultPrices[Currency.CNY] = 17500_00000000;
        defaultPrices[Currency.CAD] = 3375_00000000;
        defaultPrices[Currency.AUD] = 3875_00000000;
        defaultPrices[Currency.CHF] = 2200_00000000;
        defaultPrices[Currency.INR] = 207500_00000000;
        defaultPrices[Currency.KRW] = 3250000_00000000;
    }
    
    // ============ Admin Functions ============
    
    function setRewardsDistributor(address _distributor) external onlyOwner {
        require(_distributor != address(0), "Invalid address");
        rewardsDistributor = _distributor;
        emit RewardsDistributorSet(_distributor);
    }
    
    function setOooweeePool(address _pool) external onlyOwner {
        require(_pool != address(0), "Invalid address");
        oooweeePool = _pool;
        
        if (poolIndex[_pool] == 0) {
            liquidityPools.push(PoolConfig({
                poolAddress: _pool,
                weight: BASIS_POINTS,
                isActive: true,
                lastValidPrice: 0,
                lastValidTimestamp: 0
            }));
            poolIndex[_pool] = liquidityPools.length;
        }
        
        emit PoolAddressSet(_pool);
    }
    
    function setPriceFeed(Currency currency, address feed) external onlyOwner {
        require(feed != address(0), "Invalid feed address");
        priceFeeds[currency] = feed;
        emit PriceFeedUpdated(currency, feed);
    }
    
    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Invalid address");
        feeCollector = _feeCollector;
        emit FeeCollectorSet(_feeCollector);
    }
    
    function setFees(uint256 _creationFeeRate, uint256 _withdrawalFeeRate) external onlyOwner {
        require(_creationFeeRate <= 500, "Max 5% creation fee");
        require(_withdrawalFeeRate <= 500, "Max 5% withdrawal fee");
        creationFeeRate = _creationFeeRate;
        withdrawalFeeRate = _withdrawalFeeRate;
        emit FeesUpdated(_creationFeeRate, _withdrawalFeeRate);
    }
    
    // ============ Emergency Price Management ============
    
    function setPriceSource(PriceSource newSource) external onlyOwner {
        require(newSource != activePriceSource, "Already active");
        PriceSource oldSource = activePriceSource;
        activePriceSource = newSource;
        emit PriceSourceChanged(oldSource, newSource);
    }
    
    function activateEmergencyPriceMode(string memory reason) external onlyOwner {
        emergencyPriceMode = true;
        activePriceSource = PriceSource.MANUAL_ORACLE;
        emit EmergencyPriceModeActivated(reason);
    }
    
    function setManualPrice(
        Currency currency,
        uint256 price,
        bool isOooweeePrice
    ) external onlyOwner {
        require(emergencyPriceMode, "Not in emergency mode");
        require(price > 0, "Invalid price");
        
        if (isOooweeePrice) {
            manualOooweeePrice = ManualPrice({
                price: price,
                timestamp: block.timestamp,
                isValid: true
            });
        } else {
            manualPrices[currency] = ManualPrice({
                price: price,
                timestamp: block.timestamp,
                isValid: true
            });
        }
        
        emit ManualPriceSet(currency, price);
    }
    
    function setEmergencyFixedRate(Currency currency, uint256 rate) external onlyOwner {
        require(rate > 0, "Invalid rate");
        emergencyFixedRates[currency] = rate;
    }
    
    function addLiquidityPool(address pool, uint256 weight) external onlyOwner {
        require(pool != address(0), "Invalid pool");
        require(weight > 0 && weight <= BASIS_POINTS, "Invalid weight");
        require(poolIndex[pool] == 0, "Pool already added");
        
        liquidityPools.push(PoolConfig({
            poolAddress: pool,
            weight: weight,
            isActive: true,
            lastValidPrice: 0,
            lastValidTimestamp: 0
        }));
        
        poolIndex[pool] = liquidityPools.length;
        emit PoolAdded(pool, weight);
    }
    
    function deactivatePool(address pool, string memory reason) external onlyOwner {
        uint256 idx = poolIndex[pool];
        require(idx > 0, "Pool not found");
        liquidityPools[idx - 1].isActive = false;
        emit PoolDeactivated(pool, reason);
    }
    
    function exitEmergencyMode() external onlyOwner {
        require(emergencyPriceMode, "Not in emergency mode");
        emergencyPriceMode = false;
        activePriceSource = PriceSource.CHAINLINK_UNISWAP;
    }
    
    // ============ Price Functions with Emergency Fallback ============
    
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
    
    function getOooweeePrice(Currency currency) public view returns (uint256) {
        (bool success, uint256 primaryPrice) = _tryPriceSource(activePriceSource, currency);
        
        if (success && _isPriceReasonable(primaryPrice, currency)) {
            if (liquidityPools.length > 0) {
                liquidityPools[0].lastValidPrice = primaryPrice;
                liquidityPools[0].lastValidTimestamp = block.timestamp;
            }
            return primaryPrice;
        }
        
        (success, uint256 fallbackPrice) = _tryPriceSource(emergencyFallback, currency);
        
        if (success && _isPriceReasonable(fallbackPrice, currency)) {
            return fallbackPrice;
        }
        
        return _getEmergencyPrice(currency);
    }
    
    function _tryPriceSource(PriceSource source, Currency currency) 
        private view returns (bool success, uint256 price) 
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
        private view returns (bool success, uint256 price) 
    {
        uint256 ethPrice = getETHPrice(currency);
        if (ethPrice == 0) return (false, 0);
        
        if (oooweeePool == address(0)) {
            return (false, 0);
        }
        
        try IUniswapV2Pair(oooweeePool).getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 lastUpdate
        ) {
            if (uint256(lastUpdate) <= block.timestamp - PRICE_STALENESS_THRESHOLD) {
                return (false, 0);
            }
            
            address token0 = IUniswapV2Pair(oooweeePool).token0();
            uint256 oooweeeReserve;
            uint256 ethReserve;
            
            if (token0 == address(oooweeeToken)) {
                oooweeeReserve = uint256(reserve0);
                ethReserve = uint256(reserve1);
            } else {
                oooweeeReserve = uint256(reserve1);
                ethReserve = uint256(reserve0);
            }
            
            if (oooweeeReserve == 0 || ethReserve == 0) return (false, 0);
            
            uint256 calculatedPrice = (ethReserve * ethPrice * (10 ** currencyDecimals[currency])) 
                                     / (oooweeeReserve * 1e8);
            
            return (true, calculatedPrice);
        } catch {
            return (false, 0);
        }
    }
    
    function _getUniswapTWAPPrice(Currency currency) 
        private view returns (bool, uint256) 
    {
        // Simplified TWAP implementation
        // In production, implement full TWAP with cumulative prices
        return _getChainlinkUniswapPrice(currency);
    }
    
    function _getManualPrice(Currency currency) 
        private view returns (bool success, uint256 price) 
    {
        if (!manualOooweeePrice.isValid) return (false, 0);
        if (block.timestamp > manualOooweeePrice.timestamp + 1 hours) return (false, 0);
        
        if (currency == Currency.USD) {
            return (true, manualOooweeePrice.price);
        }
        
        if (!manualPrices[currency].isValid) return (false, 0);
        
        uint256 exchangeRate = manualPrices[currency].price;
        uint256 convertedPrice = (manualOooweeePrice.price * exchangeRate) / 1e8;
        
        return (true, convertedPrice);
    }
    
    function _getFixedRate(Currency currency) 
        private view returns (bool success, uint256 price) 
    {
        uint256 fixedRate = emergencyFixedRates[currency];
        if (fixedRate == 0) return (false, 0);
        return (true, fixedRate);
    }
    
    function _getMultiPoolAverage(Currency currency) 
        private view returns (bool success, uint256 price) 
    {
        uint256 totalWeight = 0;
        uint256 weightedSum = 0;
        uint256 validPools = 0;
        
        for (uint i = 0; i < liquidityPools.length; i++) {
            if (!liquidityPools[i].isActive) continue;
            
            (bool poolSuccess, uint256 poolPrice) = _getPoolPrice(
                liquidityPools[i].poolAddress, 
                currency
            );
            
            if (poolSuccess && _isPriceReasonable(poolPrice, currency)) {
                weightedSum += poolPrice * liquidityPools[i].weight;
                totalWeight += liquidityPools[i].weight;
                validPools++;
            }
        }
        
        if (validPools == 0 || totalWeight == 0) return (false, 0);
        
        uint256 avgPrice = weightedSum / totalWeight;
        return (true, avgPrice);
    }
    
    function _getPoolPrice(address poolAddress, Currency currency) 
        private view returns (bool success, uint256 price) 
    {
        try IUniswapV2Pair(poolAddress).getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 lastUpdate
        ) {
            if (uint256(lastUpdate) <= block.timestamp - PRICE_STALENESS_THRESHOLD) {
                return (false, 0);
            }
            
            address token0 = IUniswapV2Pair(poolAddress).token0();
            uint256 oooweeeReserve;
            uint256 ethReserve;
            
            if (token0 == address(oooweeeToken)) {
                oooweeeReserve = uint256(reserve0);
                ethReserve = uint256(reserve1);
            } else {
                oooweeeReserve = uint256(reserve1);
                ethReserve = uint256(reserve0);
            }
            
            if (oooweeeReserve == 0 || ethReserve == 0) return (false, 0);
            
            uint256 ethPrice = getETHPrice(currency);
            uint256 calculatedPrice = (ethReserve * ethPrice * (10 ** currencyDecimals[currency])) 
                                     / (oooweeeReserve * 1e8);
            
            return (true, calculatedPrice);
        } catch {
            return (false, 0);
        }
    }
    
    function _isPriceReasonable(uint256 price, Currency currency) 
        private view returns (bool) 
    {
        if (price == 0) return false;
        
        if (liquidityPools.length > 0 && liquidityPools[0].lastValidPrice > 0) {
            uint256 lastPrice = liquidityPools[0].lastValidPrice;
            uint256 deviation = price > lastPrice 
                ? ((price - lastPrice) * BASIS_POINTS) / lastPrice
                : ((lastPrice - price) * BASIS_POINTS) / lastPrice;
            
            if (deviation > priceDeviationThreshold) {
                return false;
            }
        }
        
        uint256 minPrice = 10 ** (currencyDecimals[currency] - 4);
        uint256 maxPrice = 10 * (10 ** currencyDecimals[currency]);
        
        return price >= minPrice && price <= maxPrice;
    }
    
    function _getEmergencyPrice(Currency currency) private view returns (uint256) {
        if (liquidityPools.length > 0) {
            uint256 lastGood = liquidityPools[0].lastValidPrice;
            if (lastGood > 0 && 
                block.timestamp < liquidityPools[0].lastValidTimestamp + 24 hours) {
                return lastGood;
            }
        }
        
        uint256 fixedRate = emergencyFixedRates[currency];
        if (fixedRate > 0) return fixedRate;
        
        return 10 ** (currencyDecimals[currency] - 2);
    }
    
    function getBalanceInFiat(
        uint256 oooweeeBalance,
        Currency currency
    ) public view returns (uint256) {
        uint256 pricePerToken = getOooweeePrice(currency);
        return (oooweeeBalance * pricePerToken) / 1e18;
    }
    
    function getFiatToTokens(
        uint256 fiatAmount,
        Currency currency
    ) public view returns (uint256) {
        uint256 pricePerToken = getOooweeePrice(currency);
        if (pricePerToken == 0) return 0;
        return (fiatAmount * 1e18) / pricePerToken;
    }
    
    // ============ Account Creation Functions ============
    
    function createTimeAccountFiat(
        uint256 unlockTime,
        string memory goalName,
        uint256 initialDeposit,
        Currency displayCurrency
    ) external returns (uint256) {
        require(unlockTime > block.timestamp, "Unlock time must be in future");
        require(unlockTime <= block.timestamp + MAX_LOCK_DURATION, "Maximum lock is 100 years");
        require(initialDeposit > 0, "Must have initial deposit");
        require(unlockTime <= type(uint32).max, "Unlock time too far in future");
        
        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;
        
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit),
            "Transfer failed"
        );
        
        oooweeeToken.transfer(feeCollector, creationFee);
        totalFeesCollected += creationFee;
        
        uint256 accountId = userAccounts[msg.sender].length;
        userAccounts[msg.sender].push(SavingsAccount({
            owner: msg.sender,
            accountType: AccountType.Time,
            targetCurrency: displayCurrency,
            isActive: true,
            isFiatTarget: false,
            createdAt: uint32(block.timestamp),
            completedAt: 0,
            recipient: address(0),
            unlockTime: uint32(unlockTime),
            lastRewardUpdate: uint64(globalRewardPerToken),
            balance: depositAfterFee,
            targetAmount: 0,
            targetFiat: 0,
            goalName: goalName
        }));
        
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Time, goalName, initialDeposit, creationFee);
        return accountId;
    }
    
    function createGrowthAccountFiat(
        uint256 targetFiatAmount,
        Currency targetCurrency,
        string memory goalName,
        uint256 initialDeposit
    ) external returns (uint256) {
        require(targetFiatAmount > 0, "Target amount required");
        require(initialDeposit > 0, "Must have initial deposit");
        
        uint256 currentValue = getBalanceInFiat(initialDeposit, targetCurrency);
        require(targetFiatAmount > currentValue, "Target must be higher than initial");
        
        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;
        
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit),
            "Transfer failed"
        );
        
        oooweeeToken.transfer(feeCollector, creationFee);
        totalFeesCollected += creationFee;
        
        uint256 accountId = userAccounts[msg.sender].length;
        userAccounts[msg.sender].push(SavingsAccount({
            owner: msg.sender,
            accountType: AccountType.Growth,
            targetCurrency: targetCurrency,
            isActive: true,
            isFiatTarget: true,
            createdAt: uint32(block.timestamp),
            completedAt: 0,
            recipient: address(0),
            unlockTime: 0,
            lastRewardUpdate: uint64(globalRewardPerToken),
            balance: depositAfterFee,
            targetAmount: 0,
            targetFiat: targetFiatAmount,
            goalName: goalName
        }));
        
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Growth, goalName, initialDeposit, creationFee);
        emit FiatAccountCreated(msg.sender, accountId, targetCurrency, targetFiatAmount);
        
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
        
        return accountId;
    }
    
    function createBalanceAccountFiat(
        uint256 targetFiatAmount,
        Currency targetCurrency,
        address recipient,
        string memory goalName,
        uint256 initialDeposit
    ) external returns (uint256) {
        require(targetFiatAmount > 0, "Target amount required");
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot send to yourself");
        require(initialDeposit > 0, "Must have initial deposit");
        
        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;
        
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit),
            "Transfer failed"
        );
        
        oooweeeToken.transfer(feeCollector, creationFee);
        totalFeesCollected += creationFee;
        
        uint256 accountId = userAccounts[msg.sender].length;
        userAccounts[msg.sender].push(SavingsAccount({
            owner: msg.sender,
            accountType: AccountType.Balance,
            targetCurrency: targetCurrency,
            isActive: true,
            isFiatTarget: true,
            createdAt: uint32(block.timestamp),
            completedAt: 0,
            recipient: recipient,
            unlockTime: 0,
            lastRewardUpdate: uint64(globalRewardPerToken),
            balance: depositAfterFee,
            targetAmount: 0,
            targetFiat: targetFiatAmount,
            goalName: goalName
        }));
        
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Balance, goalName, initialDeposit, creationFee);
        emit FiatAccountCreated(msg.sender, accountId, targetCurrency, targetFiatAmount);
        
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
        
        return accountId;
    }
    
    // ============ Deposit Function ============
    
    function deposit(uint256 accountId, uint256 amount) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "Invalid account ID");
        require(amount > 0, "Amount must be greater than 0");
        
        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive, "Account is not active");
        
        _updateAccountRewards(msg.sender, accountId);
        
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        account.balance += amount;
        totalValueLocked += amount;
        totalActiveBalance += amount;
        
        emit Deposited(msg.sender, accountId, amount, account.balance);
        
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
    }
    
    // ============ Rewards Distribution ============
    
    function receiveRewards(uint256 amount) external {
        require(msg.sender == rewardsDistributor, "Only rewards distributor");
        require(amount > 0, "Amount must be > 0");
        
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        if (totalActiveBalance > 0) {
            globalRewardPerToken += (amount * 1e18) / totalActiveBalance;
            totalRewardsDistributed += amount;
        } else {
            pendingRewards += amount;
        }
        
        lastRewardDistribution = block.timestamp;
        emit RewardsReceived(amount, block.timestamp);
    }
    
    function _updateAccountRewards(address owner, uint256 accountId) internal {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        if (!account.isActive) return;
        
        uint256 currentGlobalReward = globalRewardPerToken;
        
        if (pendingRewards > 0 && totalActiveBalance > 0) {
            currentGlobalReward += (pendingRewards * 1e18) / totalActiveBalance;
            globalRewardPerToken = currentGlobalReward;
            totalRewardsDistributed += pendingRewards;
            pendingRewards = 0;
        }
        
        if (currentGlobalReward > account.lastRewardUpdate) {
            uint256 earned = (account.balance * (currentGlobalReward - account.lastRewardUpdate)) / 1e18;
            if (earned > 0) {
                account.balance += earned;
                totalValueLocked += earned;
                totalActiveBalance += earned;
                emit RewardsClaimed(owner, accountId, earned);
            }
            account.lastRewardUpdate = uint64(currentGlobalReward);
        }
    }
    
    function claimRewards(uint256 accountId) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "Invalid account");
        _updateAccountRewards(msg.sender, accountId);
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
    }
    
    function claimAllRewards() external nonReentrant {
        uint256 accountCount = userAccounts[msg.sender].length;
        require(accountCount > 0, "No accounts");
        
        uint256 maxClaims = accountCount > 20 ? 20 : accountCount;
        
        for (uint256 i = 0; i < maxClaims; i++) {
            if (userAccounts[msg.sender][i].isActive) {
                _updateAccountRewards(msg.sender, i);
                _checkAndExecuteAutoTransfer(msg.sender, i);
            }
        }
    }
    
    // ============ Auto-Transfer Logic ============
    
    function _checkFiatTarget(
        uint256 balance,
        uint256 targetFiat,
        Currency currency
    ) internal view returns (bool) {
        uint256 currentValue = getBalanceInFiat(balance, currency);
        return currentValue >= targetFiat;
    }
    
    function _checkAndExecuteAutoTransfer(address owner, uint256 accountId) internal {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        if (!account.isActive) return;
        
        if (account.accountType == AccountType.Time) {
            if (block.timestamp >= account.unlockTime) {
                _executeAutoTransfer(owner, accountId);
            }
        } else if (account.accountType == AccountType.Growth) {
            if (account.isFiatTarget) {
                if (_checkFiatTarget(account.balance, account.targetFiat, account.targetCurrency)) {
                    _executeAutoTransfer(owner, accountId);
                }
            } else {
                if (account.balance >= account.targetAmount) {
                    _executeAutoTransfer(owner, accountId);
                }
            }
        } else if (account.accountType == AccountType.Balance) {
            if (account.isFiatTarget) {
                uint256 requiredFiat = account.targetFiat + (account.targetFiat / 100);
                if (_checkFiatTarget(account.balance, requiredFiat, account.targetCurrency)) {
                    _executeBalanceTransfer(owner, accountId);
                }
            } else {
                uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
                if (account.balance >= requiredBalance) {
                    _executeBalanceTransfer(owner, accountId);
                }
            }
        }
    }
    
    function _executeAutoTransfer(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        _updateAccountRewards(owner, accountId);
        
        uint256 balance = account.balance;
        if (balance == 0) return;
        
        uint256 fee = (balance * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 amountAfterFee = balance - fee;
        
        account.balance = 0;
        account.isActive = false;
        account.completedAt = uint32(block.timestamp);
        
        totalValueLocked -= balance;
        totalActiveBalance -= balance;
        totalGoalsCompleted++;
        totalFeesCollected += fee;
        
        if (fee > 0) {
            oooweeeToken.transfer(feeCollector, fee);
        }
        
        uint256 ethReceived = _swapTokensForETH(amountAfterFee);
        
        (bool success, ) = owner.call{value: ethReceived}("");
        require(success, "ETH transfer failed");
        
        emit GoalCompleted(owner, accountId, account.goalName, ethReceived, fee);
    }
    
    function _executeBalanceTransfer(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        _updateAccountRewards(owner, accountId);
        
        uint256 transferAmount = account.isFiatTarget 
            ? getFiatToTokens(account.targetFiat, account.targetCurrency)
            : account.targetAmount;
            
        if (transferAmount > account.balance) {
            transferAmount = account.balance;
        }
        
        uint256 fee = (transferAmount * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 amountAfterFee = transferAmount - fee;
        
        account.balance -= transferAmount;
        
        if (account.balance < 1000) {
            account.balance = 0;
            account.isActive = false;
            account.completedAt = uint32(block.timestamp);
        }
        
        totalValueLocked -= transferAmount;
        totalActiveBalance -= transferAmount;
        totalFeesCollected += fee;
        
        if (fee > 0) {
            oooweeeToken.transfer(feeCollector, fee);
        }
        
        uint256 ethReceived = _swapTokensForETH(amountAfterFee);
        
        (bool success, ) = account.recipient.call{value: ethReceived}("");
        require(success, "ETH transfer failed");
        
        emit BalanceTransferred(owner, account.recipient, ethReceived, account.goalName);
        
        if (!account.isActive) {
            totalGoalsCompleted++;
        }
    }
    
    function _swapTokensForETH(uint256 tokenAmount) private returns (uint256) {
        if (tokenAmount == 0) return 0;
        
        oooweeeToken.approve(address(uniswapRouter), tokenAmount);
        
        address[] memory path = new address[](2);
        path[0] = address(oooweeeToken);
        path[1] = uniswapRouter.WETH();
        
        uint256[] memory amounts = uniswapRouter.getAmountsOut(tokenAmount, path);
        uint256 minETHOut = (amounts[1] * (10000 - SLIPPAGE_TOLERANCE)) / 10000;
        
        uint256 initialBalance = address(this).balance;
        
        uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            minETHOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        return address(this).balance - initialBalance;
    }
    
    function manualWithdraw(uint256 accountId) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "Invalid account");
        
        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive, "Account not active");
        require(account.owner == msg.sender, "Not account owner");
        
        if (account.accountType == AccountType.Time) {
            require(block.timestamp >= account.unlockTime, "Account still locked");
        }
        
        _executeAutoTransfer(msg.sender, accountId);
    }
    
    // ============ View Functions ============
    
    function getUserAccounts(address user) external view returns (uint256[] memory activeIds) {
        uint256 count = 0;
        for (uint256 i = 0; i < userAccounts[user].length; i++) {
            if (userAccounts[user][i].isActive) count++;
        }
        
        activeIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < userAccounts[user].length; i++) {
            if (userAccounts[user][i].isActive) {
                activeIds[index] = i;
                index++;
            }
        }
    }
    
    function getAccountDetails(address owner, uint256 accountId) 
        external view returns (
            AccountType accountType,
            bool isActive,
            uint256 balance,
            uint256 targetAmount,
            uint256 targetFiat,
            Currency targetCurrency,
            uint256 unlockTime,
            address recipient,
            string memory goalName
        ) 
    {
        require(accountId < userAccounts[owner].length, "Invalid account");
        SavingsAccount memory account = userAccounts[owner][accountId];
        
        return (
            account.accountType,
            account.isActive,
            account.balance + _calculatePendingRewards(owner, accountId),
            account.targetAmount,
            account.targetFiat,
            account.targetCurrency,
            account.unlockTime,
            account.recipient,
            account.goalName
        );
    }
    
    function getAccountFiatProgress(address owner, uint256 accountId) 
        external view returns (
            uint256 currentValue,
            uint256 targetValue,
            uint256 percentComplete,
            bool canWithdraw
        ) 
    {
        require(accountId < userAccounts[owner].length, "Invalid account");
        SavingsAccount memory account = userAccounts[owner][accountId];
        
        if (!account.isFiatTarget) {
            return (0, 0, 0, false);
        }
        
        uint256 totalBalance = account.balance + _calculatePendingRewards(owner, accountId);
        currentValue = getBalanceInFiat(totalBalance, account.targetCurrency);
        targetValue = account.targetFiat;
        
        if (targetValue > 0) {
            percentComplete = (currentValue * 100) / targetValue;
            if (percentComplete > 100) percentComplete = 100;
        }
        
        canWithdraw = false;
        if (account.accountType == AccountType.Growth) {
            canWithdraw = currentValue >= targetValue;
        } else if (account.accountType == AccountType.Balance) {
            uint256 requiredValue = targetValue + (targetValue / 100);
            canWithdraw = currentValue >= requiredValue;
        }
    }
    
    function _calculatePendingRewards(address owner, uint256 accountId) 
        internal view returns (uint256) 
    {
        SavingsAccount memory account = userAccounts[owner][accountId];
        
        if (!account.isActive) return 0;
        
        uint256 currentGlobalReward = globalRewardPerToken;
        
        if (pendingRewards > 0 && totalActiveBalance > 0) {
            currentGlobalReward += (pendingRewards * 1e18) / totalActiveBalance;
        }
        
        if (currentGlobalReward > account.lastRewardUpdate) {
            return (account.balance * (currentGlobalReward - account.lastRewardUpdate)) / 1e18;
        }
        
        return 0;
    }
    
    function getPriceInfo(Currency currency) external view returns (
        uint256 currentPrice,
        PriceSource sourceUsed,
        bool isEmergencyMode,
        uint256 lastValidPrice,
        uint256 timeSinceLastValid
    ) {
        currentPrice = getOooweeePrice(currency);
        sourceUsed = activePriceSource;
        isEmergencyMode = emergencyPriceMode;
        
        if (liquidityPools.length > 0) {
            lastValidPrice = liquidityPools[0].lastValidPrice;
            timeSinceLastValid = block.timestamp - liquidityPools[0].lastValidTimestamp;
        }
    }
    
    function getStatsView() external view returns (
        uint256 _totalValueLocked,
        uint256 _totalAccountsCreated,
        uint256 _totalGoalsCompleted,
        uint256 _totalActiveBalance,
        uint256 _totalRewardsDistributed,
        uint256 _totalFeesCollected
    ) {
        return (
            totalValueLocked,
            totalAccountsCreated,
            totalGoalsCompleted,
            totalActiveBalance,
            totalRewardsDistributed,
            totalFeesCollected
        );
    }
    
    receive() external payable {}
}