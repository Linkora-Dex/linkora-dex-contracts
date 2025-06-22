const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🔍 SINGLE SWAP DEBUG - Precise Problem Localization");
    console.log("==================================================");

    const latestConfig = JSON.parse(fs.readFileSync('./config/anvil_upgradeable-config.json'));
    if (!latestConfig.deployment?.completed) {
        throw new Error("Pool not properly initialized. Run prod:pools first");
    }



    const network = hre.network.name;
    const configPath = `./config/${network}_upgradeable-config.json`;

    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    console.log("Config timestamp:", config.timestamp);
    console.log("Deployment completed:", config.deployment?.completed);


    const [deployer, keeper] = await ethers.getSigners();

    console.log(`Network: ${network}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Keeper: ${keeper.address}`);

    // Debug config structure
    console.log("Config structure:");
    console.log("- contracts:", config.contracts ? "exists" : "missing");
    console.log("- tokens:", config.tokens ? "exists" : "missing");

    if (!config.contracts || !config.contracts.Router) {
        console.error("Router address not found in config.contracts.Router");
        console.log("Available config keys:", Object.keys(config));
        if (config.contracts) {
            console.log("Available contract keys:", Object.keys(config.contracts));
        }
        return;
    }

    // Get contracts using ABI instead of factory
    const routerAbi = [
        "function pool() view returns (address)",
        "function swapEthForToken(address tokenOut, uint256 minAmountOut) payable",
        "function getVersion() view returns (string)"
    ];
    const router = new ethers.Contract(config.contracts.Router, routerAbi, deployer);

    const poolAddress = await router.pool();
    console.log(`Retrieved pool address: ${poolAddress}`);

    const poolAbi = [
        "function ethBalance() view returns (uint256)",
        "function totalTokenBalances(address) view returns (uint256)",
        "function ethBalances(address) view returns (uint256)",
        "function lockedEthBalances(address) view returns (uint256)",
        "function tokenBalances(address, address) view returns (uint256)",
        "function lockedTokenBalances(address, address) view returns (uint256)",
        "function totalLiquidityContributions(address) view returns (uint256)",
        "function totalFeesAccumulated(address) view returns (uint256)",
        "function totalFeesClaimed(address) view returns (uint256)"
    ];
    const pool = new ethers.Contract(poolAddress, poolAbi, deployer);

    // Get tokens using ERC20 ABI
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
    ];

    const tokens = {};
    for (const [tokenName, tokenConfig] of Object.entries(config.tokens)) {
        // Extract address from token config object
        const tokenAddress = tokenConfig.address || tokenConfig;
        tokens[tokenName] = new ethers.Contract(tokenAddress, tokenAbi, deployer);
    }

    console.log("\n📋 Contracts loaded:");
    console.log(`Router: ${config.contracts.Router}`);
    console.log(`Pool: ${poolAddress}`);
    console.log(`Tokens: ${Object.keys(tokens).join(', ')}`);

    // Helper function to log all balances
    async function logAllBalances(label) {
        console.log(`\n${label}`);
        console.log("=".repeat(label.length));

        // Pool contract ETH
        const poolEthBalance = await pool.ethBalance();
        const actualPoolEth = await ethers.provider.getBalance(poolAddress);
        console.log(`Pool.ethBalance(): ${ethers.formatEther(poolEthBalance)} ETH`);
        console.log(`Pool actual ETH: ${ethers.formatEther(actualPoolEth)} ETH`);

        for (const [tokenName, tokenConfig] of Object.entries(tokens)) {
            const tokenAddress = Object.entries(config.tokens).find(([name]) => name === tokenName)[1].address;
            const totalTokenBalance = await pool.totalTokenBalances(tokenAddress);
            const actualTokenBalance = await tokenConfig.balanceOf(poolAddress);
            console.log(`Pool.totalTokenBalances(${tokenName}): ${ethers.formatEther(totalTokenBalance)}`);
            console.log(`Pool actual ${tokenName}: ${ethers.formatEther(actualTokenBalance)}`);
        }

        console.log("\n--- User Balances ---");
        // User balances in pool
        const users = [
            { name: "Deployer", address: deployer.address },
            { name: "Keeper", address: keeper.address }
        ];

        for (const user of users) {
            const userPoolEth = await pool.ethBalances(user.address);
            const userPoolEthLocked = await pool.lockedEthBalances(user.address);
            console.log(`${user.name} pool ETH: ${ethers.formatEther(userPoolEth)} (locked: ${ethers.formatEther(userPoolEthLocked)})`);

            for (const [tokenName, tokenContract] of Object.entries(tokens)) {
                const tokenAddress = Object.entries(config.tokens).find(([name]) => name === tokenName)[1].address;
                const userPoolToken = await pool.tokenBalances(user.address, tokenAddress);
                const userPoolTokenLocked = await pool.lockedTokenBalances(user.address, tokenAddress);
                console.log(`${user.name} pool ${tokenName}: ${ethers.formatEther(userPoolToken)} (locked: ${ethers.formatEther(userPoolTokenLocked)})`);
            }
        }

        console.log("\n--- Contribution Tracking ---");
        const totalEthContribs = await pool.totalLiquidityContributions(ethers.ZeroAddress);
        console.log(`Total ETH contributions: ${ethers.formatEther(totalEthContribs)}`);

        for (const [tokenName, tokenContract] of Object.entries(tokens)) {
            const tokenAddress = Object.entries(config.tokens).find(([name]) => name === tokenName)[1].address;
            const totalTokenContribs = await pool.totalLiquidityContributions(tokenAddress);
            console.log(`Total ${tokenName} contributions: ${ethers.formatEther(totalTokenContribs)}`);
        }

        console.log("\n--- Fee Tracking ---");
        const totalEthFees = await pool.totalFeesAccumulated(ethers.ZeroAddress);
        const claimedEthFees = await pool.totalFeesClaimed(ethers.ZeroAddress);
        console.log(`ETH fees accumulated: ${ethers.formatEther(totalEthFees)}`);
        console.log(`ETH fees claimed: ${ethers.formatEther(claimedEthFees)}`);

        for (const [tokenName, tokenContract] of Object.entries(tokens)) {
            const tokenAddress = Object.entries(config.tokens).find(([name]) => name === tokenName)[1].address;
            const totalTokenFees = await pool.totalFeesAccumulated(tokenAddress);
            const claimedTokenFees = await pool.totalFeesClaimed(tokenAddress);
            console.log(`${tokenName} fees accumulated: ${ethers.formatEther(totalTokenFees)}`);
            console.log(`${tokenName} fees claimed: ${ethers.formatEther(claimedTokenFees)}`);
        }
    }

    // Helper function to calculate and verify deltas
    async function calculateDeltas(beforeState, afterState, swapAmount, expectedTokenOut) {
        console.log("\n🧮 DELTA ANALYSIS");
        console.log("==================");

        // ETH changes
        const poolEthDelta = afterState.poolEthBalance.sub(beforeState.poolEthBalance);
        const actualEthDelta = afterState.actualPoolEth.sub(beforeState.actualPoolEth);
        const userEthDelta = afterState.userPoolEth.sub(beforeState.userPoolEth);

        console.log(`Pool.ethBalance() change: ${ethers.formatEther(poolEthDelta)} ETH`);
        console.log(`Pool actual ETH change: ${ethers.formatEther(actualEthDelta)} ETH`);
        console.log(`User ETH balance change: ${ethers.formatEther(userEthDelta)} ETH`);
        console.log(`Expected ETH increase: ${ethers.formatEther(swapAmount)} ETH`);

        // Token changes
        const poolTokenDelta = afterState.poolTokenBalance.sub(beforeState.poolTokenBalance);
        const actualTokenDelta = afterState.actualTokenBalance.sub(beforeState.actualTokenBalance);
        const userTokenDelta = afterState.userTokenBalance.sub(beforeState.userTokenBalance);

        console.log(`Pool.totalTokenBalances() change: ${ethers.formatEther(poolTokenDelta)} ${firstTokenName}`);
        console.log(`Pool actual ${firstTokenName} change: ${ethers.formatEther(actualTokenDelta)} ${firstTokenName}`);
        console.log(`User ${firstTokenName} balance change: ${ethers.formatEther(userTokenDelta)} ${firstTokenName}`);

        // Verification
        console.log("\n✅ VERIFICATION");
        console.log("================");

        const ethMatches = actualEthDelta.eq(swapAmount);
        const poolEthCorrect = poolEthDelta.eq(swapAmount);
        const userEthCorrect = userEthDelta.eq(swapAmount);

        console.log(`✅ Actual ETH increase matches swap amount: ${ethMatches}`);
        console.log(`✅ Pool.ethBalance() increase matches: ${poolEthCorrect}`);
        console.log(`✅ User ETH balance increase matches: ${userEthCorrect}`);

        const tokenDecrease = poolTokenDelta.lt(0);
        const actualTokenDecrease = actualTokenDelta.lt(0);
        const userTokenIncrease = userTokenDelta.gt(0);

        console.log(`✅ Pool token balance decreased: ${tokenDecrease}`);
        console.log(`✅ Actual token balance decreased: ${actualTokenDecrease}`);
        console.log(`✅ User token balance increased: ${userTokenIncrease}`);

        // Check if pool and actual balances are synchronized
        const poolActualEthSync = afterState.poolEthBalance.eq(afterState.actualPoolEth);
        const poolActualTokenSync = afterState.poolTokenBalance.eq(afterState.actualTokenBalance);

        console.log(`🔄 Pool.ethBalance() synced with actual: ${poolActualEthSync}`);
        console.log(`🔄 Pool.totalTokenBalances() synced with actual: ${poolActualTokenSync}`);

        return {
            ethMatches,
            poolEthCorrect,
            userEthCorrect,
            tokenDecrease,
            actualTokenDecrease,
            userTokenIncrease,
            poolActualEthSync,
            poolActualTokenSync
        };
    }

    // Capture before state
    await logAllBalances("📊 BEFORE SWAP STATE");

    const beforeState = {
        poolEthBalance: await pool.ethBalance(),
        actualPoolEth: await ethers.provider.getBalance(poolAddress),
        userPoolEth: await pool.ethBalances(deployer.address),
        poolTokenBalance: await pool.totalTokenBalances(Object.entries(config.tokens)[0][1].address),
        actualTokenBalance: await tokens[Object.keys(tokens)[0]].balanceOf(poolAddress),
        userTokenBalance: await pool.tokenBalances(deployer.address, Object.entries(config.tokens)[0][1].address)
    };

    // Perform single swap
    console.log("\n🔄 EXECUTING SWAP");
    console.log("==================");
    const swapAmount = ethers.parseEther("0.1");
    const firstTokenName = Object.keys(tokens)[0];
    const firstTokenAddress = Object.entries(config.tokens)[0][1].address;
    console.log(`Swapping ${ethers.formatEther(swapAmount)} ETH for ${firstTokenName}`);

    try {
        const tx = await router.connect(deployer).swapEthForToken(
            firstTokenAddress,
            0, // minAmountOut
            { value: swapAmount }
        );

        console.log(`Transaction hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`Gas used: ${receipt.gasUsed}`);
        console.log(`Block number: ${receipt.blockNumber}`);

        // Log all events
        console.log("\n📋 TRANSACTION EVENTS");
        console.log("=====================");
        if (receipt.events && receipt.events.length > 0) {
            receipt.events.forEach((event, index) => {
                console.log(`Event ${index + 1}: ${event.event || 'Unknown'}`);
                if (event.args) {
                    Object.keys(event.args).forEach(key => {
                        if (isNaN(key)) { // Only log named parameters
                            const value = event.args[key];
                            if (ethers.BigNumber.isBigNumber(value)) {
                                console.log(`  ${key}: ${ethers.formatEther(value)}`);
                            } else {
                                console.log(`  ${key}: ${value}`);
                            }
                        }
                    });
                }
            });
        } else {
            console.log("No events found in transaction");
        }

    } catch (error) {
        console.error("❌ Swap failed:", error.message);
        return;
    }

    // Capture after state
    await logAllBalances("📊 AFTER SWAP STATE");

    const afterState = {
        poolEthBalance: await pool.ethBalance(),
        actualPoolEth: await ethers.provider.getBalance(poolAddress),
        userPoolEth: await pool.ethBalances(deployer.address),
        poolTokenBalance: await pool.totalTokenBalances(firstTokenAddress),
        actualTokenBalance: await tokens[firstTokenName].balanceOf(poolAddress),
        userTokenBalance: await pool.tokenBalances(deployer.address, firstTokenAddress)
    };

    // Calculate and verify deltas
    const verification = await calculateDeltas(beforeState, afterState, swapAmount);

    // Summary
    console.log("\n🎯 PROBLEM IDENTIFICATION");
    console.log("==========================");

    const issues = [];

    if (!verification.poolActualEthSync) {
        issues.push("❌ Pool.ethBalance() NOT synced with actual contract balance");
    }

    if (!verification.poolActualTokenSync) {
        issues.push("❌ Pool.totalTokenBalances() NOT synced with actual contract balance");
    }

    if (!verification.poolEthCorrect) {
        issues.push("❌ Pool.ethBalance() did not update correctly");
    }

    if (!verification.userEthCorrect) {
        issues.push("❌ User ETH balance did not update correctly");
    }

    if (!verification.actualTokenDecrease) {
        issues.push("❌ Actual token balance did not decrease");
    }

    if (!verification.userTokenIncrease) {
        issues.push("❌ User token balance did not increase");
    }

    if (issues.length === 0) {
        console.log("✅ All checks passed - no issues detected");
    } else {
        console.log("Issues found:");
        issues.forEach(issue => console.log(issue));
    }

    console.log("\n🏁 SINGLE SWAP DEBUG COMPLETE");
    console.log("==============================");
    console.log("Run 'npm run infoPool' to see the full diagnostic again");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });