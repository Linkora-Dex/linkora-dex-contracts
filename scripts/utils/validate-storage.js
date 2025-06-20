const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("🔍 Validating storage layout for upgradeable contracts...");

    try {
        console.log("Validating Oracle upgrade compatibility...");
        await upgrades.validateImplementation(await ethers.getContractFactory("OracleUpgradeable"));
        console.log("✅ Oracle storage layout valid");

        console.log("Validating Pool upgrade compatibility...");
        const PoolUpgradeable = await ethers.getContractFactory("PoolUpgradeable", {
            libraries: {
                PoolLibrary: "0x0000000000000000000000000000000000000001",
                LiquidityLibrary: "0x0000000000000000000000000000000000000002",
            },
        });
        await upgrades.validateImplementation(PoolUpgradeable, {
            unsafeAllowLinkedLibraries: true
        });
        console.log("✅ Pool storage layout valid");

        console.log("Validating Trading upgrade compatibility...");
        const TradingUpgradeable = await ethers.getContractFactory("TradingUpgradeable", {
            libraries: {
                TradingLibrary: "0x0000000000000000000000000000000000000003",
            },
        });
        await upgrades.validateImplementation(TradingUpgradeable, {
            unsafeAllowLinkedLibraries: true
        });
        console.log("✅ Trading storage layout valid");

        console.log("Validating Router upgrade compatibility...");
        const RouterUpgradeable = await ethers.getContractFactory("RouterUpgradeable", {
            libraries: {
                RouterLibrary: "0x0000000000000000000000000000000000000004",
            },
        });
        await upgrades.validateImplementation(RouterUpgradeable, {
            unsafeAllowLinkedLibraries: true
        });
        console.log("✅ Router storage layout valid");

        console.log("🎯 All storage layouts validated successfully!");
        console.log("Ready for deployment and future upgrades!");

    } catch (error) {
        console.error("❌ Storage validation failed:", error.message);
        console.error("Review contract changes and ensure storage compatibility");
        process.exit(1);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Validation error:", error);
            process.exit(1);
        });
}

module.exports = main;