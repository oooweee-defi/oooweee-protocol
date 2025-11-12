// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract OOOWEEESavings is ReentrancyGuard, Ownable {
    IERC20 public immutable oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    
    enum AccountType { Time, Balance, Growth }
    
    struct SavingsAccount {
        AccountType accountType;
        address owner;
        uint256 balance;          // OOOWEEE balance (includes rewards)
        uint256 targetAmount;     // Target in OOOWEEE
        uint256 unlockTime;
        address recipient;        // For Balance accounts only
        bool isActive;
        string goalName;
        uint256 createdAt;
        uint256 completedAt;
    }
    
    mapping(address => SavingsAccount[]) public userAccounts;
    
    // Reward tracking
    mapping(address => mapping(uint256 => uint256)) public accountRewardSnapshot;
    uint256 public totalActiveBalance;
    uint256 public rewardPerTokenStored;
    
    // Fee settings
    uint256 public creationFeeRate = 100; // 1% = 100/10000 of initial deposit
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
    
    constructor(
        address _tokenAddress,
        address _uniswapRouter
    ) Ownable(msg.sender) {
        oooweeeToken = IERC20(_tokenAddress);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        feeCollector = msg.sender;
    }
    
    // ============ Admin Functions ============
    
    function setValidatorContract(address _validator) external onlyOwner {
        validatorContract = _validator;
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
    
    // ============ Account Creation with Initial Deposit ============
    
    function createTimeAccount(
        uint256 unlockTime, 
        string memory goalName,
        uint256 initialDeposit
    ) external returns (uint256) {
        require(unlockTime > block.timestamp, "Unlock time must be in future");
        require(unlockTime <= block.timestamp + MAX_LOCK_DURATION, "Maximum lock is 100 years");
        require(initialDeposit > 0, "Must have initial deposit");
        
        // Calculate creation fee (1% of initial deposit)
        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;
        
        // Transfer total amount from user
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit),
            "Transfer failed"
        );
        
        // Send fee to collector
        oooweeeToken.transfer(feeCollector, creationFee);
        totalFeesCollected += creationFee;
        
        // Create account with initial balance
        uint256 accountId = userAccounts[msg.sender].length;
        userAccounts[msg.sender].push(SavingsAccount({
            accountType: AccountType.Time,
            owner: msg.sender,
            balance: depositAfterFee,
            targetAmount: 0,
            unlockTime: unlockTime,
            recipient: address(0),
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0
        }));
        
        // Update totals
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Time, goalName, initialDeposit, creationFee);
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
        
        // Calculate creation fee (1% of initial deposit)
        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;
        
        // Transfer total amount from user
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit),
            "Transfer failed"
        );
        
        // Send fee to collector
        oooweeeToken.transfer(feeCollector, creationFee);
        totalFeesCollected += creationFee;
        
        // Create account with initial balance
        uint256 accountId = userAccounts[msg.sender].length;
        userAccounts[msg.sender].push(SavingsAccount({
            accountType: AccountType.Balance,
            owner: msg.sender,
            balance: depositAfterFee,
            targetAmount: targetAmount,
            unlockTime: 0,
            recipient: recipient,
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0
        }));
        
        // Update totals
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Balance, goalName, initialDeposit, creationFee);
        
        // Check if already complete
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
        
        return accountId;
    }
    
    function createGrowthAccount(
        uint256 targetAmount,
        string memory goalName,
        uint256 initialDeposit
    ) external returns (uint256) {
        require(targetAmount > 0, "Target amount required");
        require(initialDeposit > 0, "Must have initial deposit");
        
        // Calculate creation fee (1% of initial deposit)
        uint256 creationFee = (initialDeposit * creationFeeRate) / FEE_DIVISOR;
        uint256 depositAfterFee = initialDeposit - creationFee;
        
        // Transfer total amount from user
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), initialDeposit),
            "Transfer failed"
        );
        
        // Send fee to collector
        oooweeeToken.transfer(feeCollector, creationFee);
        totalFeesCollected += creationFee;
        
        // Create account with initial balance
        uint256 accountId = userAccounts[msg.sender].length;
        userAccounts[msg.sender].push(SavingsAccount({
            accountType: AccountType.Growth,
            owner: msg.sender,
            balance: depositAfterFee,
            targetAmount: targetAmount,
            unlockTime: 0,
            recipient: address(0),
            isActive: true,
            goalName: goalName,
            createdAt: block.timestamp,
            completedAt: 0
        }));
        
        // Update totals
        totalValueLocked += depositAfterFee;
        totalActiveBalance += depositAfterFee;
        totalAccountsCreated++;
        
        emit AccountCreated(msg.sender, accountId, AccountType.Growth, goalName, initialDeposit, creationFee);
        
        // Check if already complete
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
        
        return accountId;
    }
    
    // ============ Additional Deposits (no fee) ============
    
    function deposit(uint256 accountId, uint256 amount) external nonReentrant {
        require(accountId < userAccounts[msg.sender].length, "Invalid account ID");
        require(amount > 0, "Amount must be greater than 0");
        
        SavingsAccount storage account = userAccounts[msg.sender][accountId];
        require(account.isActive, "Account is not active");
        
        // Update any pending rewards first
        _updateAccountRewards(msg.sender, accountId);
        
        // Transfer OOOWEEE tokens from user to contract
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        // Add to account balance (no fee on additional deposits)
        account.balance += amount;
        totalValueLocked += amount;
        totalActiveBalance += amount;
        
        emit Deposited(msg.sender, accountId, amount, account.balance);
        
        // Check if this triggers auto-unlock
        _checkAndExecuteAutoTransfer(msg.sender, accountId);
    }
    
    // ============ Rewards Distribution ============
    
    // Receive rewards from validator contract
    function receiveRewards(uint256 amount) external {
        require(msg.sender == validatorContract, "Only validator contract");
        
        // Transfer tokens from validator contract
        require(
            oooweeeToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        // Update global reward per token if there are active accounts
        if (totalActiveBalance > 0) {
            rewardPerTokenStored += (amount * 1e18) / totalActiveBalance;
            totalRewardsDistributed += amount;
        }
        
        emit RewardsReceived(amount, block.timestamp);
    }
    
    // Update rewards for a specific account
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
    
    // Claim rewards for all active accounts
    function claimAllRewards() external nonReentrant {
        uint256 totalClaimed = 0;
        
        for (uint256 i = 0; i < userAccounts[msg.sender].length; i++) {
            SavingsAccount storage account = userAccounts[msg.sender][i];
            
            if (account.isActive) {
                uint256 balanceBefore = account.balance;
                _updateAccountRewards(msg.sender, i);
                uint256 claimed = account.balance - balanceBefore;
                totalClaimed += claimed;
                
                // Check if this triggers auto-unlock
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
    
    function _checkAndExecuteAutoTransfer(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        if (!account.isActive) return;
        
        if (account.accountType == AccountType.Time) {
            if (block.timestamp >= account.unlockTime) {
                _executeAutoTransfer(owner, accountId);
            }
        } else if (account.accountType == AccountType.Growth) {
            if (account.balance >= account.targetAmount) {
                _executeAutoTransfer(owner, accountId);
            }
        } else if (account.accountType == AccountType.Balance) {
            uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
            if (account.balance >= requiredBalance) {
                _executeBalanceTransfer(owner, accountId);
            }
        }
    }
    
    function _executeAutoTransfer(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        // Final reward update
        _updateAccountRewards(owner, accountId);
        
        uint256 balance = account.balance;
        if (balance == 0) return;
        
        // Calculate 1% withdrawal fee
        uint256 fee = (balance * withdrawalFeeRate) / FEE_DIVISOR;
        uint256 amountAfterFee = balance - fee;
        
        // Update state FIRST (prevent reentrancy)
        account.balance = 0;
        account.isActive = false;
        account.completedAt = block.timestamp;
        totalValueLocked -= balance;
        totalActiveBalance -= balance;
        totalGoalsCompleted++;
        totalFeesCollected += fee;
        
        // Fee stays as OOOWEEE
        if (fee > 0) {
            oooweeeToken.transfer(feeCollector, fee);
        }
        
        // SWAP remaining OOOWEEE to ETH for user
        uint256 ethReceived = _swapTokensForETH(amountAfterFee);
        
        // Send ETH to user
        (bool success, ) = owner.call{value: ethReceived}("");
        require(success, "ETH transfer failed");
        
        emit GoalCompleted(owner, accountId, account.goalName, ethReceived, fee);
    }
    
    function _executeBalanceTransfer(address owner, uint256 accountId) private {
        SavingsAccount storage account = userAccounts[owner][accountId];
        
        // Final reward update
        _updateAccountRewards(owner, accountId);
        
        // Calculate amounts (user saved 101% to cover fee)
        uint256 fee = account.targetAmount / 100;
        uint256 amountToRecipient = account.targetAmount;
        
        // Update state FIRST
        account.balance = 0;
        account.isActive = false;
        account.completedAt = block.timestamp;
        totalValueLocked -= (amountToRecipient + fee);
        totalActiveBalance -= (amountToRecipient + fee);
        totalGoalsCompleted++;
        totalFeesCollected += fee;
        
        // Fee stays as OOOWEEE
        oooweeeToken.transfer(feeCollector, fee);
        
        // SWAP tokens to ETH for recipient
        uint256 ethForRecipient = _swapTokensForETH(amountToRecipient);
        
        // Send ETH to recipient
        (bool success, ) = account.recipient.call{value: ethForRecipient}("");
        require(success, "ETH transfer failed");
        
        emit BalanceTransferred(owner, account.recipient, ethForRecipient, account.goalName);
        emit GoalCompleted(owner, accountId, account.goalName, ethForRecipient, fee);
    }
    
    // ============ Swap Function ============
    
    function _swapTokensForETH(uint256 tokenAmount) internal returns (uint256) {
        if (tokenAmount == 0) return 0;
        
        // Approve router
        oooweeeToken.approve(address(uniswapRouter), tokenAmount);
        
        // Set up swap path
        address[] memory path = new address[](2);
        path[0] = address(oooweeeToken);
        path[1] = uniswapRouter.WETH();
        
        // Get ETH balance before
        uint256 ethBalanceBefore = address(this).balance;
        
        // Execute swap
        uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0, // Accept any amount (consider adding slippage protection in production)
            path,
            address(this),
            block.timestamp + 300
        );
        
        // Calculate ETH received
        return address(this).balance - ethBalanceBefore;
    }
    
    // ============ View Functions ============
    
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
        
        // Determine account type and progress
        if (account.accountType == AccountType.Time) {
            accountTypeName = "Time";
            if (block.timestamp >= account.unlockTime) {
                progressPercent = 100;
            } else {
                uint256 totalTime = account.unlockTime - account.createdAt;
                uint256 timePassed = block.timestamp - account.createdAt;
                progressPercent = (timePassed * 100) / totalTime;
            }
        } else if (account.accountType == AccountType.Balance) {
            accountTypeName = "Balance";
            uint256 requiredBalance = account.targetAmount + (account.targetAmount / 100);
            uint256 effectiveBalance = account.balance + pendingRewards;
            progressPercent = effectiveBalance * 100 / requiredBalance;
            if (progressPercent > 100) progressPercent = 100;
        } else {
            accountTypeName = "Growth";
            uint256 effectiveBalance = account.balance + pendingRewards;
            progressPercent = account.targetAmount > 0 ? effectiveBalance * 100 / account.targetAmount : 0;
            if (progressPercent > 100) progressPercent = 100;
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
    
    // IMPORTANT: Contract needs to receive ETH from swaps
    receive() external payable {}
}