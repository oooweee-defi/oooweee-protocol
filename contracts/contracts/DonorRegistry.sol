// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title DonorRegistry
 * @notice Tracks donors and their contributions to the OOOWEEE protocol
 */
contract DonorRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    struct Donor {
        uint256 totalDonated;
        uint256 donationCount;
        uint256 firstDonation;
        uint256 lastDonation;
    }

    mapping(address => Donor) public donors;
    address[] public donorList;
    uint256 public totalDonors;
    uint256 public totalDonated;

    event DonationRecorded(address indexed donor, uint256 amount, uint256 timestamp);
    event DonorAdded(address indexed donor);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

    function recordDonation(address donor, uint256 amount) external onlyOwner {
        require(donor != address(0), "Invalid donor");
        require(amount > 0, "Amount must be > 0");

        if (donors[donor].firstDonation == 0) {
            donors[donor].firstDonation = block.timestamp;
            donorList.push(donor);
            totalDonors++;
            emit DonorAdded(donor);
        }

        donors[donor].totalDonated += amount;
        donors[donor].donationCount++;
        donors[donor].lastDonation = block.timestamp;
        totalDonated += amount;

        emit DonationRecorded(donor, amount, block.timestamp);
    }

    function getDonor(address donor) external view returns (
        uint256 _totalDonated,
        uint256 _donationCount,
        uint256 _firstDonation,
        uint256 _lastDonation
    ) {
        Donor memory d = donors[donor];
        return (d.totalDonated, d.donationCount, d.firstDonation, d.lastDonation);
    }

    function getDonorCount() external view returns (uint256) {
        return totalDonors;
    }

    function getDonorAtIndex(uint256 index) external view returns (address) {
        require(index < donorList.length, "Invalid index");
        return donorList[index];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function renounceOwnership() public virtual override {
        revert("Renounce disabled");
    }

    uint256[50] private __gap;
}
