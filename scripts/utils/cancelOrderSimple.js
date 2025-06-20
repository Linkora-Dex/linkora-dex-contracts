const { ethers, network } = require("hardhat");
const fs = require('fs');

async function main() {
    const orderId = process.argv[2];
    const isListMode = !orderId || orderId === 'list';
    const isCancelAll = orderId === 'all';

    console.log("🗑️ Order Cancellation | Network:", network.name);

    const configPath = './config/deployed-config.json';
    if (!fs.existsSync(configPath)) {
        console.error("❌ Config not found. Run: npm run full-deploy");
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const [deployer, user1, user2] = await ethers.getSigners();
    const router = await ethers.getContractAt("Router", config.contracts.Router);

    console.log("✅ Router:", router.address);

    const displayOrderDetails = async (orderId) => {
        try {
            const order = await router.getOrder(orderId);
            console.log(`\n┌─ ORDER ${orderId} ──────────────────────────────────────────────┐`);
            console.log(`│ User: ${order.user}`);
            console.log(`│ TokenIn: ${order.tokenIn === ethers.constants.AddressZero ? 'ETH' : 'Token'}`);
            console.log(`│ Amount: ${order.tokenIn === ethers.constants.AddressZero ? 
                ethers.utils.formatEther(order.amountIn) : 
                ethers.utils.formatUnits(order.amountIn, 6)} ${order.tokenIn === ethers.constants.AddressZero ? 'ETH' : 'Token'}`);
            console.log(`│ Target: ${ethers.utils.formatEther(order.targetPrice)} USD`);
            console.log(`│ Type: ${order.orderType === 0 ? 'LIMIT' : 'STOP_LOSS'} | ${order.isLong ? 'LONG' : 'SHORT'}`);
            console.log(`│ Status: ${order.executed ? '✅ EXECUTED' : '⏳ PENDING'}`);
            console.log("└────────────────────────────────────────────────────────────────┘");
            return order;
        } catch (error) {
            console.log(`❌ Error getting order ${orderId}: ${error.message}`);
            return null;
        }
    };

    const listAllOrders = async () => {
        try {
            const nextOrderId = await router.getNextOrderId();
            const totalOrders = nextOrderId - 1;

            if (totalOrders === 0) {
                console.log("📋 No orders found");
                return [];
            }

            console.log(`\n📋 Found ${totalOrders} orders:`);
            const orders = [];

            for (let orderId = 1; orderId <= totalOrders; orderId++) {
                try {
                    const order = await router.getOrder(orderId);
                    orders.push({ id: orderId, ...order });

                    const status = order.executed ? "✅ EXECUTED" : "⏳ PENDING";
                    const type = order.orderType === 0 ? 'LIMIT' : 'STOP_LOSS';
                    const tokenIn = order.tokenIn === ethers.constants.AddressZero ? 'ETH' : 'Token';

                    console.log(`   ${orderId}: ${type} | ${tokenIn} | ${status} | User: ${order.user.slice(0,8)}...`);
                } catch (error) {
                    console.log(`   ${orderId}: ❌ Error`);
                }
            }
            return orders;
        } catch (error) {
            console.log(`❌ Error listing orders: ${error.message}`);
            return [];
        }
    };

    const getUserSigner = (userAddress) => {
        if (userAddress.toLowerCase() === user1.address.toLowerCase()) {
            return user1;
        } else if (userAddress.toLowerCase() === user2.address.toLowerCase()) {
            return user2;
        } else if (userAddress.toLowerCase() === deployer.address.toLowerCase()) {
            return deployer;
        }
        return null;
    };

    const cancelOrder = async (orderId, userSigner) => {
        try {
            console.log(`\n🗑️ Cancelling order ${orderId}...`);

            const cancelTx = await router.connect(userSigner).cancelOrder(orderId);
            console.log(`⏳ TX: ${cancelTx.hash}`);

            await cancelTx.wait();
            console.log(`✅ Order ${orderId} cancelled | Funds returned`);
            return true;
        } catch (error) {
            console.log(`❌ Failed: ${error.message}`);
            return false;
        }
    };

    // Режим просмотра списка
    if (isListMode) {
        await listAllOrders();
        console.log("\n💡 Usage:");
        console.log("   node scripts/cancelOrderSimple.js <orderId>  # Cancel specific order");
        console.log("   node scripts/cancelOrderSimple.js all       # Cancel all pending");
        console.log("   node scripts/cancelOrderSimple.js list      # Show this list");
        console.log("\n   Quick npm commands:");
        console.log("   npm run cancel-1    # Cancel order 1");
        console.log("   npm run cancel-all  # Cancel all pending");
        return;
    }

    // Режим отмены всех ордеров
    if (isCancelAll) {
        console.log("\n🗑️ Cancelling ALL pending orders...");

        const orders = await listAllOrders();
        const pendingOrders = orders.filter(order => !order.executed);

        if (pendingOrders.length === 0) {
            console.log("✅ No pending orders to cancel");
            return;
        }

        let successCount = 0;
        for (const order of pendingOrders) {
            const userSigner = getUserSigner(order.user);

            if (!userSigner) {
                console.log(`⚠️ Order ${order.id}: No signer for ${order.user}`);
                continue;
            }

            await displayOrderDetails(order.id);
            const success = await cancelOrder(order.id, userSigner);

            if (success) successCount++;
        }

        console.log(`\n📊 Result: ${successCount}/${pendingOrders.length} orders cancelled`);
        return;
    }

    // Режим отмены конкретного ордера
    const orderIdNum = parseInt(orderId);

    if (isNaN(orderIdNum) || orderIdNum < 1) {
        console.error("❌ Invalid order ID:", orderId);
        process.exit(1);
    }

    console.log(`\n🎯 Targeting order ${orderIdNum}`);

    const order = await displayOrderDetails(orderIdNum);

    if (!order) {
        console.error(`❌ Order ${orderIdNum} not found`);
        process.exit(1);
    }

    if (order.executed) {
        console.error(`❌ Order ${orderIdNum} already executed`);
        process.exit(1);
    }

    const userSigner = getUserSigner(order.user);

    if (!userSigner) {
        console.error(`❌ No signer for user ${order.user}`);
        console.log("Available signers:");
        console.log(`   User1: ${user1.address}`);
        console.log(`   User2: ${user2.address}`);
        console.log(`   Deployer: ${deployer.address}`);
        process.exit(1);
    }

    console.log(`✅ Using signer for ${order.user}`);

    const success = await cancelOrder(orderIdNum, userSigner);

    if (success) {
        console.log(`\n🎉 Order ${orderIdNum} cancelled successfully!`);
    } else {
        console.log(`\n💔 Cancellation failed`);
        process.exit(1);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("🚨 Error:", error.message);
            process.exit(1);
        });
}

module.exports = main;