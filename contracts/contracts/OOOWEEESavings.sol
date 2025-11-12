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
    
    struct SavingsAccount {
        AccountType accountType;
        address owner;
        uint256 balance;          // OOOWEEE balance (includes rewards)
        uint256 targetAmount;     // Legacy: Target in OOOWEEE
        uint256 targetFiat;       // Target in smallest currency unit (cents, pence, etc)
        Currency targetCurrency;  // Which currency for the target
        uint256 unlockTime;
        address recipient;        // For Balance accounts only
        bool isActive;
        string goalName;
        uint256 createdAt;
        uint256 completedAt;
        bool isFiatTarget;        // true = fiat denominated, false = OOOWEEE denominated
    }
    
    // Chainlink price feeds for ETH to each currency
    mapping(Currency => address) public priceFeeds;
    
    // Uniswap pool for OOOWEEE/ETH price discovery
    address public oooweeePool;
    
    mapping(address => SavingsAccount[]) public userAccounts;
    
    // Reward tracking
    mapping(address => mapping(uint256 => uint256)) public accountRewardSnapshot;
    uint256 public totalActiveBalance;
    uint256 public rewardPerTokenStored;
    
    // Fee settings
    uint256 public creationFeeRate = 100; // 1% = 100/10000
    uint256 public withdrawalFeeRate = 100; // 1% = 100/10000
    uint256 public constant FEE_DIVISOR = 10000;
    uint256 public constant MAX_LOCK_DURATION = 36500 days; // 100 years max
    
    address public feeCollector;
    address public validatorContract;
    
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
    event RewardsClaimed(address indexed user, uint256 totalClaimed);
    event PriceFeedUpdated(Currency currency, address feed);
    
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
    
    function setValidatorContract(address _validator) external onlyOwner {
        validatorContract = _validator;
    }
    
    function setOooweeePool(address _pool) external onlyOwner {
        oooweeePool = _pool;
    }
    
    function setPriceFeed(Currency currency, address feed) external onlyOwner {
        require(feed != address(0), "Invalid feed address");
        priceFeeds[currency] = feed;
        emit PriceFeedUpdated(currency, feed);
    }
    
    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Invalid address");
        feeCollector = _feeCollector;
    }
    
    function setFees(uint256 _creationFeeRate, uint256 _withdrawalFeeRate) external onlyOwner {
        require(_creationFeeRate <= 500, "Max 5% creation fee");
        require(_withdrawalFeeRate <= 500, "Max 5% withdrawal fee");
        creationFeeRate = _creationFeeRate;
        withdrawalFeeRate = _withdrawalFeeRate;
    }
    
    // ============ Price Functions ============
    
    // Get ETH price in specified currency (8 decimals from Chainlink)
    function getETHPrice(Currency currency) public view returns (uint256) {
        address feedAddress = priceFeeds[currency];
        if (feedAddress == address(0)) return 200000000000; // Default $2000 with 8 decimals
        
        AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
        try priceFeed.latestRoundData() returns (
            uint80,
            int256 price,
            uint256,
            uint256,
            uint80
        ) {
            if (price > 0) {
                return uint256(price);
            }
        } catch {}
        
        return 200000000000; // Fallback price
    }
    
    // Get OOOWEEE price in specified currency
    function getOooweeePrice(Currency currency) public view returns (uint256) {
        uint256 ethPrice = getETHPrice(currency);
        
        if (oooweeePool == address(0)) {
            // Fallback: assume 100,000 OOOWEEE per ETH
            return ethPrice / 100000;
        }
        
        try IUniswapV2Pair(oooweeePool).getReserves() returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32
        ) {
            // Determine which reserve is OOOWEEE and which is ETH
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
                // Price = (ETH per OOOWEEE) * (Currency per ETH)
                // With proper decimal handling
                return (ethReserve * ethPrice * 1e18) / (oooweeeReserve * 1e8);
            }
        } catch {}
        
        return ethPrice / 100000; // Fallback
    }
    
    // Get current value of OOOWEEE balance in fiat (with 8 decimals)
    function getBalanceInFiat(
        uint256 oooweeeBalance,
        Currency currency
    ) public view returns (uint256) {
        uint256 price = getOooweeePrice(currency);
        return (oooweeeBalance * price) / 1e18;
    }
    
    // ============ Account Creation Functions ============
    
    // Time account with fiat display preference
    function createTimeAccountFiat(
        uint256 unlockTime,
        string memory goalName,
        uint256 initialDeposit,
        Currency displayCurrency
    ) external returns (uint256) {
        require(unlockTime > block.timestamp, "Unlock time must be in future");
        require(unlockTime <= block.timestamp + MAX_LOCK_DURATION, "Maximum lock is 100 years");
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
            accountType: AccountType.Time,
            owner: msg.sender,
            balance: depositAfterFee,
            targetAmount: 0,
            targetFiat: 0,
            targetCurrency: displayCurrency,
            unlockTime: unlockTime,
            recipient: address(0),
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0,
            isFiatTarget: false
        }));
        
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Time, goalName, initialDeposit, creationFee);
        return accountId;
    }
    
    // Growth account with fiat target
    function createGrowthAccountFiat(
        uint256 targetFiatAmount,  // In smallest unit (cents for USD/EUR)
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
            accountType: AccountType.Growth,
            owner: msg.sender,
            balance: depositAfterFee,
            targetAmount: 0,
            targetFiat: targetFiatAmount,
            targetCurrency: targetCurrency,
            unlockTime: 0,
            recipient: address(0),
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0,
            isFiatTarget: true
        }));
        
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Growth, goalName, initialDeposit, creationFee);
        emit FiatAccountCreated(msg.sender, accountId, targetCurrency, targetFiatAmount);
        
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
        
        return accountId;
    }
    
    // Balance account with fiat target
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
            accountType: AccountType.Balance,
            owner: msg.sender,
            balance: depositAfterFee,
            targetAmount: 0,
            targetFiat: targetFiatAmount,
            targetCurrency: targetCurrency,
            unlockTime: 0,
            recipient: recipient,
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0,
            isFiatTarget: true
        }));
        
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Balance, goalName, initialDeposit, creationFee);
        emit FiatAccountCreated(msg.sender, accountId, targetCurrency, targetFiatAmount);
        
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
        
        return accountId;
    }
    
    // Legacy functions for backward compatibility
    function createTimeAccount(
        uint256 unlockTime,
        string memory goalName,
        uint256 initialDeposit
    ) external returns (uint256) {
        return createTimeAccountFiat(unlockTime, goalName, initialDeposit, Currency.USD);
    }
    
    function createGrowthAccount(
        uint256 targetAmount,
        string memory goalName,
        uint256 initialDeposit
    ) external returns (uint256) {
        require(targetAmount > 0, "Target amount required");
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
            accountType: AccountType.Growth,
            owner: msg.sender,
            balance: depositAfterFee,
            targetAmount: targetAmount,
            targetFiat: 0,
            targetCurrency: Currency.USD,
            unlockTime: 0,
            recipient: address(0),
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0,
            isFiatTarget: false
        }));
        
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Growth, goalName, initialDeposit, creationFee);
        
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
        
        return accountId;
    }
    
    function createBalanceAccount(
        uint256 targetAmount,
        address recipient,
        string memory goalName,
        uint256 initialDeposit
    ) external returns (uint256) {
        require(targetAmount > 0, "Target amount required");
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
            accountType: AccountType.Balance,
            owner: msg.sender,
            balance: depositAfterFee,
            targetAmount: targetAmount,
            targetFiat: 0,
            targetCurrency: Currency.USD,
            unlockTime: 0,
            recipient: recipient,
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0,
            isFiatTarget: false
        }));
        
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Balance, goalName, initialDeposit, creationFee);
        
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
        require(msg.sender == validatorContract, "Only validator contract");
        
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        if (totalActiveBalance > 0) {
            rewardPerTokenStored += (amount * 1e18) / totalActiveBalance;
            totalRewardsDistributed += amount;
        }
        
        emit RewardsReceived(amount, block.timestamp);
    }
    
    function _updateAccountRewards(address owner, uint256 accountId) internal {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        if (!account.isActive) return;
        
        uint256 currentRewardPerToken = rewardPerTokenStored;
        uint256 lastSnapshot = accountRewardSnapshot[owner][accountId];
        
        if (currentRewardPerToken > lastSnapshot) {
            uint256 earned = (account.balance * (currentRewardPerToken - lastSnapshot)) / 1e18;
            if (earned > 0) {
                account.balance += earned;
                totalValueLocked += earned;
                totalActiveBalance += earned;
            }
            accountRewardSnapshot[owner][accountId] = currentRewardPerToken;
        }
    }
    
    function claimAllRewards() external nonReentrant {
        uint256 totalClaimed = 0;
        
        for (uint256 i = 0; i < userAccounts[msg.sender].length; i++) {
            SavingsAccount storage account = userAccounts[msg.sender][i];
            
            if (account.isActive) {
                uint256 balanceBefore = account.balance;
                _updateAccountRewards(msg.sender, i);
                uint256 claimed = account.balance - balanceBefore;
                totalClaimed += claimed;
                
                _checkAndExecuteAutoTransfer(msg.sender, i);
            }
        }
        
        if (totalClaimed > 0) {
            emit RewardsClaimed(msg.sender, totalClaimed);
        }
    }
    
    // ============ Auto-Transfer Logic ============
    
    function checkTimeAccount(address owner, uint256 accountId) external nonReentrant {
        require(accountId < userAccounts[owner].length, "Invalid account ID");
        SavingsAccount storage account = userAccounts[owner][accountId];
        require(account.isActive, "Account is not active");
        require(account.accountType == AccountType.Time, "Not a Time account");
        
        _updateAccountRewards(owner, accountId);
        _checkAndExecuteAutoTransfer(owner, accountId);
    }
    
    function _checkFiatTarget(
        uint256 balance,
        uint256 targetFiat,
        Currency currency
    ) internal view returns (bool) {
        uint256 currentValue = getBalanceInFiat(balance, currency);
        // Convert to smallest unit (cents) for comparison
        return currentValue >= targetFiat * 1e6; // Adjust decimals
    }
    
    function _checkAndExecuteAutoTransfer(address owner, uint256 accountId) private {
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
        account.completedAt = block.timestamp;
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
            // For fiat targets, calculate based on actual balance
            fee = account.balance / 101; // Approximately 1%
            amountToRecipient = account.balance - fee;
        } else {
            fee = account.targetAmount / 100;
            amountToRecipient = account.targetAmount;
        }
        
        account.balance = 0;
        account.isActive = false;
        account.completedAt = block.timestamp;
        totalValueLocked -= (amountToRecipient + fee);
        totalActiveBalance -= (amountToRecipient + fee);
        totalGoalsCompleted++;
        totalFeesCollected += fee;
        
        oooweeeToken.transfer(feeCollector, fee);
        
        uint256 ethForRecipient = _swapTokensForETH(amountToRecipient);
        
        (bool success, ) = account.recipient.call{value: ethForRecipient}("");
        require(success, "ETH transfer failed");
        
        emit BalanceTransferred(owner, account.recipient, ethForRecipient, account.goalName);
        emit GoalCompleted(owner, accountId, account.goalName, ethForRecipient, fee);
    }
    
    // ============ Swap Function ============
    
    function _swapTokensForETH(uint256 tokenAmount) internal returns (uint256) {
        if (tokenAmount == 0) return 0;
        
        uint256 approvalAmount = tokenAmount + 1;
        oooweeeToken.approve(address(uniswapRouter), approvalAmount);
        
        address[] memory path = new address[](2);
        path[0] = address(oooweeeToken);
        path[1] = uniswapRouter.WETH();
        
        uint256 ethBalanceBefore = address(this).balance;
        
        uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0,
            path,
            address(this),
            block.timestamp + 300
        );
        
        oooweeeToken.approve(address(uniswapRouter), 0);
        
        return address(this).balance - ethBalanceBefore;
    }
    
    // ============ View Functions ============
    
    function getAccountInfoExtended(address user, uint256 accountId) external view returns (
        string memory accountTypeName,
        string memory goalName,
        uint256 balance,
        uint256 targetAmount,
        uint256 targetFiat,
        uint8 targetCurrency,
        uint256 currentFiatValue,
        uint256 unlockTime,
        address recipient,
        bool isActive,
        uint256 progressPercent,
        uint256 pendingRewards,
        bool isFiatTarget
    ) {
        require(accountId < userAccounts[user].length, "Invalid account");
        SavingsAccount memory account = userAccounts[user][accountId];
        
        // Calculate pending rewards
        if (account.isActive && totalActiveBalance > 0) {
            uint256 currentRewardPerToken = rewardPerTokenStored;
            uint256 lastSnapshot = accountRewardSnapshot[user][accountId];
            if (currentRewardPerToken > lastSnapshot) {
                pendingRewards = (account.balance * (currentRewardPerToken - lastSnapshot)) / 1e18;
            }
        }
        
        uint256 effectiveBalance = account.balance + pendingRewards;
        
        // Calculate current fiat value
        if (account.isFiatTarget || uint8(account.targetCurrency) <= 9) {
            currentFiatValue = getBalanceInFiat(effectiveBalance, account.targetCurrency) / 1e6;
        }
        
        // Determine account type name
        if (account.accountType == AccountType.Time) {
            accountTypeName = "Time";
        } else if (account.accountType == AccountType.Balance) {
            accountTypeName = "Balance";
        } else {
            accountTypeName = "Growth";
        }
        
        // Calculate progress
        if (account.accountType == AccountType.Time) {
            if (block.timestamp >= account.unlockTime) {
                progressPercent = 100;
            } else {
                uint256 totalTime = account.unlockTime - account.createdAt;
                uint256 timePassed = block.timestamp - account.createdAt;
                progressPercent = (timePassed * 100) / totalTime;
            }
        } else if (account.isFiatTarget && account.targetFiat > 0) {
            progressPercent = (currentFiatValue * 100) / account.targetFiat;
            if (progressPercent > 100) progressPercent = 100;
        } else if (account.targetAmount > 0) {
            progressPercent = (effectiveBalance * 100) / account.targetAmount;
            if (progressPercent > 100) progressPercent = 100;
        }
        
        return (
            accountTypeName,
            account.goalName,
            account.balance,
            account.targetAmount,
            account.targetFiat,
            uint8(account.targetCurrency),
            currentFiatValue,
            account.unlockTime,
            account.recipient,
            account.isActive,
            progressPercent,
            pendingRewards,
            account.isFiatTarget
        );
    }
    
    // Legacy getAccountInfo for backward compatibility
    function getAccountInfo(address user, uint256 accountId) external view returns (
        string memory accountTypeName,
        string memory goalName,
        uint256 balance,
        uint256 targetAmount,
        uint256 unlockTime,
        address recipient,
        bool isActive,
        uint256 progressPercent,
        uint256 pendingRewards
    ) {
        (
            accountTypeName,
            goalName,
            balance,
            targetAmount,
            , // targetFiat
            , // targetCurrency
            , // currentFiatValue
            unlockTime,
            recipient,
            isActive,
            progressPercent,
            pendingRewards,
            // isFiatTarget
        ) = this.getAccountInfoExtended(user, accountId);
        
        return (
            accountTypeName,
            goalName,
            balance,
            targetAmount,
            unlockTime,
            recipient,
            isActive,
            progressPercent,
            pendingRewards
        );
    }
    
    function getUserAccounts(address user) external view returns (uint256[] memory) {
        uint256 count = userAccounts[user].length;
        uint256[] memory accountIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            accountIds[i] = i;
        }
        return accountIds;
    }
    
    function getStats() external view returns (
        uint256 tvl,
        uint256 activeBalance,
        uint256 accounts,
        uint256 completed,
        uint256 fees,
        uint256 rewards
    ) {
        return (
            totalValueLocked,
            totalActiveBalance,
            totalAccountsCreated,
            totalGoalsCompleted,
            totalFeesCollected,
            totalRewardsDistributed
        );
    }
    
    receive() external payable {}
}