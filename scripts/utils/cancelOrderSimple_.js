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

async function getTokenDecimals(tokenAddress) {
    if (decimalsCache[tokenAddress]) return decimalsCache[tokenAddress];

    const token = await ethers.getContractAt("MockERC20", tokenAddress);
    const decimals = await token.decimals();
    decimalsCache[tokenAddress] = decimals;
    return decimals;
}

async function displayOrderDetails(order, id) {
    const tokenName = order.tokenIn === ZeroAddress ? "ETH" : "Token";
    const amountFormatted = order.tokenIn === ZeroAddress
        ? ethers.formatEther(order.amountIn)
        : ethers.formatUnits(order.amountIn, await getTokenDecimals(order.tokenIn));

    const typeStr = order.orderType === 0 ? "LIMIT" : "STOP_LOSS";
    const statusStr = order.executed ? "✅ EXECUTED" : "⏳ PENDING";

    console.log(`\n┌─ ORDER ${id} ──────────────────────────────────────────────┐`);
    console.log(`│ User: ${order.user}`);
    console.log(`│ TokenIn: ${tokenName}`);
    console.log(`│ Amount: ${amountFormatted} ${tokenName}`);
    console.log(`│ Target: ${ethers.formatEther(order.targetPrice)} USD`);
    console.log(`│ Type: ${typeStr} | ${order.isLong ? "LONG" : "SHORT"}`);
    console.log(`│ Created: ${formatTimestamp(order.createdAt)}`);
    console.log(`│ Triggered: ${formatTimestamp(order.triggeredAt)}`);
    console.log(`│ Slippage: ${order.slippage || "-"} bps`);
    console.log(`│ Status: ${statusStr}`);
    console.log("└──────────────────────────────────────────────────────────────┘");
}

async function listAllOrders(router) {
    try {
        const nextOrderId = await router.getNextOrderId();
        const totalOrders = Number(nextOrderId) - 1;

        if (totalOrders <= 0) {
            console.log("📋 No orders found");
            return [];
        }

        const orders = [];
        for (let id = 1; id <= totalOrders; id++) {
            try {
                const order = await router.getOrder(id);
                orders.push({ id, ...order });
            } catch {
                continue;
            }
        }

        if (isJson) {
            console.log(JSON.stringify(orders, null, 2));
        } else if (isVerbose) {
            for (const order of orders) await displayOrderDetails(order, order.id);
        } else {
            console.log(`\n📋 Found ${orders.length} orders:`);
            for (const order of orders) {
                const status = order.executed ? "✅ EXECUTED" : "⏳ PENDING";
                const type = order.orderType === 0 ? "LIMIT" : "STOP_LOSS";
                const token = order.tokenIn === ZeroAddress ? "ETH" : "Token";

                const userShort = (order.user && typeof order.user === 'string')
                        ? `${order.user.slice(0, 8)}...`
                        : "unknown";

            console.log(`   ${order.id}: ${type} | ${token} | ${status} | User: ${userShort}`);



            }
        }

        return orders;
    } catch (err) {
        console.log(`❌ Error listing orders: ${err.message}`);
        return [];
    }
}

async function getUserSigner(userAddress, deployer, user1, user2) {
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
        const receipt = await tx.wait();
        const minedIn = receipt.blockNumber;
        console.log(`✅ Order ${orderId} cancelled | Block: ${minedIn}`);
        return true;
    } catch (err) {
        const reason = err.reason || (err.error?.message || err.message);
        console.log(`❌ Failed to cancel order ${orderId}: ${reason}`);
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

    const orders = await listAllOrders(router);

    if (isCancelAll) {
        const pending = orders.filter(o => !o.executed);
        if (pending.length === 0) {
            console.log("✅ No pending orders");
            return;
        }

        let success = 0;
        for (const order of pending) {
            const signer = await getUserSigner(order.user, deployer, user1, user2);
            if (!signer) {
                console.log(`⚠️ No signer for order ${order.id}`);
                continue;
            }

            await displayOrderDetails(order, order.id);
            const ok = await cancelOrder(router, order.id, signer);
            if (ok) success++;
        }

        console.log(`\n📊 Cancelled ${success}/${pending.length} orders`);
        return;
    }

    const targetId = parseInt(modeArg);
    if (isNaN(targetId) || targetId < 1) {
        throw new Error(`❌ Invalid order ID: ${modeArg}`);
    }

    const order = orders.find(o => o.id === targetId);
    if (!order) throw new Error(`❌ Order ${targetId} not found`);
    if (order.executed) throw new Error(`❌ Order ${targetId} already executed`);

    await displayOrderDetails(order, targetId);
    const signer = await getUserSigner(order.user, deployer, user1, user2);
    if (!signer) throw new Error(`❌ No signer for user ${order.user}`);

    await cancelOrder(router, targetId, signer);
}

if (require.main === module) {
    main().then(() => process.exit(0)).catch(err => {
        console.error("🚨 Error:", err.message);
        process.exit(1);
    });
}

module.exports = main;
