const { ethers, network } = require("hardhat");
const fs = require("fs");

const args = process.argv.slice(2);
const modeArg = args[0];
const flags = new Set(args.slice(1));
const isListMode = !modeArg || modeArg === "list";
const isCancelAll = modeArg === "all";
const isJson = flags.has("--json");
const isVerbose = flags.has("--verbose");
const isDryRun = flags.has("--dry-run");

const ZeroAddress = ethers.ZeroAddress;
const decimalsCache = {};

async function loadConfig() {
    const configPaths = [
        "./config/anvil_upgradeable-config.json",
        "./config/anvil_final-config.json",
        "./config/deployed-config.json"
    ];

    for (const path of configPaths) {
        if (fs.existsSync(path)) {
            console.log(`📋 Loading config: ${path}`);
            return JSON.parse(fs.readFileSync(path, "utf8"));
        }
    }

    throw new Error("❌ No config found");
}

function formatTimestamp(seconds) {
    if (!seconds || seconds === 0n) return "-";
    return new Date(Number(seconds) * 1000).toISOString().replace("T", " ").slice(0, 19);
}

function extractField(order, keyOrIndex) {
    if (order == null) return undefined;
    if (Array.isArray(order)) return order[keyOrIndex];
    if (typeof order === "object") return order[keyOrIndex];
    return undefined;
}

async function getTokenDecimals(tokenAddress) {
    if (decimalsCache[tokenAddress]) return decimalsCache[tokenAddress];

    const token = await ethers.getContractAt("MockERC20", tokenAddress);
    const decimals = await token.decimals();
    decimalsCache[tokenAddress] = decimals;
    return decimals;
}

async function displayOrderDetails(order, id) {
    const user = extractField(order, "user") || extractField(order, 0);
    const tokenIn = extractField(order, "tokenIn") || extractField(order, 1);
    const amountIn = extractField(order, "amountIn") || extractField(order, 2);
    const targetPrice = extractField(order, "targetPrice") || extractField(order, 3);
    const orderType = extractField(order, "orderType") || extractField(order, 4);
    const isLong = extractField(order, "isLong") || extractField(order, 5);
    const executed = extractField(order, "executed") || extractField(order, 6);
    const createdAt = extractField(order, "createdAt") || extractField(order, 7);
    const triggeredAt = extractField(order, "triggeredAt") || extractField(order, 8);
    const slippage = extractField(order, "slippage") || extractField(order, 9);

    const tokenName = tokenIn === ZeroAddress ? "ETH" : "Token";
    const amountFormatted = tokenIn === ZeroAddress
        ? ethers.formatEther(amountIn)
        : ethers.formatUnits(amountIn, await getTokenDecimals(tokenIn));

    const typeStr = orderType === 0 || orderType === 0n ? "LIMIT" : "STOP_LOSS";
    const statusStr = executed ? "✅ EXECUTED" : "⏳ PENDING";

    console.log(`\n┌─ ORDER ${id} ──────────────────────────────────────────────┐`);
    console.log(`│ User: ${user || "unknown"}`);
    console.log(`│ TokenIn: ${tokenName}`);
    console.log(`│ Amount: ${amountFormatted} ${tokenName}`);
    console.log(`│ Target: ${ethers.formatEther(targetPrice)} USD`);
    console.log(`│ Type: ${typeStr} | ${isLong ? "LONG" : "SHORT"}`);
    console.log(`│ Created: ${formatTimestamp(createdAt)}`);
    console.log(`│ Triggered: ${formatTimestamp(triggeredAt)}`);
    console.log(`│ Slippage: ${slippage || "-"} bps`);
    console.log(`│ Status: ${statusStr}`);
    console.log("└──────────────────────────────────────────────────────────────┘");
}

async function listAllOrders(router) {
    try {
        const nextOrderId = await router.getNextOrderId();
        const totalOrders = Number(nextOrderId) - 1;
        const orders = [];

        for (let id = 1; id <= totalOrders; id++) {
            try {
                const order = await router.getOrder(id);
                orders.push({ id, order });
            } catch {
                continue;
            }
        }

        if (isJson) {
            console.log(JSON.stringify(orders, null, 2));
        } else if (isVerbose) {
            for (const { id, order } of orders) await displayOrderDetails(order, id);
        } else {
            console.log(`\n📋 Found ${orders.length} orders:`);
            for (const { id, order } of orders) {
                const user = extractField(order, "user") || extractField(order, 0);
                const executed = extractField(order, "executed") || extractField(order, 6);
                const orderType = extractField(order, "orderType") || extractField(order, 4);
                const tokenIn = extractField(order, "tokenIn") || extractField(order, 1);

                const userShort = (user && typeof user === "string") ? user.slice(0, 80)  : "unknown";
                const status = executed ? "✅ EXECUTED" : "⏳ PENDING";
                const type = orderType === 0 || orderType === 0n ? "LIMIT" : "STOP_LOSS";
                const token = tokenIn === ZeroAddress ? "ETH" : "Token";

                console.log(`   ${id}: ${type} | ${token} | ${status} | User: ${userShort}`);
            }
        }

        return orders;
    } catch (err) {
        console.log(`❌ Error listing orders: ${err.message}`);
        return [];
    }
}

async function getUserSigner(userAddress, deployer, user1, user2) {
    if (!userAddress) return null;
    const address = userAddress.toLowerCase();
    if (address === deployer.address.toLowerCase()) return deployer;
    if (address === user1.address.toLowerCase()) return user1;
    if (address === user2.address.toLowerCase()) return user2;
    return null;
}

async function cancelOrder(router, orderId, signer) {
    try {
        console.log(`🗑️ Sending cancel tx for order ${orderId}`);
        if (isDryRun) {
            console.log("🚫 Dry run mode: TX skipped");
            return true;
        }
        const tx = await router.connect(signer).cancelOrder(orderId);
        console.log(`⏳ TX: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ Order ${orderId} cancelled`);
        return true;
    } catch (err) {
        console.log(`❌ Failed to cancel order ${orderId}: ${err.reason || err.message}`);
        return false;
    }
}

async function main() {
    console.log("🗑️ Order Cancellation | Network:", network.name);
    const config = await loadConfig();
    const [deployer, user1, user2] = await ethers.getSigners();
    const router = await ethers.getContractAt("RouterUpgradeable", config.contracts.Router);
    console.log("✅ Router address:", router.target || router.address);

    if (isListMode) {
        await listAllOrders(router);
        console.log("\n💡 Usage:");
        console.log("   node scripts/cancelOrderSimple.js <orderId> [--dry-run]");
        console.log("   node scripts/cancelOrderSimple.js all [--verbose]");
        console.log("   node scripts/cancelOrderSimple.js list [--json|--verbose]");
        return;
    }

    const all = await listAllOrders(router);

    if (isCancelAll) {
        const pending = all.filter(({ order }) => !extractField(order, "executed") && !extractField(order, 6));
        if (pending.length === 0) {
            console.log("✅ No pending orders");
            return;
        }

        let success = 0;
        for (const { id, order } of pending) {
            const user = extractField(order, "user") || extractField(order, 0);
            const signer = await getUserSigner(user, deployer, user1, user2);
            if (!signer) {
                console.log(`⚠️ No signer for order ${id}`);
                continue;
            }

            await displayOrderDetails(order, id);
            if (await cancelOrder(router, id, signer)) success++;
        }

        console.log(`\n📊 Cancelled ${success}/${pending.length} orders`);
        return;
    }

    const targetId = parseInt(modeArg);
    if (isNaN(targetId) || targetId < 1) {
        throw new Error(`❌ Invalid order ID: ${modeArg}`);
    }

    const target = all.find(o => o.id === targetId);
    if (!target) throw new Error(`❌ Order ${targetId} not found`);

    const executed = extractField(target.order, "executed") || extractField(target.order, 6);
    if (executed) throw new Error(`❌ Order ${targetId} already executed`);

    await displayOrderDetails(target.order, targetId);

    const user = extractField(target.order, "user") || extractField(target.order, 0);
    const signer = await getUserSigner(user, deployer, user1, user2);
    if (!signer) throw new Error(`❌ No signer for user ${user}`);

    await cancelOrder(router, targetId, signer);
}

if (require.main === module) {
    main().then(() => process.exit(0)).catch(err => {
        console.error("🚨 Error:", err.message);
        process.exit(1);
    });
}

module.exports = main;
