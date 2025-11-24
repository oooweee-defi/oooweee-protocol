// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OOOWEEEToken is ERC20, Ownable {
    uint256 public constant TOTAL_SUPPLY = 100_000_000 * 10**18;
    uint256 public constant FOUNDER_ALLOCATION = 10_000_000 * 10**18;
    uint256 public constant OPERATIONS_ALLOCATION = 1_000_000 * 10**18;  // For initial liquidity & operations
    uint256 public constant STABILITY_RESERVE = 89_000_000 * 10**18;
    
    address public stabilityMechanism;
    address public founderWallet;
    address public operationsWallet;  // Renamed from liquidityWallet
    
    // NO TAXES - Essential for circular economy
    uint256 public constant buyTaxRate = 0;
    uint256 public constant sellTaxRate = 0;
    
    mapping(address => bool) public isLiquidityPair;
    mapping(address => bool) public isExemptFromLimits;
    bool public tradingEnabled = false;
    
    event StabilityMechanismSet(address indexed mechanism);
    event StabilityMechanismUpdated(address indexed oldMechanism, address indexed newMechanism);
    event TradingEnabled();
    event LiquidityPairSet(address indexed pair, bool value);
    event ExemptionSet(address indexed account, bool exempt);
    
    constructor(
        address _founderWallet,
        address _operationsWallet  // Changed parameter name
    ) ERC20("OOOWEEE", "OOOWEEE") Ownable() {
        founderWallet = _founderWallet;
        operationsWallet = _operationsWallet;  // Changed from liquidityWallet
        
        // SET EXEMPTIONS FIRST (before minting!)
        isExemptFromLimits[msg.sender] = true;
        isExemptFromLimits[address(this)] = true;
        isExemptFromLimits[_founderWallet] = true;
        isExemptFromLimits[_operationsWallet] = true;
        
        // MINT ALLOCATIONS
        _mint(founderWallet, FOUNDER_ALLOCATION);         // 10M to founder
        _mint(operationsWallet, OPERATIONS_ALLOCATION);   // 1M to operations (for liquidity + expenses)
        _mint(address(this), STABILITY_RESERVE);          // 89M held for stability mechanism
    }
    
    function setStabilityMechanism(address _mechanism) external onlyOwner {
        require(stabilityMechanism == address(0), "Already set");
        require(_mechanism != address(0), "Invalid address");
        stabilityMechanism = _mechanism;
        isExemptFromLimits[_mechanism] = true;
        
        // Transfer stability reserve to mechanism
        _transfer(address(this), stabilityMechanism, STABILITY_RESERVE);
        
        emit StabilityMechanismSet(_mechanism);
    }
    
    // NEW: Allow updating stability mechanism for recovery/fixes
    function updateStabilityMechanism(address _newMechanism) external onlyOwner {
        require(_newMechanism != address(0), "Invalid address");
        
        address oldMechanism = stabilityMechanism;
        stabilityMechanism = _newMechanism;
        
        // Update exemptions
        isExemptFromLimits[_newMechanism] = true;
        // Optionally remove exemption from old mechanism
        // isExemptFromLimits[oldMechanism] = false;
        
        // Note: Tokens remain in old contract, must be recovered separately
        emit StabilityMechanismUpdated(oldMechanism, _newMechanism);
    }
    
    function enableTrading() external onlyOwner {
        require(!tradingEnabled, "Already enabled");
        tradingEnabled = true;
        emit TradingEnabled();
    }
    
    function setLiquidityPair(address pair, bool value) external onlyOwner {
        isLiquidityPair[pair] = value;
        emit LiquidityPairSet(pair, value);
    }
    
    function setExemption(address account, bool exempt) external onlyOwner {
        isExemptFromLimits[account] = exempt;
        emit ExemptionSet(account, exempt);
    }
    
    // Override ERC20 hook to check trading status (but NO taxes)
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        if (!tradingEnabled) {
            require(
                isExemptFromLimits[from] || isExemptFromLimits[to],
                "Trading not enabled"
            );
        }

        // NO TAX LOGIC - Just allow transfer
        super._beforeTokenTransfer(from, to, amount);
    }
}
