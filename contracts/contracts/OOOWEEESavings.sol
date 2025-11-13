// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract OOOWEEESavings is ReentrancyGuard, Ownable {
    IERC20 public immutable oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    
    enum AccountType { Time, Balance, Growth }
    enum Currency { USD, EUR, GBP, JPY, CNY, CAD, AUD, CHF, INR, KRW }
    
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
    
    // Chainlink price feeds for ETH to each currency
    mapping(Currency => address) public priceFeeds;
    
    // Uniswap pool for OOOWEEE/ETH price discovery
    address public oooweeePool;
    
    mapping(address => SavingsAccount[]) public userAccounts;
    
    // Gas-efficient reward tracking
    uint256 public totalActiveBalance;
    uint256 public globalRewardPerToken;
    uint256 public lastRewardDistribution;
    uint256 public pendingRewards;  // Rewards not yet distributed
    
    // Fee settings
    uint256 public creationFeeRate = 100; // 1% = 100/10000
    uint256 public withdrawalFeeRate = 100; // 1% = 100/10000
    uint256 public constant FEE_DIVISOR = 10000;
    uint256 public constant MAX_LOCK_DURATION = 36500 days; // 100 years max
    uint256 public constant PRICE_STALENESS_THRESHOLD = 3600; // 1 hour
    uint256 public constant SLIPPAGE_TOLERANCE = 300; // 3%
    
    address public feeCollector;
    address public rewardsDistributor; // Fixed: renamed from validatorContract
    
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
    
    constructor(
        address _tokenAddress,
        address _uniswapRouter
    ) Ownable(msg.sender) {
        oooweeeToken = IERC20(_tokenAddress);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        feeCollector = msg.sender;
        
        // Initialize with Sepolia testnet price feeds
        // On mainnet, these would be actual currency feeds
        _initializePriceFeeds();
    }
    
    function _initializePriceFeeds() internal {
        // Sepolia testnet - using ETH/USD feed for all as placeholder
        // On mainnet, use proper feeds for each currency
        address ethUsdFeed = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
        
        priceFeeds[Currency.USD] = ethUsdFeed;
        priceFeeds[Currency.EUR] = ethUsdFeed; // Replace with ETH/EUR on mainnet
        priceFeeds[Currency.GBP] = ethUsdFeed; // Replace with ETH/GBP on mainnet
        priceFeeds[Currency.JPY] = ethUsdFeed; // Replace with ETH/JPY on mainnet
        priceFeeds[Currency.CNY] = ethUsdFeed; // May need custom oracle
        priceFeeds[Currency.CAD] = ethUsdFeed; // Replace with ETH/CAD on mainnet
        priceFeeds[Currency.AUD] = ethUsdFeed; // Replace with ETH/AUD on mainnet
        priceFeeds[Currency.CHF] = ethUsdFeed; // Replace with ETH/CHF on mainnet
        priceFeeds[Currency.INR] = ethUsdFeed; // May need custom oracle
        priceFeeds[Currency.KRW] = ethUsdFeed; // May need custom oracle
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
    
    // ============ Price Functions with Staleness Checks ============
    
    function getETHPrice(Currency currency) public view returns (uint256) {
        address feedAddress = priceFeeds[currency];
        if (feedAddress == address(0)) return 200000000000; // Default $2000 with 8 decimals
        
        AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
        try priceFeed.latestRoundData() returns (
            uint80,
            int256 price,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            // Check for stale price data
            if (updatedAt <= block.timestamp - PRICE_STALENESS_THRESHOLD) {
                // Price is stale, use fallback
                return 200000000000;
            }
            if (price <= 0) {
                return 200000000000;
            }
            
            return uint256(price);
        } catch {
            return 200000000000; // Fallback price
        }
    }
    
    function getOooweeePrice(Currency currency) public view returns (uint256) {
        uint256 ethPrice = getETHPrice(currency);
        
        if (oooweeePool == address(0)) {
            return ethPrice / 100000;
        }
        
        try IUniswapV2Pair(oooweeePool).getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 lastUpdate
        ) {
            // Check pool staleness
            if (uint256(lastUpdate) <= block.timestamp - PRICE_STALENESS_THRESHOLD) {
                return ethPrice / 100000;
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
            
            if (oooweeeReserve > 0 && ethReserve > 0) {
                return (ethReserve * ethPrice * 1e18) / (oooweeeReserve * 1e8);
            }
        } catch {}
        
        return ethPrice / 100000; // Fallback
    }
    
    function getBalanceInFiat(
        uint256 oooweeeBalance,
        Currency currency
    ) public view returns (uint256) {
        uint256 price = getOooweeePrice(currency);
        return (oooweeeBalance * price) / 1e18;
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
    
    // ============ Gas-Efficient Rewards Distribution ============
    
    function receiveRewards(uint256 amount) external {
        require(msg.sender == rewardsDistributor, "Only rewards distributor");
        require(amount > 0, "Amount must be > 0");
        
        // Tokens already at RewardsDistributor, just need transfer
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        // Distribute rewards globally instead of per-account
        if (totalActiveBalance > 0) {
            globalRewardPerToken += (amount * 1e18) / totalActiveBalance;
            totalRewardsDistributed += amount;
        } else {
            // No active accounts, store as pending
            pendingRewards += amount;
        }
        
        lastRewardDistribution = block.timestamp;
        emit RewardsReceived(amount, block.timestamp);
    }
    
    function _updateAccountRewards(address owner, uint256 accountId) internal {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        if (!account.isActive) return;
        
        uint256 currentGlobalReward = globalRewardPerToken;
        
        // Add any pending rewards if this is the first active account
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
        
        // Limit to prevent excessive gas usage
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
        
        // Update all related state together for gas optimization
        account.balance = 0;
        account.isActive = false;
        account.completedAt = uint32(block.timestamp);
        
        // Combined state updates
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
        
        uint256 fee;
        uint256 amountToRecipient;
        
        if (account.isFiatTarget) {
            fee = account.balance / 101; // Approximately 1%
            amountToRecipient = account.balance - fee;
        } else {
            fee = account.targetAmount / 100;
            amountToRecipient = account.targetAmount;
        }
        
        // Update all related state together for gas optimization
        account.balance = 0;
        account.isActive = false;
        account.completedAt = uint32(block.timestamp);
        
        // Combined state updates
        uint256 totalAmount = amountToRecipient + fee;
        totalValueLocked -= totalAmount;
        totalActiveBalance -= totalAmount;
        totalGoalsCompleted++;
        totalFeesCollected += fee;
        
        oooweeeToken.transfer(feeCollector, fee);
        
        uint256 ethForRecipient = _swapTokensForETH(amountToRecipient);
        
        (bool success, ) = account.recipient.call{value: ethForRecipient}("");
        require(success, "ETH transfer failed");
        
        emit BalanceTransferred(owner, account.recipient, ethForRecipient, account.goalName);
        emit GoalCompleted(owner, accountId, account.goalName, ethForRecipient, fee);
    }
    
    // ============ Swap Function with Slippage Protection ============
    
    function _swapTokensForETH(uint256 tokenAmount) internal returns (uint256) {
        if (tokenAmount == 0) return 0;
        
        uint256 approvalAmount = tokenAmount + 1;
        oooweeeToken.approve(address(uniswapRouter), approvalAmount);
        
        address[] memory path = new address[](2);
        path[0] = address(oooweeeToken);
        path[1] = uniswapRouter.WETH();
        
        // Calculate minimum ETH with slippage protection
        uint256[] memory amounts = uniswapRouter.getAmountsOut(tokenAmount, path);
        uint256 minETHOut = (amounts[1] * (10000 - SLIPPAGE_TOLERANCE)) / 10000;
        
        uint256 ethBalanceBefore = address(this).balance;
        
        uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            minETHOut, // With slippage protection
            path,
            address(this),
            block.timestamp + 300
        );
        
        oooweeeToken.approve(address(uniswapRouter), 0);
        
        return address(this).balance - ethBalanceBefore;
    }
    
    // ============ View Functions ============
    
    function getAccountInfo(address user, uint256 accountId) external view returns (
        string memory goalName,
        uint256 balance,
        uint256 pendingReward,
        uint256 currentFiatValue,
        bool isActive,
        uint256 unlockTime
    ) {
        require(accountId < userAccounts[user].length, "Invalid account");
        SavingsAccount memory account = userAccounts[user][accountId];
        
        uint256 pending = 0;
        if (account.isActive && totalActiveBalance > 0) {
            uint256 currentGlobal = globalRewardPerToken;
            if (pendingRewards > 0) {
                currentGlobal += (pendingRewards * 1e18) / totalActiveBalance;
            }
            if (currentGlobal > account.lastRewardUpdate) {
                pending = (account.balance * (currentGlobal - account.lastRewardUpdate)) / 1e18;
            }
        }
        
        uint256 fiatValue = getBalanceInFiat(
            account.balance + pending,
            account.targetCurrency
        );
        
        return (
            account.goalName,
            account.balance,
            pending,
            fiatValue,
            account.isActive,
            uint256(account.unlockTime)
        );
    }
    
    function getUserAccountCount(address user) external view returns (uint256) {
        return userAccounts[user].length;
    }
    
    function getActiveAccountCount(address user) external view returns (uint256) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < userAccounts[user].length; i++) {
            if (userAccounts[user][i].isActive) {
                activeCount++;
            }
        }
        return activeCount;
    }
    
    function getContractStats() external view returns (
        uint256 tvl,
        uint256 accounts,
        uint256 completed,
        uint256 fees,
        uint256 rewards,
        uint256 activeBalance
    ) {
        return (
            totalValueLocked,
            totalAccountsCreated,
            totalGoalsCompleted,
            totalFeesCollected,
            totalRewardsDistributed,
            totalActiveBalance
        );
    }
    
    receive() external payable {}
}