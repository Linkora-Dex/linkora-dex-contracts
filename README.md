# DEX Smart Contracts

Decentralized exchange with margin trading and upgradeable architecture

## Quick Start

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Start local network
npm run node

# Deploy system (in new terminal)
npm run prod:infrastructure
npm run prod:tokens
npm run prod:pools

or

npm run prod:deploy:config

# Start services
npm run price-generator-anvil    # Price generator
npm run keeper:upgradeable-anvil # Order executor
npm run trading-demo-anvil       # Trading demo
```

## Architecture

### Core DEX
**Upgradeable Proxy Pattern**
- Router Proxy → Router Implementation
- Pool Proxy → Pool Implementation  
- Trading Proxy → Trading Implementation
- Oracle Proxy → Oracle Implementation

**Configuration** `config/anvil_upgradeable-config.json`

### Governance Token (optional)
**Additional features**
- Trading discounts up to 10%
- Staking with rewards from fees
- Voting system for governance
- Premium access features

**Configuration** `config/token-config.json`

## Main Features

### Core DEX
- ✅ Spot trading
- ✅ Limit orders
- ✅ Stop-loss orders  
- ✅ Margin trading
- ✅ Liquidity providing
- ✅ Upgradeable contracts
- ✅ Flash loan protection
- ✅ Circuit breaker

### Governance Token (optional)
- ✅ ERC-20 with extended functions
- ✅ Trading discount system
- ✅ Staking with doubled voting weight
- ✅ Distribution of part of fees to stakers
- ✅ Timelock governance with quorum
- ✅ Premium features for large holders

## Deployment and Management

### Main system
- [Deployment Guide](./docs/readme_deployment_guide.md) - Step-by-step deployment
- [Scripts Overview](./scripts/readme.md) - Description of all scripts
- [Security Analysis](./docs/readme_slither.md) - Security analysis

### Governance and tokenomics
- [Governance Token Guide](./docs/readme_governance.md) - User guide
- [Monetization Model](./docs/readme_monetization.md) - Economic model
- [Technical Tokenomics](./docs/readme_tokenomics.md) - Technical documentation

## Development Commands

### Deploy and testing
```bash
# Full deployment pipeline
npm run prod:infrastructure  # Infrastructure
npm run prod:tokens         # Tokens and prices
npm run prod:pools          # Liquidity

# Governance token
npm run deploy:governance-token
npm run verify:governance-token

# Testing
npm run test:integration
npm run test:full-upgradeable
npm run verify:upgrades
```

### Services and automation
```bash
# Runtime services
npm run price-generator-anvil    # Price updates
npm run keeper:upgradeable-anvil # Order execution
npm run trading-demo-anvil       # Trading demonstration

# Management
npm run pause                   # Emergency stop
npm run unpause                 # Resume operation
npm run cancel-all              # Cancel all orders
```

### Docker deployment
```bash
# Full development environment
./docker-run.sh full

# Individual components
./docker-run.sh start    # Node only
./docker-run.sh deploy   # Contract deployment
./docker-run.sh services # Automation
```

## Operating Principles

### Modular architecture
- **Core DEX** Fully functional without token
- **Governance Token** Optional addition
- **Simple integration** Token connects with one command

### Router-centric design
- All operations through single Router contract
- Upgradeable without changing addresses
- Backward compatibility guaranteed

### Security
- Timelock for all governance changes
- Quorum for decision validity
- Restrictions on critical parameters
- Emergency stop capability
- Flash loan protection
- Circuit breaker mechanisms

## Project Structure

```
├── contracts/
│   ├── upgradeable/     # Main contracts
│   ├── governance/      # Governance token
│   ├── libraries/       # Logic libraries
│   └── access/         # Access control
├── scripts/
│   ├── prod_*          # Production deploy
│   ├── utils/          # Management utilities
│   └── tests/          # Integration tests
├── config/             # Configurations
└── docs/              # Documentation
```

## Security and Audit

- Upgradeable proxy pattern with timelock protection
- Comprehensive testing with >95% coverage
- Static analysis with Slither
- Emergency pause functionality
- Multi-signature governance for critical operations

## License

MIT License - see [LICENSE](./LICENSE) for details

## Support

- Technical documentation in `docs/` folder
- Usage examples in `scripts/`
- Issues and questions through GitHub