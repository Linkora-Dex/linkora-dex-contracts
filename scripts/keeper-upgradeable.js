const { ethers, network } = require("hardhat");
const fs = require('fs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function loadConfig() {
    const configPaths = [
        './config/anvil_upgradeable-config.json',
        './config/anvil_final-config.json',
        './config/upgradeable-config.json'
    ];

    for (const configPath of configPaths) {
        if (fs.existsSync(configPath)) {
            console.log(`📋 Loading config: ${configPath}`);
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    }

    throw new Error("❌ No config found. Run: npm run prod:deploy");
}

async function main() {
    console.log("🤖 Keeper Service with Upgradeable Router integration | Network:", network.name);

    const config = await loadConfig();
    const signers = await ethers.getSigners();

    if (signers.length < 2) {
        throw new Error("❌ Need at least 2 signers (deployer, keeper)");
    }

    const [deployer, keeper] = signers;
    console.log("👤 Deployer:", deployer.address);
    console.log("🔑 Keeper:", keeper.address);

    const router = await ethers.getContractAt("RouterUpgradeable", config.contracts.Router);

    let accessControl;
    try {
        if (config.contracts.AccessControl) {
            accessControl = await ethers.getContractAt("AccessControlContract", config.contracts.AccessControl);
        }
    } catch (error) {
        console.log("⚠️ AccessControl not available, using router for system status");
    }

    const tokens = {};
    for (const [symbol, tokenConfig] of Object.entries(config.tokens || {})) {
        tokens[symbol] = await ethers.getContractAt("MockERC20", tokenConfig.address);
    }

    console.log("✅ Upgradeable Keeper initialized");
    console.log(" Keeper address:", keeper.address);
    console.log(" Router proxy address:", router.target);
    console.log(" Architecture: Transparent Proxy");
    console.log(" Available tokens:", Object.keys(tokens).join(', '));

    const getPrice = async (tokenAddress) => {
        try {
            return await router.getPrice(tokenAddress);
        } catch (error) {
            console.log(`⚠️ Price fetch failed for ${tokenAddress}: ${error.message}`);
            return 0n;
        }
    };

    const checkSystemStatus = async () => {
        try {
            if (accessControl && typeof accessControl.emergencyStop === 'function') {
                return !(await accessControl.emergencyStop());
            }
            return true;
        } catch (error) {
            console.log(`⚠️ System status check failed: ${error.message}`);
            return true;
        }
    };

    const displayDiagnostics = async (phase) => {
        console.log(`\n┌─ UPGRADEABLE DIAGNOSTICS: ${phase} ────────────────────────┐`);

        try {
            const keeperBalance = await keeper.provider.getBalance(keeper.address);
            console.log(`│ Keeper ETH: ${ethers.formatEther(keeperBalance)} ETH`);

            const keeperPoolBalance = await router.getBalance(keeper.address, ethers.ZeroAddress);
            console.log(`│ Keeper in pool: ${ethers.formatEther(keeperPoolBalance)} ETH`);

            try {
                const routerVersion = await router.version();
                console.log(`│ Router version: ${routerVersion}`);
            } catch (error) {
                console.log(`│ Router version: N/A`);
            }

            const balances = [];
            for (const [symbol, tokenConfig] of Object.entries(config.tokens || {})) {
                const balance = await router.getBalance(keeper.address, tokenConfig.address);
                const formatted = ethers.formatUnits(balance, tokenConfig.decimals);
                if (parseFloat(formatted) > 0) {
                    balances.push(`${symbol}: ${parseFloat(formatted).toFixed(2)}`);
                }
            }
            if (balances.length > 0) {
                console.log(`│ Token balances: ${balances.join(' | ')}`);
            }
        } catch (error) {
            console.log(`│ ❌ Diagnostics error: ${error.message}`);
        }

        console.log("└────────────────────────────────────────────────────────────────┘");
    };

    await displayDiagnostics("INITIALIZATION");

    console.log("\n🚀 Upgradeable Keeper monitoring started");
    console.log("🎯 Checking orders every 5s, positions every 10s");
    console.log("🔄 All operations via Upgradeable Router proxy");
    console.log("⏹️ Press Ctrl+C to stop\n");

    let cycleCounter = 0;

    while (true) {
        try {
            cycleCounter++;

            const isOperational = await checkSystemStatus();
            if (!isOperational) {
                console.log("🔴 System paused - waiting 10s...");
                await sleep(10000);
                continue;
            }

            const nextOrderId = await router.getNextOrderId();
            const totalOrders = Number(nextOrderId) - 1;

            if (totalOrders > 0) {
                console.log(`🔍 Cycle ${cycleCounter}: Checking ${totalOrders} orders (Upgradeable)`);

                let executedCount = 0;
                let skippedCount = 0;
                for (let orderId = 1; orderId <= totalOrders; orderId++) {
                    try {
                        const order = await router.getOrder(orderId);
                        if (order.executed) continue;

                        const shouldExecute = await router.shouldExecuteOrder(orderId);
                        if (shouldExecute) {
                            console.log(`🎯 Order ${orderId} (${order.orderType === 0 ? 'LIMIT' : 'STOP_LOSS'}): Conditions met - executing via proxy`);

                            try {
                                const executionTx = await router.connect(keeper).selfExecuteOrder(orderId);
                                await executionTx.wait();

                                console.log(`✅ Order ${orderId} executed successfully via upgradeable contracts`);
                                executedCount++;

                                await displayDiagnostics(`ORDER ${orderId} EXECUTED`);
                            } catch (executionError) {
                                if (executionError.message.includes('Slippage too high')) {
                                    console.log(`⚠️ Order ${orderId}: Slippage protection triggered`);
                                } else {
                                    console.log(`❌ Execution failed for order ${orderId}: ${executionError.message}`);
                                }
                            }
                        }
                    } catch (orderError) {
                        console.log(`⚠️ Error checking order ${orderId}: ${orderError.message}`);
                    }
                }

                if (executedCount > 0 || skippedCount > 0) {
                    console.log(`📊 Cycle ${cycleCounter} summary: ${executedCount} executed | ${skippedCount} skipped`);
                }
            }

            if (cycleCounter % 2 === 0) {
                const nextPositionId = await router.getNextPositionId();
                const totalPositions = Number(nextPositionId) - 1;

                if (totalPositions > 0) {
                    console.log(`📊 Checking ${totalPositions} positions for liquidation (Upgradeable)`);

                    let liquidatedCount = 0;
                    for (let positionId = 1; positionId <= totalPositions; positionId++) {
                        try {
                            const position = await router.getPosition(positionId);
                            if (!position.isOpen) continue;

                            const currentPrice = await getPrice(position.token);
                            if (currentPrice === 0n) {
                                console.log(`⚠️ Cannot get price for position ${positionId}`);
                                continue;
                            }

                            const entryPrice = BigInt(position.entryPrice);
                            const currentPriceBig = BigInt(currentPrice);

                            const pnlRatio = position.positionType === 0
                                ? ((currentPriceBig - entryPrice) * 100n) / entryPrice
                                : ((entryPrice - currentPriceBig) * 100n) / entryPrice;

                            if (pnlRatio < -90n) {
                                console.log(`⚠️ Position ${positionId}: ${pnlRatio}% loss - liquidating via proxy`);

                                try {
                                    const liquidationTx = await router.connect(keeper).liquidatePosition(positionId);
                                    await liquidationTx.wait();
                                    console.log(`⚡ Position ${positionId} liquidated via upgradeable contracts`);
                                    liquidatedCount++;
                                } catch (liquidationError) {
                                    console.log(`❌ Liquidation failed for position ${positionId}: ${liquidationError.message}`);
                                }
                            }
                        } catch (positionError) {
                            console.log(`⚠️ Error checking position ${positionId}: ${positionError.message}`);
                        }
                    }

                    if (liquidatedCount > 0) {
                        console.log(`📊 Liquidation summary: ${liquidatedCount} positions liquidated`);
                    }
                }
            }

            if (totalOrders === 0 && cycleCounter % 4 === 0) {
                console.log(`💤 No active orders | Cycle ${cycleCounter} | Upgradeable system operational`);
            }

            if (cycleCounter % 20 === 0 && totalOrders > 0) {
                console.log("\n💡 UPGRADEABLE KEEPER TIPS:");
                console.log(" • All operations use proxy contracts - no address changes needed");
                console.log(" • Contract upgrades don't affect keeper operation");
                console.log(" • Run 'npm run upgrade:contracts' to upgrade implementations");
                console.log(" • All user data is preserved during upgrades\n");
            }

        } catch (mainError) {
            console.log(`🚨 Main loop error: ${mainError.message}`);
        }

        await sleep(5000);
    }
}

process.on('SIGINT', () => {
    console.log('\n🛑 Upgradeable Keeper service stopped');
    process.exit(0);
});

if (require.main === module) {
    main().catch(error => {
        console.error("🚨 Upgradeable Keeper failed:", error.message);
        process.exit(1);
    });
}

module.exports = main;