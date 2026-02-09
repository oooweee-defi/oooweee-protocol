// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./SavingsPriceOracle.sol";

/**
 * @title AutomationCompatibleInterface
 * @notice Chainlink Automation interface for checkUpkeep/performUpkeep
 */
interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

/**
 * @title OOOWEEESavings
 * @notice Flattened V1+V2+V3 savings contract for fresh mainnet deployment.
 *         Includes individual savings accounts (Time, Growth, Balance),
 *         group savings, Chainlink Automation auto-unlock, and a clean
 *         rewards system with separate deposit/reward tracking.
 *
 * @dev All audit findings (C-1, C-2, H-1, H-2, H-3, M-3, L-6) are addressed.
 *      No storage layout compatibility with any previous deployment is needed.
 *
 * Reward system:
 *   - rewardPerToken accumulates rewards per deposited token
 *   - totalDepositedBalance tracks only user deposits (not rewards)
 *   - accountEarnedRewards tracks earned but unclaimed rewards per account
 *   - Rewards never merge into account.balance
 *   - Solvency check: earned rewards capped at (contract balance - totalDepositedBalance)
 */
contract OOOWEEESavings is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    AutomationCompatibleInterface
{
    // ============ Token & Oracle ============

    IERC20 public oooweeeToken;
    SavingsPriceOracle public priceOracle;

    // ============ Enums ============

    enum AccountType { Time, Balance, Growth }

    // ============ SavingsAccount Struct ============
    // NOTE: lastRewardUpdate removed from struct; tracked via mapping instead.

    struct SavingsAccount {
        // Slot 1: 32 bytes
        address owner;                                  // 20 bytes
        AccountType accountType;                        // 1 byte
        SavingsPriceOracle.Currency targetCurrency;     // 1 byte
        bool isActive;                                  // 1 byte
        bool isFiatTarget;                              // 1 byte
        uint32 createdAt;                               // 4 bytes
        uint32 completedAt;                             // 4 bytes
        // Slot 2: 24 bytes used
        address recipient;                              // 20 bytes
        uint32 unlockTime;                              // 4 bytes
        // Slot 3-6: 32 bytes each
        uint256 balance;        // deposits only, rewards never merged in
        uint256 targetAmount;
        uint256 targetFiat;
        string goalName;
    }

    // ============ Fee Settings ============

    uint256 public creationFeeRate;
    uint256 public withdrawalFeeRate;
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

    // ============ Account Storage ============

    mapping(address => SavingsAccount[]) public userAccounts;

    // ============ Rewards (clean, single system) ============

    uint256 public rewardPerToken;
    uint256 public totalDepositedBalance;
    uint256 public pendingRewards;
    uint256 public lastRewardDistribution;

    mapping(address => mapping(uint256 => uint256)) public lastRewardUpdate;
    mapping(address => mapping(uint256 => uint256)) public accountEarnedRewards;

    uint256 public totalActiveBalance;  // kept for stats view compatibility

    // ============ Auto-Unlock ============

    address public automationRegistry;
    uint256 public maxAutoProcessBatch;

    struct ActiveAccountRef {
        address owner;
        uint256 accountId;
    }

    ActiveAccountRef[] public activeAccountRefs;
    mapping(address => mapping(uint256 => uint256)) public activeAccountIndex;

    // ============ Group Savings ============

    struct GroupAccount {
        address creator;
        address destinationWallet;
        AccountType accountType;
        SavingsPriceOracle.Currency targetCurrency;
        bool isActive;
        uint32 createdAt;
        uint32 completedAt;
        uint32 unlockTime;
        uint256 totalBalance;
        uint256 targetFiat;
        string goalName;
        address[] members;
        mapping(address => bool) isMember;
        mapping(address => bool) isInvited;
        mapping(address => uint256) contributions;
    }

    uint256 public groupCount;
    mapping(uint256 => GroupAccount) public groups;

    // AUDIT FIX M-3 R2: Track group deposits separately for solvency calculation
    uint256 public totalGroupBalance;

    // ============ Storage Gap ============

    uint256[50] private __gap;

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
        uint256 depositFee,
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

    // V2 events
    event AutoUnlockProcessed(address indexed owner, uint256 indexed accountId, uint256 amount);
    event AutomationRegistryUpdated(address indexed registry);
    event GroupCreated(uint256 indexed groupId, address indexed creator, string goalName);
    event MemberInvited(uint256 indexed groupId, address indexed member);
    event InvitationAccepted(uint256 indexed groupId, address indexed member);
    event GroupDeposit(uint256 indexed groupId, address indexed depositor, uint256 amount);
    event GroupCompleted(uint256 indexed groupId, address indexed destination, uint256 amount);

    // New: M-3 audit fix
    event GroupCancelled(uint256 indexed groupId, address indexed cancelledBy, uint256 totalReturned);

    // ============ Constructor ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ============ Initializer ============

    function initialize(
        address _tokenAddress,
        address _priceOracle
    ) public initializer {
        require(_tokenAddress != address(0), "E1");
        require(_priceOracle != address(0), "E1");

        __ReentrancyGuard_init();
        __Ownable_init();
        __UUPSUpgradeable_init();

        oooweeeToken = IERC20(_tokenAddress);
        priceOracle = SavingsPriceOracle(_priceOracle);
        feeCollector = msg.sender;
        creationFeeRate = 100;          // 1%
        withdrawalFeeRate = 100;        // 1%
        maxAutoProcessBatch = 20;
    }

    // ============ AUDIT FIX L-6: Disable renounceOwnership ============

    function renounceOwnership() public virtual override {
        revert("E32");
    }

    // ============ Admin Functions ============

    function setRewardsDistributor(address _distributor) external onlyOwner {
        require(_distributor != address(0), "E1");
        rewardsDistributor = _distributor;
        emit RewardsDistributorSet(_distributor);
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "E1");
        feeCollector = _feeCollector;
        emit FeeCollectorSet(_feeCollector);
    }

    function setFees(uint256 _creationFeeRate, uint256 _withdrawalFeeRate) external onlyOwner {
        require(_creationFeeRate <= 500, "E30");
        require(_withdrawalFeeRate <= 500, "E31");
        creationFeeRate = _creationFeeRate;
        withdrawalFeeRate = _withdrawalFeeRate;
        emit FeesUpdated(_creationFeeRate, _withdrawalFeeRate);
    }

    function setPriceOracle(address _priceOracle) external onlyOwner {
        require(_priceOracle != address(0), "E1");
        priceOracle = SavingsPriceOracle(_priceOracle);
        emit PriceOracleUpdated(_priceOracle);
    }

    function setAutomationRegistry(address _registry) external onlyOwner {
        automationRegistry = _registry;
        emit AutomationRegistryUpdated(_registry);
    }

    function setMaxAutoProcessBatch(uint256 _max) external onlyOwner {
        require(_max > 0 && _max <= 50, "Batch 1-50");
        maxAutoProcessBatch = _max;
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

    /**
     * @notice Convert fiat amount to tokens using TWAP-validated price
     * @dev AUDIT FIX M-2 R3: Uses same price source as withdrawal gate check
     */
    function getFiatToTokensValidated(
        uint256 fiatAmount,
        SavingsPriceOracle.Currency currency
    ) public returns (uint256) {
        uint256 pricePerToken = priceOracle.getValidatedOooweeePrice(currency);
        if (pricePerToken == 0) return 0;
        return (fiatAmount * 1e18) / pricePerToken;
    }

    // ============ Account Creation ============

    /**
     * @notice Create a time-locked savings account
     * @dev AUDIT FIX C-1: Sets lastRewardUpdate[msg.sender][accountId] = rewardPerToken
     */
    function createTimeAccount(
        uint256 unlockTime,
        string memory goalName,
        uint256 initialDeposit,
        SavingsPriceOracle.Currency displayCurrency
    ) external nonReentrant returns (uint256) {
        require(unlockTime > block.timestamp, "E7");
        require(unlockTime <= block.timestamp + MAX_LOCK_DURATION, "E8");
        require(initialDeposit > 0, "E4");
        require(unlockTime <= type(uint32).max, "E9");

        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit), "TF");
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
            balance: depositAfterFee,
            targetAmount: 0,
            targetFiat: 0,
            goalName: goalName
        }));

        // AUDIT FIX C-1: Checkpoint reward state at creation
        lastRewardUpdate[msg.sender][accountId] = rewardPerToken;

        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalDepositedBalance += depositAfterFee;
        totalAccountsCreated++;

        _addActiveRef(msg.sender, accountId);

        emit AccountCreated(msg.sender, accountId, AccountType.Time, goalName, initialDeposit, creationFee);
        return accountId;
    }

    /**
     * @notice Create a growth savings account targeting a fiat value
     * @dev AUDIT FIX H-1: Uses getBalanceInFiatView() instead of getBalanceInFiat()
     * @dev AUDIT FIX C-1: Sets lastRewardUpdate[msg.sender][accountId] = rewardPerToken
     */
    function createGrowthAccount(
        uint256 targetFiatAmount,
        SavingsPriceOracle.Currency targetCurrency,
        string memory goalName,
        uint256 initialDeposit
    ) external nonReentrant returns (uint256) {
        require(targetFiatAmount > 0, "E5");
        require(initialDeposit > 0, "E4");

        // AUDIT FIX H-1: Use view function to prevent state changes during creation check
        uint256 currentValue = getBalanceInFiatView(initialDeposit, targetCurrency);
        require(targetFiatAmount > currentValue, "E10");

        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit), "TF");
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
            balance: depositAfterFee,
            targetAmount: 0,
            targetFiat: targetFiatAmount,
            goalName: goalName
        }));

        // AUDIT FIX C-1: Checkpoint reward state at creation
        lastRewardUpdate[msg.sender][accountId] = rewardPerToken;

        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalDepositedBalance += depositAfterFee;
        totalAccountsCreated++;

        _addActiveRef(msg.sender, accountId);

        emit AccountCreated(msg.sender, accountId, AccountType.Growth, goalName, initialDeposit, creationFee);
        emit FiatAccountCreated(msg.sender, accountId, targetCurrency, targetFiatAmount);
        return accountId;
    }

    /**
     * @notice Create a balance account that transfers to a recipient when target is met
     * @dev AUDIT FIX C-1: Sets lastRewardUpdate[msg.sender][accountId] = rewardPerToken
     */
    function createBalanceAccount(
        uint256 targetFiatAmount,
        SavingsPriceOracle.Currency targetCurrency,
        address recipient,
        string memory goalName,
        uint256 initialDeposit
    ) external nonReentrant returns (uint256) {
        require(targetFiatAmount > 0, "E5");
        require(recipient != address(0), "E1");
        require(recipient != msg.sender, "E11");
        require(initialDeposit > 0, "E4");

        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit), "TF");
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
            balance: depositAfterFee,
            targetAmount: 0,
            targetFiat: targetFiatAmount,
            goalName: goalName
        }));

        // AUDIT FIX C-1: Checkpoint reward state at creation
        lastRewardUpdate[msg.sender][accountId] = rewardPerToken;

        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalDepositedBalance += depositAfterFee;
        totalAccountsCreated++;

        _addActiveRef(msg.sender, accountId);

        emit AccountCreated(msg.sender, accountId, AccountType.Balance, goalName, initialDeposit, creationFee);
        emit FiatAccountCreated(msg.sender, accountId, targetCurrency, targetFiatAmount);
        return accountId;
    }

    // ============ Deposit ============

    function deposit(uint256 accountId, uint256 amount) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "E2");
        require(amount > 0, "E4");

        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive, "E3");

        _updateAccountRewards(msg.sender, accountId);

        uint256 depositFee = (amount * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = amount - depositFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), amount), "TF");

        if (depositFee > 0) {
            oooweeeToken.transfer(feeCollector, depositFee);
            totalFeesCollected += depositFee;
        }

        account.balance += depositAfterFee;
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalDepositedBalance += depositAfterFee;

        emit Deposited(msg.sender, accountId, depositAfterFee, depositFee, account.balance);
    }

    // ============ Withdrawal ============

    /**
     * @notice Withdraw from any account type — user checks and pays gas.
     * @dev AUDIT FIX C-2: No _merge function. totalBal = balance + earnedRewards.
     *      Withdrawal uses _fullBalance for condition checks and clean tracker subtraction.
     */
    function manualWithdraw(uint256 accountId) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "E2");

        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive, "E3");
        require(account.owner == msg.sender, "E12");

        _updateAccountRewards(msg.sender, accountId);

        // AUDIT FIX C-2: Use totalBal (deposits + earned rewards) for condition checks
        uint256 totalBal = account.balance + accountEarnedRewards[msg.sender][accountId];

        if (account.accountType == AccountType.Time) {
            require(block.timestamp >= account.unlockTime, "E13");
            _executeReturn(msg.sender, accountId);

        } else if (account.accountType == AccountType.Growth) {
            if (account.isFiatTarget) {
                require(
                    _checkFiatTarget(totalBal, account.targetFiat, account.targetCurrency),
                    "E6"
                );
            } else {
                require(totalBal >= account.targetAmount, "E6");
            }
            _executeReturn(msg.sender, accountId);

        } else if (account.accountType == AccountType.Balance) {
            if (account.isFiatTarget) {
                uint256 requiredFiat = account.targetFiat + (account.targetFiat / 100);
                require(
                    _checkFiatTarget(totalBal, requiredFiat, account.targetCurrency),
                    "E6"
                );
            } else {
                uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
                require(totalBal >= requiredBalance, "E6");
            }
            _executeBalanceTransfer(msg.sender, accountId);
        }

        // AUDIT FIX M-3 R3: Remove from active refs on manual withdraw
        // (previously only _autoProcess removed refs, causing array bloat)
        _removeActiveRef(msg.sender, accountId);
    }

    /**
     * @notice Check if an account can be withdrawn — free view call, no gas
     */
    function canWithdraw(address owner, uint256 accountId) external view returns (bool) {
        if (accountId >= userAccounts[owner].length) return false;
        SavingsAccount memory account = userAccounts[owner][accountId];
        if (!account.isActive) return false;
        return _checkWithdraw(account, _fullBalance(owner, accountId));
    }

    // ============ Rewards ============

    /**
     * @notice Receive OOOWEEE reward tokens from ValidatorFund
     * @dev Uses totalDepositedBalance as denominator (not totalActiveBalance)
     */
    function receiveRewards(uint256 amount) external nonReentrant {
        require(msg.sender == rewardsDistributor, "E14");
        require(amount > 0, "E4");

        require(oooweeeToken.transferFrom(msg.sender, address(this), amount), "TF");

        if (totalDepositedBalance > 0) {
            rewardPerToken += (amount * 1e18) / totalDepositedBalance;
            totalRewardsDistributed += amount;
        } else {
            pendingRewards += amount;
        }

        lastRewardDistribution = block.timestamp;
        emit RewardsReceived(amount, block.timestamp);
    }

    function claimRewards(uint256 accountId) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "E2");
        _updateAccountRewards(msg.sender, accountId);
    }

    /**
     * @notice Claim rewards for multiple accounts with pagination
     * @param startIndex First account index to process
     * @param count Maximum number of accounts to process (capped at 20 per call)
     */
    function claimAllRewards(uint256 startIndex, uint256 count) external nonReentrant {
        uint256 accountCount = userAccounts[msg.sender].length;
        require(accountCount > 0, "E15");
        require(startIndex < accountCount, "E16");

        if (count > 20) count = 20;
        uint256 endIndex = startIndex + count;
        if (endIndex > accountCount) endIndex = accountCount;

        for (uint256 i = startIndex; i < endIndex; i++) {
            if (userAccounts[msg.sender][i].isActive) {
                _updateAccountRewards(msg.sender, i);
            }
        }
    }

    /**
     * @notice Convenience: claim rewards for first 20 accounts
     */
    function claimAllRewards() external nonReentrant {
        uint256 accountCount = userAccounts[msg.sender].length;
        require(accountCount > 0, "E15");

        uint256 maxClaims = accountCount > 20 ? 20 : accountCount;
        for (uint256 i = 0; i < maxClaims; i++) {
            if (userAccounts[msg.sender][i].isActive) {
                _updateAccountRewards(msg.sender, i);
            }
        }
    }

    // ============ Chainlink Automation ============

    /**
     * @notice Chainlink Automation: check if any accounts are ready for auto-unlock
     */
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256 batch = maxAutoProcessBatch > 0 ? maxAutoProcessBatch : 20;
        uint256 count = 0;

        address[] memory owners = new address[](batch);
        uint256[] memory ids = new uint256[](batch);

        for (uint256 i = 0; i < activeAccountRefs.length && count < batch; i++) {
            ActiveAccountRef memory ref = activeAccountRefs[i];
            if (ref.owner == address(0)) continue;

            if (_isAccountMatured(ref.owner, ref.accountId)) {
                owners[count] = ref.owner;
                ids[count] = ref.accountId;
                count++;
            }
        }

        if (count > 0) {
            upkeepNeeded = true;
            performData = abi.encode(owners, ids, count);
        }
    }

    /**
     * @notice Chainlink Automation: process matured accounts
     */
    function performUpkeep(bytes calldata performData) external override nonReentrant {
        require(automationRegistry != address(0), "E17");
        require(msg.sender == automationRegistry, "E18");

        (address[] memory owners, uint256[] memory ids, uint256 count) =
            abi.decode(performData, (address[], uint256[], uint256));

        for (uint256 i = 0; i < count; i++) {
            _autoProcess(owners[i], ids[i]);
        }
    }

    /**
     * @notice Anyone can trigger auto-unlock for matured accounts
     */
    function processMaturedAccounts() external nonReentrant {
        uint256 batch = maxAutoProcessBatch > 0 ? maxAutoProcessBatch : 20;
        uint256 processed = 0;

        for (uint256 i = 0; i < activeAccountRefs.length && processed < batch; i++) {
            ActiveAccountRef memory ref = activeAccountRefs[i];
            if (ref.owner == address(0)) continue;

            if (_isAccountMatured(ref.owner, ref.accountId)) {
                _autoProcess(ref.owner, ref.accountId);
                processed++;
            }
        }
    }

    // ============ Group Savings ============

    /**
     * @notice Create a group savings account
     * @dev AUDIT FIX M-2 NEW: Group deposits excluded from totalDepositedBalance (no reward dilution).
     */
    function createGroupAccount(
        AccountType _accountType,
        address _destinationWallet,
        string memory _goalName,
        uint256 _targetFiat,
        SavingsPriceOracle.Currency _targetCurrency,
        uint32 _unlockTime,
        uint256 _initialDeposit
    ) external nonReentrant returns (uint256) {
        require(_destinationWallet != address(0), "E1");
        require(bytes(_goalName).length > 0, "E19");
        require(_initialDeposit > 0, "E4");

        if (_accountType == AccountType.Time) {
            require(_unlockTime > block.timestamp, "E7");
        } else {
            require(_targetFiat > 0, "E5");
        }

        uint256 creationFee = (_initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = _initialDeposit - creationFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), _initialDeposit), "TF");
        if (creationFee > 0) {
            oooweeeToken.transfer(feeCollector, creationFee);
            totalFeesCollected += creationFee;
        }

        uint256 groupId = groupCount++;
        GroupAccount storage group = groups[groupId];
        group.creator = msg.sender;
        group.destinationWallet = _destinationWallet;
        group.accountType = _accountType;
        group.targetCurrency = _targetCurrency;
        group.isActive = true;
        group.createdAt = uint32(block.timestamp);
        group.unlockTime = _unlockTime;
        group.totalBalance = depositAfterFee;
        group.targetFiat = _targetFiat;
        group.goalName = _goalName;

        group.members.push(msg.sender);
        group.isMember[msg.sender] = true;
        group.contributions[msg.sender] = depositAfterFee;

        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        // AUDIT FIX M-2 NEW: Group deposits excluded from totalDepositedBalance
        // to avoid diluting individual account rewards. Groups don't earn rewards.
        // AUDIT FIX M-3 R2: Track group balance for solvency calculation
        totalGroupBalance += depositAfterFee;

        emit GroupCreated(groupId, msg.sender, _goalName);
        return groupId;
    }

    function inviteMember(uint256 groupId, address member) external {
        GroupAccount storage group = groups[groupId];
        require(group.creator == msg.sender, "E20");
        require(group.isActive, "E21");
        require(member != address(0), "E1");
        require(!group.isMember[member], "E22");
        require(!group.isInvited[member], "E23");

        group.isInvited[member] = true;
        emit MemberInvited(groupId, member);
    }

    function acceptInvitation(uint256 groupId) external {
        GroupAccount storage group = groups[groupId];
        require(group.isActive, "E21");
        require(group.isInvited[msg.sender], "E24");
        require(!group.isMember[msg.sender], "E22");

        group.isMember[msg.sender] = true;
        group.isInvited[msg.sender] = false;
        group.members.push(msg.sender);

        emit InvitationAccepted(groupId, msg.sender);
    }

    /**
     * @notice Deposit tokens into a group account
     * @dev AUDIT FIX M-1 NEW: Applies deposit fee (matches individual deposit()).
     *      AUDIT FIX M-2 NEW: Group deposits excluded from totalDepositedBalance.
     */
    function depositToGroup(uint256 groupId, uint256 amount) external nonReentrant {
        GroupAccount storage group = groups[groupId];
        require(group.isActive, "E21");
        require(group.isMember[msg.sender], "E25");
        require(amount > 0, "E4");

        // AUDIT FIX M-1 NEW: Apply deposit fee (matches individual deposit())
        uint256 depositFee = (amount * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = amount - depositFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), amount), "TF");

        if (depositFee > 0) {
            oooweeeToken.transfer(feeCollector, depositFee);
            totalFeesCollected += depositFee;
        }

        group.totalBalance += depositAfterFee;
        group.contributions[msg.sender] += depositAfterFee;
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalGroupBalance += depositAfterFee;

        emit GroupDeposit(groupId, msg.sender, depositAfterFee);
    }

    /**
     * @notice Process a group account when conditions are met
     * @dev AUDIT FIX H-2: Only creator or owner can call.
     *      Uses getValidatedOooweeePrice (TWAP) instead of spot price.
     * @dev AUDIT FIX M-2 NEW: Groups excluded from totalDepositedBalance — no subtraction needed.
     */
    function processGroupAccount(uint256 groupId) external nonReentrant {
        GroupAccount storage group = groups[groupId];
        require(group.isActive, "E21");
        // AUDIT FIX H-2: Access control
        require(msg.sender == group.creator || msg.sender == owner(), "E26");

        bool canProcess = false;

        if (group.accountType == AccountType.Time) {
            canProcess = block.timestamp >= group.unlockTime;
        } else {
            // AUDIT FIX H-2: Use TWAP-validated price instead of spot
            uint256 pricePerToken = priceOracle.getValidatedOooweeePrice(group.targetCurrency);
            uint256 currentValue = (group.totalBalance * pricePerToken) / 1e18;
            if (group.accountType == AccountType.Balance) {
                uint256 requiredFiat = group.targetFiat + (group.targetFiat / 100);
                canProcess = currentValue >= requiredFiat;
            } else {
                canProcess = currentValue >= group.targetFiat;
            }
        }

        require(canProcess, "E27");

        uint256 bal = group.totalBalance;
        uint256 fee = (bal * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 amountAfterFee = bal - fee;

        group.totalBalance = 0;
        group.isActive = false;
        group.completedAt = uint32(block.timestamp);

        totalValueLocked = totalValueLocked >= bal ? totalValueLocked - bal : 0;
        totalActiveBalance = totalActiveBalance >= bal ? totalActiveBalance - bal : 0;
        // AUDIT FIX M-3 R2: Subtract from totalGroupBalance
        totalGroupBalance = totalGroupBalance >= bal ? totalGroupBalance - bal : 0;
        totalGoalsCompleted++;
        totalFeesCollected += fee;

        if (fee > 0) {
            oooweeeToken.transfer(feeCollector, fee);
        }

        require(oooweeeToken.transfer(group.destinationWallet, amountAfterFee), "TF");

        emit GroupCompleted(groupId, group.destinationWallet, amountAfterFee);
    }

    /**
     * @notice AUDIT FIX M-3: Cancel a group account and return contributions proportionally
     * @dev Creator can cancel immediately if sole member, or after timeout.
     *      Owner (admin) can cancel anytime.
     *      Timeout: 365 days past unlockTime for Time accounts, 730 days past createdAt for others.
     */
    function cancelGroupAccount(uint256 groupId) external nonReentrant {
        GroupAccount storage group = groups[groupId];
        require(group.isActive, "E21");

        bool isAdmin = msg.sender == owner();
        bool isCreator = msg.sender == group.creator;

        require(isAdmin || isCreator, "E26");

        if (isCreator && !isAdmin) {
            if (group.members.length == 1) {
                // Creator is sole member: can cancel immediately
            } else {
                // Creator must wait for timeout
                if (group.accountType == AccountType.Time) {
                    require(
                        block.timestamp >= uint256(group.unlockTime) + 365 days,
                        "E28"
                    );
                } else {
                    require(
                        block.timestamp >= uint256(group.createdAt) + 730 days,
                        "E29"
                    );
                }
            }
        }
        // Admin (owner) can cancel anytime — no additional checks needed

        uint256 bal = group.totalBalance;
        group.totalBalance = 0;
        group.isActive = false;
        group.completedAt = uint32(block.timestamp);

        totalValueLocked = totalValueLocked >= bal ? totalValueLocked - bal : 0;
        totalActiveBalance = totalActiveBalance >= bal ? totalActiveBalance - bal : 0;
        // AUDIT FIX M-3 R2: Subtract from totalGroupBalance
        totalGroupBalance = totalGroupBalance >= bal ? totalGroupBalance - bal : 0;

        // Return contributions proportionally to members
        uint256 totalReturned = 0;
        for (uint256 i = 0; i < group.members.length; i++) {
            address member = group.members[i];
            uint256 contribution = group.contributions[member];
            if (contribution > 0 && bal > 0) {
                // Proportional share: (contribution / original totalBalance) * remaining bal
                // Since no fees were taken from bal during cancel, bal == sum of all contributions
                uint256 share = contribution;
                if (share > bal - totalReturned) {
                    share = bal - totalReturned;
                }
                group.contributions[member] = 0;
                if (share > 0) {
                    totalReturned += share;
                    oooweeeToken.transfer(member, share);
                }
            }
        }

        emit GroupCancelled(groupId, msg.sender, totalReturned);
    }

    // ============ Internal Logic ============

    /**
     * @notice Update account rewards using the clean V3 system
     * @dev Uses rewardPerToken, lastRewardUpdate mapping, accountEarnedRewards mapping.
     *      AUDIT FIX M-3 R2: Solvency check accounts for both individual deposits AND group deposits.
     *      Available rewards = contractBalance - totalDepositedBalance - totalGroupBalance.
     */
    function _updateAccountRewards(address owner, uint256 accountId) internal {
        SavingsAccount storage account = userAccounts[owner][accountId];
        if (!account.isActive) return;

        uint256 currentReward = rewardPerToken;

        // Flush any pending rewards into the accumulator
        if (pendingRewards > 0 && totalDepositedBalance > 0) {
            currentReward += (pendingRewards * 1e18) / totalDepositedBalance;
            rewardPerToken = currentReward;
            totalRewardsDistributed += pendingRewards;
            pendingRewards = 0;
        }

        uint256 lu = lastRewardUpdate[owner][accountId];
        if (currentReward > lu) {
            uint256 earned = (account.balance * (currentReward - lu)) / 1e18;

            // AUDIT FIX M-3 R2: Solvency check must reserve tokens for both
            // individual deposits and group deposits
            uint256 contractBalance = oooweeeToken.balanceOf(address(this));
            uint256 reserved = totalDepositedBalance + totalGroupBalance;
            if (reserved + earned > contractBalance) {
                earned = contractBalance > reserved ? contractBalance - reserved : 0;
            }

            if (earned > 0) {
                accountEarnedRewards[owner][accountId] += earned;
                emit RewardsClaimed(owner, accountId, earned);
            }
            lastRewardUpdate[owner][accountId] = currentReward;
        }
    }

    /**
     * @notice Calculate pending rewards without state change (view)
     */
    function _calculatePendingRewards(address owner, uint256 accountId)
        internal view returns (uint256)
    {
        SavingsAccount memory account = userAccounts[owner][accountId];
        if (!account.isActive) return accountEarnedRewards[owner][accountId];

        uint256 currentReward = rewardPerToken;
        if (pendingRewards > 0 && totalDepositedBalance > 0) {
            currentReward += (pendingRewards * 1e18) / totalDepositedBalance;
        }

        uint256 lu = lastRewardUpdate[owner][accountId];
        uint256 pending = currentReward > lu ? (account.balance * (currentReward - lu)) / 1e18 : 0;
        return accountEarnedRewards[owner][accountId] + pending;
    }

    /**
     * @notice Full balance = deposits + earned rewards + pending calculated rewards
     */
    function _fullBalance(address owner, uint256 accountId) internal view returns (uint256) {
        return userAccounts[owner][accountId].balance + _calculatePendingRewards(owner, accountId);
    }

    /**
     * @notice Unified withdraw check for all account types
     */
    function _checkWithdraw(SavingsAccount memory account, uint256 bal) internal view returns (bool) {
        if (account.accountType == AccountType.Time) {
            return block.timestamp >= account.unlockTime;
        }
        if (account.accountType == AccountType.Growth) {
            if (account.isFiatTarget) {
                return getBalanceInFiatView(bal, account.targetCurrency) >= account.targetFiat;
            }
            return bal >= account.targetAmount;
        }
        if (account.accountType == AccountType.Balance) {
            if (account.isFiatTarget) {
                uint256 requiredFiat = account.targetFiat + (account.targetFiat / 100);
                return getBalanceInFiatView(bal, account.targetCurrency) >= requiredFiat;
            }
            uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
            return bal >= requiredBalance;
        }
        return false;
    }

    /**
     * @notice Check fiat target using TWAP-validated price to prevent flash loan manipulation
     */
    function _checkFiatTarget(
        uint256 balance,
        uint256 targetFiat,
        SavingsPriceOracle.Currency currency
    ) internal returns (bool) {
        uint256 pricePerToken = priceOracle.getValidatedOooweeePrice(currency);
        uint256 currentValue = (balance * pricePerToken) / 1e18;
        return currentValue >= targetFiat;
    }

    /**
     * @notice AUDIT FIX C-2: Clean tracker subtraction helper
     * @param depositAmt The deposit-only amount (account.balance) to subtract from totalDepositedBalance
     * @param totalAmt The total amount (deposits + rewards) to subtract from totalValueLocked
     */
    function _reduceTrackers(uint256 depositAmt, uint256 totalAmt) internal {
        totalDepositedBalance = totalDepositedBalance >= depositAmt ? totalDepositedBalance - depositAmt : 0;
        totalValueLocked = totalValueLocked >= totalAmt ? totalValueLocked - totalAmt : 0;
        totalActiveBalance = totalActiveBalance >= depositAmt ? totalActiveBalance - depositAmt : 0;
    }

    /**
     * @notice Return tokens to account owner (Time & Growth accounts)
     * @dev AUDIT FIX C-2: totalBal = balance + earnedRewards. Subtract deposits from
     *      totalDepositedBalance, totalBal from totalValueLocked. Zero out earnedRewards.
     */
    function _executeReturn(address owner, uint256 accountId) internal {
        SavingsAccount storage account = userAccounts[owner][accountId];

        uint256 depositBal = account.balance;
        uint256 earnedBal = accountEarnedRewards[owner][accountId];
        uint256 totalBal = depositBal + earnedBal;
        if (totalBal == 0) return;

        uint256 fee = (totalBal * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 amountAfterFee = totalBal - fee;

        // Solvency guard
        uint256 contractBal = oooweeeToken.balanceOf(address(this));
        if (amountAfterFee + fee > contractBal) {
            amountAfterFee = contractBal > fee ? contractBal - fee : 0;
        }

        account.balance = 0;
        account.isActive = false;
        account.completedAt = uint32(block.timestamp);
        accountEarnedRewards[owner][accountId] = 0;

        // AUDIT FIX C-2: Clean subtraction
        _reduceTrackers(depositBal, totalBal);
        totalGoalsCompleted++;
        totalFeesCollected += fee;

        if (fee > 0) {
            oooweeeToken.transfer(feeCollector, fee);
        }
        require(oooweeeToken.transfer(owner, amountAfterFee), "TF");

        emit GoalCompleted(owner, accountId, account.goalName, amountAfterFee, fee);
    }

    /**
     * @notice Transfer tokens to recipient (Balance accounts)
     * @dev AUDIT FIX C-2: totalBal = balance + earnedRewards. Subtract deposits from
     *      totalDepositedBalance, totalBal from totalValueLocked. Zero out earnedRewards.
     */
    function _executeBalanceTransfer(address owner, uint256 accountId) internal {
        SavingsAccount storage account = userAccounts[owner][accountId];

        uint256 depositBal = account.balance;
        uint256 earnedBal = accountEarnedRewards[owner][accountId];
        uint256 totalBal = depositBal + earnedBal;

        uint256 fee = (totalBal * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 balanceAfterFee = totalBal - fee;

        // AUDIT FIX M-2 R3: Use TWAP-validated price (same source as withdrawal gate)
        uint256 transferAmount = account.isFiatTarget
            ? getFiatToTokensValidated(account.targetFiat, account.targetCurrency)
            : account.targetAmount;

        uint256 amountToRecipient = transferAmount;
        if (amountToRecipient > balanceAfterFee) {
            amountToRecipient = balanceAfterFee;
        }
        uint256 remainder = balanceAfterFee - amountToRecipient;

        // AUDIT FIX M-1 R2: Solvency guard — prioritize fee, then recipient, then remainder
        uint256 contractBal = oooweeeToken.balanceOf(address(this));
        if (fee + amountToRecipient + remainder > contractBal) {
            uint256 available = contractBal > fee ? contractBal - fee : 0;
            if (amountToRecipient > available) amountToRecipient = available;
            remainder = available > amountToRecipient ? available - amountToRecipient : 0;
        }

        account.balance = 0;
        account.isActive = false;
        account.completedAt = uint32(block.timestamp);
        accountEarnedRewards[owner][accountId] = 0;

        // AUDIT FIX C-2: Clean subtraction
        _reduceTrackers(depositBal, totalBal);
        totalFeesCollected += fee;
        totalGoalsCompleted++;

        if (fee > 0) {
            oooweeeToken.transfer(feeCollector, fee);
        }

        require(oooweeeToken.transfer(account.recipient, amountToRecipient), "TF");

        if (remainder > 0) {
            oooweeeToken.transfer(owner, remainder);
        }

        emit BalanceTransferred(owner, account.recipient, amountToRecipient, account.goalName);
    }

    /**
     * @notice Auto-process a matured account (called by automation or processMaturedAccounts)
     * @dev AUDIT FIX C-2: No _merge. Uses totalBal for condition checks.
     */
    function _autoProcess(address owner, uint256 accountId) internal {
        if (accountId >= userAccounts[owner].length) return;
        SavingsAccount storage account = userAccounts[owner][accountId];
        if (!account.isActive) return;

        _updateAccountRewards(owner, accountId);

        uint256 totalBal = account.balance + accountEarnedRewards[owner][accountId];

        if (account.accountType == AccountType.Time) {
            if (block.timestamp < account.unlockTime) return;
            _executeReturn(owner, accountId);
        } else if (account.accountType == AccountType.Growth) {
            if (account.isFiatTarget) {
                if (!_checkFiatTarget(totalBal, account.targetFiat, account.targetCurrency)) return;
            } else {
                if (totalBal < account.targetAmount) return;
            }
            _executeReturn(owner, accountId);
        } else if (account.accountType == AccountType.Balance) {
            if (account.isFiatTarget) {
                uint256 requiredFiat = account.targetFiat + (account.targetFiat / 100);
                if (!_checkFiatTarget(totalBal, requiredFiat, account.targetCurrency)) return;
            } else {
                uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
                if (totalBal < requiredBalance) return;
            }
            _executeBalanceTransfer(owner, accountId);
        }

        _removeActiveRef(owner, accountId);

        emit AutoUnlockProcessed(owner, accountId, totalBal);
    }

    /**
     * @notice Check if an account is matured using _fullBalance
     */
    function _isAccountMatured(address owner, uint256 accountId) internal view returns (bool) {
        if (accountId >= userAccounts[owner].length) return false;
        SavingsAccount memory account = userAccounts[owner][accountId];
        if (!account.isActive) return false;
        return _checkWithdraw(account, _fullBalance(owner, accountId));
    }

    // ============ Active Account Tracking ============

    function _addActiveRef(address owner, uint256 accountId) internal {
        if (activeAccountIndex[owner][accountId] != 0) return;
        activeAccountRefs.push(ActiveAccountRef(owner, accountId));
        activeAccountIndex[owner][accountId] = activeAccountRefs.length; // 1-indexed
    }

    function _removeActiveRef(address owner, uint256 accountId) internal {
        uint256 idx = activeAccountIndex[owner][accountId];
        if (idx == 0) return;

        uint256 lastIdx = activeAccountRefs.length - 1;
        if (idx - 1 != lastIdx) {
            ActiveAccountRef memory last = activeAccountRefs[lastIdx];
            activeAccountRefs[idx - 1] = last;
            activeAccountIndex[last.owner][last.accountId] = idx;
        }
        activeAccountRefs.pop();
        delete activeAccountIndex[owner][accountId];
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

    /**
     * @notice Get account details with full balance (deposits + rewards)
     */
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
            string memory goalName,
            uint256 createdAt
        )
    {
        require(accountId < userAccounts[owner].length, "E2");
        SavingsAccount memory account = userAccounts[owner][accountId];
        return (
            account.accountType,
            account.isActive,
            _fullBalance(owner, accountId),
            account.targetAmount,
            account.targetFiat,
            account.targetCurrency,
            account.unlockTime,
            account.recipient,
            account.goalName,
            account.createdAt
        );
    }

    /**
     * @notice Get fiat progress for a fiat-target account
     */
    function getAccountFiatProgressView(address owner, uint256 accountId)
        external view returns (
            uint256 currentValue,
            uint256 targetValue,
            uint256 percentComplete,
            bool withdrawable
        )
    {
        require(accountId < userAccounts[owner].length, "E2");
        SavingsAccount memory account = userAccounts[owner][accountId];

        if (!account.isFiatTarget) return (0, 0, 0, false);

        uint256 totalBalance = _fullBalance(owner, accountId);
        currentValue = getBalanceInFiatView(totalBalance, account.targetCurrency);
        targetValue = account.targetFiat;

        if (targetValue > 0) {
            percentComplete = (currentValue * 100) / targetValue;
            if (percentComplete > 100) percentComplete = 100;
        }

        withdrawable = false;
        if (account.accountType == AccountType.Growth) {
            withdrawable = currentValue >= account.targetFiat;
        } else if (account.accountType == AccountType.Balance) {
            uint256 requiredValue = account.targetFiat + (account.targetFiat / 100);
            withdrawable = currentValue >= requiredValue;
        }
    }

    /**
     * @notice Get detailed balance breakdown for an account
     */
    function getAccountBalanceBreakdown(address owner, uint256 accountId)
        external view returns (
            uint256 depositBalance,
            uint256 earnedRewards,
            uint256 pendingAmt,
            uint256 totalBalance
        )
    {
        require(accountId < userAccounts[owner].length, "E2");
        SavingsAccount memory account = userAccounts[owner][accountId];
        depositBalance = account.balance;
        earnedRewards = accountEarnedRewards[owner][accountId];

        if (account.isActive) {
            uint256 currentReward = rewardPerToken;
            if (pendingRewards > 0 && totalDepositedBalance > 0) {
                currentReward += (pendingRewards * 1e18) / totalDepositedBalance;
            }
            uint256 lu = lastRewardUpdate[owner][accountId];
            if (currentReward > lu) {
                pendingAmt = (account.balance * (currentReward - lu)) / 1e18;
            }
        }

        totalBalance = depositBalance + earnedRewards + pendingAmt;
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

    // ============ Group View Functions ============

    function getGroupDetails(uint256 groupId) external view returns (
        address creator,
        address destinationWallet,
        AccountType accountType,
        bool isActive,
        uint256 totalBalance,
        uint256 targetFiat,
        SavingsPriceOracle.Currency targetCurrency,
        uint32 unlockTime,
        string memory goalName,
        uint256 memberCount
    ) {
        GroupAccount storage group = groups[groupId];
        return (
            group.creator,
            group.destinationWallet,
            group.accountType,
            group.isActive,
            group.totalBalance,
            group.targetFiat,
            group.targetCurrency,
            group.unlockTime,
            group.goalName,
            group.members.length
        );
    }

    function getGroupMembers(uint256 groupId) external view returns (address[] memory) {
        return groups[groupId].members;
    }

    function getGroupContribution(uint256 groupId, address member) external view returns (uint256) {
        return groups[groupId].contributions[member];
    }

    function isGroupMember(uint256 groupId, address member) external view returns (bool) {
        return groups[groupId].isMember[member];
    }

    function isGroupInvited(uint256 groupId, address member) external view returns (bool) {
        return groups[groupId].isInvited[member];
    }

    function getActiveAccountCount() external view returns (uint256) {
        return activeAccountRefs.length;
    }

    // ============ UUPS Upgrade ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
