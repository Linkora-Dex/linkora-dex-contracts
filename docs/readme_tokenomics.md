# 🪙 Linkora DEX Tokenomics

## What this document is

Technical guide for implementing governance token into working Linkora DEX.

### Project status
- **Platform ready**: DEX fully works without token
- **Token optional**: Adds additional capabilities
- **Simple integration**: Functions activate immediately upon deployment

---

## Integration with existing architecture

### Router-centric integration

**All token functions through single Router**:
```solidity
contract RouterUpgradeable {
    GovernanceToken public governanceToken;
    uint256 public feeToStakersPercent = 30; // 30% fees to stakers
    
    function setGovernanceToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        governanceToken = GovernanceToken(token);
    }
    
    function setFeeToStakersPercent(uint256 _percent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_percent <= 50, "Max 50%");
        feeToStakersPercent = _percent;
    }
    
    function _getTradingDiscount(address user) internal view returns (uint256) {
        if (address(governanceToken) == address(0)) return 0;
        return governanceToken.getTradingDiscount(user);
    }
}
```

---

## Token parameters

### Basic structure

```javascript
const TOKEN_PARAMS = {
    maxSupply: 10_000_000,      // 10M tokens maximum
    initialSupply: 1_000_000,   // 1M tokens initial mint
    name: "Platform Governance Token",
    symbol: "PGT",
    decimals: 18
};

const TRADING_PARAMS = {
    baseFeeRate: 30,        // 0.3% in basis points
    maxDiscount: 1000       // 10% maximum discount
};
```

### Discount system

```javascript
const DISCOUNT_TIERS = [
    { threshold: ethers.parseEther("1000"), discount: 200 },    // 1k tokens, 2%
    { threshold: ethers.parseEther("10000"), discount: 500 },   // 10k tokens, 5%
    { threshold: ethers.parseEther("50000"), discount: 1000 }   // 50k tokens, 10%
];
```

Implementation in contract:
```solidity
function getTradingDiscount(address user) external view returns (uint256) {
    uint256 totalTokens = balanceOf(user) + stakingBalance[user];
    
    if (totalTokens >= 50_000 * 10**18) return 1000; // 10%
    if (totalTokens >= 10_000 * 10**18) return 500;  // 5%
    if (totalTokens >= 1_000 * 10**18) return 200;   // 2%
    
    return 0;
}
```

### Governance parameters

```javascript
const GOVERNANCE_PARAMS = {
    proposalThreshold: ethers.parseEther("10000"),  // 10k tokens for proposal creation
    votingDelay: 1 * 24 * 60 * 60,                 // 1 day voting delay
    votingPeriod: 7 * 24 * 60 * 60,                // 7 days voting
    executionDelay: 2 * 24 * 60 * 60,              // 2 days execution delay
    quorum: ethers.parseEther("100000"),            // 100k tokens minimum for quorum
};
```

---

## Economic mechanisms

### Fee distribution

```solidity
function _distributeFee(address token, uint256 feeAmount) internal {
    if (feeAmount == 0) return;

    uint256 lpFee = (feeAmount * (100 - feeToStakersPercent)) / 100;
    uint256 stakingFee = feeAmount - lpFee;

    if (lpFee > 0) {
        totalFeesAccumulated[token] += lpFee;
    }

    if (stakingFee > 0 && router != address(0)) {
        try IRouterFeeDistribution(router).distributeStakingRewards(token, stakingFee) {
        } catch {}
    }

    emit FeeDistributed(token, lpFee, stakingFee, block.timestamp);
}
```

### Token distribution

```javascript
const TOKEN_DISTRIBUTION = {
    totalSupply: 10_000_000,
    
    allocation: {
        users: 4_000_000,        // 40% - user rewards
        team: 2_000_000,         // 20% - development team  
        liquidity: 2_000_000,    // 20% - initial liquidity
        reserve: 1_500_000,      // 15% - platform reserve
        partners: 500_000        // 5% - partners
    },
    
    vesting: {
        team: "48 months linear vesting with 12 months cliff",
        immediate: ["liquidity", "users", "partners"]
    }
};
```

Implementation in contract:
```solidity
struct TokenDistribution {
    uint256 users;     // 40% - user rewards
    uint256 team;      // 20% - development team
    uint256 liquidity; // 20% - initial liquidity
    uint256 reserve;   // 15% - platform reserve
    uint256 partners;  // 5% - partners
}

TokenDistribution public distribution;

function allocateTokens(bytes32 category, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
    // Token allocation by categories with limit checks
}
```

---

## Governance system

### Voting power calculation

```solidity
function getVotingPower(address user) external view returns (uint256) {
    uint256 balance = balanceOf(user);
    uint256 staked = stakingBalance[user];
    
    // Staked tokens have 2x weight to incentivize long-term participation
    return balance + (staked * 2);
}
```

### Proposal creation

```solidity
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
```

### Voting with security

```solidity
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
```

### Proposal execution with timelock

```solidity
function executeProposal(uint256 proposalId) external {
    Proposal storage proposal = proposals[proposalId];
    require(block.timestamp >= proposal.executionTime, "Execution delay not met");
    require(!proposal.executed, "Already executed");
    require(!proposal.cancelled, "Proposal cancelled");
    require(proposal.votesFor > proposal.votesAgainst, "Proposal rejected");
    require(proposal.votesFor >= quorum, "Quorum not reached");

    proposal.executed = true;

    // Execution of proposal data
    if (proposal.data.length > 0 && proposal.target != address(0)) {
        (bool success, ) = proposal.target.call(proposal.data);
        require(success, "Execution failed");
    }

    emit ProposalExecuted(proposalId, block.timestamp);
}
```

### What can be controlled through governance

**Trading parameters**:
- Base fee (within 0.1% - 1%)
- Fee distribution between LP and stakers (from 50/50 to 100/0)
- Discount parameters

**Platform parameters**:
- Adding new trading pairs
- Changing order limits
- Activating new platform features
- Liquidity mining parameters

**Governance parameters**:
- Proposal creation threshold (within 1k-100k tokens)
- Voting period (1-30 days)
- Quorum requirements

```solidity
function proposeFeeChange(uint256 newFeeRate) external {
    require(newFeeRate >= 10 && newFeeRate <= 100, "Fee must be 0.1%-1%");
    
    bytes memory data = abi.encodeWithSignature(
        "setBaseFeeRate(uint256)", 
        newFeeRate
    );
    
    createProposal("Change trading fee", address(router), data);
}
```

---

## Staking and rewards

### Staking system

```solidity
mapping(address => uint256) public stakingBalance;
mapping(address => uint256) public stakingTimestamp;
mapping(address => uint256) public pendingRewards;
uint256 public totalStaked;
uint256 public rewardRate = 100; // 1% base annual rate

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
```

### Reward distribution

```solidity
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
```

---

## Technical specifications

### Contract upgrades

**RouterUpgradeable main functions**:
```solidity
function setGovernanceToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE)
function setFeeToStakersPercent(uint256 _percent) external onlyRole(DEFAULT_ADMIN_ROLE)
function getUserTokenomicsInfo(address user) external view returns (...)
function getTokenomicsStats() external view returns (...)
function distributeStakingRewards(address token, uint256 amount) external
```

**PoolUpgradeable changes**:
```solidity
function _distributeFee(address token, uint256 feeAmount) internal {
    if (feeAmount == 0) return;

    uint256 lpFee = (feeAmount * (100 - feeToStakersPercent)) / 100;
    uint256 stakingFee = feeAmount - lpFee;

    if (lpFee > 0) {
        totalFeesAccumulated[token] += lpFee;
    }

    if (stakingFee > 0 && router != address(0)) {
        try IRouterFeeDistribution(router).distributeStakingRewards(token, stakingFee) {
        } catch {}
    }

    emit FeeDistributed(token, lpFee, stakingFee, block.timestamp);
}
```

**GovernanceToken full contract**:
```solidity
contract GovernanceToken is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint256 public constant MAX_SUPPLY = 10000000 * 10**18; // 10M tokens
    uint256 public constant MAX_DISCOUNT = 1000; // 10% maximum discount

    // Governance parameters
    uint256 public proposalThreshold = 10000 * 10**18;
    uint256 public votingPeriod = 7 days;
    uint256 public executionDelay = 2 days;
    uint256 public quorum = 100000 * 10**18;

    // Staking parameters
    mapping(address => uint256) public stakingBalance;
    mapping(address => uint256) public pendingRewards;
    uint256 public totalStaked;
    uint256 public rewardRate = 100; // 1% base rate

    // Fee sharing system
    mapping(address => uint256) public accumulatedFees;
    uint256 public totalFeesDistributed;

    // Governance proposals
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

    // Token distribution
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

        // Distribution initialization
        distribution = TokenDistribution({
            users: 4000000 * 10**18,     // 40%
            team: 2000000 * 10**18,      // 20%
            liquidity: 2000000 * 10**18, // 20%
            reserve: 1500000 * 10**18,   // 15%
            partners: 500000 * 10**18    // 5%
        });
    }

    // Main functions described above...
}
```

---

## Configuration files

### Deployment configuration

```javascript
const DEPLOYMENT_CONFIG = {
    token: {
        name: "Your DEX Governance Token",
        symbol: "YDGT",
        maxSupply: TOKEN_PARAMS.maxSupply,
        initialSupply: TOKEN_PARAMS.initialSupply
    },
    
    discounts: DISCOUNT_TIERS,
    governance: GOVERNANCE_PARAMS,
    
    feeDistribution: {
        feeToStakersPercent: 30,    // 30% fees stakers
        lpFeePercent: 70            // 70% fees LP
    },
    
    rewards: {
        executionReward: ethers.parseEther("100"),     // 100 tokens for execution
        liquidationReward: ethers.parseEther("50"),    // 50 tokens for liquidation
        liquidityMiningRate: 1000                      // 10% APR for LP
    }
};
```

### Runtime parameters

```javascript
const RUNTIME_PARAMS = {
    // These parameters can be changed through governance
    mutable: {
        baseFeeRate: { min: 10, max: 100, current: 30 },
        feeToStakersPercent: { min: 0, max: 50, current: 30 },
        proposalThreshold: { min: 1000, max: 100000, current: 10000 },
        rewardRate: { min: 0, max: 2000, current: 100 }
    },
    
    // These parameters are fixed
    immutable: {
        maxSupply: TOKEN_PARAMS.maxSupply,
        maxDiscount: TRADING_PARAMS.maxDiscount,
        votingPeriod: GOVERNANCE_PARAMS.votingPeriod,
        executionDelay: GOVERNANCE_PARAMS.executionDelay
    }
};
```

---

## Interfaces

### IRouterFeeDistribution

```solidity
interface IRouterFeeDistribution {
    function distributeStakingRewards(address token, uint256 amount) external;
    function getTradingDiscount(address user) external view returns (uint256);
}
```

Actual implementation in Router:
```solidity
function distributeStakingRewards(address token, uint256 amount) external {
    require(msg.sender == address(pool), "Only pool can distribute");

    if (address(governanceToken) != address(0) && governanceToken.totalStaked() > 0) {
        stakingRewards[token] += amount;
        totalRewardsDistributed[token] += amount;

        governanceToken.distributeRewards(amount);
        emit StakingRewardsDistributed(token, amount);
    }
}

function getTradingDiscount(address user) external view returns (uint256) {
    return _getTradingDiscount(user);
}
```

---

## Risks and limitations

### Technical risks

**Smart contract risks**:
- Errors in fee distribution logic
- Problems during contract upgrades
- Vulnerabilities in governance mechanisms
- Errors in staking reward calculations

**Integration risks**:
- Errors in discount calculations
- Compatibility problems during upgrades
- Failures in reward distribution
- Problems with timelock execution

### Economic risks

**For holders**:
- Complete loss of token value
- Decrease in platform trading volumes
- Ineffective governance decisions
- Changes to economic model through voting

**For platform**:
- Governance attacks with large amounts of tokens
- Ineffective community decisions
- Regulatory risks of security classification
- Power concentration among large holders

### Governance specific risks

**Governance attacks**:
- Token acquisition for voting control
- Coordinated community attacks
- Manipulations through proposal timing

**Protective mechanisms**:
- Timelock execution delay (2 days)
- Quorum for decision validity
- Restrictions on critical parameters
- Ability to cancel malicious proposals

---

## Compliance requirements

### Regulatory approach

**Utility-first design**:
- Token provides access to platform functions
- Discounts as primary value
- Governance as additional utility
- Staking for long-term participation

**Risk management**:
- Full disclosure of all risks
- No profitability promises
- Clear separation of utility and speculative aspects
- Emphasis on voluntary participation

```javascript
const COMPLIANCE_FRAMEWORK = {
    tokenClassification: "utility",
    primaryUseCase: "platform_discounts_and_governance",
    
    riskDisclosures: [
        "Complete loss of value possible",
        "Income not guaranteed", 
        "Dependence on platform volumes",
        "Technical risks of smart contracts",
        "Governance risks and attacks",
        "Regulatory uncertainty",
        "Complexity of governance system"
    ],
    
    utilityFeatures: [
        "Trading discounts up to 10%",
        "Share in platform fees",
        "Participation in governance decisions",
        "Staking rewards",
        "Premium feature access"
    ]
};
```

---

## Conclusion

### Technical implementation

**Modular architecture**: Token integrates as optional module
**Simple activation**: Functions work immediately upon deployment  
**Backward compatibility**: Platform works with and without token
**Upgradeable design**: Possibility of improvements without data loss

### Economic model

**Simplicity**: Clear discount and distribution mechanisms
**Flexibility**: Parameters configurable through governance
**Stability**: Model doesn't depend on token price growth  
**Security**: Timelock and quorum protect against attacks

### Governance system

**Complete system**: Creation, voting, execution of proposals
**Security**: Timelock, quorum, parameter restrictions
**Flexibility**: Ability to adapt to community needs
**Transparency**: All processes public and verifiable

### Implementation recommendations

**Start minimal**: Trading discounts and basic staking work immediately
**Test thoroughly**: Especially governance and fee distribution
**Listen to community**: Adapt parameters based on feedback
**Document risks**: Clearly explain system complexity

**Principle**: Token significantly improves platform, but doesn't replace its core value. Governance complexity requires user understanding.
