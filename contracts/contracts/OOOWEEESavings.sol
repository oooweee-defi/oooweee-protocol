// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./SavingsPriceOracle.sol";

contract OOOWEEESavings is ReentrancyGuard, Ownable {
    IERC20 public immutable oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    SavingsPriceOracle public priceOracle;

    enum AccountType { Time, Balance, Growth }
    // Currency and price config now live in SavingsPriceOracle
    
    // OPTIMIZED STRUCT PACKING - Saves ~20,000 gas per account
    struct SavingsAccount {
        // Slot 1: 32 bytes
        address owner;              // 20 bytes
        AccountType accountType;    // 1 byte
        SavingsPriceOracle.Currency targetCurrency;    // 1 byte
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
    
    // State Variables
    mapping(address => SavingsAccount[]) public userAccounts;
    uint256 public totalActiveBalance;
    uint256 public globalRewardPerToken;
    uint256 public pendingRewards;
    uint256 public lastRewardDistribution;
    
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
        SavingsPriceOracle.Currency currency,
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
    event PoolAddressSet(address indexed pool);
    event FeeCollectorSet(address indexed collector);
    event RewardsDistributorSet(address indexed distributor);
    event FeesUpdated(uint256 creationFee, uint256 withdrawalFee);

    constructor(
        address _tokenAddress,
        address _uniswapRouter,
        address _priceOracle
    ) Ownable() {
        oooweeeToken = IERC20(_tokenAddress);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        priceOracle = SavingsPriceOracle(_priceOracle);
        feeCollector = msg.sender;
    }
    
    // ============ Admin Functions ============
    
    function setRewardsDistributor(address _distributor) external onlyOwner {
        require(_distributor != address(0), "Invalid address");
        rewardsDistributor = _distributor;
        emit RewardsDistributorSet(_distributor);
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
    
    
    function getBalanceInFiat(
        uint256 oooweeeBalance,
        SavingsPriceOracle.Currency currency
    ) public returns (uint256) {
        uint256 pricePerToken = priceOracle.getOooweeePrice(currency);
        return (oooweeeBalance * pricePerToken) / 1e18;
    }
    
    function getFiatToTokens(
        uint256 fiatAmount,
        SavingsPriceOracle.Currency currency
    ) public returns (uint256) {
        uint256 pricePerToken = priceOracle.getOooweeePrice(currency);
        if (pricePerToken == 0) return 0;
        return (fiatAmount * 1e18) / pricePerToken;
    }
    
    // ============ Account Creation Functions ============
    
    function createTimeAccountFiat(
        uint256 unlockTime,
        string memory goalName,
        uint256 initialDeposit,
        SavingsPriceOracle.Currency displayCurrency
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
        SavingsPriceOracle.Currency targetCurrency,
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
        SavingsPriceOracle.Currency targetCurrency,
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
        SavingsPriceOracle.Currency currency
    ) internal returns (bool) {
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
            SavingsPriceOracle.Currency targetCurrency,
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
        external returns (
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
    
    // Price info can now be queried directly from SavingsPriceOracle.
    
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