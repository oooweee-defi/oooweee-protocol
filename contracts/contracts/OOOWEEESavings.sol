// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OOOWEEE Savings - ABSOLUTE HARD LOCK with AUTO-TRANSFER
 * @notice Funds are LOCKED until conditions met, then AUTO-TRANSFER with 1% fee
 * @dev No emergency withdrawals. No manual withdrawals. Fully automated. OOOWEEE!
 */
contract OOOWEEESavings is ReentrancyGuard, Ownable {
    IERC20 public immutable oooweeeToken;
    
    enum AccountType { Time, Balance, Growth }
    
    struct SavingsAccount {
        AccountType accountType;
        address owner;
        uint256 balance;
        uint256 targetAmount;
        uint256 unlockTime;
        address recipient; // For Balance accounts only
        bool isActive;
        string goalName;
        uint256 createdAt;
        uint256 completedAt;
    }
    
    mapping(address => SavingsAccount[]) public userAccounts;
    
    uint256 public accountCreationFee = 100 * 10**18; // 100 OOOWEEE
    uint256 public withdrawalFeeRate = 100; // 1% = 100/10000
    uint256 public constant FEE_DIVISOR = 10000;
    uint256 public constant MAX_LOCK_DURATION = 1825 days; // 5 years max
    
    address public feeCollector;
    uint256 public totalValueLocked;
    uint256 public totalAccountsCreated;
    uint256 public totalGoalsCompleted;
    uint256 public totalFeesCollected;
    
    event AccountCreated(
        address indexed owner, 
        uint256 indexed accountId, 
        AccountType accountType, 
        string goalName,
        uint256 targetValue
    );
    
    event Deposited(
        address indexed owner, 
        uint256 indexed accountId, 
        uint256 amount,
        uint256 newBalance
    );
    
    event GoalCompleted(
        address indexed owner,
        uint256 indexed accountId,
        string goalName,
        uint256 amountTransferred,
        uint256 feeCollected
    );
    
    event BalanceTransferred(
        address indexed from,
        address indexed to,
        uint256 amount,
        string goalName
    );
    
    constructor(address _tokenAddress) Ownable(msg.sender) {
        oooweeeToken = IERC20(_tokenAddress);
        feeCollector = msg.sender;
    }
    
    /**
     * @notice Create a Time Account - AUTO-TRANSFERS on unlock date
     */
    function createTimeAccount(
        uint256 unlockTime, 
        string memory goalName
    ) external returns (uint256) {
        require(unlockTime > block.timestamp, "Unlock time must be in future");
        require(unlockTime <= block.timestamp + MAX_LOCK_DURATION, "Maximum lock is 5 years");
        
        // Charge creation fee
        oooweeeToken.transferFrom(msg.sender, feeCollector, accountCreationFee);
        totalFeesCollected += accountCreationFee;
        
        uint256 accountId = userAccounts[msg.sender].length;
        userAccounts[msg.sender].push(SavingsAccount({
            accountType: AccountType.Time,
            owner: msg.sender,
            balance: 0,
            targetAmount: 0,
            unlockTime: unlockTime,
            recipient: address(0),
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0
        }));
        
        totalAccountsCreated++;
        emit AccountCreated(msg.sender, accountId, AccountType.Time, goalName, unlockTime);
        return accountId;
    }
    
    /**
     * @notice Create a Balance Account - AUTO-TRANSFERS to recipient at 101% of target
     * @dev User must save 101% to ensure recipient gets full target amount after 1% fee
     */
    function createBalanceAccount(
        uint256 targetAmount,
        address recipient,
        string memory goalName
    ) external returns (uint256) {
        require(targetAmount > 0, "Target amount required");
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot send to yourself");
        
        // Charge creation fee
        oooweeeToken.transferFrom(msg.sender, feeCollector, accountCreationFee);
        totalFeesCollected += accountCreationFee;
        
        uint256 accountId = userAccounts[msg.sender].length;
        userAccounts[msg.sender].push(SavingsAccount({
            accountType: AccountType.Balance,
            owner: msg.sender,
            balance: 0,
            targetAmount: targetAmount,
            unlockTime: 0,
            recipient: recipient,
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0
        }));
        
        totalAccountsCreated++;
        emit AccountCreated(msg.sender, accountId, AccountType.Balance, goalName, targetAmount);
        return accountId;
    }
    
    /**
     * @notice Create a Growth Account - AUTO-TRANSFERS on target reached
     */
    function createGrowthAccount(
        uint256 targetAmount,
        string memory goalName
    ) external returns (uint256) {
        require(targetAmount > 0, "Target amount required");
        
        // Charge creation fee
        oooweeeToken.transferFrom(msg.sender, feeCollector, accountCreationFee);
        totalFeesCollected += accountCreationFee;
        
        uint256 accountId = userAccounts[msg.sender].length;
        userAccounts[msg.sender].push(SavingsAccount({
            accountType: AccountType.Growth,
            owner: msg.sender,
            balance: 0,
            targetAmount: targetAmount,
            unlockTime: 0,
            recipient: address(0),
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0
        }));
        
        totalAccountsCreated++;
        emit AccountCreated(msg.sender, accountId, AccountType.Growth, goalName, targetAmount);
        return accountId;
    }
    
    /**
     * @notice Deposit to account - May trigger auto-transfer if conditions met
     * @dev All deposits are FINAL until unlock conditions are met
     */
    function deposit(uint256 accountId, uint256 amount) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "Invalid account ID");
        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive, "Account is not active");
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer tokens from user to contract
        oooweeeToken.transferFrom(msg.sender, address(this), amount);
        account.balance += amount;
        totalValueLocked += amount;
        
        emit Deposited(msg.sender, accountId, amount, account.balance);
        
        // Check if auto-transfer should trigger
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
    }
    
    /**
     * @notice Check current unlock time for Time accounts
     * @dev Anyone can check to trigger auto-transfers for Time accounts
     */
    function checkTimeAccount(address owner, uint256 accountId) external nonReentrant {
        require(accountId < userAccounts[owner].length, "Invalid account ID");
        SavingsAccount storage account = userAccounts[owner][accountId];
        require(account.isActive, "Account is not active");
        require(account.accountType == AccountType.Time, "Not a Time account");
        
        _checkAndExecuteAutoTransfer(owner, accountId);
    }
    
    /**
     * @dev Check conditions and execute auto-transfer if met
     */
    function _checkAndExecuteAutoTransfer(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        if (!account.isActive) return;
        
        if (account.accountType == AccountType.Time) {
            // Time account: Check if unlock time reached
            if (block.timestamp >= account.unlockTime) {
                _executeAutoTransfer(owner, accountId);
            }
        } else if (account.accountType == AccountType.Growth) {
            // Growth account: Check if target reached
            if (account.balance >= account.targetAmount) {
                _executeAutoTransfer(owner, accountId);
            }
        } else if (account.accountType == AccountType.Balance) {
            // Balance account: Need 101% to cover fee
            uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
            if (account.balance >= requiredBalance) {
                _executeBalanceTransfer(owner, accountId);
            }
        }
    }
    
    /**
     * @dev Execute auto-transfer for Time/Growth accounts back to owner
     */
    function _executeAutoTransfer(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        uint256 balance = account.balance;
        if (balance == 0) return; // Nothing to transfer
        
        // Calculate 1% fee
        uint256 fee = (balance * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 amountAfterFee = balance - fee;
        
        // Update account state
        account.balance = 0;
        account.isActive = false;
        account.completedAt = block.timestamp;
        totalValueLocked -= balance;
        totalGoalsCompleted++;
        totalFeesCollected += fee;
        
        // Transfer fee to collector
        if (fee > 0) {
            oooweeeToken.transfer(feeCollector, fee);
        }
        
        // Transfer remaining to owner's general balance
        oooweeeToken.transfer(owner, amountAfterFee);
        
        emit GoalCompleted(owner, accountId, account.goalName, amountAfterFee, fee);
    }
    
    /**
     * @dev Execute auto-transfer for Balance accounts to recipient
     */
    function _executeBalanceTransfer(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        // Calculate amounts (they saved 101%, recipient gets 100%, we get 1%)
        uint256 fee = account.targetAmount / 100;
        uint256 amountToRecipient = account.targetAmount;
        
        // Update account state
        account.balance = 0;
        account.isActive = false;
        account.completedAt = block.timestamp;
        totalValueLocked -= (amountToRecipient + fee);
        totalGoalsCompleted++;
        totalFeesCollected += fee;
        
        // Transfer fee to collector
        oooweeeToken.transfer(feeCollector, fee);
        
        // Transfer target amount to recipient
        oooweeeToken.transfer(account.recipient, amountToRecipient);
        
        emit BalanceTransferred(owner, account.recipient, amountToRecipient, account.goalName);
        emit GoalCompleted(owner, accountId, account.goalName, amountToRecipient, fee);
    }
    
    /**
     * @notice View account details
     */
    function getAccountInfo(address user, uint256 accountId) external view returns (
        string memory accountTypeName,
        string memory goalName,
        uint256 balance,
        uint256 targetAmount,
        uint256 unlockTime,
        address recipient,
        bool isActive,
        uint256 progressPercent,
        string memory status
    ) {
        require(accountId < userAccounts[user].length, "Invalid account");
        SavingsAccount memory account = userAccounts[user][accountId];
        
        // Determine account type name
        if (account.accountType == AccountType.Time) {
            accountTypeName = "Time";
            if (block.timestamp >= account.unlockTime) {
                status = "Ready to transfer!";
                progressPercent = 100;
            } else {
                uint256 timeLeft = account.unlockTime - block.timestamp;
                uint256 daysLeft = timeLeft / 1 days;
                status = string(abi.encodePacked("Locked for ", uint2str(daysLeft), " more days"));
                uint256 totalTime = account.unlockTime - account.createdAt;
                uint256 timePassed = block.timestamp - account.createdAt;
                progressPercent = (timePassed * 100) / totalTime;
            }
        } else if (account.accountType == AccountType.Balance) {
            accountTypeName = "Balance";
            uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
            progressPercent = account.balance * 100 / requiredBalance;
            if (progressPercent > 100) progressPercent = 100;
            
            if (account.balance >= requiredBalance) {
                status = "Ready to send!";
            } else {
                uint256 needed = requiredBalance - account.balance;
                status = string(abi.encodePacked("Need ", uint2str(needed / 10**18), " more OOOWEEE (includes 1% fee)"));
            }
        } else {
            accountTypeName = "Growth";
            progressPercent = account.targetAmount > 0 ? account.balance * 100 / account.targetAmount : 0;
            if (progressPercent > 100) progressPercent = 100;
            
            if (account.balance >= account.targetAmount) {
                status = "Target reached! Ready to transfer!";
            } else {
                uint256 needed = account.targetAmount - account.balance;
                status = string(abi.encodePacked("Need ", uint2str(needed / 10**18), " more OOOWEEE"));
            }
        }
        
        return (
            accountTypeName,
            account.goalName,
            account.balance,
            account.targetAmount,
            account.unlockTime,
            account.recipient,
            account.isActive,
            progressPercent,
            status
        );
    }
    
    /**
     * @notice Get all accounts for a user
     */
    function getUserAccounts(address user) external view returns (uint256[] memory) {
        uint256 count = userAccounts[user].length;
        uint256[] memory accountIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            accountIds[i] = i;
        }
        return accountIds;
    }
    
    /**
     * @notice Get platform statistics
     */
    function getStats() external view returns (
        uint256 tvl,
        uint256 totalAccounts,
        uint256 completedGoals,
        uint256 feesCollected
    ) {
        return (
            totalValueLocked,
            totalAccountsCreated,
            totalGoalsCompleted,
            totalFeesCollected
        );
    }
    
    // Admin functions
    
    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Invalid address");
        feeCollector = _feeCollector;
    }
    
    function setFees(uint256 _creationFee, uint256 _withdrawalFeeRate) external onlyOwner {
        require(_withdrawalFeeRate <= 500, "Max 5% withdrawal fee");
        accountCreationFee = _creationFee;
        withdrawalFeeRate = _withdrawalFeeRate;
    }
    
    // Helper function
    function uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
}