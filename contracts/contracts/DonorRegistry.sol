// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DonorRegistry
 * @notice Stores donor metadata (name, message, location) on-chain.
 * @dev Companion to OOOWEEEValidatorFund — after donating ETH to the fund,
 *      the frontend calls registerDonation() here to permanently record
 *      the donor's name, message and location.
 *
 *      Costs ~50-80k gas (~$0.02). Metadata is immutable once written
 *      for a given donation (keyed by address + donation count).
 */
contract DonorRegistry is Ownable {

    struct DonorInfo {
        string name;
        string message;
        string location;
        uint256 timestamp;
    }

    // address → latest donor info (updated on each donation)
    mapping(address => DonorInfo) public donorInfo;

    // address → full donation history
    mapping(address => DonorInfo[]) public donorHistory;

    // All donor addresses (for iteration)
    address[] public allDonors;
    mapping(address => bool) public isRegistered;

    uint256 public totalRegistrations;

    event DonorRegistered(
        address indexed donor,
        string name,
        string message,
        string location,
        uint256 timestamp
    );

    constructor() Ownable() {}

    /**
     * @notice Register donor metadata after making a donation
     * @param name Display name (max 50 chars)
     * @param message Donor message (max 180 chars)
     * @param location Optional location (max 50 chars)
     */
    function registerDonation(
        string calldata name,
        string calldata message,
        string calldata location
    ) external {
        require(bytes(name).length <= 50, "Name too long");
        require(bytes(message).length <= 180, "Message too long");
        require(bytes(location).length <= 50, "Location too long");

        DonorInfo memory info = DonorInfo({
            name: bytes(name).length > 0 ? name : "Anonymous",
            message: message,
            location: location,
            timestamp: block.timestamp
        });

        donorInfo[msg.sender] = info;
        donorHistory[msg.sender].push(info);

        if (!isRegistered[msg.sender]) {
            allDonors.push(msg.sender);
            isRegistered[msg.sender] = true;
        }

        totalRegistrations++;

        emit DonorRegistered(msg.sender, info.name, message, location, block.timestamp);
    }

    /**
     * @notice Get donor info for a specific address
     */
    function getDonorInfo(address donor) external view returns (
        string memory name,
        string memory message,
        string memory location,
        uint256 timestamp
    ) {
        DonorInfo memory info = donorInfo[donor];
        return (info.name, info.message, info.location, info.timestamp);
    }

    /**
     * @notice Get total number of registered donors
     */
    function getDonorCount() external view returns (uint256) {
        return allDonors.length;
    }

    /**
     * @notice Get donor address by index (for iteration)
     */
    function getDonorAt(uint256 index) external view returns (address) {
        require(index < allDonors.length, "Index out of bounds");
        return allDonors[index];
    }

    /**
     * @notice Get donation history count for a donor
     */
    function getDonationCount(address donor) external view returns (uint256) {
        return donorHistory[donor].length;
    }
}
