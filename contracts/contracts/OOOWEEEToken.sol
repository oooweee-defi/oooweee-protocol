// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OOOWEEEToken
 * @notice L1-native OOOWEEE token with stability-first distribution
 * @dev 100M fixed supply: 10M creator, 10M liquidity, 80M stability reserve
 *
 * Distribution rationale:
 * - 10M liquidity provides deeper initial Uniswap pool depth
 * - 80M stability reserve gives mechanism enough runway to suppress spikes
 *   for years while the validator yield engine builds
 * - Zero transfer taxes — fees are collected at savings contract level only
 */
contract OOOWEEEToken is ERC20, Ownable {
    uint256 public constant TOTAL_SUPPLY = 100_000_000 * 10**18;       // 100M
    uint256 public constant FOUNDER_ALLOCATION = 10_000_000 * 10**18;  // 10M  (10%)
    uint256 public constant LIQUIDITY_ALLOCATION = 10_000_000 * 10**18; // 10M  (10%)
    uint256 public constant STABILITY_RESERVE = 80_000_000 * 10**18;   // 80M  (80%)

    address public stabilityMechanism;
    address public founderWallet;
    address public operationsWallet;

    // No transfer taxes
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
        address _operationsWallet
    ) ERC20("OOOWEEE", "OOOWEEE") Ownable() {
        require(_founderWallet != address(0), "Invalid founder");
        require(_operationsWallet != address(0), "Invalid operations");

        founderWallet = _founderWallet;
        operationsWallet = _operationsWallet;

        // Set exemptions before minting
        isExemptFromLimits[msg.sender] = true;
        isExemptFromLimits[address(this)] = true;
        isExemptFromLimits[_founderWallet] = true;
        isExemptFromLimits[_operationsWallet] = true;

        // Mint allocations
        _mint(founderWallet, FOUNDER_ALLOCATION);        // 10M to founder
        _mint(operationsWallet, LIQUIDITY_ALLOCATION);   // 10M to operations (for Uniswap LP)
        _mint(address(this), STABILITY_RESERVE);         // 80M held for stability mechanism
    }

    /**
     * @notice Transfer stability reserve to the stability mechanism contract
     * @dev Can only be called once. The 80M tokens move from this contract
     *      to the stability mechanism where they'll be sold into price spikes.
     */
    function setStabilityMechanism(address _mechanism) external onlyOwner {
        require(stabilityMechanism == address(0), "Already set");
        require(_mechanism != address(0), "Invalid address");

        stabilityMechanism = _mechanism;
        isExemptFromLimits[_mechanism] = true;

        _transfer(address(this), stabilityMechanism, STABILITY_RESERVE);

        emit StabilityMechanismSet(_mechanism);
    }

    /**
     * @notice Update stability mechanism address for upgrades
     * @dev Tokens must be recovered from old mechanism separately via its
     *      emergencyRecoverTokens() function, then sent to new mechanism
     */
    function updateStabilityMechanism(address _newMechanism) external onlyOwner {
        require(_newMechanism != address(0), "Invalid address");

        address oldMechanism = stabilityMechanism;
        stabilityMechanism = _newMechanism;
        isExemptFromLimits[_newMechanism] = true;

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
        super._beforeTokenTransfer(from, to, amount);
    }
}
