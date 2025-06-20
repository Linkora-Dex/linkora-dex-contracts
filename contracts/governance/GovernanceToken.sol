// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract GovernanceToken is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint256 public constant MAX_SUPPLY = 10000000 * 10**18;
    uint256 public constant MAX_DISCOUNT = 1000;
    uint256 public constant LIQUIDATION_THRESHOLD = 80;

    uint256 public proposalThreshold;
    uint256 public votingPeriod;
    uint256 public executionDelay;
    uint256 public quorum;

    mapping(address => uint256) public stakingBalance;
    mapping(address => uint256) public stakingTimestamp;
    mapping(address => uint256) public pendingRewards;
    mapping(address => uint256) public lastRewardClaim;

    uint256 public totalStaked;
    uint256 public rewardRate;
    uint256 public rewardPerTokenStored;
    uint256 public constant SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

    mapping(address => uint256) public accumulatedFees;
    mapping(address => mapping(address => uint256)) public userFeesClaimed;
    uint256 public totalFeesDistributed;

    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        bytes data;
        address target;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 startTime;
        uint256 endTime;
        uint256 executionTime;
        bool executed;
        bool cancelled;
        mapping(address => bool) hasVoted;
        mapping(address => uint256) votes;
    }

    mapping(uint256 => Proposal) public proposals;
    uint256 public nextProposalId;

    struct TokenDistribution {
        uint256 users;
        uint256 team;
        uint256 liquidity;
        uint256 reserve;
        uint256 partners;
    }

    TokenDistribution public distribution;
    mapping(bytes32 => uint256) public allocatedTokens;
    mapping(bytes32 => uint256) public claimedTokens;

    event Staked(address indexed user, uint256 amount, uint256 timestamp);
    event Unstaked(address indexed user, uint256 amount, uint256 timestamp);
    event RewardClaimed(address indexed user, uint256 reward, uint256 timestamp);
    event FeesDistributed(address indexed token, uint256 amount, uint256 timestamp);
    event FeesClaimed(address indexed user, address indexed token, uint256 amount);

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string description,
        uint256 startTime,
        uint256 endTime
    );
    event Voted(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 votes,
        uint256 timestamp
    );
    event ProposalExecuted(uint256 indexed proposalId, uint256 timestamp);
    event ProposalCancelled(uint256 indexed proposalId, uint256 timestamp);

    event TokensAllocated(bytes32 indexed category, uint256 amount);
    event TokensClaimed(bytes32 indexed category, address indexed recipient, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,
        string memory symbol,
        address initialOwner
    ) public initializer {
        __ERC20_init(name, symbol);
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);
        _grantRole(OPERATOR_ROLE, initialOwner);

        proposalThreshold = 10000 * 10**18;
        votingPeriod = 7 days;
        executionDelay = 2 days;
        quorum = 100000 * 10**18;
        rewardRate = 100;

        distribution = TokenDistribution({
            users: 4000000 * 10**18,
            team: 2000000 * 10**18,
            liquidity: 2000000 * 10**18,
            reserve: 1500000 * 10**18,
            partners: 500000 * 10**18
        });
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(account, amount);
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");

        _updateRewards(msg.sender);

        _transfer(msg.sender, address(this), amount);
        stakingBalance[msg.sender] += amount;
        stakingTimestamp[msg.sender] = block.timestamp;
        totalStaked += amount;

        emit Staked(msg.sender, amount, block.timestamp);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(stakingBalance[msg.sender] >= amount, "Insufficient staking balance");

        _updateRewards(msg.sender);

        stakingBalance[msg.sender] -= amount;
        totalStaked -= amount;
        _transfer(address(this), msg.sender, amount);

        emit Unstaked(msg.sender, amount, block.timestamp);
    }

    function distributeRewards(uint256 amount) external onlyRole(OPERATOR_ROLE) {
        require(amount > 0, "Amount must be greater than 0");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");

        if (totalStaked > 0) {
            rewardPerTokenStored += (amount * 1e18) / totalStaked;
            _mint(address(this), amount);
        }
    }

    function claimRewards() external nonReentrant {
        _updateRewards(msg.sender);

        uint256 reward = pendingRewards[msg.sender];
        require(reward > 0, "No rewards to claim");

        pendingRewards[msg.sender] = 0;
        lastRewardClaim[msg.sender] = block.timestamp;

        require(totalSupply() + reward <= MAX_SUPPLY, "Exceeds max supply");
        _mint(msg.sender, reward);

        emit RewardClaimed(msg.sender, reward, block.timestamp);
    }

    function _updateRewards(address user) internal {
        if (stakingBalance[user] > 0 && stakingTimestamp[user] > 0) {
            uint256 timeStaked = block.timestamp - stakingTimestamp[user];
            uint256 reward = (stakingBalance[user] * rewardRate * timeStaked) / (10000 * SECONDS_PER_YEAR);
            pendingRewards[user] += reward;
        }
        stakingTimestamp[user] = block.timestamp;
    }

    function getTradingDiscount(address user) external view returns (uint256) {
        uint256 totalTokens = balanceOf(user) + stakingBalance[user];

        if (totalTokens >= 50000 * 10**18) return 1000;
        if (totalTokens >= 10000 * 10**18) return 500;
        if (totalTokens >= 1000 * 10**18) return 200;

        return 0;
    }

    function getUserStakingInfo(address user) external view returns (
        uint256 balance,
        uint256 staked,
        uint256 rewards,
        uint256 discountBps
    ) {
        balance = balanceOf(user);
        staked = stakingBalance[user];
        rewards = this.calculateRewards(user);
        discountBps = this.getTradingDiscount(user);
    }

    function isPremiumUser(address user) external view returns (bool) {
        return (balanceOf(user) + stakingBalance[user]) >= 10000 * 10**18;
    }

    function getVotingPower(address user) external view returns (uint256) {
        uint256 balance = balanceOf(user);
        uint256 staked = stakingBalance[user];

        return balance + (staked * 2);
    }

    function canCreateProposal(address user) external view returns (bool) {
        return this.getVotingPower(user) >= proposalThreshold;
    }

    function createProposal(
        string memory description,
        address target,
        bytes memory data
    ) external returns (uint256) {
        require(this.getVotingPower(msg.sender) >= proposalThreshold, "Insufficient voting power");
        require(bytes(description).length > 0, "Description required");

        uint256 proposalId = nextProposalId++;
        Proposal storage proposal = proposals[proposalId];

        proposal.id = proposalId;
        proposal.proposer = msg.sender;
        proposal.description = description;
        proposal.target = target;
        proposal.data = data;
        proposal.startTime = block.timestamp;
        proposal.endTime = block.timestamp + votingPeriod;
        proposal.executionTime = proposal.endTime + executionDelay;

        emit ProposalCreated(
            proposalId,
            msg.sender,
            description,
            proposal.startTime,
            proposal.endTime
        );

        return proposalId;
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp >= proposal.startTime, "Voting not started");
        require(block.timestamp <= proposal.endTime, "Voting ended");
        require(!proposal.hasVoted[msg.sender], "Already voted");
        require(!proposal.executed && !proposal.cancelled, "Proposal not active");

        uint256 votes = this.getVotingPower(msg.sender);
        require(votes > 0, "No voting power");

        proposal.hasVoted[msg.sender] = true;
        proposal.votes[msg.sender] = votes;

        if (support) {
            proposal.votesFor += votes;
        } else {
            proposal.votesAgainst += votes;
        }

        emit Voted(proposalId, msg.sender, support, votes, block.timestamp);
    }

    function executeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp >= proposal.executionTime, "Execution delay not met");
        require(!proposal.executed, "Already executed");
        require(!proposal.cancelled, "Proposal cancelled");
        require(proposal.votesFor > proposal.votesAgainst, "Proposal rejected");
        require(proposal.votesFor >= quorum, "Quorum not reached");

        proposal.executed = true;

        if (proposal.data.length > 0 && proposal.target != address(0)) {
            (bool success, ) = proposal.target.call(proposal.data);
            require(success, "Execution failed");
        }

        emit ProposalExecuted(proposalId, block.timestamp);
    }

    function cancelProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(
            msg.sender == proposal.proposer || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not authorized"
        );
        require(!proposal.executed, "Already executed");
        require(!proposal.cancelled, "Already cancelled");

        proposal.cancelled = true;
        emit ProposalCancelled(proposalId, block.timestamp);
    }

    function distributeFees(address token, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        require(amount > 0, "Amount must be greater than 0");
        require(totalStaked > 0, "No stakers");

        accumulatedFees[token] += amount;
        totalFeesDistributed += amount;

        emit FeesDistributed(token, amount, block.timestamp);
    }

    function claimFees(address token) external nonReentrant {
        require(stakingBalance[msg.sender] > 0, "No staking balance");

        uint256 userShare = (accumulatedFees[token] * stakingBalance[msg.sender]) / totalStaked;
        uint256 alreadyClaimed = userFeesClaimed[msg.sender][token];

        require(userShare > alreadyClaimed, "No fees to claim");

        uint256 claimableAmount = userShare - alreadyClaimed;
        userFeesClaimed[msg.sender][token] = userShare;

        if (token == address(0)) {
            payable(msg.sender).transfer(claimableAmount);
        } else {
            IERC20(token).transfer(msg.sender, claimableAmount);
        }

        emit FeesClaimed(msg.sender, token, claimableAmount);
    }

    function getClaimableFees(address user, address token) external view returns (uint256) {
        if (stakingBalance[user] == 0 || totalStaked == 0) return 0;

        uint256 userShare = (accumulatedFees[token] * stakingBalance[user]) / totalStaked;
        uint256 alreadyClaimed = userFeesClaimed[user][token];

        return userShare > alreadyClaimed ? userShare - alreadyClaimed : 0;
    }

    function allocateTokens(bytes32 category, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(amount > 0, "Amount must be greater than 0");

        bytes32 usersCategory = keccak256("USERS");
        bytes32 teamCategory = keccak256("TEAM");
        bytes32 liquidityCategory = keccak256("LIQUIDITY");
        bytes32 reserveCategory = keccak256("RESERVE");
        bytes32 partnersCategory = keccak256("PARTNERS");

        uint256 maxAllocation;
        if (category == usersCategory) maxAllocation = distribution.users;
        else if (category == teamCategory) maxAllocation = distribution.team;
        else if (category == liquidityCategory) maxAllocation = distribution.liquidity;
        else if (category == reserveCategory) maxAllocation = distribution.reserve;
        else if (category == partnersCategory) maxAllocation = distribution.partners;
        else revert("Invalid category");

        require(allocatedTokens[category] + amount <= maxAllocation, "Exceeds category allocation");

        allocatedTokens[category] += amount;
        emit TokensAllocated(category, amount);
    }

    function claimAllocatedTokens(
        bytes32 category,
        address recipient,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(claimedTokens[category] + amount <= allocatedTokens[category], "Exceeds allocated amount");

        claimedTokens[category] += amount;
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");

        _mint(recipient, amount);
        emit TokensClaimed(category, recipient, amount);
    }

    function updateGovernanceParams(
        uint256 _proposalThreshold,
        uint256 _votingPeriod,
        uint256 _executionDelay,
        uint256 _quorum
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_proposalThreshold > 0, "Invalid proposal threshold");
        require(_votingPeriod >= 1 days && _votingPeriod <= 30 days, "Invalid voting period");
        require(_executionDelay >= 1 hours && _executionDelay <= 7 days, "Invalid execution delay");
        require(_quorum > 0, "Invalid quorum");

        proposalThreshold = _proposalThreshold;
        votingPeriod = _votingPeriod;
        executionDelay = _executionDelay;
        quorum = _quorum;
    }

    function setRewardRate(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRate <= 2000, "Rate too high");
        rewardRate = newRate;
    }

    function calculateRewards(address user) external view returns (uint256) {
        if (stakingBalance[user] == 0 || stakingTimestamp[user] == 0) {
            return pendingRewards[user];
        }

        uint256 timeStaked = block.timestamp - stakingTimestamp[user];
        uint256 newReward = (stakingBalance[user] * rewardRate * timeStaked) / (10000 * SECONDS_PER_YEAR);

        return pendingRewards[user] + newReward;
    }

    function getProposal(uint256 proposalId) external view returns (
        uint256 id,
        address proposer,
        string memory description,
        address target,
        uint256 votesFor,
        uint256 votesAgainst,
        uint256 startTime,
        uint256 endTime,
        uint256 executionTime,
        bool executed,
        bool cancelled
    ) {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.id,
            proposal.proposer,
            proposal.description,
            proposal.target,
            proposal.votesFor,
            proposal.votesAgainst,
            proposal.startTime,
            proposal.endTime,
            proposal.executionTime,
            proposal.executed,
            proposal.cancelled
        );
    }

    function getUserInfo(address user) external view returns (
        uint256 balance,
        uint256 staked,
        uint256 rewards,
        uint256 votingPower,
        uint256 discountBps,
        bool premium
    ) {
        balance = balanceOf(user);
        staked = stakingBalance[user];
        rewards = this.calculateRewards(user);
        votingPower = this.getVotingPower(user);
        discountBps = this.getTradingDiscount(user);
        premium = this.isPremiumUser(user);
    }

    function getTokenStats() external view returns (
        uint256 totalSupply_,
        uint256 maxSupply_,
        uint256 totalStaked_,
        uint256 totalFeesDistributed_,
        uint256 circulatingSupply,
        uint256 nextProposalId_
    ) {
        totalSupply_ = totalSupply();
        maxSupply_ = MAX_SUPPLY;
        totalStaked_ = totalStaked;
        totalFeesDistributed_ = totalFeesDistributed;
        circulatingSupply = totalSupply() - balanceOf(address(this));
        nextProposalId_ = nextProposalId;
    }

    function getDistributionInfo(bytes32 category) external view returns (
        uint256 allocated,
        uint256 claimed,
        uint256 remaining
    ) {
        allocated = allocatedTokens[category];
        claimed = claimedTokens[category];
        remaining = allocated - claimed;
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) {
            payable(msg.sender).transfer(amount);
        } else {
            IERC20(token).transfer(msg.sender, amount);
        }
    }

    receive() external payable {}
}