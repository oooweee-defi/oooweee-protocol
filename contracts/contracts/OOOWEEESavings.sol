// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SavingsPriceOracle.sol";

/**
 * @title OOOWEEESavings
 * @notice L1-native savings accounts with fiat-denominated targets
 * @dev Users deposit OOOWEEE tokens, set goals in EUR/USD/GBP, and withdraw
 *      when their target is met. All checks are user-initiated (self-paid gas).
 *
 * Three account types:
 * - Time:    Locks tokens until a specific date. User calls manualWithdraw after unlock.
 * - Growth:  Locks tokens until fiat value hits target. User calls manualWithdraw when ready.
 * - Balance: Like Growth, but sends tokens to a recipient address when target is hit.
 *
 * Rewards from validator yield are distributed proportionally based on TVL.
 * Users claim rewards by calling claimRewards() — again, self-paid gas.
 *
 * No automation needed. The frontend shows users their current fiat value.
 * When they see it's hit target, they submit the withdrawal transaction.
 * The contract checks the oracle on-chain and either releases or reverts.
 */
contract OOOWEEESavings is ReentrancyGuard, Ownable {
    IERC20 public immutable oooweeeToken;
    SavingsPriceOracle public priceOracle;

    enum AccountType { Time, Balance, Growth }

    // Struct packing optimised for minimal storage slots
    struct SavingsAccount {
        // Slot 1: 32 bytes
        address owner;                                  // 20 bytes
        AccountType accountType;                        // 1 byte
        SavingsPriceOracle.Currency targetCurrency;     // 1 byte
        bool isActive;                                  // 1 byte
        bool isFiatTarget;                              // 1 byte
        uint32 createdAt;                               // 4 bytes
        uint32 completedAt;                             // 4 bytes
        // Slot 2: 32 bytes
        address recipient;                              // 20 bytes
        uint32 unlockTime;                              // 4 bytes
        uint64 lastRewardUpdate;                        // 8 bytes
        // Slot 3-6: 32 bytes each
        uint256 balance;
        uint256 targetAmount;
        uint256 targetFiat;
        string goalName;
    }

    // ============ Fee Settings ============

    uint256 public creationFeeRate = 100;       // 1%
    uint256 public withdrawalFeeRate = 100;     // 1%
    uint256 public constant FEE_DIVISOR = 10000;
    uint256 public constant MAX_LOCK_DURATION = 36500 days;

    address public feeCollector;
    address public rewardsDistributor;

    // ============ Statistics ============

    uint256 public totalValueLocked;
    uint256 public totalAccountsCreated;
    uint256 public totalGoalsCompleted;
    uint256 public totalFeesCollected;
    uint256 public totalRewardsDistributed;

    // ============ Reward State ============

    mapping(address => SavingsAccount[]) public userAccounts;
    uint256 public totalActiveBalance;
    uint256 public globalRewardPerToken;
    uint256 public pendingRewards;
    uint256 public lastRewardDistribution;

    // ============ Events ============

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
        uint256 tokensReturned,
        uint256 feeCollected
    );
    event BalanceTransferred(
        address indexed from,
        address indexed to,
        uint256 tokenAmount,
        string goalName
    );
    event RewardsReceived(uint256 amount, uint256 timestamp);
    event RewardsClaimed(address indexed user, uint256 indexed accountId, uint256 claimed);
    event FeeCollectorSet(address indexed collector);
    event RewardsDistributorSet(address indexed distributor);
    event FeesUpdated(uint256 creationFee, uint256 withdrawalFee);
    event PriceOracleUpdated(address indexed newOracle);

    constructor(
        address _tokenAddress,
        address _priceOracle
    ) Ownable() {
        require(_tokenAddress != address(0), "Invalid token");
        require(_priceOracle != address(0), "Invalid oracle");

        oooweeeToken = IERC20(_tokenAddress);
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

    function setPriceOracle(address _priceOracle) external onlyOwner {
        require(_priceOracle != address(0), "Invalid address");
        priceOracle = SavingsPriceOracle(_priceOracle);
        emit PriceOracleUpdated(_priceOracle);
    }

    // ============ Price Functions ============

    function getBalanceInFiat(
        uint256 oooweeeBalance,
        SavingsPriceOracle.Currency currency
    ) public returns (uint256) {
        uint256 pricePerToken = priceOracle.getOooweeePrice(currency);
        return (oooweeeBalance * pricePerToken) / 1e18;
    }

    function getBalanceInFiatView(
        uint256 oooweeeBalance,
        SavingsPriceOracle.Currency currency
    ) public view returns (uint256) {
        uint256 pricePerToken = priceOracle.getOooweeePriceView(currency);
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

    function getFiatToTokensView(
        uint256 fiatAmount,
        SavingsPriceOracle.Currency currency
    ) public view returns (uint256) {
        uint256 pricePerToken = priceOracle.getOooweeePriceView(currency);
        if (pricePerToken == 0) return 0;
        return (fiatAmount * 1e18) / pricePerToken;
    }

    // ============ Account Creation ============

    function createTimeAccount(
        uint256 unlockTime,
        string memory goalName,
        uint256 initialDeposit,
        SavingsPriceOracle.Currency displayCurrency
    ) external returns (uint256) {
        require(unlockTime > block.timestamp, "Unlock must be future");
        require(unlockTime <= block.timestamp + MAX_LOCK_DURATION, "Max 100 years");
        require(initialDeposit > 0, "Must deposit");
        require(unlockTime <= type(uint32).max, "Overflow");

        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit), "Transfer failed");
        if (creationFee > 0) {
            oooweeeToken.transfer(feeCollector, creationFee);
            totalFeesCollected += creationFee;
        }

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

    function createGrowthAccount(
        uint256 targetFiatAmount,
        SavingsPriceOracle.Currency targetCurrency,
        string memory goalName,
        uint256 initialDeposit
    ) external returns (uint256) {
        require(targetFiatAmount > 0, "Target required");
        require(initialDeposit > 0, "Must deposit");

        uint256 currentValue = getBalanceInFiat(initialDeposit, targetCurrency);
        require(targetFiatAmount > currentValue, "Target must exceed initial value");

        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit), "Transfer failed");
        if (creationFee > 0) {
            oooweeeToken.transfer(feeCollector, creationFee);
            totalFeesCollected += creationFee;
        }

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
        return accountId;
    }

    function createBalanceAccount(
        uint256 targetFiatAmount,
        SavingsPriceOracle.Currency targetCurrency,
        address recipient,
        string memory goalName,
        uint256 initialDeposit
    ) external returns (uint256) {
        require(targetFiatAmount > 0, "Target required");
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot send to self");
        require(initialDeposit > 0, "Must deposit");

        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit), "Transfer failed");
        if (creationFee > 0) {
            oooweeeToken.transfer(feeCollector, creationFee);
            totalFeesCollected += creationFee;
        }

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
        return accountId;
    }

    // ============ Deposit ============

    function deposit(uint256 accountId, uint256 amount) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "Invalid account");
        require(amount > 0, "Amount must be > 0");

        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive, "Account not active");

        _updateAccountRewards(msg.sender, accountId);

        require(oooweeeToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        account.balance += amount;
        totalValueLocked += amount;
        totalActiveBalance += amount;

        emit Deposited(msg.sender, accountId, amount, account.balance);
    }

    // ============ Withdrawal (User-Initiated, Self-Paid Gas) ============

    /**
     * @notice Withdraw from any account type — user checks and pays gas
     * @dev The frontend shows the user their fiat value. When they believe
     *      their target is met, they call this. The contract verifies on-chain:
     *      - Time accounts: checks block.timestamp >= unlockTime
     *      - Growth accounts: checks fiat value >= targetFiat via oracle
     *      - Balance accounts: checks fiat value >= targetFiat + 1% buffer,
     *        then sends target amount to recipient, remainder back to owner
     *
     *      If conditions aren't met, transaction reverts. User loses gas only.
     *      Use canWithdraw() view function first to check without spending gas.
     */
    function manualWithdraw(uint256 accountId) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "Invalid account");

        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive, "Account not active");
        require(account.owner == msg.sender, "Not owner");

        _updateAccountRewards(msg.sender, accountId);

        if (account.accountType == AccountType.Time) {
            require(block.timestamp >= account.unlockTime, "Still locked");
            _executeReturn(msg.sender, accountId);

        } else if (account.accountType == AccountType.Growth) {
            if (account.isFiatTarget) {
                require(
                    _checkFiatTarget(account.balance, account.targetFiat, account.targetCurrency),
                    "Target not reached"
                );
            } else {
                require(account.balance >= account.targetAmount, "Target not reached");
            }
            _executeReturn(msg.sender, accountId);

        } else if (account.accountType == AccountType.Balance) {
            if (account.isFiatTarget) {
                uint256 requiredFiat = account.targetFiat + (account.targetFiat / 100);
                require(
                    _checkFiatTarget(account.balance, requiredFiat, account.targetCurrency),
                    "Target not reached (need +1% buffer for fees)"
                );
            } else {
                uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
                require(account.balance >= requiredBalance, "Target not reached");
            }
            _executeBalanceTransfer(msg.sender, accountId);
        }
    }

    /**
     * @notice Check if an account can be withdrawn — free view call, no gas
     * @dev Frontend calls this to show a "Withdraw" button when ready
     */
    function canWithdraw(address owner, uint256 accountId) external view returns (bool) {
        if (accountId >= userAccounts[owner].length) return false;

        SavingsAccount memory account = userAccounts[owner][accountId];
        if (!account.isActive) return false;

        uint256 totalBalance = account.balance + _calculatePendingRewards(owner, accountId);

        if (account.accountType == AccountType.Time) {
            return block.timestamp >= account.unlockTime;

        } else if (account.accountType == AccountType.Growth) {
            if (account.isFiatTarget) {
                uint256 currentValue = getBalanceInFiatView(totalBalance, account.targetCurrency);
                return currentValue >= account.targetFiat;
            }
            return totalBalance >= account.targetAmount;

        } else if (account.accountType == AccountType.Balance) {
            if (account.isFiatTarget) {
                uint256 requiredFiat = account.targetFiat + (account.targetFiat / 100);
                uint256 currentValue = getBalanceInFiatView(totalBalance, account.targetCurrency);
                return currentValue >= requiredFiat;
            }
            uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
            return totalBalance >= requiredBalance;
        }

        return false;
    }

    // ============ Rewards ============

    /**
     * @notice Receive OOOWEEE reward tokens from ValidatorFund
     * @dev Called by the ValidatorFund after swapping ETH→OOOWEEE
     */
    function receiveRewards(uint256 amount) external {
        require(msg.sender == rewardsDistributor, "Only rewards distributor");
        require(amount > 0, "Amount must be > 0");

        require(oooweeeToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        if (totalActiveBalance > 0) {
            globalRewardPerToken += (amount * 1e18) / totalActiveBalance;
            totalRewardsDistributed += amount;
        } else {
            pendingRewards += amount;
        }

        lastRewardDistribution = block.timestamp;
        emit RewardsReceived(amount, block.timestamp);
    }

    function claimRewards(uint256 accountId) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "Invalid account");
        _updateAccountRewards(msg.sender, accountId);
    }

    function claimAllRewards() external nonReentrant {
        uint256 accountCount = userAccounts[msg.sender].length;
        require(accountCount > 0, "No accounts");

        uint256 maxClaims = accountCount > 20 ? 20 : accountCount;
        for (uint256 i = 0; i < maxClaims; i++) {
            if (userAccounts[msg.sender][i].isActive) {
                _updateAccountRewards(msg.sender, i);
            }
        }
    }

    // ============ Internal Logic ============

    function _updateAccountRewards(address owner, uint256 accountId) internal {
        SavingsAccount storage account = userAccounts[owner][accountId];
        if (!account.isActive) return;

        uint256 currentGlobalReward = globalRewardPerToken;

        // Flush any pending rewards into the global accumulator
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

    function _checkFiatTarget(
        uint256 balance,
        uint256 targetFiat,
        SavingsPriceOracle.Currency currency
    ) internal returns (bool) {
        uint256 currentValue = getBalanceInFiat(balance, currency);
        return currentValue >= targetFiat;
    }

    /**
     * @notice Return OOOWEEE tokens to account owner (Time & Growth)
     */
    function _executeReturn(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];

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
        require(oooweeeToken.transfer(owner, amountAfterFee), "Transfer failed");

        emit GoalCompleted(owner, accountId, account.goalName, amountAfterFee, fee);
    }

    /**
     * @notice Transfer OOOWEEE to recipient (Balance accounts)
     * @dev Sends target amount to recipient, remainder back to owner
     */
    function _executeBalanceTransfer(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];

        // Cache full balance before any modifications
        uint256 fullBalance = account.balance;

        uint256 transferAmount = account.isFiatTarget
            ? getFiatToTokens(account.targetFiat, account.targetCurrency)
            : account.targetAmount;

        if (transferAmount > fullBalance) {
            transferAmount = fullBalance;
        }

        uint256 fee = (transferAmount * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 amountAfterFee = transferAmount - fee;
        uint256 remainder = fullBalance - transferAmount;

        // Close account
        account.balance = 0;
        account.isActive = false;
        account.completedAt = uint32(block.timestamp);

        // Subtract the FULL original balance from trackers (not just transferAmount)
        totalValueLocked -= fullBalance;
        totalActiveBalance -= fullBalance;
        totalFeesCollected += fee;
        totalGoalsCompleted++;

        if (fee > 0) {
            oooweeeToken.transfer(feeCollector, fee);
        }

        // Send target to recipient
        require(oooweeeToken.transfer(account.recipient, amountAfterFee), "Transfer to recipient failed");

        // Return remainder to owner
        if (remainder > 0) {
            oooweeeToken.transfer(owner, remainder);
        }

        emit BalanceTransferred(owner, account.recipient, amountAfterFee, account.goalName);
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

    function getUserAccountCount(address user) external view returns (uint256 total, uint256 active) {
        total = userAccounts[user].length;
        for (uint256 i = 0; i < total; i++) {
            if (userAccounts[user][i].isActive) active++;
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

    function getAccountFiatProgressView(address owner, uint256 accountId)
        external view returns (
            uint256 currentValue,
            uint256 targetValue,
            uint256 percentComplete,
            bool withdrawable
        )
    {
        require(accountId < userAccounts[owner].length, "Invalid account");
        SavingsAccount memory account = userAccounts[owner][accountId];

        if (!account.isFiatTarget) return (0, 0, 0, false);

        uint256 totalBalance = account.balance + _calculatePendingRewards(owner, accountId);
        currentValue = getBalanceInFiatView(totalBalance, account.targetCurrency);
        targetValue = account.targetFiat;

        if (targetValue > 0) {
            percentComplete = (currentValue * 100) / targetValue;
            if (percentComplete > 100) percentComplete = 100;
        }

        withdrawable = false;
        if (account.accountType == AccountType.Growth) {
            withdrawable = currentValue >= targetValue;
        } else if (account.accountType == AccountType.Balance) {
            uint256 requiredValue = targetValue + (targetValue / 100);
            withdrawable = currentValue >= requiredValue;
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
}
