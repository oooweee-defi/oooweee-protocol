// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IL2StandardBridge {
    function bridgeETHTo(address _to, uint32 _minGasLimit, bytes memory _extraData) external payable;
}

/**
 * @title OOOWEEEValidatorFund
 * @notice Accumulates ETH from stability mechanism to create validators
 * @dev Deployed on L2, bridges ETH to L1 for validator creation
 */
contract OOOWEEEValidatorFund is Ownable, ReentrancyGuard {
    // Bridge configuration
    address public constant L2_BRIDGE = 0x4200000000000000000000000000000000000010;
    address public operatorL1Address; // L1 address for validator operations
    
    // Fund tracking
    uint256 public totalETHReceived;
    uint256 public pendingETH;
    uint256 public totalETHBridged;
    
    // Validator tracking
    uint256 public validatorsToCreate;
    uint256 public validatorsCreated;
    uint256 public totalValidatorRewards;
    
    // Donation tracking
    uint256 public totalDonations;
    mapping(address => uint256) public donations;
    address[] public donors;
    
    // Access control
    address public stabilityContract;
    address public rewardsContract;
    
    // Constants
    uint256 public constant VALIDATOR_STAKE = 32 ether;
    
    // Events
    event ETHReceived(address indexed from, uint256 amount);
    event ETHBridgedForValidator(uint256 amount, address indexed to);
    event ValidatorCreated(uint256 indexed validatorId);
    event DonationReceived(address indexed donor, uint256 amount);
    event StabilityContractUpdated(address indexed newContract);
    event RewardsContractUpdated(address indexed newContract);
    event OperatorAddressUpdated(address indexed newOperator);
    event EmergencyWithdrawal(address indexed to, uint256 amount);
    
    // Errors
    error OnlyStability();
    error OnlyRewards();
    error InsufficientETH();
    error InvalidAddress();
    error TransferFailed();
    
    constructor(address _stabilityContract, address _rewardsContract) {
        stabilityContract = _stabilityContract;
        rewardsContract = _rewardsContract;
    }
    
    // Modifiers
    modifier onlyStability() {
        if (msg.sender != stabilityContract) revert OnlyStability();
        _;
    }
    
    modifier onlyRewards() {
        if (msg.sender != rewardsContract) revert OnlyRewards();
        _;
    }
    
    // Main functions
    
    /**
     * @notice Receive ETH from stability mechanism
     */
    receive() external payable {
        totalETHReceived += msg.value;
        pendingETH += msg.value;
        emit ETHReceived(msg.sender, msg.value);
    }
    
    /**
     * @notice Receive ETH from stability contract
     */
    function receiveFromStability() external payable onlyStability {
        totalETHReceived += msg.value;
        pendingETH += msg.value;
        emit ETHReceived(msg.sender, msg.value);
    }
    
    /**
     * @notice Bridge 32 ETH to L1 for validator creation
     * @dev Sends directly to operator's L1 address
     */
    function bridgeForValidator() external onlyOwner nonReentrant {
        if (pendingETH < VALIDATOR_STAKE) revert InsufficientETH();
        if (operatorL1Address == address(0)) revert InvalidAddress();
        
        // Update state before external call
        pendingETH -= VALIDATOR_STAKE;
        totalETHBridged += VALIDATOR_STAKE;
        validatorsToCreate++;
        
        // Bridge to operator's L1 address
        IL2StandardBridge(L2_BRIDGE).bridgeETHTo{value: VALIDATOR_STAKE}(
            operatorL1Address,
            200000,  // L1 gas limit
            ""       // No extra data
        );
        
        emit ETHBridgedForValidator(VALIDATOR_STAKE, operatorL1Address);
    }
    
    /**
     * @notice Accept donations
     */
    function donate() external payable nonReentrant {
        require(msg.value > 0, "No donation sent");
        
        if (donations[msg.sender] == 0) {
            donors.push(msg.sender);
        }
        
        donations[msg.sender] += msg.value;
        totalDonations += msg.value;
        pendingETH += msg.value;
        totalETHReceived += msg.value;
        
        emit DonationReceived(msg.sender, msg.value);
    }
    
    /**
     * @notice Track when validator is created
     */
    function confirmValidatorCreated() external onlyOwner {
        require(validatorsToCreate > 0, "No validators pending");
        validatorsToCreate--;
        validatorsCreated++;
        emit ValidatorCreated(validatorsCreated);
    }
    
    /**
     * @notice Track rewards received from validators
     */
    function recordValidatorRewards(uint256 amount) external onlyRewards {
        totalValidatorRewards += amount;
    }
    
    // Admin functions
    
    /**
     * @notice Set operator's L1 address for receiving bridged ETH
     */
    function setOperatorL1Address(address _operator) external onlyOwner {
        if (_operator == address(0)) revert InvalidAddress();
        operatorL1Address = _operator;
        emit OperatorAddressUpdated(_operator);
    }
    
    /**
     * @notice Update stability contract address
     */
    function setStabilityContract(address _stability) external onlyOwner {
        if (_stability == address(0)) revert InvalidAddress();
        stabilityContract = _stability;
        emit StabilityContractUpdated(_stability);
    }
    
    /**
     * @notice Update rewards contract address
     */
    function setRewardsContract(address _rewards) external onlyOwner {
        if (_rewards == address(0)) revert InvalidAddress();
        rewardsContract = _rewards;
        emit RewardsContractUpdated(_rewards);
    }
    
    /**
     * @notice Emergency withdrawal function
     * @dev Only for extreme circumstances
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success,) = owner().call{value: balance}("");
        if (!success) revert TransferFailed();
        emit EmergencyWithdrawal(owner(), balance);
    }
    
    // View functions
    
    /**
     * @notice Get current stats
     */
    function getStats() external view returns (
        uint256 _validatorsCreated,
        uint256 _pendingETH,
        uint256 _validatorsToCreate,
        uint256 _totalETHReceived,
        uint256 _totalDonations,
        uint256 _donorCount,
        uint256 _totalETHBridged
    ) {
        return (
            validatorsCreated,
            pendingETH,
            validatorsToCreate,
            totalETHReceived,
            totalDonations,
            donors.length,
            totalETHBridged
        );
    }
    
    /**
     * @notice Check ETH until next validator
     */
    function ethUntilNextValidator() external view returns (uint256) {
        if (pendingETH >= VALIDATOR_STAKE) return 0;
        return VALIDATOR_STAKE - pendingETH;
    }
    
    /**
     * @notice Get progress to next validator
     */
    function progressToNextValidator() external view returns (uint256 current, uint256 required) {
        return (pendingETH, VALIDATOR_STAKE);
    }
}