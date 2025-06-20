const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

async function loadConfig(configPath = './config/deployment-config.json') {
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function getGasSettings(config) {
    try {
        const feeData = await ethers.provider.getFeeData();
        let gasPrice = BigInt(config.gas.gasPrice);

        if (feeData.gasPrice) {
            gasPrice = feeData.gasPrice * BigInt(120) / BigInt(100);
        } else if (feeData.maxFeePerGas) {
            gasPrice = feeData.maxFeePerGas;
        }

        console.log(`Using gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

        return {
            gasPrice: gasPrice,
            gasLimit: config.gas.gasLimit
        };
    } catch (error) {
        console.log("Fallback gas settings");
        return {
            gasPrice: BigInt(config.gas.fallbackGasPrice),
            gasLimit: config.gas.gasLimit
        };
    }
}

async function deployLibraries(gasSettings) {
    console.log("=== Deploying Libraries ===");

    const PnLCalculator = await ethers.getContractFactory("PnLCalculator");
    const pnlCalculator = await PnLCalculator.deploy(gasSettings);
    await pnlCalculator.waitForDeployment();
    console.log("PnLCalculator deployed to:", pnlCalculator.target);

    const PoolLibrary = await ethers.getContractFactory("PoolLibrary");
    const poolLibrary = await PoolLibrary.deploy(gasSettings);
    await poolLibrary.waitForDeployment();
    console.log("PoolLibrary deployed to:", poolLibrary.target);

    const LiquidityLibrary = await ethers.getContractFactory("LiquidityLibrary");
    const liquidityLibrary = await LiquidityLibrary.deploy(gasSettings);
    await liquidityLibrary.waitForDeployment();
    console.log("LiquidityLibrary deployed to:", liquidityLibrary.target);

    const TradingLibrary = await ethers.getContractFactory("TradingLibrary");
    const tradingLibrary = await TradingLibrary.deploy(gasSettings);
    await tradingLibrary.waitForDeployment();
    console.log("TradingLibrary deployed to:", tradingLibrary.target);

    const RouterLibrary = await ethers.getContractFactory("RouterLibrary");
    const routerLibrary = await RouterLibrary.deploy(gasSettings);
    await routerLibrary.waitForDeployment();
    console.log("RouterLibrary deployed to:", routerLibrary.target);

    return {
        pnlCalculator,
        poolLibrary,
        liquidityLibrary,
        tradingLibrary,
        routerLibrary
    };
}

async function deploySecurityContracts(gasSettings) {
    console.log("=== Deploying Security Contracts ===");

    const ReentrancyGuard = await ethers.getContractFactory("ReentrancyGuard");
    const reentrancyGuard = await ReentrancyGuard.deploy(gasSettings);
    await reentrancyGuard.waitForDeployment();
    console.log("ReentrancyGuard deployed to:", reentrancyGuard.target);

    const AccessControlContract = await ethers.getContractFactory("AccessControlContract");
    const accessControl = await AccessControlContract.deploy(gasSettings);
    await accessControl.waitForDeployment();
    console.log("AccessControl deployed to:", accessControl.target);

    return {
        reentrancyGuard,
        accessControl
    };
}

async function deployUpgradeableContracts(libraries, gasSettings) {
    console.log("=== Deploying Upgradeable Core Contracts ===");

    console.log("📊 Deploying Oracle...");
    const OracleUpgradeable = await ethers.getContractFactory("OracleUpgradeable");
    const oracle = await upgrades.deployProxy(OracleUpgradeable, [], {
        initializer: 'initialize',
        gasLimit: gasSettings.gasLimit
    });
    await oracle.waitForDeployment();
    console.log("Oracle deployed to:", await oracle.getAddress());

    console.log("💧 Deploying Pool...");
    const PoolUpgradeable = await ethers.getContractFactory("PoolUpgradeable", {
        libraries: {
            PoolLibrary: libraries.poolLibrary.target,
            LiquidityLibrary: libraries.liquidityLibrary.target,
        },
    });
    const pool = await upgrades.deployProxy(PoolUpgradeable, [], {
        initializer: 'initialize',
        gasLimit: gasSettings.gasLimit,
        unsafeAllowLinkedLibraries: true
    });
    await pool.waitForDeployment();
    console.log("Pool deployed to:", await pool.getAddress());

    console.log("📈 Deploying Trading...");
    const TradingUpgradeable = await ethers.getContractFactory("TradingUpgradeable", {
        libraries: {
            TradingLibrary: libraries.tradingLibrary.target,
        },
    });
    const trading = await upgrades.deployProxy(
        TradingUpgradeable,
        [await pool.getAddress(), await oracle.getAddress()],
        {
            initializer: 'initialize',
            gasLimit: gasSettings.gasLimit,
            unsafeAllowLinkedLibraries: true
        }
    );
    await trading.waitForDeployment();
    console.log("Trading deployed to:", await trading.getAddress());

    console.log("🎯 Deploying Router...");
    const RouterUpgradeable = await ethers.getContractFactory("RouterUpgradeable", {
        libraries: {
            RouterLibrary: libraries.routerLibrary.target,
        },
    });
    const router = await upgrades.deployProxy(
        RouterUpgradeable,
        [
            await pool.getAddress(),
            await trading.getAddress(),
            await oracle.getAddress()
        ],
        {
            initializer: 'initialize',
            gasLimit: gasSettings.gasLimit,
            unsafeAllowLinkedLibraries: true
        }
    );
    await router.waitForDeployment();
    console.log("Router deployed to:", await router.getAddress());

    const TradingEvents = await ethers.getContractFactory("TradingEvents");
    const tradingEvents = await TradingEvents.deploy(gasSettings);
    await tradingEvents.waitForDeployment();
    console.log("TradingEvents deployed to:", tradingEvents.target);

    return {
        oracle,
        pool,
        trading,
        router,
        tradingEvents
    };
}

async function setupRoles(contracts, config, gasSettings) {
    console.log("=== Setting Up Permissions ===");

    const { oracle, pool, trading, router, tradingEvents } = contracts;
    const [deployer] = await ethers.getSigners();
    const keeperAddress = config.accounts.keeper;

    const KEEPER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("KEEPER_ROLE"));
    const DEFAULT_ADMIN_ROLE = ethers.id("DEFAULT_ADMIN_ROLE");

    await oracle.grantRole(KEEPER_ROLE, keeperAddress, gasSettings);
    await oracle.grantRole(KEEPER_ROLE, await router.getAddress(), gasSettings);
    await oracle.grantRole(DEFAULT_ADMIN_ROLE, deployer.address, gasSettings);
    console.log("Oracle permissions granted");

    await pool.grantRole(KEEPER_ROLE, await router.getAddress(), gasSettings);
    await pool.grantRole(KEEPER_ROLE, await trading.getAddress(), gasSettings);
    await pool.grantRole(DEFAULT_ADMIN_ROLE, deployer.address, gasSettings);
    console.log("Pool permissions granted");

    await router.grantRole(KEEPER_ROLE, await trading.getAddress(), gasSettings);
    await router.grantRole(KEEPER_ROLE, keeperAddress, gasSettings);
    await router.grantRole(DEFAULT_ADMIN_ROLE, deployer.address, gasSettings);
    console.log("Router permissions granted");

    await trading.grantRole(KEEPER_ROLE, await router.getAddress(), gasSettings);
    await trading.grantRole(KEEPER_ROLE, keeperAddress, gasSettings);
    await trading.grantRole(DEFAULT_ADMIN_ROLE, deployer.address, gasSettings);
    console.log("Trading permissions granted");

    await tradingEvents.grantRole(KEEPER_ROLE, keeperAddress, gasSettings);
    console.log("TradingEvents permissions granted");

    console.log("All permissions configured");
}

async function saveConfig(config, libraries, securityContracts, upgradeableContracts) {
    if (config.deployment.createConfigDir && !fs.existsSync('./config')) {
        fs.mkdirSync('./config');
        console.log("Config directory created");
    }

    const deploymentConfig = {
        network: config.network,
        prefix: config.prefix,
        architecture: "upgradeable-router-centric",
        timestamp: new Date().toISOString(),
        contracts: {
            AccessControl: securityContracts.accessControl.target,
            ReentrancyGuard: securityContracts.reentrancyGuard.target,
            PnLCalculator: libraries.pnlCalculator.target,
            PoolLibrary: libraries.poolLibrary.target,
            LiquidityLibrary: libraries.liquidityLibrary.target,
            TradingLibrary: libraries.tradingLibrary.target,
            RouterLibrary: libraries.routerLibrary.target,
            Oracle: await upgradeableContracts.oracle.getAddress(),
            Pool: await upgradeableContracts.pool.getAddress(),
            Trading: await upgradeableContracts.trading.getAddress(),
            Router: await upgradeableContracts.router.getAddress(),
            TradingEvents: upgradeableContracts.tradingEvents.target
        },
        proxies: {
            OracleProxy: await upgradeableContracts.oracle.getAddress(),
            PoolProxy: await upgradeableContracts.pool.getAddress(),
            TradingProxy: await upgradeableContracts.trading.getAddress(),
            RouterProxy: await upgradeableContracts.router.getAddress()
        },
        implementations: {
            OracleImpl: await upgrades.erc1967.getImplementationAddress(await upgradeableContracts.oracle.getAddress()),
            PoolImpl: await upgrades.erc1967.getImplementationAddress(await upgradeableContracts.pool.getAddress()),
            TradingImpl: await upgrades.erc1967.getImplementationAddress(await upgradeableContracts.trading.getAddress()),
            RouterImpl: await upgrades.erc1967.getImplementationAddress(await upgradeableContracts.router.getAddress())
        },
        accounts: config.accounts,
        features: config.features,
        step: "infrastructure"
    };

    const configPath = `./config/${config.prefix}infrastructure-config.json`;
    fs.writeFileSync(configPath, JSON.stringify(deploymentConfig, null, 2));
    console.log(`Infrastructure configuration saved to ${configPath}`);

    return deploymentConfig;
}

async function main(configPath) {
    const config = await loadConfig(configPath);

    console.log("=== Infrastructure Deployment ===");
    console.log("Network:", config.network.name);
    console.log("Chain ID:", config.network.chainId);
    console.log("RPC URL:", config.network.url);
    console.log("Prefix:", config.prefix);

    const gasSettings = await getGasSettings(config);

    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("Keeper:", config.accounts.keeper);

    const libraries = await deployLibraries(gasSettings);
    const securityContracts = await deploySecurityContracts(gasSettings);
    const upgradeableContracts = await deployUpgradeableContracts(libraries, gasSettings);

    await setupRoles(upgradeableContracts, config, gasSettings);

    const deploymentConfig = await saveConfig(config, libraries, securityContracts, upgradeableContracts);

    console.log("\n=== Infrastructure Deployment Complete ===");
    console.log("Next step: Run setup-tokens script");

    return {
        config: deploymentConfig,
        contracts: {
            ...libraries,
            ...securityContracts,
            ...upgradeableContracts
        }
    };
}

if (require.main === module) {
    const configPath = process.argv[2] || './config/deployment-config.json';
    main(configPath)
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("Infrastructure deployment failed:", error);
            process.exit(1);
        });
}

module.exports = main;