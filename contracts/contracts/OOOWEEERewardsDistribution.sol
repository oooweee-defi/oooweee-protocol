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
    
    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
    
    function WETH() external pure returns (address);
}

interface IOOOWEEESavings {
    function receiveRewards(uint256 amount) external;
}

contract OOOWEEERewardsDistributor is Ownable {
    address public immutable operationsWallet;
    address public immutable validatorFundContract; // Renamed for clarity
    address public immutable savingsContract;
    IUniswapV2Router02 public immutable uniswapRouter;
    IERC20 public immutable oooweeeToken;
    
    uint256 public constant OPERATIONS_PERCENT = 33;
    uint256 public constant USERS_PERCENT = 33;
    uint256 public constant REINVEST_PERCENT = 34;
    uint256 public constant SLIPPAGE_TOLERANCE = 300; // 3% slippage tolerance
    
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
    event TokensBoughtForUsers(uint256 ethSpent, uint256 tokensReceived, uint256 minExpected);
    event DistributionThresholdUpdated(uint256 newThreshold);
    
    constructor(
        address _operationsWallet,
        address _validatorFundContract,
        address _savingsContract,
        address _uniswapRouter,
        address _oooweeeToken
    ) Ownable(msg.sender) {
        require(_operationsWallet != address(0), "Invalid operations wallet");
        require(_validatorFundContract != address(0), "Invalid validator fund contract");
        require(_savingsContract != address(0), "Invalid savings contract");
        require(_uniswapRouter != address(0), "Invalid router");
        require(_oooweeeToken != address(0), "Invalid token");
        
        operationsWallet = _operationsWallet;
        validatorFundContract = _validatorFundContract;
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
        uint256 toReinvest = balance - toOperations - toUsers; // Ensures no dust remains
        
        totalOperationsDistributed += toOperations;
        totalUsersDistributed += toUsers;
        totalReinvested += toReinvest;
        lastDistribution = block.timestamp;
        
        // Send to operations wallet
        (bool opsSuccess,) = payable(operationsWallet).call{value: toOperations}("");
        require(opsSuccess, "Operations transfer failed");
        
        // Send to validator fund for reinvestment
        (bool valSuccess,) = payable(validatorFundContract).call{value: toReinvest}("");
        require(valSuccess, "Validator fund transfer failed");
        
        // Buy tokens and distribute to savers
        if (toUsers > 0) {
            _buyTokensAndDistributeToSavers(toUsers);
        }
        
        emit RewardsDistributed(toOperations, toUsers, toReinvest, block.timestamp);
    }
    
    function _buyTokensAndDistributeToSavers(uint256 ethAmount) internal {
        address[] memory path = new address[](2);
        path[0] = uniswapRouter.WETH();
        path[1] = address(oooweeeToken);
        
        // Calculate minimum tokens with slippage protection
        uint256[] memory amounts = uniswapRouter.getAmountsOut(ethAmount, path);
        uint256 expectedTokens = amounts[1];
        uint256 minTokensOut = (expectedTokens * (10000 - SLIPPAGE_TOLERANCE)) / 10000;
        
        uint256 tokensBefore = oooweeeToken.balanceOf(address(this));
        
        // Execute swap with slippage protection
        uniswapRouter.swapExactETHForTokensSupportingFeeOnTransferTokens{value: ethAmount}(
            minTokensOut, // Use calculated minimum instead of 0
            path,
            address(this),
            block.timestamp + 300
        );
        
        uint256 tokensBought = oooweeeToken.balanceOf(address(this)) - tokensBefore;
        require(tokensBought > 0, "No tokens received from swap");
        
        emit TokensBoughtForUsers(ethAmount, tokensBought, minTokensOut);
        
        // Approve and send tokens to savings contract
        oooweeeToken.approve(savingsContract, tokensBought);
        
        // Transfer tokens to savings contract
        require(
            oooweeeToken.transfer(savingsContract, tokensBought),
            "Token transfer to savings failed"
        );
        
        // Notify savings contract of the rewards
        IOOOWEEESavings(savingsContract).receiveRewards(tokensBought);
    }
    
    // View functions
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
    
    function calculateExpectedTokens(uint256 ethAmount) external view returns (
        uint256 expected,
        uint256 minimum
    ) {
        if (ethAmount == 0) return (0, 0);
        
        address[] memory path = new address[](2);
        path[0] = uniswapRouter.WETH();
        path[1] = address(oooweeeToken);
        
        try uniswapRouter.getAmountsOut(ethAmount, path) returns (uint256[] memory amounts) {
            expected = amounts[1];
            minimum = (expected * (10000 - SLIPPAGE_TOLERANCE)) / 10000;
        } catch {
            return (0, 0);
        }
    }
}