const { ethers } = require("hardhat");

async function main() {
    const deployerAddress = "0xbA5C24084c98A42974f324F377c87Ad44900648E";
    const keeperAddress = "0x3a683E750b98A372f7d7638532afe8877fE3FF2D";

    console.log("Checking balances...");

    const deployerBalance = await ethers.provider.getBalance(deployerAddress);
    const keeperBalance = await ethers.provider.getBalance(keeperAddress);

    console.log(`Deployer (${deployerAddress}): ${ethers.formatEther(deployerBalance)} ETH`);
    console.log(`Keeper (${keeperAddress}): ${ethers.formatEther(keeperBalance)} ETH`);

    // Проверим также первые 3 аккаунта из hardhat.config.js
    const signers = await ethers.getSigners();
    console.log("\nDefault Hardhat accounts:");
    for (let i = 0; i < Math.min(3, signers.length); i++) {
        const balance = await ethers.provider.getBalance(signers[i].address);
        console.log(`Account ${i} (${signers[i].address}): ${ethers.formatEther(balance)} ETH`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });