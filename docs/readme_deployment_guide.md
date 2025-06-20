# Deployment Guide

Step-by-step guide for deploying Linkora DEX with upgradeable architecture.

## Prerequisites

### System Requirements
- Node.js 18+
- NPM or Yarn
- Git
- 8GB RAM minimum

### Development Tools
```bash
npm install -g hardhat
npm install -g @openzeppelin/hardhat-upgrades
```

## Quick Start

### 1. Installing Dependencies
```bash
git clone <repository>
cd linkora-dex-contracts
npm install
```

### 2. Compiling Contracts
```bash
npm run compile
```

### 3. Running Local Network
```bash
npm run node
```

### 4. Full Deployment
```bash
npm run prod:deploy:config
```

### 5. Running Services
```bash
# New terminals
npm run price-generator-anvil
npm run keeper:upgradeable-anvil
npm run trading-demo-anvil
```

## Phased Deployment

### Phase 1 - Infrastructure
```bash
npm run prod:infrastructure
```

**Deploys**
- AccessControl and ReentrancyGuard
- Libraries (PoolLibrary, TradingLibrary, RouterLibrary)
- Upgradeable contracts (Oracle, Pool, Trading, Router)
- Role and permission setup

**Result** `config/anvil_infrastructure-config.json`

### Phase 2 - Tokens and Prices
```bash
npm run prod:tokens
```

**Creates**
- Test ERC20 tokens (CAPY, AXOL, QUOK, PANG, NARW)
- Token minting to users
- Setting initial prices through Oracle

**Result** `config/anvil_tokens-config.json`

### Phase 3 - Liquidity
```bash
npm run prod:pools
```

**Adds**
- Initial ETH liquidity (100 ETH)
- Token liquidity proportional to prices
- Basic functionality verification

**Result** `config/anvil_final-config.json`

## Governance Token (optional)

### Deploying Governance Token
```bash
npm run deploy:governance-token
```

### Parameter Configuration
Edit `config/token-config.json`
```json
{
  "name": "Your DEX Token",
  "symbol": "YDT", 
  "maxSupply": "10000000",
  "governance": {
    "proposalThreshold": "10000",
    "votingPeriod": 604800,
    "executionDelay": 172800,
    "quorum": "100000"
  }
}
```

### Token Verification
```bash
npm run verify:governance-token
```

## Network Configuration

### Anvil (local development)
```javascript
// hardhat.config.js
anvil: {
  url: "http://127.0.0.1:8545",
  chainId: 31337,
  accounts: [
    process.env.ANVIL_DEPLOYER_PRIVATE_KEY,
    process.env.ANVIL_KEEPER_PRIVATE_KEY
  ]
}
```

### .env Setup
```bash
ANVIL_DEPLOYER_PRIVATE_KEY=your_private_key_here
ANVIL_KEEPER_PRIVATE_KEY=your_private_key_here
```

### Configuration Setup
Edit `config/deployment-config.json`
```json
{
  "network": {
    "name": "anvil",
    "chainId": 31337,
    "url": "http://127.0.0.1:8545"
  },
  "accounts": {
    "deployer": "0xbA5C24084c98A42974f324F377c87Ad44900648E",
    "keeper": "0x3a683E750b98A372f7d7638532afe8877fE3FF2D"
  },
  "tokens": [...],
  "liquidity": {
    "ethAmount": "100",
    "tokenMultiplier": 1
  }
}
```

## Docker Deployment

### Full Development Environment
```bash
./docker-run.sh full
```

### Individual Components
```bash
./docker-run.sh start    # Node only
./docker-run.sh deploy   # Contract deployment  
./docker-run.sh services # Automation
```

## System Management

### Emergency Commands
```bash
npm run pause           # Stop trading
npm run unpause         # Resume trading
npm run cancel-all      # Cancel all orders
```

### Monitoring
```bash
npm run check-balance   # Check balances
npm run price-diagnostics # Oracle diagnostics
npm run list-orders     # List active orders
```

### Testing
```bash
npm run test:integration        # Integration tests
npm run test:full-upgradeable   # Full testing
npm run verify:upgrades         # Verify upgrades
```

## Troubleshooting

### Common Issues

**"Price change too large" Error**
```bash
# Reduce volatility in priceGenerator.js
VOLATILITY_CONFIG.DEFAULT_VOLATILITY = 0.01
```

**Nonce Error**
```bash
# Increase delays in configuration
INDIVIDUAL_UPDATE_DELAY: 2000
```

**Insufficient Gas**
```bash
# Increase gas limit in hardhat.config.js
gasLimit: 30000000
```

### Diagnostics

**System Status Check**
```bash
# Pause status
npm run check-balance

# Access rights
npm run verify:upgrades

# Oracle state
npm run price-diagnostics
```

**Recovery After Errors**
```bash
# Clean and redeploy
npm run clean
npm run compile
npm run prod:deploy:config
```

## Security

### Keys and Accounts
- Use separate keys for deployer and keeper
- Set up multisig for production
- Regularly rotate keeper keys

### Monitoring
- Monitor price change sizes
- Control trading volumes
- Set up alerts for critical events

### Updates
- Test all updates on testnet
- Use timelock for critical changes
- Keep state backups

## Production Checklist

### Before Launch
- [ ] Security audit conducted
- [ ] All use cases tested
- [ ] Monitoring and alerts configured
- [ ] Emergency response procedures prepared
- [ ] External service compatibility verified

### After Launch
- [ ] Gas cost monitoring
- [ ] Keeper performance tracking
- [ ] Trading activity analysis
- [ ] Regular security checks

Full documentation available in `docs/` directory.