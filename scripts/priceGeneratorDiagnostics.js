const { ethers, network } = require("hardhat");
const fs = require('fs');

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

    throw new Error("❌ No config found");
}

async function main() {
    console.log("🔍 Price Generator Diagnostics | Network:", network.name);

    const config = await loadConfig();
    const [deployer, keeper] = await ethers.getSigners();

    const router = await ethers.getContractAt("RouterUpgradeable", config.contracts.Router);

    console.log("✅ Contracts loaded");
    console.log("   Deployer:", deployer.address);
    console.log("   Keeper:", keeper.address);
    console.log("   Router:", router.target);

    console.log("\n🔍 Testing Oracle Access Rights");

    // Проверяем права keeper'а
    const tokens = [
        { symbol: 'ETH', address: ethers.ZeroAddress },
        ...Object.entries(config.tokens || {}).map(([symbol, tokenConfig]) => ({
            symbol,
            address: tokenConfig.address
        }))
    ];

    for (const token of tokens) {
        console.log(`\n📋 Testing ${token.symbol} (${token.address})`);

        try {
            // Проверяем текущую цену
            const currentPrice = await router.getPrice(token.address);
            console.log(`   Current price: ${ethers.formatEther(currentPrice)}`);

            // Пробуем небольшое обновление цены
            const newPrice = currentPrice + BigInt(ethers.parseEther("0.001"));

            console.log(`   Testing price update to: ${ethers.formatEther(newPrice)}`);

            // Симулируем обновление с call static
            try {
                await router.connect(keeper).updateOraclePrice.staticCall(token.address, newPrice);
                console.log(`   ✅ ${token.symbol}: Update simulation successful`);
            } catch (staticError) {
                console.log(`   ❌ ${token.symbol}: Static call failed -`, staticError.message.split('\n')[0]);
            }

            // Проверяем газ для обновления
            try {
                const gasEstimate = await router.connect(keeper).updateOraclePrice.estimateGas(token.address, newPrice);
                console.log(`   ⛽ ${token.symbol}: Gas estimate: ${gasEstimate.toString()}`);
            } catch (gasError) {
                console.log(`   ❌ ${token.symbol}: Gas estimation failed -`, gasError.message.split('\n')[0]);
            }

        } catch (error) {
            console.log(`   ❌ ${token.symbol}: Failed to get price -`, error.message.split('\n')[0]);
        }
    }

    console.log("\n🔍 Testing System Status");

    try {
        if (config.contracts.AccessControl) {
            const accessControl = await ethers.getContractAt("AccessControlContract", config.contracts.AccessControl);
            const isPaused = await accessControl.emergencyStop();
            console.log(`   Emergency Stop: ${isPaused ? '🔴 PAUSED' : '🟢 ACTIVE'}`);
        } else {
            console.log("   Emergency Stop: ⚠️ AccessControl not available");
        }
    } catch (error) {
        console.log("   Emergency Stop: ❌ Check failed -", error.message.split('\n')[0]);
    }

    console.log("\n🔍 Testing Keeper Balance & Nonce");

    try {
        const keeperBalance = await ethers.provider.getBalance(keeper.address);
        console.log(`   Keeper ETH balance: ${ethers.formatEther(keeperBalance)}`);

        const keeperNonce = await keeper.getNonce();
        console.log(`   Keeper nonce: ${keeperNonce}`);

        if (keeperBalance < ethers.parseEther("0.1")) {
            console.log("   ⚠️ Low keeper balance - may cause transaction failures");
        }
    } catch (error) {
        console.log("   ❌ Keeper status check failed:", error.message.split('\n')[0]);
    }

    console.log("\n🔍 Testing Gas Price");

    try {
        const feeData = await ethers.provider.getFeeData();
        console.log(`   Gas price: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`);
        console.log(`   Max fee per gas: ${feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') + ' gwei' : 'N/A'}`);
    } catch (error) {
        console.log("   ❌ Gas price check failed:", error.message.split('\n')[0]);
    }

    console.log("\n🔍 Recommended Solutions");

    console.log("   1. If some tokens fail: Check if keeper has PRICE_UPDATER role");
    console.log("   2. If 'Price change too large': Reduce volatility in price generator");
    console.log("   3. If nonce issues: Add longer delays between updates");
    console.log("   4. If gas issues: Increase gas limit or reduce gas price");
    console.log("   5. If system paused: Run 'npm run unpause' command");

    console.log("\n💡 Quick Fixes:");
    console.log("   - Restart price generator: Ctrl+C then npm run price-generator-anvil");
    console.log("   - Grant keeper roles: Check deployment scripts for role assignments");
    console.log("   - Reduce update frequency: Increase INDIVIDUAL_UPDATE_DELAY in config");

    console.log("\n🎯 Price Generator should work for tokens that show ✅ above");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("🚨 Diagnostics failed:", error.message);
        process.exit(1);
    });