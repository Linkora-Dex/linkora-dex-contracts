// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract AccessControlContract is AccessControl {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    
    bool public emergencyStop = false;
    uint256 public constant TIMELOCK_DELAY = 0; // Set to 0 for testing, 24 hours for production
    uint256 public requiredSignatures = 2;

    mapping(bytes32 => uint256) public proposalTimestamps;
    mapping(bytes32 => mapping(address => bool)) public hasSignedProposal;
    mapping(bytes32 => uint256) public signatureCount;

    event EmergencyPause(address indexed admin, uint256 timestamp);
    event EmergencyUnpause(address indexed admin, uint256 timestamp);
    event ProposalCreated(bytes32 indexed proposalHash, uint256 executeTime);
    event ProposalSigned(bytes32 indexed proposalHash, address indexed signer, uint256 totalSignatures);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier whenNotPaused() {
        require(!emergencyStop, "System paused");
        _;
    }

    modifier requiresTimelock(bytes32 proposalHash) {
        require(
            proposalTimestamps[proposalHash] != 0 &&
            block.timestamp >= proposalTimestamps[proposalHash] + TIMELOCK_DELAY,
            "Timelock not satisfied"
        );
        delete proposalTimestamps[proposalHash];
        _;
    }

    modifier requiresMultiSig(bytes32 proposalHash) {
        require(signatureCount[proposalHash] >= requiredSignatures, "Insufficient signatures");
        _;
    }

    function emergencyPause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyStop = true;
        emit EmergencyPause(msg.sender, block.timestamp);
    }

    function emergencyUnpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyStop = false;
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }

    function proposeChange(bytes32 proposalHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        proposalTimestamps[proposalHash] = block.timestamp;
        emit ProposalCreated(proposalHash, block.timestamp + TIMELOCK_DELAY);
    }

    function signProposal(bytes32 proposalHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!hasSignedProposal[proposalHash][msg.sender], "Already signed");
        require(proposalTimestamps[proposalHash] != 0, "Proposal not found");

        hasSignedProposal[proposalHash][msg.sender] = true;
        signatureCount[proposalHash]++;

        emit ProposalSigned(proposalHash, msg.sender, signatureCount[proposalHash]);
    }

    function setRequiredSignatures(uint256 _requiredSignatures) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_requiredSignatures > 0, "Invalid signature count");
        requiredSignatures = _requiredSignatures;
    }
}