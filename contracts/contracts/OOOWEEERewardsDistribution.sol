// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

interface IOOOWEEESavings {
    function receiveRewards(uint256 amount) external;
}

interface ICrossDomainMessenger {
    function xDomainMessageSender() external view returns (address);
}

/**
 * @title OOOWEEERewardsDistribution
 * @notice Receives validator rewards from L1 and distributes to savers on L2
 * @dev Splits rewards: 33% to savers (as OOOWEEE), 33% to validators (as ETH), 34% to operations (as ETH)
 */
contract OOOWEEERewardsDistribution is Ownable, ReentrancyGuard {
    // L2 Bridge configuration
    address public constant L2_CROSS_DOMAIN_MESSENGER = 0x4200000000000000000000000000000000000007;
    address public l1ValidatorCollector; // The L1 address that sends rewards
    
    // Contracts
    IOOOWEEESavings public savingsContract;
    IERC20 public oooweeeToken;
    IUniswapV2Router02 public immutable uniswapRouter;
    address public validatorFund;
    address public operationsWallet;
    
    // Distribution percentages (basis points for precision)
    uint256 public constant SAVERS_SHARE = 3300;      // 33%
    uint256 public constant VALIDATORS_SHARE = 3300;  // 33%
    uint256 public constant OPERATIONS_SHARE = 3400;  // 34%
    uint256 public constant BASIS_POINTS = 10000;     // 100%
    
    // Tracking
    uint256 public totalRewardsReceived;
    uint256 public totalRewardsToSavers;
    uint256 public totalRewardsToValidators;
    uint256 public totalRewardsToOperations;
    uint256 public pendingRewards;
    
    // Distribution parameters
    uint256 public distributionThreshold = 0.01 ether;
    uint256 public lastDistribution;
    uint256 public constant SLIPPAGE_TOLERANCE = 300; // 3%
    
    // Events
    event RewardsReceived(uint256 amount, address from);
    event RewardsReceivedFromL1(uint256 amount);
    event RewardsDistributed(
        uint256 totalAmount,
        uint256 toSavers,
        uint256 toValidators,
        uint256 toOperations,
        uint256 oooweeeTokensBought,
        uint256 timestamp
    );
    event ContractsUpdated(address savings, address token, address validatorFund, address operations);
    event L1CollectorUpdated(address newCollector);
    event ThresholdUpdated(uint256 newThreshold);
    event EmergencyWithdrawal(address to, uint256 amount);
    
    // Errors
    error InvalidAddress();
    error InsufficientRewards();
    error TransferFailed();
    error UnauthorizedBridgeCall();
    error SwapFailed();
    
    constructor(
        address _savingsContract,
        address _oooweeeToken,
        address _uniswapRouter,
        address _validatorFund,
        address _operationsWallet,
        address _l1ValidatorCollector
    ) {
        if (_savingsContract == address(0) || 
            _oooweeeToken == address(0) || 
            _uniswapRouter == address(0) ||
            _validatorFund == address(0) ||
            _operationsWallet == address(0) ||
            _l1ValidatorCollector == address(0)) {
            revert InvalidAddress();
        }
        
        savingsContract = IOOOWEEESavings(_savingsContract);
        oooweeeToken = IERC20(_oooweeeToken);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        validatorFund = _validatorFund;
        operationsWallet = _operationsWallet;
        l1ValidatorCollector = _l1ValidatorCollector;
    }
    
    /**
     * @notice Receive ETH from L1 bridge
     * @dev Verifies sender is the L2 messenger and originated from ValidatorCollector
     */
    function receiveFromL1Bridge() external payable {
        // Verify the call is from the L2 messenger
        if (msg.sender != L2_CROSS_DOMAIN_MESSENGER) {
            revert UnauthorizedBridgeCall();
        }
        
        // Verify the L1 sender
        address l1Sender = ICrossDomainMessenger(L2_CROSS_DOMAIN_MESSENGER).xDomainMessageSender();
        if (l1Sender != l1ValidatorCollector) {
            revert UnauthorizedBridgeCall();
        }
        
        totalRewardsReceived += msg.value;
        pendingRewards += msg.value;
        
        emit RewardsReceivedFromL1(msg.value);
        
        // Auto-distribute if above threshold
        if (pendingRewards >= distributionThreshold) {
            _distributeRewards();
        }
    }
    
    /**
     * @notice Fallback receive for any direct ETH transfers (for testing/manual sends)
     */
    receive() external payable {
        totalRewardsReceived += msg.value;
        pendingRewards += msg.value;
        emit RewardsReceived(msg.value, msg.sender);
        
        // Auto-distribute if above threshold
        if (pendingRewards >= distributionThreshold) {
            _distributeRewards();
        }
    }
    
    /**
     * @notice Manually trigger reward distribution
     */
    function distributeRewards() external nonReentrant {
        if (pendingRewards == 0) revert InsufficientRewards();
        _distributeRewards();
    }
    
    /**
     * @notice Internal distribution logic - splits rewards three ways
     */
    function _distributeRewards() private {
        uint256 toDistribute = pendingRewards;
        pendingRewards = 0;
        
        // Calculate splits
        uint256 saversShare = (toDistribute * SAVERS_SHARE) / BASIS_POINTS;
        uint256 validatorsShare = (toDistribute * VALIDATORS_SHARE) / BASIS_POINTS;
        uint256 operationsShare = toDistribute - saversShare - validatorsShare; // Remainder to avoid rounding issues
        
        // 1. Convert savers' share to OOOWEEE tokens
        uint256 oooweeeTokensBought = 0;
        if (saversShare > 0) {
            oooweeeTokensBought = _swapETHForOOOWEEE(saversShare);
            
            if (oooweeeTokensBought > 0) {
                // Approve and transfer OOOWEEE tokens to savings contract
                oooweeeToken.approve(address(savingsContract), oooweeeTokensBought);
                
                try savingsContract.receiveRewards(oooweeeTokensBought) {
                    totalRewardsToSavers += saversShare;
                } catch {
                    // If savings contract fails, hold the tokens
                    oooweeeToken.approve(address(savingsContract), 0);
                }
            }
        }
        
        // 2. Send ETH to validator fund (33%)
        if (validatorsShare > 0 && validatorFund != address(0)) {
            (bool success,) = validatorFund.call{value: validatorsShare}("");
            if (success) {
                totalRewardsToValidators += validatorsShare;
            }
        }
        
        // 3. Send ETH to operations wallet (34%)
        if (operationsShare > 0 && operationsWallet != address(0)) {
            (bool success,) = operationsWallet.call{value: operationsShare}("");
            if (success) {
                totalRewardsToOperations += operationsShare;
            }
        }
        
        lastDistribution = block.timestamp;
        
        emit RewardsDistributed(
            toDistribute,
            saversShare,
            validatorsShare,
            operationsShare,
            oooweeeTokensBought,
            block.timestamp
        );
    }
    
    /**
     * @notice Swap ETH for OOOWEEE tokens
     * @param ethAmount Amount of ETH to swap
     * @return Amount of OOOWEEE tokens received
     */
    function _swapETHForOOOWEEE(uint256 ethAmount) private returns (uint256) {
        // Set up swap path
        address[] memory path = new address[](2);
        path[0] = uniswapRouter.WETH();
        path[1] = address(oooweeeToken);
        
        // Get expected output amount for slippage calculation
        try uniswapRouter.getAmountsOut(ethAmount, path) returns (uint256[] memory amounts) {
            uint256 expectedTokens = amounts[1];
            uint256 minTokensOut = (expectedTokens * (10000 - SLIPPAGE_TOLERANCE)) / 10000;
            
            // Execute swap
            try uniswapRouter.swapExactETHForTokens{value: ethAmount}(
                minTokensOut,
                path,
                address(this),
                block.timestamp + 300
            ) returns (uint256[] memory swapAmounts) {
                return swapAmounts[1]; // Return actual tokens received
            } catch {
                // Swap failed, return 0
                return 0;
            }
        } catch {
            // Quote failed, return 0
            return 0;
        }
    }
    
    /**
     * @notice Send ETH directly to validator fund (for any accumulated ETH)
     * @param amount Amount to send
     */
    function fundValidators(uint256 amount) external onlyOwner nonReentrant {
        if (amount > address(this).balance) revert InsufficientRewards();
        
        (bool success,) = validatorFund.call{value: amount}("");
        if (!success) revert TransferFailed();
        
        totalRewardsToValidators += amount;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update L1 validator collector address
     * @param _l1Collector New L1 collector address
     */
    function setL1ValidatorCollector(address _l1Collector) external onlyOwner {
        if (_l1Collector == address(0)) revert InvalidAddress();
        l1ValidatorCollector = _l1Collector;
        emit L1CollectorUpdated(_l1Collector);
    }
    
    /**
     * @notice Update contract addresses
     */
    function updateContracts(
        address _savingsContract,
        address _oooweeeToken,
        address _validatorFund,
        address _operationsWallet
    ) external onlyOwner {
        if (_savingsContract == address(0) || 
            _oooweeeToken == address(0) || 
            _validatorFund == address(0) ||
            _operationsWallet == address(0)) {
            revert InvalidAddress();
        }
        
        savingsContract = IOOOWEEESavings(_savingsContract);
        oooweeeToken = IERC20(_oooweeeToken);
        validatorFund = _validatorFund;
        operationsWallet = _operationsWallet;
        
        emit ContractsUpdated(_savingsContract, _oooweeeToken, _validatorFund, _operationsWallet);
    }
    
    /**
     * @notice Update distribution threshold
     */
    function setDistributionThreshold(uint256 _threshold) external onlyOwner {
        distributionThreshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }
    
    /**
     * @notice Emergency withdrawal
     * @dev Only for extreme circumstances
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success,) = owner().call{value: balance}("");
        if (!success) revert TransferFailed();
        emit EmergencyWithdrawal(owner(), balance);
    }
    
    /**
     * @notice Recover stuck tokens
     * @param token Token address to recover
     * @param amount Amount to recover
     */
    function recoverTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get current status
     */
    function getStatus() external view returns (
        uint256 _totalReceived,
        uint256 _toSavers,
        uint256 _toValidators,
        uint256 _toOperations,
        uint256 _pending,
        uint256 _lastDistribution,
        bool _canDistribute
    ) {
        return (
            totalRewardsReceived,
            totalRewardsToSavers,
            totalRewardsToValidators,
            totalRewardsToOperations,
            pendingRewards,
            lastDistribution,
            pendingRewards >= distributionThreshold
        );
    }
    
    /**
     * @notice Calculate how rewards would be split
     */
    function calculateSplit(uint256 amount) external pure returns (
        uint256 savers,
        uint256 validators,
        uint256 operations
    ) {
        savers = (amount * SAVERS_SHARE) / BASIS_POINTS;
        validators = (amount * VALIDATORS_SHARE) / BASIS_POINTS;
        operations = amount - savers - validators;
    }
}