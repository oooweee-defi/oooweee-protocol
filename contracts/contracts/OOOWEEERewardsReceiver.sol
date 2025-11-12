// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniswapV2Router02 {
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable;
    
    function WETH() external pure returns (address);
}

interface IOOOWEEESavings {
    function receiveRewards(uint256 amount) external;
}

contract OOOWEEERewardsReceiver is Ownable {
    address public immutable operationsWallet;
    address public immutable validatorsContract;
    address public immutable savingsContract;
    IUniswapV2Router02 public immutable uniswapRouter;
    IERC20 public immutable oooweeeToken;
    
    uint256 public constant OPERATIONS_PERCENT = 33;
    uint256 public constant USERS_PERCENT = 33;
    uint256 public constant REINVEST_PERCENT = 34;
    
    uint256 public totalRewardsReceived;
    uint256 public totalOperationsDistributed;
    uint256 public totalUsersDistributed;
    uint256 public totalReinvested;
    uint256 public lastDistribution;
    
    uint256 public constant MIN_DISTRIBUTION_AMOUNT = 0.1 ether;
    
    event RewardsReceived(uint256 amount, uint256 timestamp);
    event RewardsDistributed(
        uint256 toOperations,
        uint256 toUsers,
        uint256 toReinvest,
        uint256 timestamp
    );
    event TokensBoughtForUsers(uint256 ethSpent, uint256 tokensReceived);
    
    constructor(
        address _operationsWallet,
        address _validatorsContract,
        address _savingsContract,
        address _uniswapRouter,
        address _oooweeeToken
    ) Ownable(msg.sender) {
        require(_operationsWallet != address(0), "Invalid operations wallet");
        require(_validatorsContract != address(0), "Invalid validators contract");
        require(_savingsContract != address(0), "Invalid savings contract");
        require(_uniswapRouter != address(0), "Invalid router");
        require(_oooweeeToken != address(0), "Invalid token");
        
        operationsWallet = _operationsWallet;
        validatorsContract = _validatorsContract;
        savingsContract = _savingsContract;
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        oooweeeToken = IERC20(_oooweeeToken);
    }
    
    receive() external payable {
        totalRewardsReceived += msg.value;
        emit RewardsReceived(msg.value, block.timestamp);
        
        if (address(this).balance >= MIN_DISTRIBUTION_AMOUNT) {
            distributeRewards();
        }
    }
    
    function distributeRewards() public {
        uint256 balance = address(this).balance;
        require(balance >= MIN_DISTRIBUTION_AMOUNT, "Below minimum distribution amount");
        
        uint256 toOperations = (balance * OPERATIONS_PERCENT) / 100;
        uint256 toUsers = (balance * USERS_PERCENT) / 100;
        uint256 toReinvest = balance - toOperations - toUsers;
        
        totalOperationsDistributed += toOperations;
        totalUsersDistributed += toUsers;
        totalReinvested += toReinvest;
        lastDistribution = block.timestamp;
        
        (bool opsSuccess,) = payable(operationsWallet).call{value: toOperations}("");
        require(opsSuccess, "Operations transfer failed");
        
        (bool valSuccess,) = payable(validatorsContract).call{value: toReinvest}("");
        require(valSuccess, "Validators transfer failed");
        
        if (toUsers > 0) {
            _buyTokensAndDistributeToSavers(toUsers);
        }
        
        emit RewardsDistributed(toOperations, toUsers, toReinvest, block.timestamp);
    }
    
    function _buyTokensAndDistributeToSavers(uint256 ethAmount) internal {
        address[] memory path = new address[](2);
        path[0] = uniswapRouter.WETH();
        path[1] = address(oooweeeToken);
        
        uint256 tokensBefore = oooweeeToken.balanceOf(address(this));
        
        uniswapRouter.swapExactETHForTokensSupportingFeeOnTransferTokens{value: ethAmount}(
            0,
            path,
            address(this),
            block.timestamp + 300
        );
        
        uint256 tokensBought = oooweeeToken.balanceOf(address(this)) - tokensBefore;
        require(tokensBought > 0, "No tokens received from swap");
        
        emit TokensBoughtForUsers(ethAmount, tokensBought);
        
        oooweeeToken.approve(savingsContract, tokensBought);
        IOOOWEEESavings(savingsContract).receiveRewards(tokensBought);
    }
    
    function pendingRewards() external view returns (uint256) {
        return address(this).balance;
    }
    
    function canDistribute() external view returns (bool) {
        return address(this).balance >= MIN_DISTRIBUTION_AMOUNT;
    }
    
    function getStats() external view returns (
        uint256 received,
        uint256 operations,
        uint256 users,
        uint256 reinvested,
        uint256 pending
    ) {
        return (
            totalRewardsReceived,
            totalOperationsDistributed,
            totalUsersDistributed,
            totalReinvested,
            address(this).balance
        );
    }
    
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        
        (bool success,) = payable(owner()).call{value: balance}("");
        require(success, "Emergency withdraw failed");
    }
    
    function emergencyTokenWithdraw(address token) external onlyOwner {
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        tokenContract.transfer(owner(), balance);
    }
}