// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

interface IOOOWEEESavings {
    function receiveRewards(uint256 amount) external;
}

/**
 * @title OOOWEEEValidatorFund
 * @notice L1-native fund that accumulates ETH, provisions validators, and splits rewards
 * @dev Replaces both the old ValidatorFund (L2) and ValidatorCollector (L1)
 *
 * ETH flows IN from two sources:
 * 1. Stability mechanism captures ETH from price spikes → sent here
 * 2. Donations from anyone → donate()
 *
 * When 32 ETH accumulates:
 * - Owner calls provisionValidator() to release 32 ETH to operations wallet
 * - Operations wallet manually sets up the validator node
 * - Validator withdrawal address is set to THIS contract
 *
 * When validator rewards arrive (ETH sent to this contract from consensus layer):
 * - They arrive as plain ETH transfers (no function call)
 * - receive() classifies them as validator rewards (pendingRewards)
 * - Owner calls distributeRewards() to split:
 *   33% → operations wallet (ETH)
 *   33% → stays in fund (accumulates toward more validators)
 *   34% → swapped to OOOWEEE tokens → sent to Savings contract for savers
 *
 * All flows are visible on Etherscan. No bridging. No cross-chain messaging.
 */
contract OOOWEEEValidatorFund is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {

    // ============ Contracts ============

    IERC20 public oooweeeToken;
    IUniswapV2Router02 public uniswapRouter;
    IOOOWEEESavings public savingsContract;

    // ============ Addresses ============

    address public operationsWallet;
    address public stabilityContract;

    // ============ Distribution (basis points) ============

    uint256 public constant OPERATIONS_SHARE = 3300;   // 33%
    uint256 public constant VALIDATORS_SHARE = 3300;   // 33% (stays in fund)
    uint256 public constant SAVERS_SHARE = 3400;       // 34% (swapped to OOOWEEE for savers)
    uint256 public constant BASIS_POINTS = 10000;

    // ============ Validator Tracking ============

    uint256 public constant VALIDATOR_STAKE = 32 ether;

    uint256 public validatorsProvisioned;
    uint256 public validatorsActive;

    // ============ Fund Tracking ============

    uint256 public totalETHReceived;         // All ETH ever received
    uint256 public totalETHFromStability;    // ETH from stability interventions
    uint256 public totalETHFromDonations;    // ETH from donations
    uint256 public totalETHFromRewards;      // ETH from validator rewards

    uint256 public totalETHToOperations;     // ETH sent to operations
    uint256 public totalETHToValidators;     // ETH used for validator provisioning
    uint256 public totalETHToSavers;         // ETH swapped to OOOWEEE for savers
    uint256 public totalOOOWEEEToSavers;     // OOOWEEE tokens sent to savings

    // ============ Reward Distribution ============

    uint256 public pendingRewards;           // Validator rewards waiting to be distributed
    uint256 public lastDistribution;
    uint256 public totalDistributions;

    uint256 public constant SLIPPAGE_TOLERANCE = 300; // 3%

    // ============ Failed Swap Tracking ============

    uint256 public failedSwapETH;            // ETH from failed swaps awaiting retry

    // ============ Donation Tracking ============

    uint256 public totalDonations;
    mapping(address => uint256) public donations;
    address[] public donors;

    // ============ Events ============

    event ETHReceivedFromStability(uint256 amount);
    event ETHReceivedFromRewards(uint256 amount);
    event DonationReceived(address indexed donor, uint256 amount);
    event ValidatorProvisioned(uint256 indexed validatorId, uint256 amount);
    event ValidatorConfirmed(uint256 indexed validatorId);
    event RewardsDistributed(
        uint256 totalAmount,
        uint256 toOperations,
        uint256 toValidatorFund,
        uint256 toSavers,
        uint256 oooweeeTokensBought,
        uint256 timestamp
    );
    event OperationsWalletUpdated(address indexed newWallet);
    event StabilityContractUpdated(address indexed newContract);
    event EmergencyWithdrawal(address indexed to, uint256 amount);
    event SwapFailed(uint256 ethAmount, uint256 timestamp);
    event SwapRetried(uint256 ethAmount, uint256 tokensReceived, uint256 timestamp);
    event RewardsReclassified(uint256 amount, string direction);

    // ============ Errors ============

    error InsufficientETH();
    error InvalidAddress();
    error TransferFailed();
    error NoRewardsToDistribute();
    error SwapFailedError();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _uniswapRouter,
        address _operationsWallet
    ) public initializer {
        require(_uniswapRouter != address(0), "Invalid router");
        require(_operationsWallet != address(0), "Invalid operations");

        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        operationsWallet = _operationsWallet;
    }

    // ============ Receive ETH ============

    /**
     * @notice Receive ETH — classifies by sender
     * @dev Stability contract is the only known sender that uses plain ETH transfers.
     *      Ethereum consensus-layer validator rewards also arrive as plain ETH transfers
     *      (no function call). Since donations use donate() explicitly, unknown senders
     *      are treated as validator rewards and added to pendingRewards for distribution.
     */
    receive() external payable {
        totalETHReceived += msg.value;

        if (msg.sender == stabilityContract) {
            // ETH from stability interventions — accumulates toward validator provisioning
            totalETHFromStability += msg.value;
            emit ETHReceivedFromStability(msg.value);
        } else {
            // Unknown sender — likely validator consensus-layer rewards.
            // Treat as validator rewards so they enter the 33/33/34 distribution.
            totalETHFromRewards += msg.value;
            pendingRewards += msg.value;
            emit ETHReceivedFromRewards(msg.value);
        }
    }

    /**
     * @notice Explicitly receive validator rewards (alternative to plain ETH transfer)
     * @dev Can be used by automated systems that can call a specific function.
     */
    function receiveValidatorRewards() external payable {
        require(msg.value > 0, "No ETH sent");

        totalETHReceived += msg.value;
        totalETHFromRewards += msg.value;
        pendingRewards += msg.value;

        emit ETHReceivedFromRewards(msg.value);
    }

    /**
     * @notice Accept donations toward validator fund
     */
    function donate() external payable nonReentrant {
        require(msg.value > 0, "No donation sent");

        if (donations[msg.sender] == 0) {
            donors.push(msg.sender);
        }

        donations[msg.sender] += msg.value;
        totalDonations += msg.value;
        totalETHFromDonations += msg.value;
        totalETHReceived += msg.value;

        emit DonationReceived(msg.sender, msg.value);
    }

    // ============ Validator Provisioning ============

    /**
     * @notice Release 32 ETH to operations wallet for validator setup
     * @dev Operations wallet uses this ETH to provision a new Ethereum validator.
     *      The validator's withdrawal address MUST be set to this contract
     *      so rewards flow back here for distribution.
     *
     *      Only callable when the fund has 32+ ETH available (excluding pendingRewards
     *      and failedSwapETH).
     */
    function provisionValidator() external onlyOwner nonReentrant {
        uint256 available = availableForValidators();
        if (available < VALIDATOR_STAKE) revert InsufficientETH();
        if (operationsWallet == address(0)) revert InvalidAddress();

        validatorsProvisioned++;
        totalETHToValidators += VALIDATOR_STAKE;

        (bool success,) = operationsWallet.call{value: VALIDATOR_STAKE}("");
        if (!success) revert TransferFailed();

        emit ValidatorProvisioned(validatorsProvisioned, VALIDATOR_STAKE);
    }

    /**
     * @notice Confirm a validator is now active on the beacon chain
     */
    function confirmValidatorActive() external onlyOwner {
        require(validatorsProvisioned > validatorsActive, "No pending validators");
        validatorsActive++;
        emit ValidatorConfirmed(validatorsActive);
    }

    // ============ Reward Distribution ============

    /**
     * @notice Distribute accumulated validator rewards three ways
     * @dev Call periodically (e.g. weekly) to split pendingRewards:
     *      33% → operations wallet (ETH, direct transfer)
     *      33% → stays in this contract (accumulates toward more validators)
     *      34% → swapped to OOOWEEE on Uniswap, sent to Savings contract
     *
     *      The validator share just stays in the contract balance naturally,
     *      contributing toward the next 32 ETH threshold.
     */
    function distributeRewards() external onlyOwner nonReentrant {
        if (pendingRewards == 0) revert NoRewardsToDistribute();

        uint256 toDistribute = pendingRewards;
        pendingRewards = 0;

        // Calculate splits
        uint256 operationsAmount = (toDistribute * OPERATIONS_SHARE) / BASIS_POINTS;
        uint256 validatorsAmount = (toDistribute * VALIDATORS_SHARE) / BASIS_POINTS;
        uint256 saversAmount = toDistribute - operationsAmount - validatorsAmount; // Remainder to savers

        // 1. Send 33% to operations (ETH)
        if (operationsAmount > 0) {
            (bool success,) = operationsWallet.call{value: operationsAmount}("");
            if (success) {
                totalETHToOperations += operationsAmount;
            }
            // If fails, ETH stays in contract (not lost)
        }

        // 2. Validators' 33% stays in this contract automatically
        //    (it's already here, just not sent anywhere)
        //    This accumulates toward the next 32 ETH validator stake

        // 3. Swap 34% to OOOWEEE and send to savings contract
        uint256 oooweeeTokensBought = 0;
        if (saversAmount > 0 && address(savingsContract) != address(0)) {
            oooweeeTokensBought = _swapETHForOOOWEEE(saversAmount);

            if (oooweeeTokensBought > 0) {
                oooweeeToken.approve(address(savingsContract), oooweeeTokensBought);

                try savingsContract.receiveRewards(oooweeeTokensBought) {
                    totalETHToSavers += saversAmount;
                    totalOOOWEEEToSavers += oooweeeTokensBought;
                } catch {
                    // If savings contract rejects, clear approval
                    // Tokens stay in this contract for manual recovery
                    oooweeeToken.approve(address(savingsContract), 0);
                }
            } else {
                // Swap failed — track the ETH for retry
                failedSwapETH += saversAmount;
                emit SwapFailed(saversAmount, block.timestamp);
            }
        }

        lastDistribution = block.timestamp;
        totalDistributions++;

        emit RewardsDistributed(
            toDistribute,
            operationsAmount,
            validatorsAmount,
            saversAmount,
            oooweeeTokensBought,
            block.timestamp
        );
    }

    /**
     * @notice Retry failed swaps for the savers' share
     * @dev Call when market conditions improve (liquidity restored, etc.)
     */
    function retryFailedSwaps() external onlyOwner nonReentrant {
        require(failedSwapETH > 0, "No failed swaps to retry");
        require(address(savingsContract) != address(0), "Savings contract not set");

        uint256 ethToSwap = failedSwapETH;
        failedSwapETH = 0;

        uint256 oooweeeTokensBought = _swapETHForOOOWEEE(ethToSwap);

        if (oooweeeTokensBought > 0) {
            oooweeeToken.approve(address(savingsContract), oooweeeTokensBought);

            try savingsContract.receiveRewards(oooweeeTokensBought) {
                totalETHToSavers += ethToSwap;
                totalOOOWEEEToSavers += oooweeeTokensBought;
                emit SwapRetried(ethToSwap, oooweeeTokensBought, block.timestamp);
            } catch {
                oooweeeToken.approve(address(savingsContract), 0);
                failedSwapETH += ethToSwap; // Re-track for next retry
            }
        } else {
            // Swap failed again — re-track
            failedSwapETH += ethToSwap;
            emit SwapFailed(ethToSwap, block.timestamp);
        }
    }

    /**
     * @notice Swap ETH for OOOWEEE tokens on Uniswap
     */
    function _swapETHForOOOWEEE(uint256 ethAmount) private returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = uniswapRouter.WETH();
        path[1] = address(oooweeeToken);

        try uniswapRouter.getAmountsOut(ethAmount, path) returns (uint256[] memory amounts) {
            uint256 minTokensOut = (amounts[1] * (10000 - SLIPPAGE_TOLERANCE)) / 10000;

            try uniswapRouter.swapExactETHForTokens{value: ethAmount}(
                minTokensOut,
                path,
                address(this),
                block.timestamp + 300
            ) returns (uint256[] memory swapAmounts) {
                return swapAmounts[1];
            } catch {
                return 0;
            }
        } catch {
            return 0;
        }
    }

    // ============ Admin Functions ============

    function setContracts(
        address _oooweeeToken,
        address _savingsContract
    ) external onlyOwner {
        require(_oooweeeToken != address(0), "Invalid token");
        require(_savingsContract != address(0), "Invalid savings");

        oooweeeToken = IERC20(_oooweeeToken);
        savingsContract = IOOOWEEESavings(_savingsContract);
    }

    function setOperationsWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid address");
        operationsWallet = _wallet;
        emit OperationsWalletUpdated(_wallet);
    }

    function setStabilityContract(address _stability) external onlyOwner {
        require(_stability != address(0), "Invalid address");
        stabilityContract = _stability;
        emit StabilityContractUpdated(_stability);
    }

    /**
     * @notice Reclassify ETH between stability income and pending rewards
     * @dev Use if ETH was misclassified (e.g., a manual ETH send that should
     *      count as stability income rather than validator rewards)
     * @param amount Amount to reclassify from pendingRewards to general fund
     */
    function reclassifyRewardsAsStability(uint256 amount) external onlyOwner {
        require(amount <= pendingRewards, "Amount exceeds pending rewards");
        pendingRewards -= amount;
        totalETHFromRewards -= amount;
        totalETHFromStability += amount;
        emit RewardsReclassified(amount, "rewards_to_stability");
    }

    /**
     * @notice Emergency withdrawal — last resort only
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success,) = owner().call{value: balance}("");
        if (!success) revert TransferFailed();
        pendingRewards = 0;
        failedSwapETH = 0;
        emit EmergencyWithdrawal(owner(), balance);
    }

    /**
     * @notice Recover stuck ERC20 tokens
     */
    function recoverTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }

    // ============ View Functions ============

    /**
     * @notice ETH available for validator provisioning (excludes pending rewards and failed swaps)
     */
    function availableForValidators() public view returns (uint256) {
        uint256 balance = address(this).balance;
        uint256 reserved = pendingRewards + failedSwapETH;
        if (balance <= reserved) return 0;
        return balance - reserved;
    }

    /**
     * @notice ETH needed until next validator can be provisioned
     */
    function ethUntilNextValidator() external view returns (uint256) {
        uint256 available = availableForValidators();
        if (available >= VALIDATOR_STAKE) return 0;
        return VALIDATOR_STAKE - available;
    }

    /**
     * @notice Progress toward next validator (for frontend)
     */
    function progressToNextValidator() external view returns (
        uint256 current,
        uint256 required,
        uint256 percentComplete
    ) {
        current = availableForValidators();
        required = VALIDATOR_STAKE;
        if (current >= required) {
            percentComplete = 100;
        } else {
            percentComplete = (current * 100) / required;
        }
    }

    /**
     * @notice Full fund status
     */
    function getStats() external view returns (
        uint256 _totalETHReceived,
        uint256 _fromStability,
        uint256 _fromDonations,
        uint256 _fromRewards,
        uint256 _pendingRewards,
        uint256 _availableForValidators,
        uint256 _validatorsProvisioned,
        uint256 _validatorsActive,
        uint256 _totalDistributions,
        uint256 _donorCount
    ) {
        return (
            totalETHReceived,
            totalETHFromStability,
            totalETHFromDonations,
            totalETHFromRewards,
            pendingRewards,
            availableForValidators(),
            validatorsProvisioned,
            validatorsActive,
            totalDistributions,
            donors.length
        );
    }

    /**
     * @notice Reward distribution totals
     */
    function getDistributionStats() external view returns (
        uint256 _toOperations,
        uint256 _toValidators,
        uint256 _toSaversETH,
        uint256 _toSaversOOOWEEE,
        uint256 _lastDistribution,
        uint256 _totalDistributions
    ) {
        return (
            totalETHToOperations,
            totalETHToValidators,
            totalETHToSavers,
            totalOOOWEEEToSavers,
            lastDistribution,
            totalDistributions
        );
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function renounceOwnership() public virtual override {
        revert("Renounce disabled");
    }

    uint256[50] private __gap;
}
