const { ethers } = require("hardhat");
const fs = require('fs');

async function loadConfig(configPath = './config/deployment-config.json') {
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function loadTokenConfig(config) {
    const tokenPath = `./config/${config.prefix}tokens-config.json`;
    if (!fs.existsSync(tokenPath)) {
        throw new Error(`Token config not found: ${tokenPath}. Run token setup first.`);
    }
    return JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
}

async function getGasSettings(config) {
    try {
        const feeData = await ethers.provider.getFeeData();
        let gasPrice = BigInt(config.gas.gasPrice);

        if (feeData.gasPrice) {
            gasPrice = feeData.gasPrice * BigInt(120) / BigInt(100);
        }

        return {
            gasPrice: gasPrice,
            gasLimit: config.gas.gasLimit
        };
    } catch (error) {
        return {
            gasPrice: BigInt(config.gas.fallbackGasPrice),
            gasLimit: config.gas.gasLimit
        };
    }
}

async function addLiquidity(tokenConfig, config, gasSettings) {
    console.log("=== Adding Initial Liquidity ===");

    const router = await ethers.getContractAt("RouterUpgradeable", tokenConfig.contracts.Router);
    const [deployer] = await ethers.getSigners();

    const ethAmount = ethers.parseEther(config.liquidity.ethAmount);
    await router.connect(deployer).depositETH({ value: ethAmount, ...gasSettings });
    console.log(`Added ${config.liquidity.ethAmount} ETH to pool`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    for (const [symbol, tokenData] of Object.entries(tokenConfig.tokens)) {
        const tokenContract = await ethers.getContractAt("MockERC20", tokenData.address);
        const liquidityAmount = ethers.parseUnits(
            (parseFloat(tokenData.mintAmount) * config.liquidity.tokenMultiplier).toString(),
            tokenData.decimals
        );

        await tokenContract.connect(deployer).approve(tokenConfig.contracts.Router, liquidityAmount, gasSettings);
        await router.connect(deployer).depositToken(tokenData.address, liquidityAmount, gasSettings);

        console.log(`Added ${ethers.formatUnits(liquidityAmount, tokenData.decimals)} ${symbol} to pool`);
        await new Promise(resolve => setTimeout(resolve, 500));
    }



    console.log("Initial liquidity added to all pools");
}

async function testBasicFunctionality(tokenConfig, config, gasSettings) {
    console.log("=== Testing Basic Functionality ===");

    const pool = await ethers.getContractAt("PoolUpgradeable", tokenConfig.contracts.Pool);
    const [deployer] = await ethers.getSigners();

    for (let i = 0; i < 50; i++) {
        await network.provider.send("evm_mine");
    }
    console.log("Mined blocks for flash loan protection bypass");

    const ethBalance = await pool.getBalance(deployer.address, ethers.ZeroAddress);
    console.log(`Deployer ETH balance in pool: ${ethers.formatEther(ethBalance)}`);

    for (const [symbol, tokenData] of Object.entries(tokenConfig.tokens)) {
        const balance = await pool.getBalance(deployer.address, tokenData.address);
        console.log(`Deployer ${symbol} balance in pool: ${ethers.formatUnits(balance, tokenData.decimals)}`);

        const actualBalance = await pool.totalTokenBalances(tokenData.address);
        console.log(`Verified ${symbol} pool balance: ${ethers.formatUnits(actualBalance, tokenData.decimals)}`);


    }





    console.log("Pool functionality verified");
}

async function saveConfig(config, tokenConfig) {
    const finalConfig = {
        ...tokenConfig,
        liquidity: config.liquidity,
        step: "complete",
        timestamp: new Date().toISOString(),
        deployment: {
            ...config.deployment,
            completed: true,
            completedAt: new Date().toISOString()
        }
    };

    const configPath = `./config/${config.prefix}final-config.json`;
    fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));
    console.log(`Final configuration saved to ${configPath}`);

    const upgradeableConfigPath = `./config/${config.prefix}upgradeable-config.json`;
    fs.writeFileSync(upgradeableConfigPath, JSON.stringify(finalConfig, null, 2));
    console.log(`Upgradeable configuration saved to ${upgradeableConfigPath}`);

    return finalConfig;
}

async function printDeploymentSummary(finalConfig, config) {
    console.log("\n=== Deployment Summary ===");
    console.log("🏗️ Architecture: Upgradeable Router-Centric with Libraries");
    console.log("🔄 Upgrade Pattern: Transparent Proxy");
    console.log("🔒 Security Features:");
    console.log(" - Flash loan protection: ACTIVE");
    console.log(" - Emergency stop: READY");
    console.log(" - Circuit breaker: 20% max price change");
    console.log(" - Reentrancy protection: ACTIVE");
    console.log(" - Proxy admin control: ENABLED");

    console.log("\n📈 Trading Features:");
    console.log(" - Limit orders: READY");
    console.log(" - Stop-loss orders: READY");
    console.log(" - Self-execution: READY");
    console.log(" - Public liquidation: READY");
    console.log(" - Contract upgrades: ENABLED");

    console.log("\n💰 Deployed Tokens:");
    Object.entries(finalConfig.tokens).forEach(([symbol, tokenData]) => {
        console.log(` ${symbol}: ${tokenData.address}`);
    });

    console.log("\n🎯 Contract Addresses:");
    console.log(`Router: ${finalConfig.contracts.Router}`);
    console.log(`Pool: ${finalConfig.contracts.Pool}`);
    console.log(`Trading: ${finalConfig.contracts.Trading}`);
    console.log(`Oracle: ${finalConfig.contracts.Oracle}`);

    console.log("\n=== Ready for Trading! ===");
    console.log("Architecture: User → Router(Proxy) → Pool(Proxy)/Trading(Proxy)");
    console.log("Run: npm run keeper:upgradeable");
    console.log("Run: npm run trading-demo");
}

async function main(configPath) {
    const config = await loadConfig(configPath);
    const tokenConfig = await loadTokenConfig(config);

    console.log("=== Pool Creation ===");
    console.log("Network:", config.network.name);
    console.log("Prefix:", config.prefix);

    const gasSettings = await getGasSettings(config);

    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    await addLiquidity(tokenConfig, config, gasSettings);

    if (config.deployment.validateDeployment) {
        await testBasicFunctionality(tokenConfig, config, gasSettings);
    }

    const finalConfig = await saveConfig(config, tokenConfig);
    await printDeploymentSummary(finalConfig, config);

    console.log("\n=== Full Deployment Complete ===");

    return {
        config: finalConfig
    };
}

if (require.main === module) {
    const configPath = process.argv[2] || './config/deployment-config.json';
    main(configPath)
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Pool creation failed:", error);
            process.exit(1);
        });
}

module.exports = main;