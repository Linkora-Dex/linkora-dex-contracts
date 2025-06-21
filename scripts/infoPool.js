const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("🔍 POOL DIAGNOSTICS - Comprehensive Analysis");
    console.log("============================================\n");

    const config = JSON.parse(fs.readFileSync("./config/anvil_final-config.json"));
    // console.log("config", config);
    const [deployer, keeper, ...otherSigners] = await ethers.getSigners();

    const user1 = otherSigners[0] || deployer;
    const user2 = otherSigners[1] || keeper;

    console.log("👥 Test Users:");
    console.log(`   User1: ${user1.address}`);
    console.log(`   User2: ${user2.address}\n`);

    console.log("📋 Config Check:");
    console.log(`Router address: ${config.contracts.Router}`);
    console.log(`Pool address: ${config.contracts.Pool || 'not set'}\n`);

    if (!config.contracts.Router) {
        console.log("❌ No router address in config");
        return;
    }

    const router = await ethers.getContractAt("RouterUpgradeable", config.contracts.Router);

    console.log("🔗 Getting Pool address from Router...");
    let actualPoolAddress;
    try {
        actualPoolAddress = await router.getPoolAddress();
        console.log(`Pool address from Router: ${actualPoolAddress}`);
    } catch (error) {
        console.log(`❌ Failed to get pool address from Router: ${error.message}`);

        // Fallback: use from config
        if (poolAddress) {
            actualPoolAddress = poolAddress;
            console.log(`Using pool from config: ${actualPoolAddress}`);
        } else {
            console.log("❌ No pool address available");
            return;
        }
    }

    if (!actualPoolAddress || actualPoolAddress === ethers.ZeroAddress) {
        console.log("❌ Invalid pool address");
        return;
    }

    const pool = await ethers.getContractAt("PoolUpgradeable", actualPoolAddress);

    const tokens = config.tokens || {};
    const tokenContracts = {};
    for (const [symbol, tokenData] of Object.entries(tokens)) {
        if (symbol !== "ETH") {
            const tokenAddress = typeof tokenData === 'string' ? tokenData : tokenData.address;
            tokenContracts[symbol] = await ethers.getContractAt("MockERC20", tokenAddress);
        }
    }

    console.log("📊 PHASE 1: CONTRACT ADDRESSES & VERSIONS");
    console.log("==========================================");
    // console.log(`Router: ${routerAddress}`);
    console.log(`Router: ${config.contracts.Router}`);
    console.log(`Pool: ${actualPoolAddress}`);

    let routerVersion = "unknown";
    let poolVersion = "unknown";

    try {
        routerVersion = await router.version();
    } catch (error) {
        console.log(`❌ Router version check failed: ${error.message}`);
    }

    try {
        poolVersion = await pool.version();
    } catch (error) {
        console.log(`❌ Pool version check failed: ${error.message}`);
    }

    console.log(`Router Version: ${routerVersion}`);
    console.log(`Pool Version: ${poolVersion}\n`);

    console.log("📊 PHASE 2: ETH BALANCE ANALYSIS");
    console.log("=================================");

    const poolEthBalance = await pool.ethBalance();
    const poolEthActual = await ethers.provider.getBalance(actualPoolAddress);
    const user1EthInPool = await pool.ethBalances(user1.address);
    const user2EthInPool = await pool.ethBalances(user2.address);
    const user1EthLocked = await pool.lockedEthBalances(user1.address);
    const user2EthLocked = await pool.lockedEthBalances(user2.address);

    console.log(`Pool.ethBalance(): ${ethers.formatEther(poolEthBalance)} ETH`);
    console.log(`Pool actual ETH: ${ethers.formatEther(poolEthActual)} ETH`);
    console.log(`User1 in pool: ${ethers.formatEther(user1EthInPool)} ETH (locked: ${ethers.formatEther(user1EthLocked)})`);
    console.log(`User2 in pool: ${ethers.formatEther(user2EthInPool)} ETH (locked: ${ethers.formatEther(user2EthLocked)})`);

    const totalUserEth = user1EthInPool + user2EthInPool;
    console.log(`Total user ETH: ${ethers.formatEther(totalUserEth)} ETH`);
    console.log(`Balance match: ${poolEthBalance === totalUserEth ? "✅" : "❌"}`);
    console.log(`Contract ETH match: ${poolEthBalance === poolEthActual ? "✅" : "❌"}\n`);

    console.log("📊 PHASE 3: TOKEN BALANCE ANALYSIS");
    console.log("===================================");

    for (const [symbol, token] of Object.entries(tokenContracts)) {
        const tokenAddress = await token.getAddress();
        const poolTokenBalance = await pool.totalTokenBalances(tokenAddress);
        const poolTokenActual = await token.balanceOf(actualPoolAddress);
        const user1TokenInPool = await pool.tokenBalances(user1.address, tokenAddress);
        const user2TokenInPool = await pool.tokenBalances(user2.address, tokenAddress);
        const user1TokenLocked = await pool.lockedTokenBalances(user1.address, tokenAddress);
        const user2TokenLocked = await pool.lockedTokenBalances(user2.address, tokenAddress);

        console.log(`${symbol} (${tokenAddress}):`);
        console.log(`  Pool.totalTokenBalances(): ${ethers.formatUnits(poolTokenBalance, tokens[symbol]?.decimals || 18)}`);
        console.log(`  Pool actual ${symbol}: ${ethers.formatUnits(poolTokenActual, tokens[symbol]?.decimals || 18)}`);
        console.log(`  User1 in pool: ${ethers.formatUnits(user1TokenInPool, tokens[symbol]?.decimals || 18)} (locked: ${ethers.formatUnits(user1TokenLocked, tokens[symbol]?.decimals || 18)})`);
        console.log(`  User2 in pool: ${ethers.formatUnits(user2TokenInPool, tokens[symbol]?.decimals || 18)} (locked: ${ethers.formatUnits(user2TokenLocked, tokens[symbol]?.decimals || 18)})`);

        const totalUserTokens = user1TokenInPool + user2TokenInPool;
        console.log(`  Total user ${symbol}: ${ethers.formatUnits(totalUserTokens, tokens[symbol]?.decimals || 18)}`);
        console.log(`  Balance match: ${poolTokenBalance === totalUserTokens ? "✅" : "❌"}`);
        console.log(`  Contract ${symbol} match: ${poolTokenBalance === poolTokenActual ? "✅" : "❌"}\n`);
    }

    console.log("📊 PHASE 4: LIQUIDITY CONTRIBUTIONS");
    console.log("====================================");

    const ethContribUser1 = await pool.liquidityContributions(user1.address, ethers.ZeroAddress);
    const ethContribUser2 = await pool.liquidityContributions(user2.address, ethers.ZeroAddress);
    const totalEthContrib = await pool.totalLiquidityContributions(ethers.ZeroAddress);

    console.log("ETH Liquidity Contributions:");
    console.log(`  User1: ${ethers.formatEther(ethContribUser1)} ETH`);
    console.log(`  User2: ${ethers.formatEther(ethContribUser2)} ETH`);
    console.log(`  Total: ${ethers.formatEther(totalEthContrib)} ETH`);
    console.log(`  Match: ${totalEthContrib === (ethContribUser1 + ethContribUser2) ? "✅" : "❌"}\n`);

    for (const [symbol, token] of Object.entries(tokenContracts)) {
        const tokenAddress = await token.getAddress();
        const contribUser1 = await pool.liquidityContributions(user1.address, tokenAddress);
        const contribUser2 = await pool.liquidityContributions(user2.address, tokenAddress);
        const totalContrib = await pool.totalLiquidityContributions(tokenAddress);

        console.log(`${symbol} Liquidity Contributions:`);
        console.log(`  User1: ${ethers.formatUnits(contribUser1, tokens[symbol]?.decimals || 18)}`);
        console.log(`  User2: ${ethers.formatUnits(contribUser2, tokens[symbol]?.decimals || 18)}`);
        console.log(`  Total: ${ethers.formatUnits(totalContrib, tokens[symbol]?.decimals || 18)}`);
        console.log(`  Match: ${totalContrib === (contribUser1 + contribUser2) ? "✅" : "❌"}\n`);
    }

    console.log("📊 PHASE 5: ROUTER BALANCE CHECKS");
    console.log("==================================");

    const user1EthViaRouter = await router.getBalance(user1.address, ethers.ZeroAddress);
    const user2EthViaRouter = await router.getBalance(user2.address, ethers.ZeroAddress);
    const user1EthAvailable = await router.getAvailableBalance(user1.address, ethers.ZeroAddress);
    const user2EthAvailable = await router.getAvailableBalance(user2.address, ethers.ZeroAddress);

    console.log("ETH via Router:");
    console.log(`  User1 total: ${ethers.formatEther(user1EthViaRouter)} ETH`);
    console.log(`  User1 available: ${ethers.formatEther(user1EthAvailable)} ETH`);
    console.log(`  User2 total: ${ethers.formatEther(user2EthViaRouter)} ETH`);
    console.log(`  User2 available: ${ethers.formatEther(user2EthAvailable)} ETH`);
    console.log(`  Router vs Pool User1: ${user1EthViaRouter === user1EthInPool ? "✅" : "❌"}`);
    console.log(`  Router vs Pool User2: ${user2EthViaRouter === user2EthInPool ? "✅" : "❌"}\n`);

    for (const [symbol, token] of Object.entries(tokenContracts)) {
        const tokenAddress = await token.getAddress();
        const user1TokenViaRouter = await router.getBalance(user1.address, tokenAddress);
        const user2TokenViaRouter = await router.getBalance(user2.address, tokenAddress);
        const user1TokenAvailable = await router.getAvailableBalance(user1.address, tokenAddress);
        const user2TokenAvailable = await router.getAvailableBalance(user2.address, tokenAddress);

        const user1TokenInPool = await pool.tokenBalances(user1.address, tokenAddress);
        const user2TokenInPool = await pool.tokenBalances(user2.address, tokenAddress);

        console.log(`${symbol} via Router:`);
        console.log(`  User1 total: ${ethers.formatUnits(user1TokenViaRouter, tokens[symbol]?.decimals || 18)}`);
        console.log(`  User1 available: ${ethers.formatUnits(user1TokenAvailable, tokens[symbol]?.decimals || 18)}`);
        console.log(`  User2 total: ${ethers.formatUnits(user2TokenViaRouter, tokens[symbol]?.decimals || 18)}`);
        console.log(`  User2 available: ${ethers.formatUnits(user2TokenAvailable, tokens[symbol]?.decimals || 18)}`);
        console.log(`  Router vs Pool User1: ${user1TokenViaRouter === user1TokenInPool ? "✅" : "❌"}`);
        console.log(`  Router vs Pool User2: ${user2TokenViaRouter === user2TokenInPool ? "✅" : "❌"}\n`);
    }






    console.log("📊 PHASE 6: LIQUIDITY STATISTICS");
    console.log("=================================");

    const ethStats = await pool.getLiquidityStats(ethers.ZeroAddress);
    console.log("ETH Pool Statistics:");
    console.log(`  Total Contributions: ${ethers.formatEther(ethStats.totalContributions)} ETH`);
    console.log(`  Total Fees Accumulated: ${ethers.formatEther(ethStats.totalFeesAcc)} ETH`);
    console.log(`  Total Fees Claimed: ${ethers.formatEther(ethStats.totalFeesCla)} ETH`);
    console.log(`  Available Fees: ${ethers.formatEther(ethStats.availableFees)} ETH\n`);

    for (const [symbol, token] of Object.entries(tokenContracts)) {
        const tokenAddress = await token.getAddress();
        const stats = await pool.getLiquidityStats(tokenAddress);
        console.log(`${symbol} Pool Statistics:`);
        console.log(`  Total Contributions: ${ethers.formatUnits(stats.totalContributions, tokens[symbol]?.decimals || 18)}`);
        console.log(`  Total Fees Accumulated: ${ethers.formatUnits(stats.totalFeesAcc, tokens[symbol]?.decimals || 18)}`);
        console.log(`  Total Fees Claimed: ${ethers.formatUnits(stats.totalFeesCla, tokens[symbol]?.decimals || 18)}`);
        console.log(`  Available Fees: ${ethers.formatUnits(stats.availableFees, tokens[symbol]?.decimals || 18)}\n`);
    }





    console.log("📊 PHASE 7: USER LIQUIDITY INFO");
    console.log("================================");

    for (const [userLabel, user] of [["User1", user1], ["User2", user2]]) {
        console.log(`${userLabel} (${user.address}):`);

        const ethInfo = await pool.getUserLiquidityInfo(user.address, ethers.ZeroAddress);
        console.log(`  ETH: contribution=${ethers.formatEther(ethInfo.contribution)}, share=${Number(ethInfo.sharePercentage)/100}%, claimable=${ethers.formatEther(ethInfo.claimableFees)}`);

        for (const [symbol, token] of Object.entries(tokenContracts)) {
            const tokenAddress = await token.getAddress();
            const info = await pool.getUserLiquidityInfo(user.address, tokenAddress);
            console.log(`  ${symbol}: contribution=${ethers.formatUnits(info.contribution, tokens[symbol]?.decimals || 18)}, share=${Number(info.sharePercentage)/100}%, claimable=${ethers.formatUnits(info.claimableFees, tokens[symbol]?.decimals || 18)}`);
        }
        console.log();
    }








    console.log("📊 PHASE 8: SWAP CALCULATIONS");
    console.log("==============================");

    try {
        const ethToCapy = await router.getAmountOut(ethers.parseEther("0.1"), ethers.ZeroAddress, config.tokens.CAPY.address);
        console.log(`0.1 ETH → CAPY: ${ethers.formatEther(ethToCapy)} CAPY`);
    } catch (error) {
        console.log(`❌ ETH → CAPY swap calculation failed: ${error.message}`);
    }

    try {
        const capyToEth = await router.getAmountOut(ethers.parseEther("10"), config.tokens.CAPY.address, ethers.ZeroAddress);
        console.log(`10 CAPY → ETH: ${ethers.formatEther(capyToEth)} ETH`);
    } catch (error) {
        console.log(`❌ CAPY → ETH swap calculation failed: ${error.message}`);
    }

    console.log("\n📊 PHASE 9: PROBLEM SUMMARY");
    console.log("============================");

    const problems = [];

    if (poolEthBalance !== totalUserEth) {
        problems.push("❌ ETH balance mismatch between pool.ethBalance() and sum of user balances");
    }

    if (poolEthBalance !== poolEthActual) {
        problems.push("❌ ETH balance mismatch between pool.ethBalance() and actual contract balance");
    }

    for (const [symbol, token] of Object.entries(tokenContracts)) {
        const tokenAddress = await token.getAddress();
        const poolTokenBalance = await pool.totalTokenBalances(tokenAddress);
        const poolTokenActual = await token.balanceOf(actualPoolAddress);
        const user1TokenInPool = await pool.tokenBalances(user1.address, tokenAddress);
        const user2TokenInPool = await pool.tokenBalances(user2.address, tokenAddress);
        const totalUserTokens = user1TokenInPool + user2TokenInPool;

        if (poolTokenBalance !== totalUserTokens) {
            problems.push(`❌ ${symbol} balance mismatch between totalTokenBalances and sum of user balances`);
        }

        if (poolTokenBalance !== poolTokenActual) {
            problems.push(`❌ ${symbol} balance mismatch between totalTokenBalances and actual contract balance`);
        }
    }

    if (problems.length === 0) {
        console.log("✅ No problems detected - all balances are consistent");
    } else {
        console.log("Problems detected:");
        problems.forEach(problem => console.log(`  ${problem}`));
    }

    console.log("\n🎯 RECOMMENDATIONS:");
    console.log("===================");
    if (totalEthContrib === 0n) {
        console.log("• No ETH liquidity contributions found - check deposit functions");
    }
    if (poolEthBalance === 0n && poolEthActual > 0n) {
        console.log("• ETH is in contract but not tracked in pool.ethBalance() - deposit logic issue");
    }
    if (problems.length > 0) {
        console.log("• Check deposit/withdrawal functions for proper balance tracking");
        console.log("• Verify all mappings are updated correctly in transactions");
        console.log("• Review event logs for deposit transactions");
    }

    console.log("\n✅ DIAGNOSTICS COMPLETE");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Diagnostics failed:", error);
        process.exit(1);
    });