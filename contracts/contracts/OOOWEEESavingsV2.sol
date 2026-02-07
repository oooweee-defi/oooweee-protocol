// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OOOWEEESavings.sol";

/**
 * @title OOOWEEESavingsV2
 * @notice Adds auto-unlock via Chainlink Automation and group savings accounts
 * @dev Upgrades from OOOWEEESavings (V1) — all existing storage is preserved.
 *      New storage variables are appended at the end to maintain layout compatibility.
 *
 * New features:
 * A) Auto-Unlock: Chainlink Automation calls processMaturedAccounts() to automatically
 *    transfer funds when conditions are met (time elapsed, fiat target reached).
 * B) Group Savings: Multiple wallets contribute to a shared goal with a preset
 *    destination wallet set by the creator.
 */
contract OOOWEEESavingsV2 is OOOWEEESavings {

    // ============ V2 Storage (appended after V1) ============

    // --- Auto-Unlock ---
    address public automationRegistry;
    uint256 public maxAutoProcessBatch;

    // Track all active accounts for auto-processing
    struct ActiveAccountRef {
        address owner;
        uint256 accountId;
    }
    ActiveAccountRef[] public activeAccountRefs;
    // Maps (owner, accountId) => index in activeAccountRefs (1-indexed, 0 = not present)
    mapping(address => mapping(uint256 => uint256)) public activeAccountIndex;

    // --- Group Savings ---
    struct GroupAccount {
        address creator;
        address destinationWallet;
        AccountType accountType;
        SavingsPriceOracle.Currency targetCurrency;
        bool isActive;
        uint32 createdAt;
        uint32 completedAt;
        uint32 unlockTime;           // For Time groups
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

    // ============ V2 Events ============

    event AutoUnlockProcessed(address indexed owner, uint256 indexed accountId, uint256 amount);
    event AutomationRegistryUpdated(address indexed registry);
    event GroupCreated(uint256 indexed groupId, address indexed creator, string goalName);
    event MemberInvited(uint256 indexed groupId, address indexed member);
    event InvitationAccepted(uint256 indexed groupId, address indexed member);
    event GroupDeposit(uint256 indexed groupId, address indexed depositor, uint256 amount);
    event GroupCompleted(uint256 indexed groupId, address indexed destination, uint256 amount);

    // ============ V2 Initializer ============

    function initializeV2(uint256 _maxAutoProcessBatch) external onlyOwner {
        require(maxAutoProcessBatch == 0, "V2 already initialized");
        maxAutoProcessBatch = _maxAutoProcessBatch > 0 ? _maxAutoProcessBatch : 20;
    }

    // ============ A) Auto-Unlock via Chainlink Automation ============

    function setAutomationRegistry(address _registry) external onlyOwner {
        automationRegistry = _registry;
        emit AutomationRegistryUpdated(_registry);
    }

    function setMaxAutoProcessBatch(uint256 _max) external onlyOwner {
        require(_max > 0 && _max <= 50, "Batch 1-50");
        maxAutoProcessBatch = _max;
    }

    /**
     * @notice Chainlink Automation: check if any accounts are ready for auto-unlock
     */
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
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
    function performUpkeep(bytes calldata performData) external {
        if (automationRegistry != address(0)) {
            require(msg.sender == automationRegistry, "Only automation");
        }

        (address[] memory owners, uint256[] memory ids, uint256 count) =
            abi.decode(performData, (address[], uint256[], uint256));

        for (uint256 i = 0; i < count; i++) {
            _autoProcess(owners[i], ids[i]);
        }
    }

    /**
     * @notice Anyone can trigger auto-unlock for matured accounts
     */
    function processMaturedAccounts() external {
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

    function _isAccountMatured(address owner, uint256 accountId) internal view returns (bool) {
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

    function _autoProcess(address owner, uint256 accountId) internal {
        if (accountId >= userAccounts[owner].length) return;
        SavingsAccount storage account = userAccounts[owner][accountId];
        if (!account.isActive) return;

        _updateAccountRewards(owner, accountId);

        uint256 bal = account.balance;

        if (account.accountType == AccountType.Time) {
            if (block.timestamp < account.unlockTime) return;
            _executeReturn(owner, accountId);
        } else if (account.accountType == AccountType.Growth) {
            if (account.isFiatTarget) {
                if (!_checkFiatTarget(account.balance, account.targetFiat, account.targetCurrency)) return;
            } else {
                if (account.balance < account.targetAmount) return;
            }
            _executeReturn(owner, accountId);
        } else if (account.accountType == AccountType.Balance) {
            if (account.isFiatTarget) {
                uint256 requiredFiat = account.targetFiat + (account.targetFiat / 100);
                if (!_checkFiatTarget(account.balance, requiredFiat, account.targetCurrency)) return;
            } else {
                uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
                if (account.balance < requiredBalance) return;
            }
            _executeBalanceTransfer(owner, accountId);
        }

        // Remove from active refs
        _removeActiveRef(owner, accountId);

        emit AutoUnlockProcessed(owner, accountId, bal);
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

    // ============ Override Account Creation to Track Active Refs ============

    function createTimeAccount(
        uint256 unlockTime,
        string memory goalName,
        uint256 initialDeposit,
        SavingsPriceOracle.Currency displayCurrency
    ) external override returns (uint256) {
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
        _addActiveRef(msg.sender, accountId);

        emit AccountCreated(msg.sender, accountId, AccountType.Time, goalName, initialDeposit, creationFee);
        return accountId;
    }

    function createGrowthAccount(
        uint256 targetFiatAmount,
        SavingsPriceOracle.Currency targetCurrency,
        string memory goalName,
        uint256 initialDeposit
    ) external override returns (uint256) {
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
        _addActiveRef(msg.sender, accountId);

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
    ) external override returns (uint256) {
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
        _addActiveRef(msg.sender, accountId);

        emit AccountCreated(msg.sender, accountId, AccountType.Balance, goalName, initialDeposit, creationFee);
        emit FiatAccountCreated(msg.sender, accountId, targetCurrency, targetFiatAmount);
        return accountId;
    }

    // ============ B) Group Savings ============

    function createGroupAccount(
        AccountType _accountType,
        address _destinationWallet,
        string memory _goalName,
        uint256 _targetFiat,
        SavingsPriceOracle.Currency _targetCurrency,
        uint32 _unlockTime,
        uint256 _initialDeposit
    ) external returns (uint256) {
        require(_destinationWallet != address(0), "Invalid destination");
        require(bytes(_goalName).length > 0, "Goal name required");
        require(_initialDeposit > 0, "Must deposit");

        if (_accountType == AccountType.Time) {
            require(_unlockTime > block.timestamp, "Unlock must be future");
        } else {
            require(_targetFiat > 0, "Target required");
        }

        uint256 creationFee = (_initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = _initialDeposit - creationFee;

        require(oooweeeToken.transferFrom(msg.sender, address(this), _initialDeposit), "Transfer failed");
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

        emit GroupCreated(groupId, msg.sender, _goalName);
        return groupId;
    }

    function inviteMember(uint256 groupId, address member) external {
        GroupAccount storage group = groups[groupId];
        require(group.creator == msg.sender, "Only creator");
        require(group.isActive, "Group not active");
        require(member != address(0), "Invalid member");
        require(!group.isMember[member], "Already member");
        require(!group.isInvited[member], "Already invited");

        group.isInvited[member] = true;
        emit MemberInvited(groupId, member);
    }

    function acceptInvitation(uint256 groupId) external {
        GroupAccount storage group = groups[groupId];
        require(group.isActive, "Group not active");
        require(group.isInvited[msg.sender], "Not invited");
        require(!group.isMember[msg.sender], "Already member");

        group.isMember[msg.sender] = true;
        group.isInvited[msg.sender] = false;
        group.members.push(msg.sender);

        emit InvitationAccepted(groupId, msg.sender);
    }

    function depositToGroup(uint256 groupId, uint256 amount) external {
        GroupAccount storage group = groups[groupId];
        require(group.isActive, "Group not active");
        require(group.isMember[msg.sender], "Not a member");
        require(amount > 0, "Amount must be > 0");

        require(oooweeeToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        group.totalBalance += amount;
        group.contributions[msg.sender] += amount;
        totalValueLocked += amount;
        totalActiveBalance += amount;

        emit GroupDeposit(groupId, msg.sender, amount);
    }

    function processGroupAccount(uint256 groupId) external {
        GroupAccount storage group = groups[groupId];
        require(group.isActive, "Group not active");

        bool canProcess = false;

        if (group.accountType == AccountType.Time) {
            canProcess = block.timestamp >= group.unlockTime;
        } else {
            uint256 currentValue = getBalanceInFiat(group.totalBalance, group.targetCurrency);
            if (group.accountType == AccountType.Balance) {
                uint256 requiredFiat = group.targetFiat + (group.targetFiat / 100);
                canProcess = currentValue >= requiredFiat;
            } else {
                canProcess = currentValue >= group.targetFiat;
            }
        }

        require(canProcess, "Conditions not met");

        uint256 bal = group.totalBalance;
        uint256 fee = (bal * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 amountAfterFee = bal - fee;

        group.totalBalance = 0;
        group.isActive = false;
        group.completedAt = uint32(block.timestamp);

        totalValueLocked -= bal;
        totalActiveBalance -= bal;
        totalGoalsCompleted++;
        totalFeesCollected += fee;

        if (fee > 0) {
            oooweeeToken.transfer(feeCollector, fee);
        }

        require(oooweeeToken.transfer(group.destinationWallet, amountAfterFee), "Transfer failed");

        emit GroupCompleted(groupId, group.destinationWallet, amountAfterFee);
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
}
