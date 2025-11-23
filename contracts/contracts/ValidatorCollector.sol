// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ValidatorCollector
 * @notice Receives validator rewards and principal on L1, routes appropriately
 * @dev This is the ONLY contract you deploy on L1 (besides OP Stack infrastructure)
 */
contract ValidatorCollector is Ownable, ReentrancyGuard {
    // ============ State Variables ============
    
    // L2 Bridge Configuration
    address public immutable L2_STANDARD_BRIDGE;
    address public l2RewardsDistributor;
    address public operationalTreasury;
    
    // Tracking
    uint256 public totalRewardsBridged;
    uint256 public totalPrincipalRecovered;
    uint256 public pendingValidatorExits;
    uint256 public lastBridgeTime;
    
    // Configuration
    uint256 public constant VALIDATOR_PRINCIPAL = 32 ether;
    uint256 public minBridgeAmount = 0.5 ether;
    uint256 public bridgeCooldown = 30 days; // Monthly by default
    uint32 public l2GasLimit = 200000;
    
    // Safety
    bool public bridgingEnabled = true;
    
    // ============ Events ============
    
    event RewardsBridged(uint256 amount, uint256 timestamp);
    event PrincipalRecovered(uint256 amount, address indexed to);
    event ValidatorExitExpected(uint256 totalPending);
    event ConfigurationUpdated(string param, address value);
    event BridgingToggled(bool enabled);
    event EmergencyWithdrawal(address to, uint256 amount);
    
    // ============ Errors ============
    
    error BridgingDisabled();
    error CooldownActive();
    error InsufficientBalance();
    error NoPrincipalAvailable();
    error TransferFailed();
    error InvalidAddress();
    
    // ============ Constructor ============
    
    /**
     * @param _l2StandardBridge The L2 bridge contract address
     * @param _l2RewardsDistributor Your L2 rewards contract address
     * @param _operationalTreasury Treasury for recovered principal
     */
    constructor(
        address _l2StandardBridge,
        address _l2RewardsDistributor,
        address _operationalTreasury
    ) {
        if (_l2StandardBridge == address(0) || 
            _l2RewardsDistributor == address(0) || 
            _operationalTreasury == address(0)) {
            revert InvalidAddress();
        }
        
        L2_STANDARD_BRIDGE = _l2StandardBridge;
        l2RewardsDistributor = _l2RewardsDistributor;
        operationalTreasury = _operationalTreasury;
    }
    
    // ============ Main Functions ============
    
    /**
     * @notice Receives ETH from validators
     * @dev Validators send rewards here automatically
     */
    receive() external payable {
        // Just receive and accumulate
        // Manual bridging for better control
    }
    
    /**
     * @notice Bridge accumulated rewards to L2
     * @dev Anyone can call this (they pay gas) - incentivized public good
     */
    function bridgeRewards() external nonReentrant {
        if (!bridgingEnabled) revert BridgingDisabled();
        if (block.timestamp < lastBridgeTime + bridgeCooldown) {
            revert CooldownActive();
        }
        
        // Calculate bridgeable amount (exclude reserved principal)
        uint256 reservedPrincipal = pendingValidatorExits * VALIDATOR_PRINCIPAL;
        uint256 totalBalance = address(this).balance;
        
        if (totalBalance <= reservedPrincipal) revert InsufficientBalance();
        
        uint256 bridgeableAmount = totalBalance - reservedPrincipal;
        if (bridgeableAmount < minBridgeAmount) revert InsufficientBalance();
        
        // Update state
        lastBridgeTime = block.timestamp;
        totalRewardsBridged += bridgeableAmount;
        
        // Bridge to L2 using OP Stack Standard Bridge
        (bool success, ) = L2_STANDARD_BRIDGE.call{value: bridgeableAmount}(
            abi.encodeWithSignature(
                "depositETHTo(address,uint32,bytes)",
                l2RewardsDistributor,
                l2GasLimit,
                ""
            )
        );
        
        if (!success) revert TransferFailed();
        
        emit RewardsBridged(bridgeableAmount, block.timestamp);
    }
    
    /**
     * @notice Recover validator principal after exit
     * @dev Call after validator exit completes (32 ETH returned)
     */
    function recoverValidatorPrincipal() external onlyOwner nonReentrant {
        if (pendingValidatorExits == 0) revert NoPrincipalAvailable();
        if (address(this).balance < VALIDATOR_PRINCIPAL) {
            revert InsufficientBalance();
        }
        
        pendingValidatorExits--;
        totalPrincipalRecovered += VALIDATOR_PRINCIPAL;
        
        (bool success, ) = operationalTreasury.call{value: VALIDATOR_PRINCIPAL}("");
        if (!success) revert TransferFailed();
        
        emit PrincipalRecovered(VALIDATOR_PRINCIPAL, operationalTreasury);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Mark that a validator exit is pending
     * @dev Call before initiating validator exit
     */
    function expectValidatorExit() external onlyOwner {
        pendingValidatorExits++;
        emit ValidatorExitExpected(pendingValidatorExits);
    }
    
    /**
     * @notice Update bridge cooldown period
     * @param _cooldown New cooldown in seconds (e.g., 2592000 for 30 days)
     */
    function setBridgeCooldown(uint256 _cooldown) external onlyOwner {
        bridgeCooldown = _cooldown;
    }
    
    /**
     * @notice Update minimum bridge amount
     * @param _minAmount Minimum ETH to bridge
     */
    function setMinBridgeAmount(uint256 _minAmount) external onlyOwner {
        minBridgeAmount = _minAmount;
    }
    
    /**
     * @notice Update L2 gas limit for bridge transactions
     * @param _gasLimit New gas limit
     */
    function setL2GasLimit(uint32 _gasLimit) external onlyOwner {
        l2GasLimit = _gasLimit;
    }
    
    /**
     * @notice Toggle bridging on/off
     */
    function toggleBridging() external onlyOwner {
        bridgingEnabled = !bridgingEnabled;
        emit BridgingToggled(bridgingEnabled);
    }
    
    /**
     * @notice Update L2 rewards distributor address
     * @param _l2RewardsDistributor New L2 address
     */
    function setL2RewardsDistributor(address _l2RewardsDistributor) external onlyOwner {
        if (_l2RewardsDistributor == address(0)) revert InvalidAddress();
        l2RewardsDistributor = _l2RewardsDistributor;
        emit ConfigurationUpdated("l2RewardsDistributor", _l2RewardsDistributor);
    }
    
    /**
     * @notice Update operational treasury
     * @param _treasury New treasury address
     */
    function setOperationalTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        operationalTreasury = _treasury;
        emit ConfigurationUpdated("operationalTreasury", _treasury);
    }
    
    /**
     * @notice Emergency withdrawal
     * @dev Last resort only
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = owner().call{value: balance}("");
        if (!success) revert TransferFailed();
        emit EmergencyWithdrawal(owner(), balance);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get bridgeable amount (excluding reserved principal)
     */
    function getBridgeableAmount() public view returns (uint256) {
        uint256 reservedPrincipal = pendingValidatorExits * VALIDATOR_PRINCIPAL;
        uint256 balance = address(this).balance;
        
        if (balance <= reservedPrincipal) return 0;
        return balance - reservedPrincipal;
    }
    
    /**
     * @notice Check if bridging is currently possible
     */
    function canBridge() public view returns (bool) {
        return bridgingEnabled && 
               block.timestamp >= lastBridgeTime + bridgeCooldown &&
               getBridgeableAmount() >= minBridgeAmount;
    }
    
    /**
     * @notice Get complete contract status
     */
    function getStatus() external view returns (
        uint256 balance,
        uint256 bridgeable,
        uint256 reserved,
        uint256 nextBridgeTime,
        bool bridgeAvailable
    ) {
        balance = address(this).balance;
        bridgeable = getBridgeableAmount();
        reserved = pendingValidatorExits * VALIDATOR_PRINCIPAL;
        nextBridgeTime = lastBridgeTime + bridgeCooldown;
        bridgeAvailable = canBridge();
    }
}