# 🪙 Токеномика Linkora DEX

## Что это за документ

Техническое руководство по внедрению governance токена в работающий Linkora DEX.

### Статус проекта
- **Платформа готова**: DEX полностью работает без токена
- **Токен опционален**: Добавляет дополнительные возможности
- **Простая интеграция**: Функции активируются сразу при развертывании

---

## Интеграция с существующей архитектурой

### Router-центричная интеграция

**Все функции токена через единый Router**:
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

## Параметры токена

### Базовая структура

```javascript
const TOKEN_PARAMS = {
    maxSupply: 10_000_000,      // 10M токенов максимум
    initialSupply: 1_000_000,   // 1M токенов начальный mint
    name: "Platform Governance Token",
    symbol: "PGT",
    decimals: 18
};

const TRADING_PARAMS = {
    baseFeeRate: 30,        // 0.3% в basis points
    maxDiscount: 1000       // 10% максимальная скидка
};
```

### Система скидок

```javascript
const DISCOUNT_TIERS = [
    { threshold: ethers.parseEther("1000"), discount: 200 },    // 1k токенов, 2%
    { threshold: ethers.parseEther("10000"), discount: 500 },   // 10k токенов, 5%
    { threshold: ethers.parseEther("50000"), discount: 1000 }   // 50k токенов, 10%
];
```

Реализация в контракте:
```solidity
function getTradingDiscount(address user) external view returns (uint256) {
    uint256 totalTokens = balanceOf(user) + stakingBalance[user];
    
    if (totalTokens >= 50_000 * 10**18) return 1000; // 10%
    if (totalTokens >= 10_000 * 10**18) return 500;  // 5%
    if (totalTokens >= 1_000 * 10**18) return 200;   // 2%
    
    return 0;
}
```

### Governance параметры

```javascript
const GOVERNANCE_PARAMS = {
    proposalThreshold: ethers.parseEther("10000"),  // 10k токенов для создания предложения
    votingDelay: 1 * 24 * 60 * 60,                 // 1 день задержка голосования
    votingPeriod: 7 * 24 * 60 * 60,                // 7 дней голосования
    executionDelay: 2 * 24 * 60 * 60,              // 2 дня задержка исполнения
    quorum: ethers.parseEther("100000"),            // 100k токенов минимум для кворума
};
```

---

## Экономические механизмы

### Распределение комиссий

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

### Распределение токенов

```javascript
const TOKEN_DISTRIBUTION = {
    totalSupply: 10_000_000,
    
    allocation: {
        users: 4_000_000,        // 40% - награды пользователям
        team: 2_000_000,         // 20% - команда разработки  
        liquidity: 2_000_000,    // 20% - начальная ликвидность
        reserve: 1_500_000,      // 15% - резерв платформы
        partners: 500_000        // 5% - партнеры
    },
    
    vesting: {
        team: "48 месяцев linear vesting с cliff 12 месяцев",
        immediate: ["liquidity", "users", "partners"]
    }
};
```

Реализация в контракте:
```solidity
struct TokenDistribution {
    uint256 users;     // 40% - награды пользователям
    uint256 team;      // 20% - команда разработки
    uint256 liquidity; // 20% - начальная ликвидность
    uint256 reserve;   // 15% - резерв платформы
    uint256 partners;  // 5% - партнеры
}

TokenDistribution public distribution;

function allocateTokens(bytes32 category, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
    // Выделение токенов по категориям с проверкой лимитов
}
```

---

## Система управления

### Расчет силы голоса

```solidity
function getVotingPower(address user) external view returns (uint256) {
    uint256 balance = balanceOf(user);
    uint256 staked = stakingBalance[user];
    
    // Staked токены имеют 2x вес для стимулирования долгосрочного участия
    return balance + (staked * 2);
}
```

### Создание предложений

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

### Голосование с безопасностью

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

### Исполнение предложений с timelock

```solidity
function executeProposal(uint256 proposalId) external {
    Proposal storage proposal = proposals[proposalId];
    require(block.timestamp >= proposal.executionTime, "Execution delay not met");
    require(!proposal.executed, "Already executed");
    require(!proposal.cancelled, "Proposal cancelled");
    require(proposal.votesFor > proposal.votesAgainst, "Proposal rejected");
    require(proposal.votesFor >= quorum, "Quorum not reached");

    proposal.executed = true;

    // Исполнение данных предложения
    if (proposal.data.length > 0 && proposal.target != address(0)) {
        (bool success, ) = proposal.target.call(proposal.data);
        require(success, "Execution failed");
    }

    emit ProposalExecuted(proposalId, block.timestamp);
}
```

### Что можно контролировать через governance

**Торговые параметры**:
- Базовая комиссия (в пределах 0.1% - 1%)
- Распределение комиссий между LP и stakers (от 50/50 до 100/0)
- Параметры скидок

**Платформенные параметры**:
- Добавление новых торговых пар
- Изменение лимитов на ордера
- Активация новых функций платформы
- Параметры liquidity mining

**Governance параметры**:
- Порог создания предложений (в пределах 1k-100k токенов)
- Период голосования (1-30 дней)
- Требования кворума

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

## Стейкинг и награды

### Система стейкинга

```solidity
mapping(address => uint256) public stakingBalance;
mapping(address => uint256) public stakingTimestamp;
mapping(address => uint256) public pendingRewards;
uint256 public totalStaked;
uint256 public rewardRate = 100; // 1% базовая годовая ставка

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

### Распределение наград

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

## Технические спецификации

### Обновления контрактов

**RouterUpgradeable основные функции**:
```solidity
function setGovernanceToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE)
function setFeeToStakersPercent(uint256 _percent) external onlyRole(DEFAULT_ADMIN_ROLE)
function getUserTokenomicsInfo(address user) external view returns (...)
function getTokenomicsStats() external view returns (...)
function distributeStakingRewards(address token, uint256 amount) external
```

**PoolUpgradeable изменения**:
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

**GovernanceToken полный контракт**:
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

    // Governance параметры
    uint256 public proposalThreshold = 10000 * 10**18;
    uint256 public votingPeriod = 7 days;
    uint256 public executionDelay = 2 days;
    uint256 public quorum = 100000 * 10**18;

    // Staking параметры
    mapping(address => uint256) public stakingBalance;
    mapping(address => uint256) public pendingRewards;
    uint256 public totalStaked;
    uint256 public rewardRate = 100; // 1% базовая ставка

    // Fee sharing система
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

        // Инициализация распределения
        distribution = TokenDistribution({
            users: 4000000 * 10**18,     // 40%
            team: 2000000 * 10**18,      // 20%
            liquidity: 2000000 * 10**18, // 20%
            reserve: 1500000 * 10**18,   // 15%
            partners: 500000 * 10**18    // 5%
        });
    }

    // Основные функции описаны выше...
}
```

---

## Конфигурационные файлы

### Deployment конфигурация

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
        feeToStakersPercent: 30,    // 30% комиссий stakers
        lpFeePercent: 70            // 70% комиссий LP
    },
    
    rewards: {
        executionReward: ethers.parseEther("100"),     // 100 токенов за исполнение
        liquidationReward: ethers.parseEther("50"),    // 50 токенов за ликвидацию
        liquidityMiningRate: 1000                      // 10% APR для LP
    }
};
```

### Runtime параметры

```javascript
const RUNTIME_PARAMS = {
    // Эти параметры можно менять через governance
    mutable: {
        baseFeeRate: { min: 10, max: 100, current: 30 },
        feeToStakersPercent: { min: 0, max: 50, current: 30 },
        proposalThreshold: { min: 1000, max: 100000, current: 10000 },
        rewardRate: { min: 0, max: 2000, current: 100 }
    },
    
    // Эти параметры фиксированы
    immutable: {
        maxSupply: TOKEN_PARAMS.maxSupply,
        maxDiscount: TRADING_PARAMS.maxDiscount,
        votingPeriod: GOVERNANCE_PARAMS.votingPeriod,
        executionDelay: GOVERNANCE_PARAMS.executionDelay
    }
};
```

---

## Интерфейсы

### IRouterFeeDistribution

```solidity
interface IRouterFeeDistribution {
    function distributeStakingRewards(address token, uint256 amount) external;
    function getTradingDiscount(address user) external view returns (uint256);
}
```

Фактическая реализация в Router:
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

## Риски и ограничения

### Технические риски

**Smart contract риски**:
- Ошибки в логике распределения комиссий
- Проблемы при обновлении контрактов
- Vulnerability в governance механизмах
- Ошибки в расчете наград staking

**Интеграционные риски**:
- Ошибки в расчете скидок
- Проблемы совместимости при обновлениях
- Сбои в распределении наград
- Проблемы с timelock исполнением

### Экономические риски

**Для держателей**:
- Полная потеря стоимости токена
- Снижение торговых объемов платформы
- Неэффективные governance решения
- Изменение экономической модели через голосование

**Для платформы**:
- Governance атаки с большим количеством токенов
- Неэффективные решения сообщества
- Regulatory риски классификации как security
- Концентрация власти у крупных держателей

### Governance специфичные риски

**Атаки на governance**:
- Скупка токенов для контроля голосования
- Координированные атаки сообщества
- Манипуляции через proposal timing

**Защитные механизмы**:
- Timelock задержка исполнения (2 дня)
- Кворум для валидности решений
- Ограничения на критические параметры
- Возможность отмены вредоносных предложений

---

## Соответствие требованиям

### Регулятивный подход

**Utility-first дизайн**:
- Токен предоставляет доступ к функциям платформы
- Скидки как основная ценность
- Governance как дополнительная utility
- Staking для долгосрочного участия

**Risk management**:
- Полное раскрытие всех рисков
- Отсутствие обещаний доходности
- Четкое разделение utility и спекулятивных аспектов
- Подчеркивание добровольности участия

```javascript
const COMPLIANCE_FRAMEWORK = {
    tokenClassification: "utility",
    primaryUseCase: "platform_discounts_and_governance",
    
    riskDisclosures: [
        "Полная потеря стоимости возможна",
        "Доходы не гарантированы", 
        "Зависимость от объемов платформы",
        "Технические риски smart contracts",
        "Governance риски и атаки",
        "Regulatory неопределенность",
        "Сложность системы управления"
    ],
    
    utilityFeatures: [
        "Торговые скидки до 10%",
        "Доля в комиссиях платформы",
        "Участие в governance решениях",
        "Staking rewards",
        "Premium функции доступа"
    ]
};
```

---

## Заключение

### Техническая реализация

**Модульная архитектура**: Токен интегрируется как опциональный модуль
**Простая активация**: Функции работают сразу при развертывании  
**Обратная совместимость**: Платформа работает с токеном и без него
**Upgradeable дизайн**: Возможность улучшения без потери данных

### Экономическая модель

**Простота**: Понятные механизмы скидок и распределения
**Гибкость**: Параметры настраиваются через governance
**Устойчивость**: Модель не зависит от роста цены токена  
**Безопасность**: Timelock и кворум защищают от атак

### Governance система

**Полноценная система**: Создание, голосование, исполнение proposals
**Безопасность**: Timelock, кворум, ограничения параметров
**Гибкость**: Возможность адаптации под потребности сообщества
**Прозрачность**: Все процессы публичны и верифицируемы

### Рекомендации по внедрению

**Начните минимально**: Торговые скидки и базовый staking работают сразу
**Тестируйте тщательно**: Особенно governance и fee distribution
**Слушайте сообщество**: Адаптируйте параметры на основе feedback
**Документируйте риски**: Четко объясняйте сложность системы

**Принцип**: Токен значительно улучшает платформу, но не заменяет её основную ценность. Сложность governance требует понимания от пользователей.