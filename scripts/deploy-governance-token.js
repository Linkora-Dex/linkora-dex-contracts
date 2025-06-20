const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

async function getTokenConfig() {
    const configPath = './config/token-config.json';

    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    return {
        name: "Custom DEX Token",
        symbol: "CDEX",
        maxSupply: "10000000",
        website: "https://mydex.example.com",
        exchangeName: "My Custom DEX",
        governance: {
            proposalThreshold: "10000",
            votingPeriod: 604800,
            executionDelay: 172800,
            quorum: "100000"
        },
        discounts: [
            { threshold: "1000", discount: 200, name: "Bronze", premium: false },
            { threshold: "10000", discount: 500, name: "Silver", premium: false },
            { threshold: "50000", discount: 1000, name: "Gold", premium: true }
        ]
    };
}

async function deployGovernanceToken() {
    console.log("🚀 Deploying Governance Token...");

    const config = await getTokenConfig();
    const [deployer] = await ethers.getSigners();

    console.log("📋 Configuration:");
    console.log(`Name: ${config.name}`);
    console.log(`Symbol: ${config.symbol}`);
    console.log(`Max Supply: ${config.maxSupply}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Network: ${network.name}`);

    console.log("🎯 Deploying governance token...");

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    const token = await upgrades.deployProxy(
        GovernanceToken,
        [config.name, config.symbol, deployer.address],
        {
            initializer: 'initialize'
        }
    );
    await token.waitForDeployment();

    const tokenAddress = await token.getAddress();
    console.log(`✅ Token deployed: ${tokenAddress}`);

    console.log("⚙️ Configuring token...");

    if (config.governance) {
        await token.updateGovernanceParams(
            ethers.parseEther(config.governance.proposalThreshold),
            config.governance.votingPeriod,
            config.governance.executionDelay,
            ethers.parseEther(config.governance.quorum)
        );
        console.log("📊 Governance parameters configured");
    }

    const upgradeableConfigPath = './config/anvil_upgradeable-config.json';
    if (fs.existsSync(upgradeableConfigPath)) {
        const upgradeableConfig = JSON.parse(fs.readFileSync(upgradeableConfigPath, 'utf8'));

        if (upgradeableConfig.contracts.Router) {
            try {
                const router = await ethers.getContractAt("RouterUpgradeable", upgradeableConfig.contracts.Router);
                await router.setGovernanceToken(tokenAddress);
                console.log(`🔗 Token integrated with Router: ${upgradeableConfig.contracts.Router}`);
            } catch (error) {
                console.log("⚠️ Router integration failed:", error.message);
            }
        }
    }

    const maxSupplyWithDecimals = ethers.parseEther(config.maxSupply);
    const initialMint = maxSupplyWithDecimals / BigInt(10);
    await token.mint(deployer.address, initialMint);
    console.log(`🎁 Initial mint: ${ethers.formatEther(initialMint)} tokens to deployer`);

    const tokenConfig = {
        name: config.name,
        symbol: config.symbol,
        address: tokenAddress,
        deployer: deployer.address,
        network: network.name,
        maxSupply: config.maxSupply,
        initialMint: ethers.formatEther(initialMint),
        exchangeName: config.exchangeName,
        website: config.website,
        governance: config.governance,
        discounts: config.discounts,
        deployedAt: new Date().toISOString(),
        contractType: "GovernanceToken"
    };

    const tokenConfigPath = `./config/${config.symbol.toLowerCase()}-token-config.json`;
    fs.writeFileSync(tokenConfigPath, JSON.stringify(tokenConfig, null, 2));

    console.log("\n🎉 Deployment completed successfully!");
    console.log("📁 Configuration file:");
    console.log(`  - Token: ${tokenConfigPath}`);

    console.log("\n📊 Token Summary:");
    console.log(`  Name: ${config.name}`);
    console.log(`  Symbol: ${config.symbol}`);
    console.log(`  Address: ${tokenAddress}`);
    console.log(`  Max Supply: ${config.maxSupply}`);
    console.log(`  Initial Supply: ${ethers.formatEther(initialMint)}`);

    console.log("\n🔧 Next Steps:");
    console.log("1. Set up initial token distribution");
    console.log("2. Configure fee distribution parameters");
    console.log("3. Test governance features");
    console.log("4. Distribute tokens to early users");
    console.log(`5. Update your frontend to use token: ${tokenAddress}`);

    return {
        tokenAddress,
        config: tokenConfig
    };
}

async function setupInitialDistribution() {
    console.log("\n💰 Setting up initial token distribution...");

    const config = await getTokenConfig();
    const tokenConfigPath = `./config/${config.symbol.toLowerCase()}-token-config.json`;

    if (!fs.existsSync(tokenConfigPath)) {
        console.log("❌ Token not deployed yet. Run deployment first.");
        return;
    }

    const tokenConfig = JSON.parse(fs.readFileSync(tokenConfigPath, 'utf8'));
    const [deployer] = await ethers.getSigners();

    const token = await ethers.getContractAt("GovernanceToken", tokenConfig.address);

    const maxSupply = ethers.parseEther(tokenConfig.maxSupply);
    const distribution = {
        users: {
            percent: 40,
            amount: maxSupply * BigInt(40) / BigInt(100),
            description: "Trading rewards and liquidity mining"
        },
        team: {
            percent: 20,
            amount: maxSupply * BigInt(20) / BigInt(100),
            description: "Team allocation with vesting"
        },
        liquidity: {
            percent: 20,
            amount: maxSupply * BigInt(20) / BigInt(100),
            description: "Initial liquidity bootstrap"
        },
        reserve: {
            percent: 15,
            amount: maxSupply * BigInt(15) / BigInt(100),
            description: "Platform treasury reserve"
        },
        partnerships: {
            percent: 5,
            amount: maxSupply * BigInt(5) / BigInt(100),
            description: "Strategic partnerships"
        }
    };

    console.log("📊 Recommended distribution plan:");
    Object.entries(distribution).forEach(([key, value]) => {
        console.log(`  ${key}: ${value.percent}% (${ethers.formatEther(value.amount)} tokens) - ${value.description}`);
    });

    console.log("\n💡 Note: This is a template distribution plan.");
    console.log("Customize addresses and allocations for your specific needs.");
    console.log("Use the governance/setup-distribution.js script for actual distribution.");

    return distribution;
}

async function verifyDeployment() {
    console.log("\n🔍 Verifying deployment...");

    const config = await getTokenConfig();
    const tokenConfigPath = `./config/${config.symbol.toLowerCase()}-token-config.json`;

    if (!fs.existsSync(tokenConfigPath)) {
        console.log("❌ Token config not found.");
        return false;
    }

    const tokenConfig = JSON.parse(fs.readFileSync(tokenConfigPath, 'utf8'));

    try {
        const token = await ethers.getContractAt("GovernanceToken", tokenConfig.address);

        const name = await token.name();
        const symbol = await token.symbol();
        const totalSupply = await token.totalSupply();
        const maxSupply = await token.MAX_SUPPLY();

        console.log("✅ Token verification:");
        console.log(`  Name: ${name}`);
        console.log(`  Symbol: ${symbol}`);
        console.log(`  Total Supply: ${ethers.formatEther(totalSupply)}`);
        console.log(`  Max Supply: ${ethers.formatEther(maxSupply)}`);

        const proposalThreshold = await token.proposalThreshold();
        const votingPeriod = await token.votingPeriod();

        console.log("\n✅ Governance verification:");
        console.log(`  Proposal Threshold: ${ethers.formatEther(proposalThreshold)} tokens`);
        console.log(`  Voting Period: ${votingPeriod / 86400n} days`);

        console.log("\n✅ Discount system verification:");
        const testDiscounts = [
            ethers.parseEther("500"),
            ethers.parseEther("1000"),
            ethers.parseEther("10000"),
            ethers.parseEther("50000")
        ];

        for (const amount of testDiscounts) {
            const testUser = ethers.Wallet.createRandom().address;
            const discount = await token.getTradingDiscount(testUser);
            console.log(`    ${ethers.formatEther(amount)} tokens: ${Number(discount) / 100}% discount`);
        }

        console.log("\n🎯 Deployment verification completed successfully!");
        return true;

    } catch (error) {
        console.log("❌ Verification failed:", error.message);
        return false;
    }
}

async function main() {
    const command = process.env.DEPLOY_COMMAND || 'deploy';

    switch (command) {
        case 'deploy':
            await deployGovernanceToken();
            break;

        case 'setup-distribution':
            await setupInitialDistribution();
            break;

        case 'verify':
            await verifyDeployment();
            break;

        default:
            console.log("🚀 Governance Token Deployment");
            console.log("\nAvailable commands:");
            console.log("  deploy             - Deploy new governance token");
            console.log("  setup-distribution - Show distribution template");
            console.log("  verify            - Verify deployment");
            console.log("\nUsage:");
            console.log("  DEPLOY_COMMAND=deploy npx hardhat run scripts/deploy-governance-token.js");
            console.log("  DEPLOY_COMMAND=verify npx hardhat run scripts/deploy-governance-token.js");
            break;
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Script failed:", error);
            process.exit(1);
        });
}

module.exports = {
    deployGovernanceToken,
    setupInitialDistribution,
    verifyDeployment
};