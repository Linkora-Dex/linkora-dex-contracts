const { ethers } = require("hardhat");
const fs = require('fs');

async function loadConfig(configPath = './config/deployment-config.json') {
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function loadInfrastructureConfig(config) {
    const infraPath = `./config/${config.prefix}infrastructure-config.json`;
    if (!fs.existsSync(infraPath)) {
        throw new Error(`Infrastructure config not found: ${infraPath}. Run infrastructure deployment first.`);
    }
    return JSON.parse(fs.readFileSync(infraPath, 'utf8'));
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

async function deployTokens(config, gasSettings) {
    console.log("=== Creating Tokens ===");

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const deployedTokens = {};

    for (const tokenConfig of config.tokens) {
        const token = await MockERC20.deploy(
            tokenConfig.name,
            tokenConfig.symbol,
            tokenConfig.decimals,
            1000000,
            gasSettings
        );
        await token.waitForDeployment();

        deployedTokens[tokenConfig.symbol] = {
            address: token.target,
            contract: token,
            ...tokenConfig
        };

        console.log(`${tokenConfig.symbol} deployed to:`, token.target);
    }

    return deployedTokens;
}

async function mintTokens(deployedTokens, config, gasSettings) {
    console.log("=== Minting Tokens ===");

    const [deployer] = await ethers.getSigners();

    for (const [symbol, tokenData] of Object.entries(deployedTokens)) {
        const mintAmount = ethers.parseUnits(tokenData.mintAmount, tokenData.decimals);

        await tokenData.contract.mint(deployer.address, mintAmount, gasSettings);
        console.log(`Minted ${tokenData.mintAmount} ${symbol} to deployer`);
    }

    console.log("Token minting completed");
}

async function setPrices(deployedTokens, infraConfig, config, gasSettings) {
    console.log("=== Setting Initial Prices ===");

    const router = await ethers.getContractAt("RouterUpgradeable", infraConfig.contracts.Router);
    const keeper = await ethers.getImpersonatedSigner(config.accounts.keeper);

    const ethPrice = ethers.parseEther(config.prices.ETH);
    await router.connect(keeper).updateOraclePrice(ethers.ZeroAddress, ethPrice, gasSettings);
    console.log(`ETH price set to $${config.prices.ETH}`);

    for (const [symbol, tokenData] of Object.entries(deployedTokens)) {
        const price = ethers.parseEther(tokenData.initialPrice);
        await router.connect(keeper).updateOraclePrice(tokenData.address, price, gasSettings);
        console.log(`${symbol} price set to $${tokenData.initialPrice}`);
    }

    console.log("Price setting completed");
}

async function saveConfig(config, infraConfig, deployedTokens) {
    const tokenConfig = {
        ...infraConfig,
        tokens: {},
        initialPrices: {
            ETH: config.prices.ETH
        },
        step: "tokens",
        timestamp: new Date().toISOString()
    };

    for (const [symbol, tokenData] of Object.entries(deployedTokens)) {
        tokenConfig.tokens[symbol] = {
            address: tokenData.address,
            decimals: tokenData.decimals,
            initialPrice: tokenData.initialPrice,
            mintAmount: tokenData.mintAmount
        };
        tokenConfig.initialPrices[symbol] = tokenData.initialPrice;
    }

    const configPath = `./config/${config.prefix}tokens-config.json`;
    fs.writeFileSync(configPath, JSON.stringify(tokenConfig, null, 2));
    console.log(`Token configuration saved to ${configPath}`);

    return tokenConfig;
}

async function main(configPath) {
    const config = await loadConfig(configPath);
    const infraConfig = await loadInfrastructureConfig(config);

    console.log("=== Token Setup ===");
    console.log("Network:", config.network.name);
    console.log("Prefix:", config.prefix);

    const gasSettings = await getGasSettings(config);

    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);

    const deployedTokens = await deployTokens(config, gasSettings);
    await mintTokens(deployedTokens, config, gasSettings);
    await setPrices(deployedTokens, infraConfig, config, gasSettings);

    const tokenConfig = await saveConfig(config, infraConfig, deployedTokens);

    console.log("\n=== Token Setup Complete ===");
    console.log("Tokens deployed:", Object.keys(deployedTokens).length);
    console.log("Next step: Run create-pools script");

    return {
        config: tokenConfig,
        tokens: deployedTokens
    };
}

if (require.main === module) {
    const configPath = process.argv[2] || './config/deployment-config.json';
    main(configPath)
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Token setup failed:", error);
            process.exit(1);
        });
}

module.exports = main;