const { ethers, network } = require("hardhat");
const fs = require('fs');
require('dotenv').config();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function loadConfig() {
    const configPaths = [
        './config/anvil_upgradeable-config.json',
        './config/anvil_final-config.json',
        './config/deployed-config.json'
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
    console.log("🚀 Enhanced Trading Demo | Network:", network.name);

    const config = await loadConfig();
    const signers = await ethers.getSigners();

    console.log(`📊 Available signers: ${signers.length}`);
    signers.forEach((signer, index) => {
        const role = index === 0 ? 'deployer' : index === 1 ? 'keeper' : `user${index-1}`;
        console.log(`   Signer ${index} (${role}): ${signer.address}`);
    });

    const user1PrivateKey = process.env.USER1_PRIVATE_KEY;
    const user2PrivateKey = process.env.USER2_PRIVATE_KEY;

    if (!user1PrivateKey || !user2PrivateKey) {
        throw new Error("❌ USER1_PRIVATE_KEY and USER2_PRIVATE_KEY must be set in .env file");
    }

    const provider = ethers.provider;
    const user1 = new ethers.Wallet(user1PrivateKey, provider);
    const user2 = new ethers.Wallet(user2PrivateKey, provider);

    const [deployer, keeper] = signers;

    console.log(`✅ User assignments:`);
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Keeper: ${keeper.address}`);
    console.log(`   User1: ${user1.address}`);
    console.log(`   User2: ${user2.address}`);
    const router = await ethers.getContractAt("RouterUpgradeable", config.contracts.Router);

    let accessControl;
    try {
        if (config.contracts.AccessControl) {
            accessControl = await ethers.getContractAt("AccessControlContract", config.contracts.AccessControl);
        }
    } catch (error) {
        console.log("⚠️ AccessControl not available, skipping emergency pause tests");
    }

    const tokens = {};
    for (const [symbol, tokenConfig] of Object.entries(config.tokens || {})) {
        tokens[symbol] = await ethers.getContractAt("MockERC20", tokenConfig.address);
    }

    console.log("✅ Initialized | Tokens:", Object.keys(tokens).concat(['ETH']).join(', '));
    console.log("🛡️ Features: Security, Self-Execution, Stop-Loss, Circuit Breaker, Emergency Controls\n");

    let createdOrders = [];

    const getPrice = async (tokenAddress) => {
        try {
            const price = await router.getPrice(tokenAddress);
            return parseFloat(ethers.formatEther(price));
        } catch { return 0; }
    };

    const getRawPrice = async (tokenAddress) => {
        try {
            return await router.getPrice(tokenAddress);
        } catch {
            return BigInt(0);
        }
    };

    const getPoolLiquidity = async (tokenAddress) => {
        try {
            if (tokenAddress === ethers.ZeroAddress) {
                return parseFloat(ethers.formatEther(await router.getBalance(router.target, tokenAddress)));
            } else {
                const tokenConfig = Object.values(config.tokens || {}).find(t => t.address === tokenAddress);
                const balance = await router.getBalance(router.target, tokenAddress);
                return parseFloat(ethers.formatUnits(balance, tokenConfig.decimals));
            }
        } catch { return 0; }
    };

    const getUserBalance = async (userAddress, tokenAddress) => {
        try {
            if (tokenAddress === ethers.ZeroAddress) {
                const balance = await router.getBalance(userAddress, tokenAddress);
                return parseFloat(ethers.formatEther(balance));
            } else {
                const tokenConfig = Object.values(config.tokens || {}).find(t => t.address === tokenAddress);
                const balance = await router.getBalance(userAddress, tokenAddress);
                return parseFloat(ethers.formatUnits(balance, tokenConfig.decimals));
            }
        } catch { return 0; }
    };

    const displayStatus = async () => {
        console.log("┌─ SYSTEM STATUS ─────────────────────────────────────────────────┐");

        let paused = false;
        try {
            if (accessControl) {
                paused = await accessControl.emergencyStop();
            }
        } catch {}

        let nextOrderId = BigInt(0), nextPositionId = BigInt(0);
        try {
            nextOrderId = await router.getNextOrderId();
            nextPositionId = await router.getNextPositionId();
        } catch {}

        console.log(`│ Status: ${paused ? "🔴 PAUSED" : "🟢 OPERATIONAL"} | Orders: ${Number(nextOrderId) - 1} | Positions: ${Number(nextPositionId) - 1}`);
        console.log("│ Security: ✅ Flash Loan Protection ✅ Circuit Breaker ✅ Emergency Stop");
        console.log("├─ MARKET PRICES ─────────────────────────────────────────────────┤");

        const ethPrice = await getPrice(ethers.ZeroAddress);
        const prices = [`ETH: ${ethPrice.toFixed(1)}`];

        for (const [symbol, tokenConfig] of Object.entries(config.tokens || {})) {
            const price = await getPrice(tokenConfig.address);
            prices.push(`${symbol}: ${price.toFixed(6)}`);
        }
        console.log(`│ ${prices.join(' | ')}`);

        console.log("├─ POOL LIQUIDITY ────────────────────────────────────────────────┤");
        const ethLiquidity = await getPoolLiquidity(ethers.ZeroAddress);
        const liquidities = [`ETH: ${ethLiquidity.toFixed(1)}`];

        for (const [symbol, tokenConfig] of Object.entries(config.tokens || {})) {
            const liquidity = await getPoolLiquidity(tokenConfig.address);
            liquidities.push(`${symbol}: ${liquidity.toFixed(1)}`);
        }
        console.log(`│ ${liquidities.join(' | ')}`);

        console.log("├─ USER BALANCES ─────────────────────────────────────────────────┤");

        for (const user of [user1, user2]) {
            const userNum = user === user1 ? '1' : '2';
            const ethBalance = await getUserBalance(user.address, ethers.ZeroAddress);
            const ethValue = ethBalance * ethPrice;
            const balances = [`ETH: ${ethBalance.toFixed(1)} ($${ethValue.toFixed(2)})`];

            for (const [symbol, tokenConfig] of Object.entries(config.tokens || {})) {
                const balance = await getUserBalance(user.address, tokenConfig.address);
                const price = await getPrice(tokenConfig.address);
                const value = balance * price;
                balances.push(`${symbol}: ${balance.toFixed(1)} ($${value.toFixed(2)})`);
            }
            console.log(`│ User${userNum}: ${balances.join(' | ')}`);
        }
        console.log("└─────────────────────────────────────────────────────────────────┘\n");
    };

    await displayStatus();

    console.log("⏳ Phase 0: Adding User Funds to Pool");

    try {
        await router.connect(user1).depositETH({ value: ethers.parseEther("2") });
        await router.connect(user2).depositETH({ value: ethers.parseEther("2") });
        console.log("✅ ETH deposits: User1 & User2 deposited 2 ETH each");
    } catch (error) {
        console.log("❌ ETH deposit failed:", error.message);
    }

    const depositResults = [];
    for (const [symbol, tokenConfig] of Object.entries(config.tokens || {})) {
        try {
            const userBalance = await tokens[symbol].balanceOf(user1.address);
            const requiredAmount = ethers.parseUnits("200", tokenConfig.decimals);

            if (userBalance < requiredAmount) {
                await tokens[symbol].mint(user1.address, requiredAmount * BigInt(2));
                await tokens[symbol].mint(user2.address, requiredAmount * BigInt(2));
            }

            await tokens[symbol].connect(user1).approve(router.target, requiredAmount);
            await router.connect(user1).depositToken(tokenConfig.address, requiredAmount);
            await tokens[symbol].connect(user2).approve(router.target, requiredAmount);
            await router.connect(user2).depositToken(tokenConfig.address, requiredAmount);

            depositResults.push(`${symbol}: ✅`);
        } catch (error) {
            depositResults.push(`${symbol}: ❌`);
        }
    }
    console.log("💎 Token deposits:", depositResults.join(' | '));

    await sleep(2000);

    console.log("\n⏳ Phase 1: Basic Trading & Security");

    const tokenSymbols = Object.keys(config.tokens || {});
    if (tokenSymbols.length === 0) {
        console.log("⚠️ No tokens available for trading demo");
        return;
    }

    const firstToken = tokenSymbols[0];
    const firstTokenAddress = config.tokens[firstToken].address;

    await network.provider.send("evm_mine");
    await network.provider.send("evm_mine");
    await network.provider.send("evm_mine");

    try {
        const swapAmount = ethers.parseEther("0.1");
        const expectedOut = await router.getAmountOut(swapAmount, ethers.ZeroAddress, firstTokenAddress);
        const minAmountOut = expectedOut * BigInt(90) / BigInt(100);

        console.log(`🔄 Swap: 0.1 ETH → ${ethers.formatUnits(expectedOut, config.tokens[firstToken].decimals)} ${firstToken}`);

        const swapTx = await router.connect(user2).swapTokens(
            ethers.ZeroAddress, firstTokenAddress, swapAmount, minAmountOut, { value: swapAmount }
        );
        await swapTx.wait();
        console.log("✅ Swap successful with flash loan protection");
    } catch (error) {
        console.log("❌ Swap failed:", error.message, "| Trying smaller amount...");

        try {
            const smallSwapAmount = ethers.parseEther("0.01");
            const expectedOut = await router.getAmountOut(smallSwapAmount, ethers.ZeroAddress, firstTokenAddress);
            const minAmountOut = expectedOut * BigInt(80) / BigInt(100);

            const smallSwapTx = await router.connect(user2).swapTokens(
                ethers.ZeroAddress, firstTokenAddress, smallSwapAmount, minAmountOut, { value: smallSwapAmount }
            );
            await smallSwapTx.wait();
            console.log("✅ Small swap successful");
        } catch (retryError) {
            console.log("❌ Retry swap failed:", retryError.message);
        }
    }

    await sleep(2000);

    console.log("\n⏳ Phase 2: Advanced Order Types");

    try {
        const currentTokenRawPrice = await getRawPrice(firstTokenAddress);
        const targetPriceRaw = currentTokenRawPrice * BigInt(105) / BigInt(100);
        const orderAmount = ethers.parseEther("0.05");
        const expectedOut = await router.getAmountOut(orderAmount, ethers.ZeroAddress, firstTokenAddress);
        const minAmountOut = expectedOut * BigInt(80) / BigInt(100);

        console.log(`📋 Limit Order: ${ethers.formatEther(orderAmount)} ETH @ ${ethers.formatEther(targetPriceRaw)} target`);

        const orderTx = await router.connect(user2).createLimitOrder(
            ethers.ZeroAddress, firstTokenAddress, orderAmount, targetPriceRaw, minAmountOut, true, { value: orderAmount }
        );
        await orderTx.wait();

        const orderId = (await router.getNextOrderId()) - BigInt(1);
        createdOrders.push({id: Number(orderId), user: user2, type: 'LIMIT'});
        console.log(`✅ Limit order created: ID ${orderId} | Self-executable for rewards`);
    } catch (error) {
        console.log("❌ Limit order failed:", error.message);

        try {
            const currentTokenRawPrice = await getRawPrice(firstTokenAddress);
            const orderAmount = ethers.parseEther("0.05");
            const expectedOut = await router.getAmountOut(orderAmount, ethers.ZeroAddress, firstTokenAddress);
            const minAmountOut = expectedOut * BigInt(50) / BigInt(100);

            const retryOrderTx = await router.connect(user2).createLimitOrder(
                ethers.ZeroAddress, firstTokenAddress, orderAmount, currentTokenRawPrice, minAmountOut, true, { value: orderAmount }
            );
            await retryOrderTx.wait();

            const orderId = (await router.getNextOrderId()) - BigInt(1);
            createdOrders.push({id: Number(orderId), user: user2, type: 'LIMIT_RETRY'});
            console.log(`✅ Limit order (retry) created: ID ${orderId}`);
        } catch (retryError) {
            console.log("❌ Retry limit order failed:", retryError.message);
        }
    }

    try {
        const currentEthRawPrice = await getRawPrice(ethers.ZeroAddress);
        const stopPriceRaw = currentEthRawPrice * BigInt(95) / BigInt(100);
        const orderAmount = ethers.parseEther("0.05");
        const expectedOut = await router.getAmountOut(orderAmount, ethers.ZeroAddress, firstTokenAddress);
        const minAmountOut = expectedOut * BigInt(80) / BigInt(100);

        console.log(`🛑 Stop-Loss: ${ethers.formatEther(orderAmount)} ETH @ ${ethers.formatEther(stopPriceRaw)} stop`);

        const stopLossTx = await router.connect(user2).createStopLossOrder(
            ethers.ZeroAddress, firstTokenAddress, orderAmount, stopPriceRaw, minAmountOut, { value: orderAmount }
        );
        await stopLossTx.wait();

        const orderId = (await router.getNextOrderId()) - BigInt(1);
        createdOrders.push({id: Number(orderId), user: user2, type: 'STOP_LOSS'});
        console.log(`✅ Stop-loss created: ID ${orderId} | Auto-executes if ETH drops`);
    } catch (error) {
        console.log("❌ Stop-loss failed:", error.message);

        try {
            const currentEthRawPrice = await getRawPrice(ethers.ZeroAddress);
            const orderAmount = ethers.parseEther("0.05");
            const expectedOut = await router.getAmountOut(orderAmount, ethers.ZeroAddress, firstTokenAddress);
            const minAmountOut = expectedOut * BigInt(50) / BigInt(100);

            const retryStopTx = await router.connect(user2).createStopLossOrder(
                ethers.ZeroAddress, firstTokenAddress, orderAmount, currentEthRawPrice, minAmountOut, { value: orderAmount }
            );
            await retryStopTx.wait();

            const orderId = (await router.getNextOrderId()) - BigInt(1);
            createdOrders.push({id: Number(orderId), user: user2, type: 'STOP_LOSS_RETRY'});
            console.log(`✅ Stop-loss (retry) created: ID ${orderId}`);
        } catch (retryError) {
            console.log("❌ Retry stop-loss failed:", retryError.message);
        }
    }

    await sleep(1000);

    console.log("\n⏳ Phase 3: Order Management");

    if (createdOrders.length > 0) {
        const lastOrder = createdOrders[createdOrders.length - 1];

        try {
            const currentPrice = await getRawPrice(ethers.ZeroAddress);
            const newTargetPrice = currentPrice * BigInt(98) / BigInt(100);
            const minAmountOut = ethers.parseUnits("1", config.tokens[firstToken].decimals);

            const orderData = await router.getOrder(lastOrder.id);
            if (!orderData.executed) {
                const modifyTx = await router.connect(lastOrder.user).modifyOrder(lastOrder.id, newTargetPrice, minAmountOut);
                await modifyTx.wait();
                console.log(`✏️ Order ${lastOrder.id} modified | New target: ${ethers.formatEther(newTargetPrice)}`);
            } else {
                console.log(`⚠️ Order ${lastOrder.id} already executed, skipping modification`);
            }
        } catch (error) {
            console.log(`❌ Order modification failed: ${error.message}`);
        }

        try {
            const cancelTx = await router.connect(lastOrder.user).cancelOrder(lastOrder.id);
            await cancelTx.wait();
            console.log(`❌ Order ${lastOrder.id} cancelled | Funds unlocked automatically`);
        } catch (error) {
            console.log(`❌ Order cancellation failed: ${error.message}`);
        }
    } else {
        console.log("⚠️ No orders created to demonstrate management features");
    }

    await sleep(1000);

    console.log("\n⏳ Phase 4: Emergency & Security Features");

    if (accessControl) {
        try {
            await accessControl.connect(deployer).emergencyPause();
            console.log("🚨 Emergency pause activated | All trading halted");

            await sleep(500);

            try {
                await router.connect(user1).swapTokens(
                    ethers.ZeroAddress, firstTokenAddress, ethers.parseEther("0.001"),
                    ethers.parseUnits("1", config.tokens[firstToken].decimals), { value: ethers.parseEther("0.001") }
                );
                console.log("❌ Trade executed during pause (unexpected!)");
            } catch {
                console.log("✅ Trade blocked | Emergency pause working correctly");
            }

            await accessControl.connect(deployer).emergencyUnpause();
            console.log("🔄 Emergency pause deactivated | System operational");
        } catch (error) {
            console.log(`❌ Emergency pause test failed: ${error.message}`);
        }
    } else {
        console.log("⚠️ AccessControl not available, skipping emergency pause tests");
    }

    console.log("\n⏳ Phase 5: Self-Execution Demo");

    try {
        const currentTokenRawPrice = await getRawPrice(firstTokenAddress);
        const executionPriceRaw = currentTokenRawPrice * BigInt(101) / BigInt(100);
        const orderAmount = ethers.parseEther("0.02");
        const expectedOut = await router.getAmountOut(orderAmount, ethers.ZeroAddress, firstTokenAddress);
        const minAmountOut = expectedOut * BigInt(80) / BigInt(100);

        console.log(`🎯 Self-Exec Order: ${ethers.formatEther(orderAmount)} ETH @ ${ethers.formatEther(executionPriceRaw)}`);

        const selfExecTx = await router.connect(user1).createLimitOrder(
            ethers.ZeroAddress, firstTokenAddress, orderAmount, executionPriceRaw, minAmountOut, true, { value: orderAmount }
        );
        await selfExecTx.wait();

        const orderId = (await router.getNextOrderId()) - BigInt(1);
        createdOrders.push({id: Number(orderId), user: user1, type: 'SELF_EXEC'});
        console.log(`✅ Self-executable order created: ID ${orderId} | 0.1% reward for executors`);
    } catch (error) {
        console.log(`❌ Self-executable order failed: ${error.message}`);

        try {
            const currentTokenRawPrice = await getRawPrice(firstTokenAddress);
            const orderAmount = ethers.parseEther("0.02");
            const expectedOut = await router.getAmountOut(orderAmount, ethers.ZeroAddress, firstTokenAddress);
            const minAmountOut = expectedOut * BigInt(50) / BigInt(100);

            const retrySelfExecTx = await router.connect(user1).createLimitOrder(
                ethers.ZeroAddress, firstTokenAddress, orderAmount, currentTokenRawPrice, minAmountOut, true, { value: orderAmount }
            );
            await retrySelfExecTx.wait();

            const orderId = (await router.getNextOrderId()) - BigInt(1);
            createdOrders.push({id: Number(orderId), user: user1, type: 'SELF_EXEC_RETRY'});
            console.log(`✅ Self-executable order (retry) created: ID ${orderId}`);
        } catch (retryError) {
            console.log(`❌ Retry self-executable order failed: ${retryError.message}`);
        }
    }

    await sleep(1000);

    console.log("\n⏳ Phase 6: Order Execution Testing");

    if (createdOrders.length > 0) {
        console.log("🎯 Testing order execution conditions:");

        const executionResults = [];
        for (const order of createdOrders) {
            try {
                const canExecute = await router.shouldExecuteOrder(order.id);
                const orderData = await router.getOrder(order.id);

                const status = `ID ${order.id} (${order.type}): ${canExecute ? "✅ Can execute" : "⏳ Waiting"} | Target: ${ethers.formatEther(orderData.targetPrice)} | Executed: ${orderData.executed ? "Yes" : "No"}`;
                executionResults.push(status);

                if (canExecute && !orderData.executed && keeper) {
                    try {
                        const execTx = await router.connect(keeper).selfExecuteOrder(order.id);
                        await execTx.wait();
                        console.log(`🚀 Order ${order.id} executed successfully!`);
                    } catch (execError) {
                        console.log(`❌ Order ${order.id} execution failed: ${execError.message}`);
                    }
                }
            } catch (checkError) {
                executionResults.push(`ID ${order.id}: ❌ Check failed`);
            }
        }

        executionResults.forEach(result => console.log(`   ${result}`));
    }

    await sleep(1000);

    console.log("\n⏳ Final Status");
    await displayStatus();

    console.log("📋 Orders Summary:");
    if (createdOrders.length > 0) {
        const orderTypes = createdOrders.reduce((acc, order) => {
            acc[order.type] = (acc[order.type] || 0) + 1;
            return acc;
        }, {});

        const summary = Object.entries(orderTypes).map(([type, count]) => `${type}: ${count}`).join(' | ');
        console.log(`   ${summary}`);

        createdOrders.forEach(order => {
            console.log(`   Order ${order.id}: ${order.type} by User${order.user === user1 ? '1' : '2'}`);
        });
    } else {
        console.log("   No orders were successfully created");
    }

    console.log("\n🎉 DEMO COMPLETE 🎉");
    console.log("✅ Features Demonstrated: Security | Orders | Execution | Protection | Debug");
    console.log("🔧 Router-Centric: Single API | Consistent patterns | Future-proof architecture");
    console.log("🚀 Next Steps: 'npm run keeper:upgradeable-anvil' | 'npm run price-generator-anvil' | Test scenarios");
    console.log("💡 All contract interactions now unified through Router interface\n");
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("🚨 Demo failed:", error.message);
            process.exit(1);
        });
}

module.exports = main;