// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OOOWEEESavingsV2.sol";

/**
 * @title OOOWEEESavingsV3
 * @notice Fixes critical rewards inflation bug from V1/V2.
 *         V1 mixed earned rewards into account.balance and totalActiveBalance.
 *         V3 tracks rewards separately. Storage appended after V2 for UUPS.
 */
contract OOOWEEESavingsV3 is OOOWEEESavingsV2 {

    mapping(address => mapping(uint256 => uint256)) public accountEarnedRewards;
    uint256 public v3RewardPerToken;
    mapping(address => mapping(uint256 => uint256)) public v3LastRewardUpdate;
    uint256 public totalDepositedBalance;
    bool public v3Initialized;

    event V3Initialized(uint256 totalDepositedBalance);

    function initializeV3() external onlyOwner {
        require(!v3Initialized, "V3");
        v3Initialized = true;
        totalDepositedBalance = totalActiveBalance;
        emit V3Initialized(totalDepositedBalance);
    }

    function _v3Bal(address o, uint256 id) internal view returns (uint256) {
        return userAccounts[o][id].balance + _calculatePendingRewards(o, id);
    }

    function _v3CR() internal view returns (uint256 r) {
        r = v3RewardPerToken;
        if (pendingRewards > 0 && totalDepositedBalance > 0)
            r += (pendingRewards * 1e18) / totalDepositedBalance;
    }

    function receiveRewards(uint256 amount) external override {
        require(msg.sender == rewardsDistributor && amount > 0, "E");
        require(oooweeeToken.transferFrom(msg.sender, address(this), amount), "F");
        if (totalDepositedBalance > 0) {
            v3RewardPerToken += (amount * 1e18) / totalDepositedBalance;
            totalRewardsDistributed += amount;
        } else { pendingRewards += amount; }
        lastRewardDistribution = block.timestamp;
        emit RewardsReceived(amount, block.timestamp);
    }

    function _updateAccountRewards(address owner, uint256 accountId) internal override {
        SavingsAccount storage account = userAccounts[owner][accountId];
        if (!account.isActive) return;
        uint256 cr = _v3CR();
        if (pendingRewards > 0 && totalDepositedBalance > 0) {
            v3RewardPerToken = cr;
            totalRewardsDistributed += pendingRewards;
            pendingRewards = 0;
        }
        uint256 lu = v3LastRewardUpdate[owner][accountId];
        if (cr > lu) {
            uint256 earned = (account.balance * (cr - lu)) / 1e18;
            uint256 cb = oooweeeToken.balanceOf(address(this));
            if (totalDepositedBalance + earned > cb)
                earned = cb > totalDepositedBalance ? cb - totalDepositedBalance : 0;
            if (earned > 0) accountEarnedRewards[owner][accountId] += earned;
            v3LastRewardUpdate[owner][accountId] = cr;
        }
    }

    function _calculatePendingRewards(address owner, uint256 accountId)
        internal override view returns (uint256)
    {
        SavingsAccount memory a = userAccounts[owner][accountId];
        if (!a.isActive) return accountEarnedRewards[owner][accountId];
        uint256 cr = _v3CR();
        uint256 lu = v3LastRewardUpdate[owner][accountId];
        uint256 p = cr > lu ? (a.balance * (cr - lu)) / 1e18 : 0;
        return accountEarnedRewards[owner][accountId] + p;
    }

    function getAccountDetails(address owner, uint256 accountId)
        external override view returns (
            AccountType accountType, bool isActive, uint256 balance,
            uint256 targetAmount, uint256 targetFiat,
            SavingsPriceOracle.Currency targetCurrency,
            uint256 unlockTime, address recipient, string memory goalName)
    {
        require(accountId < userAccounts[owner].length, "E");
        SavingsAccount memory a = userAccounts[owner][accountId];
        return (a.accountType, a.isActive, _v3Bal(owner, accountId),
            a.targetAmount, a.targetFiat, a.targetCurrency, a.unlockTime, a.recipient, a.goalName);
    }

    function getAccountFiatProgressView(address owner, uint256 accountId)
        external override view returns (uint256 currentValue, uint256 targetValue, uint256 percentComplete, bool withdrawable)
    {
        require(accountId < userAccounts[owner].length, "E");
        SavingsAccount memory a = userAccounts[owner][accountId];
        if (!a.isFiatTarget) return (0, 0, 0, false);
        currentValue = getBalanceInFiatView(_v3Bal(owner, accountId), a.targetCurrency);
        targetValue = a.targetFiat;
        if (targetValue > 0) {
            percentComplete = (currentValue * 100) / targetValue;
            if (percentComplete > 100) percentComplete = 100;
        }
        if (a.accountType == AccountType.Growth) withdrawable = currentValue >= a.targetFiat;
        else if (a.accountType == AccountType.Balance) withdrawable = currentValue >= a.targetFiat + (a.targetFiat / 100);
    }

    function canWithdraw(address owner, uint256 accountId) external override view returns (bool) {
        if (accountId >= userAccounts[owner].length) return false;
        SavingsAccount memory a = userAccounts[owner][accountId];
        if (!a.isActive) return false;
        return _chk(a, _v3Bal(owner, accountId));
    }

    function _chk(SavingsAccount memory a, uint256 bal) internal view returns (bool) {
        if (a.accountType == AccountType.Time) return block.timestamp >= a.unlockTime;
        if (a.accountType == AccountType.Growth) {
            return a.isFiatTarget ? getBalanceInFiatView(bal, a.targetCurrency) >= a.targetFiat : bal >= a.targetAmount;
        }
        if (a.accountType == AccountType.Balance) {
            return a.isFiatTarget
                ? getBalanceInFiatView(bal, a.targetCurrency) >= a.targetFiat + (a.targetFiat / 100)
                : bal >= a.targetAmount + (a.targetAmount / 100);
        }
        return false;
    }

    function deposit(uint256 accountId, uint256 amount) external override nonReentrant {
        require(accountId < userAccounts[msg.sender].length && amount > 0, "E");
        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive, "E");
        _updateAccountRewards(msg.sender, accountId);
        uint256 fee = (amount * creationFeeRate) / FEE_DIVISOR;
        uint256 net = amount - fee;
        require(oooweeeToken.transferFrom(msg.sender, address(this), amount), "F");
        if (fee > 0) { oooweeeToken.transfer(feeCollector, fee); totalFeesCollected += fee; }
        account.balance += net;
        totalValueLocked += net;
        totalActiveBalance += net;
        totalDepositedBalance += net;
        emit Deposited(msg.sender, accountId, net, fee, account.balance);
    }

    function manualWithdraw(uint256 accountId) external override nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "E");
        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive && account.owner == msg.sender, "E");
        _updateAccountRewards(msg.sender, accountId);
        _merge(msg.sender, accountId);
        if (account.accountType == AccountType.Time) {
            require(block.timestamp >= account.unlockTime, "E");
            _executeReturn(msg.sender, accountId);
        } else if (account.accountType == AccountType.Growth) {
            if (account.isFiatTarget) require(_checkFiatTarget(account.balance, account.targetFiat, account.targetCurrency), "E");
            else require(account.balance >= account.targetAmount, "E");
            _executeReturn(msg.sender, accountId);
        } else if (account.accountType == AccountType.Balance) {
            if (account.isFiatTarget) require(_checkFiatTarget(account.balance, account.targetFiat + (account.targetFiat / 100), account.targetCurrency), "E");
            else require(account.balance >= account.targetAmount + (account.targetAmount / 100), "E");
            _executeBalanceTransfer(msg.sender, accountId);
        }
    }

    function _merge(address o, uint256 id) internal {
        uint256 e = accountEarnedRewards[o][id];
        if (e > 0) { userAccounts[o][id].balance += e; accountEarnedRewards[o][id] = 0; }
    }

    function _executeReturn(address owner, uint256 accountId) internal override {
        SavingsAccount storage account = userAccounts[owner][accountId];
        uint256 bal = account.balance;
        if (bal == 0) return;
        uint256 fee = (bal * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 net = bal - fee;
        uint256 cb = oooweeeToken.balanceOf(address(this));
        if (net + fee > cb) net = cb > fee ? cb - fee : 0;
        account.balance = 0; account.isActive = false; account.completedAt = uint32(block.timestamp);
        accountEarnedRewards[owner][accountId] = 0;
        _red(bal);
        totalGoalsCompleted++; totalFeesCollected += fee;
        if (fee > 0) oooweeeToken.transfer(feeCollector, fee);
        require(oooweeeToken.transfer(owner, net), "F");
        emit GoalCompleted(owner, accountId, account.goalName, net, fee);
    }

    function _executeBalanceTransfer(address owner, uint256 accountId) internal override {
        SavingsAccount storage account = userAccounts[owner][accountId];
        uint256 fb = account.balance;
        uint256 fee = (fb * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 af = fb - fee;
        uint256 ta = account.isFiatTarget ? getFiatToTokens(account.targetFiat, account.targetCurrency) : account.targetAmount;
        if (ta > af) ta = af;
        uint256 rem = af - ta;
        uint256 cb = oooweeeToken.balanceOf(address(this));
        if (fee + ta + rem > cb) { if (ta > cb) ta = cb; rem = 0; }
        account.balance = 0; account.isActive = false; account.completedAt = uint32(block.timestamp);
        accountEarnedRewards[owner][accountId] = 0;
        _red(fb);
        totalGoalsCompleted++; totalFeesCollected += fee;
        if (fee > 0) oooweeeToken.transfer(feeCollector, fee);
        if (ta > 0) require(oooweeeToken.transfer(account.recipient, ta), "F");
        if (rem > 0) oooweeeToken.transfer(owner, rem);
        emit GoalCompleted(owner, accountId, account.goalName, ta, fee);
    }

    function _red(uint256 a) internal {
        totalValueLocked = totalValueLocked >= a ? totalValueLocked - a : 0;
        totalActiveBalance = totalActiveBalance >= a ? totalActiveBalance - a : 0;
        totalDepositedBalance = totalDepositedBalance >= a ? totalDepositedBalance - a : 0;
    }

    function _autoProcess(address owner, uint256 accountId) internal override {
        if (accountId >= userAccounts[owner].length) return;
        SavingsAccount storage account = userAccounts[owner][accountId];
        if (!account.isActive) return;
        _updateAccountRewards(owner, accountId);
        _merge(owner, accountId);
        uint256 bal = account.balance;
        if (account.accountType == AccountType.Time) {
            if (block.timestamp < account.unlockTime) return;
            _executeReturn(owner, accountId);
        } else if (account.accountType == AccountType.Growth) {
            if (account.isFiatTarget) { if (!_checkFiatTarget(bal, account.targetFiat, account.targetCurrency)) return; }
            else { if (bal < account.targetAmount) return; }
            _executeReturn(owner, accountId);
        } else if (account.accountType == AccountType.Balance) {
            if (account.isFiatTarget) { if (!_checkFiatTarget(bal, account.targetFiat + (account.targetFiat / 100), account.targetCurrency)) return; }
            else { if (bal < account.targetAmount + (account.targetAmount / 100)) return; }
            _executeBalanceTransfer(owner, accountId);
        }
        _removeActiveRef(owner, accountId);
        emit AutoUnlockProcessed(owner, accountId, bal);
    }

    function _isAccountMatured(address owner, uint256 accountId) internal override view returns (bool) {
        if (accountId >= userAccounts[owner].length) return false;
        SavingsAccount memory a = userAccounts[owner][accountId];
        if (!a.isActive) return false;
        return _chk(a, _v3Bal(owner, accountId));
    }

    function getAccountBalanceBreakdown(address owner, uint256 accountId)
        external view returns (uint256 depositBalance, uint256 earnedRewards, uint256 pendingAmt, uint256 totalBalance)
    {
        require(accountId < userAccounts[owner].length, "E");
        SavingsAccount memory a = userAccounts[owner][accountId];
        depositBalance = a.balance;
        earnedRewards = accountEarnedRewards[owner][accountId];
        if (a.isActive) {
            uint256 cr = _v3CR();
            uint256 lu = v3LastRewardUpdate[owner][accountId];
            if (cr > lu) pendingAmt = (a.balance * (cr - lu)) / 1e18;
        }
        totalBalance = depositBalance + earnedRewards + pendingAmt;
    }
}
