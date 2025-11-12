// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract OOOWEEEValidators is Ownable {
    // Core addresses
    address public operator;
    address public stabilityContract;
    address public rewardsReceiver;
    
    // Validator tracking
    uint256 public pendingValidatorETH;
    uint256 public totalValidators;
    uint256 public totalETHWithdrawn;
    uint256 public totalDonationsReceived;
    uint256 public donorCount;
    
    // Track unique donors
    mapping(address => uint256) public donorContributions;
    
    // Constants
    uint256 public constant VALIDATOR_SIZE = 32 ether;
    uint256 public constant MIN_DONATION = 0.001 ether; // Minimum to prevent dust
    
    // Events
    event ValidatorFunded(uint256 indexed validatorId, uint256 amount, address operator);
    event ETHReceived(address indexed from, uint256 amount, string source);
    event DonationReceived(address indexed donor, uint256 amount, uint256 totalFromDonor);
    event StabilityContractSet(address indexed stability);
    event RewardsReceiverSet(address indexed receiver);
    event OperatorChanged(address indexed oldOperator, address indexed newOperator);
    
    constructor(address _operator) Ownable(msg.sender) {
        require(_operator != address(0), "Invalid operator");
        operator = _operator;
    }
    
    // Receive ETH from multiple sources
    receive() external payable {
        // Handle different sources
        if (msg.sender == stabilityContract) {
            pendingValidatorETH += msg.value;
            emit ETHReceived(msg.sender, msg.value, "Stability");
        } else if (msg.sender == rewardsReceiver) {
            pendingValidatorETH += msg.value;
            emit ETHReceived(msg.sender, msg.value, "Reinvestment");
        } else {
            // It's a donation - anyone can contribute!
            _handleDonation();
        }
    }
    
    // Public donation function with better UX
    function donate() external payable {
        _handleDonation();
    }
    
    // Internal donation handler
    function _handleDonation() internal {
        require(msg.value >= MIN_DONATION, "Donation too small");
        
        // Track if new donor
        if (donorContributions[msg.sender] == 0) {
            donorCount++;
        }
        
        // Update tracking
        donorContributions[msg.sender] += msg.value;
        totalDonationsReceived += msg.value;
        pendingValidatorETH += msg.value;
        
        emit DonationReceived(msg.sender, msg.value, donorContributions[msg.sender]);
        emit ETHReceived(msg.sender, msg.value, "Donation");
    }
    
    // Operator withdraws exactly 32 ETH to create a validator
    function withdrawForValidator() external {
        require(msg.sender == operator, "Only operator");
        require(pendingValidatorETH >= VALIDATOR_SIZE, "Insufficient ETH for validator");
        
        // Update state first (checks-effects-interactions)
        pendingValidatorETH -= VALIDATOR_SIZE;
        totalValidators++;
        totalETHWithdrawn += VALIDATOR_SIZE;
        
        // Transfer 32 ETH to operator
        (bool success,) = payable(operator).call{value: VALIDATOR_SIZE}("");
        require(success, "ETH transfer failed");
        
        emit ValidatorFunded(totalValidators, VALIDATOR_SIZE, operator);
    }
    
    // Admin functions
    function setStabilityContract(address _stability) external onlyOwner {
        require(_stability != address(0), "Invalid address");
        require(stabilityContract == address(0), "Already set");
        stabilityContract = _stability;
        
        emit StabilityContractSet(_stability);
    }
    
    function setRewardsReceiver(address _receiver) external onlyOwner {
        require(_receiver != address(0), "Invalid address");
        rewardsReceiver = _receiver;
        
        emit RewardsReceiverSet(_receiver);
    }
    
    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "Invalid address");
        address oldOperator = operator;
        operator = _operator;
        
        emit OperatorChanged(oldOperator, _operator);
    }
    
    // View functions for frontend
    function canWithdrawValidator() external view returns (bool) {
        return pendingValidatorETH >= VALIDATOR_SIZE;
    }
    
    function validatorsAvailable() external view returns (uint256) {
        return pendingValidatorETH / VALIDATOR_SIZE;
    }
    
    function ethUntilNextValidator() external view returns (uint256) {
        if (pendingValidatorETH >= VALIDATOR_SIZE) {
            // If we have enough for a validator, show progress to the next one
            uint256 excessETH = pendingValidatorETH % VALIDATOR_SIZE;
            return VALIDATOR_SIZE - excessETH;
        }
        return VALIDATOR_SIZE - pendingValidatorETH;
    }
    
    function progressToNextValidator() external view returns (uint256, uint256) {
        uint256 currentProgress = pendingValidatorETH % VALIDATOR_SIZE;
        return (currentProgress, VALIDATOR_SIZE);
    }
    
    function getStats() external view returns (
        uint256 activeValidators,
        uint256 pendingETH,
        uint256 totalWithdrawn,
        uint256 availableValidators,
        uint256 totalDonations,
        uint256 donors
    ) {
        return (
            totalValidators,
            pendingValidatorETH,
            totalETHWithdrawn,
            pendingValidatorETH / VALIDATOR_SIZE,
            totalDonationsReceived,
            donorCount
        );
    }
}