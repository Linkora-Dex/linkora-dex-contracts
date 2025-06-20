# 🏛️ Governance Token Linkora DEX

## What is this

Governance token is an **optional addition** to Linkora DEX. The platform works completely without it.

### Basic facts
- Platform works without token
- Token provides discounts on fees
- Ability to participate in voting
- Purchase is completely voluntary

---

## Why token is needed

### For users
- Discounts on trading fees
- Share in fee revenues
- Voting on platform parameters
- Additional rewards for staking

### For platform
- Additional income from token sales
- More interested users
- Possibility of management decentralization

---

## How it works

### Basic mechanism

```solidity
contract GovernanceToken {
    mapping(address => uint256) public stakingBalance;
    
    function stake(uint256 amount) external {
        stakingBalance[msg.sender] += amount;
        _transfer(msg.sender, address(this), amount);
    }
    
    function getTradingDiscount(address user) external view returns (uint256) {
        uint256 tokens = balanceOf(user) + stakingBalance[user];
        return _calculateDiscount(tokens);
    }
    
    function getVotingPower(address user) external view returns (uint256) {
        return balanceOf(user) + (stakingBalance[user] * 2);
    }
}
```

### Trading fees

**Basic model** Trading fees from each operation

**Distribution without token**
- 100% fees to liquidity providers

**Distribution with token**
- 70% to liquidity providers  
- 30% to token holders (stakers)

---

## Discount levels

Level system provides discounts on trading fees depending on token amount

- **1000+ tokens** 2% discount (Bronze)
- **10000+ tokens** 5% discount (Silver)  
- **50000+ tokens** 10% discount (Gold) + premium features

### Premium features
When reaching Gold level (50000+ tokens) available
- Limit orders without restrictions
- Margin trading with increased leverage
- Priority order execution

---

## Management system (Governance)

### Full governance system with security

**Proposal creation process**
1. User with 10000+ tokens creates proposal
2. Voting is open for 7 days
3. Execution delay 2 days (timelock)
4. Execution when reaching quorum

**Role system**
- **DEFAULT_ADMIN_ROLE** System management
- **MINTER_ROLE** Creating new tokens
- **OPERATOR_ROLE** Operational functions

### Voting power
- Regular tokens 1x weight
- Staked tokens 2x weight in voting
- Minimum 10000 tokens to create proposals
- Quorum 100000 tokens minimum for validity

### What can be controlled through governance

**Trading parameters**
- Trading fees size (within 0.1% - 1%)
- Revenue distribution between LP and stakers
- Maximum discounts

**Platform parameters**
- Adding new trading pairs
- Liquidity mining parameters
- Platform new features activation

**Governance parameters**
- Proposal creation threshold
- Voting period  
- Quorum for decisions

### Governance security

**Timelock system**
- All changes have 2-day execution delay
- Ability to cancel malicious proposals
- Protection from governance attacks

**Limitations**
- Trading fees changes only within safe limits
- Cannot change token max supply
- Protection of critical system parameters

---

## Staking and rewards

### Staking system
```solidity
function stake(uint256 amount) external {
    require(balanceOf(msg.sender) >= amount);
    stakingBalance[msg.sender] += amount;
    _transfer(msg.sender, address(this), amount);
}

function unstake(uint256 amount) external {
    require(stakingBalance[msg.sender] >= amount);
    stakingBalance[msg.sender] -= amount;
    _transfer(address(this), msg.sender, amount);
}
```

### Rewards distribution
- **Staking rewards** Share of platform trading fees
- **Liquidity mining** Rewards for adding liquidity
- **Execution rewards** 100 tokens for order execution
- **Liquidation rewards** 50 tokens for position liquidation

### Rewards calculation
Rewards are distributed proportionally to staked tokens amount
```solidity
function claimRewards() external {
    uint256 reward = calculateRewards(msg.sender);
    pendingRewards[msg.sender] = 0;
    _mint(msg.sender, reward);
}
```

---

## Economic model

### Token distribution (10M maximum)
- **40%** (4M) User rewards and liquidity mining
- **20%** (2M) Development team (48-month vesting)
- **20%** (2M) Initial liquidity 
- **15%** (1.5M) Platform reserve
- **5%** (0.5M) Strategic partnerships

### Fee sharing mechanism
```solidity
function _distributeFee(address token, uint256 amount) internal {
    uint256 lpFee = (amount * (100 - feeToStakersPercent)) / 100;
    uint256 stakingFee = amount - lpFee;
    
    _distributeToLPs(token, lpFee);
    if (stakingFee > 0) {
        _distributeToStakers(token, stakingFee);
    }
}
```

---

## Risks

### Main risks
- **Token price can fall to zero**
- **Income depends on trading volumes**
- **Regulatory changes may ban token**
- **Technical problems with contracts**
- **Governance attacks with token concentration**

### Smart contract risks
- **Errors in reward distribution logic**
- **Problems when updating contracts**
- **Vulnerability in governance mechanisms**

### What is NOT guaranteed
- Any profitability
- Token price growth
- Token functions preservation
- Return of invested funds
- Governance decisions stability

---

## Who is it suitable for

### Worth considering if
- You trade actively and can use discounts
- Want to participate in project development
- Ready for risks of losing all investments
- Understand governance system complexity
- Ready for long-term participation (staking)

### NOT worth buying if
- Trade rarely or small amounts
- Need profitability guarantees
- Not ready for complete loss of funds
- Expect quick price growth
- Don't understand how governance works

---

## Technical implementation

### DEX integration
Token integrates with Router as optional module
```solidity
function setGovernanceToken(address token) external onlyAdmin {
    governanceToken = GovernanceToken(token);
}

function _getTradingDiscount(address user) internal view returns (uint256) {
    if (address(governanceToken) == address(0)) return 0;
    return governanceToken.getTradingDiscount(user);
}
```

### Backward compatibility
- Platform works with token and without it
- All main DEX functions are preserved
- Token only adds additional features

---

## Conclusion

**Main point** Token is a complex system with additional features. Platform works without it.

**Governance** Full management system with timelock, quorum and attack protection.

**Staking** Long-term participation system with rewards from platform activity.

**Before buying** Evaluate real benefit for your trading volumes and readiness for governance participation.

**Remember** This is high-risk investment without guarantees with additional governance system complexity.