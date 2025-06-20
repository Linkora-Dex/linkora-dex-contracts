const { ethers, network } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🔄 Emergency System Toggle Script...");
    console.log("Network:", network.name);

    const configPath = './config/deployed-config.json';
    if (!fs.existsSync(configPath)) {
        console.error("❌ Config file not found. Run deployment first: npm run full-deploy");
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const [deployer] = await ethers.getSigners();

    console.log("📋 Deployer address:", deployer.address);
    console.log("🔮 AccessControl address:", config.contracts.AccessControl);

    try {
        // Connect to AccessControl contract
        const accessControl = await ethers.getContractAt("AccessControlContract", config.contracts.AccessControl);

        // Check current pause state
        const isPaused = await accessControl.emergencyStop();
        console.log("📊 Current system status:", isPaused ? "🔴 PAUSED" : "🟢 OPERATIONAL");

        let tx;
        if (isPaused) {
            console.log("🔄 System is paused! Attempting to unpause...");
            tx = await accessControl.connect(deployer).emergencyUnpause();
        } else {
            console.log("🚨 System is operational! Attempting to pause...");
            console.log("⚠️  WARNING: This will halt ALL trading activities!");
            tx = await accessControl.connect(deployer).emergencyPause();
        }

        await tx.wait();

        const action = isPaused ? "unpaused" : "paused";
        const newEmoji = isPaused ? "🟢" : "🔴";
        const newStatus = isPaused ? "OPERATIONAL" : "PAUSED";

        console.log(`✅ System successfully ${action}!`);
        console.log("🎯 Transaction hash:", tx.hash);

        if (!isPaused) {
            console.log("🛑 ALL TRADING IS NOW HALTED");
        }

        // Verify new state
        const newPauseStatus = await accessControl.emergencyStop();
        console.log("📊 New system status:", newPauseStatus ? "🔴 PAUSED" : "🟢 OPERATIONAL");

        if (newPauseStatus) {
            console.log("📝 To resume operations, run: npm run unpause or npm run toggle-pause");
        }

        console.log("🎬 Toggle script completed successfully!");

    } catch (error) {
        console.error("❌ Failed to toggle system state:", error.message);

        if (error.message.includes("caller is not the owner")) {
            console.error("🚫 Only the contract owner can control pause state");
            console.error("🔑 Make sure you're using the deployer account");
        }

        process.exit(1);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;