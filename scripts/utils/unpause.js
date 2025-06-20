const { ethers, network } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🔧 Emergency System Unpause Script...");
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

        if (isPaused) {
            console.log("🚨 System is paused! Attempting to unpause...");

            const tx = await accessControl.connect(deployer).emergencyUnpause();
            await tx.wait();

            console.log("✅ System successfully unpaused!");
            console.log("🎯 Transaction hash:", tx.hash);

            // Verify unpause
            const newStatus = await accessControl.emergencyStop();
            console.log("📊 New system status:", newStatus ? "🔴 PAUSED" : "🟢 OPERATIONAL");

        } else {
            console.log("✅ System is already operational (not paused)");
        }

        console.log("🎬 Unpause script completed successfully!");

    } catch (error) {
        console.error("❌ Failed to unpause system:", error.message);

        if (error.message.includes("caller is not the owner")) {
            console.error("🚫 Only the contract owner can unpause the system");
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