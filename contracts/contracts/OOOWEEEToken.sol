// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OOOWEEEToken is ERC20, Ownable {
    uint256 public constant TOTAL_SUPPLY = 100_000_000 * 10**18;
    
    uint256 public buyTaxRate = 0;
    uint256 public sellTaxRate = 500;
    uint256 public constant TAX_DIVISOR = 10000;
    
    address public treasuryWallet;
    
    mapping(address => bool) public isLiquidityPair;
    mapping(address => bool) public isExemptFromTax;
    
    bool public tradingEnabled = false;
    
    constructor() ERC20("OOOWEEE", "OOOWEEE") Ownable(msg.sender) {
        _mint(msg.sender, TOTAL_SUPPLY);
        treasuryWallet = msg.sender;
        isExemptFromTax[msg.sender] = true;
        isExemptFromTax[address(this)] = true;
    }
    
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override {
        if (!tradingEnabled) {
            require(from == owner() || to == owner(), "Trading not enabled");
        }
        
        uint256 taxAmount = 0;
        
        if (!isExemptFromTax[from] && !isExemptFromTax[to]) {
            if (isLiquidityPair[to]) {
                taxAmount = (amount * sellTaxRate) / TAX_DIVISOR;
            }
        }
        
        if (taxAmount > 0) {
            super._update(from, treasuryWallet, taxAmount);
            super._update(from, to, amount - taxAmount);
        } else {
            super._update(from, to, amount);
        }
    }
    
    function enableTrading() external onlyOwner {
        tradingEnabled = true;
    }
    
    function setLiquidityPair(address pair, bool value) external onlyOwner {
        isLiquidityPair[pair] = value;
    }
    
    function setTaxExemption(address account, bool exempt) external onlyOwner {
        isExemptFromTax[account] = exempt;
    }
    
    function updateTaxRates(uint256 _buyTax, uint256 _sellTax) external onlyOwner {
        require(_buyTax <= 500, "Buy tax too high");
        require(_sellTax <= 1000, "Sell tax too high");
        buyTaxRate = _buyTax;
        sellTaxRate = _sellTax;
    }
    
    function setTreasuryWallet(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasuryWallet = _treasury;
    }
}