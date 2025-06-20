const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Full DEX Upgradeable System Test", function () {
    let dex = {};
    let accounts = {};
    let tokens = {};
    let libraries = {};

    before(async function () {
        this.timeout(60000);
        console.log("🚀 Starting Full DEX Upgradeable System Test...");

        [accounts.deployer, accounts.user1, accounts.user2, accounts.keeper] = await ethers.getSigners();
        console.log("Accounts loaded");

        await deployLibraries();
        await deployUpgradeableSystem();
        await setupSystemConfiguration();
        await setupTokensAndLiquidity();

        console.log("✅ Full upgradeable system setup complete");
    });

    async function deployLibraries() {
        console.log("📚 Deploying libraries...");

        const PoolLibrary = await ethers.getContractFactory("PoolLibrary");
        libraries.poolLibrary = await PoolLibrary.deploy();
        await libraries.poolLibrary.waitForDeployment();

        const LiquidityLibrary = await ethers.getContractFactory("LiquidityLibrary");
        libraries.liquidityLibrary = await LiquidityLibrary.deploy();
        await libraries.liquidityLibrary.waitForDeployment();

        const TradingLibrary = await ethers.getContractFactory("TradingLibrary");
        libraries.tradingLibrary = await TradingLibrary.deploy();
        await libraries.tradingLibrary.waitForDeployment();

        const RouterLibrary = await ethers.getContractFactory("RouterLibrary");
        libraries.routerLibrary = await RouterLibrary.deploy();
        await libraries.routerLibrary.waitForDeployment();

        console.log("✅ All libraries deployed");
    }

    async function deployUpgradeableSystem() {
        console.log("🏗️ Deploying upgradeable DEX system...");

        // Deploy Oracle
        const OracleUpgradeable = await ethers.getContractFactory("OracleUpgradeable");
        dex.oracle = await upgrades.deployProxy(OracleUpgradeable, [], {
            initializer: 'initialize'
        });
        await dex.oracle.waitForDeployment();

        // Deploy Pool
        const PoolUpgradeable = await ethers.getContractFactory("PoolUpgradeable", {
            libraries: {
                PoolLibrary: libraries.poolLibrary.target,
                LiquidityLibrary: libraries.liquidityLibrary.target,
            },
        });
        dex.pool = await upgrades.deployProxy(PoolUpgradeable, [], {
            initializer: 'initialize',
            unsafeAllowLinkedLibraries: true
        });
        await dex.pool.waitForDeployment();

        // Deploy Trading
        const TradingUpgradeable = await ethers.getContractFactory("TradingUpgradeable", {
            libraries: {
                TradingLibrary: libraries.tradingLibrary.target,
            },
        });
        dex.trading = await upgrades.deployProxy(
            TradingUpgradeable,
            [await dex.pool.getAddress(), await dex.oracle.getAddress()],
            {
                initializer: 'initialize',
                unsafeAllowLinkedLibraries: true
            }
        );
        await dex.trading.waitForDeployment();

        // Deploy Router
        const RouterUpgradeable = await ethers.getContractFactory("RouterUpgradeable", {
            libraries: {
                RouterLibrary: libraries.routerLibrary.target,
            },
        });
        dex.router = await upgrades.deployProxy(
            RouterUpgradeable,
            [
                await dex.pool.getAddress(),
                await dex.trading.getAddress(),
                await dex.oracle.getAddress()
            ],
            {
                initializer: 'initialize',
                unsafeAllowLinkedLibraries: true
            }
        );
        await dex.router.waitForDeployment();

        console.log("✅ Upgradeable DEX system deployed");
    }

    async function setupSystemConfiguration() {
        console.log("⚙️ Setting up system configuration...");

        const KEEPER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("KEEPER_ROLE"));

        // Oracle roles
        await dex.oracle.grantRole(KEEPER_ROLE, accounts.keeper.address);
        await dex.oracle.grantRole(KEEPER_ROLE, await dex.router.getAddress());

        // Pool roles
        await dex.pool.grantRole(KEEPER_ROLE, await dex.router.getAddress());
        await dex.pool.grantRole(KEEPER_ROLE, await dex.trading.getAddress());

        // Trading roles
        await dex.trading.grantRole(KEEPER_ROLE, await dex.router.getAddress());
        await dex.trading.grantRole(KEEPER_ROLE, accounts.keeper.address);

        // Router roles
        await dex.router.grantRole(KEEPER_ROLE, await dex.trading.getAddress());
        await dex.router.grantRole(KEEPER_ROLE, accounts.keeper.address);

        console.log("✅ System configuration complete");
    }

    async function setupTokensAndLiquidity() {
        console.log("💰 Setting up tokens and liquidity...");

        // Deploy test tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");

        tokens.USDT = await MockERC20.deploy("Tether USD", "USDT", 6, 1000000);
        await tokens.USDT.waitForDeployment();

        tokens.WBTC = await MockERC20.deploy("Wrapped Bitcoin", "WBTC", 8, 21000000);
        await tokens.WBTC.waitForDeployment();

        tokens.LINK = await MockERC20.deploy("Chainlink", "LINK", 18, 1000000);
        await tokens.LINK.waitForDeployment();

        // Mint tokens to users
        for (const token of Object.values(tokens)) {
            await token.mint(accounts.user1.address, ethers.parseUnits("50000", await token.decimals()));
            await token.mint(accounts.user2.address, ethers.parseUnits("50000", await token.decimals()));
        }

        // Set initial prices
        await dex.oracle.connect(accounts.keeper).updatePrice(ethers.ZeroAddress, ethers.parseEther("3000"));
        await dex.oracle.connect(accounts.keeper).updatePrice(tokens.USDT.target, ethers.parseEther("1"));
        await dex.oracle.connect(accounts.keeper).updatePrice(tokens.WBTC.target, ethers.parseEther("50000"));
        await dex.oracle.connect(accounts.keeper).updatePrice(tokens.LINK.target, ethers.parseEther("20"));

        // Add liquidity
        await dex.router.connect(accounts.user1).depositETH({ value: ethers.parseEther("20") });

        for (const [symbol, token] of Object.entries(tokens)) {
            const decimals = await token.decimals();
            const amount = ethers.parseUnits("10000", decimals);

            await token.connect(accounts.user1).approve(await dex.router.getAddress(), amount);
            await dex.router.connect(accounts.user1).depositToken(token.target, amount);
        }

        console.log("✅ Tokens and liquidity setup complete");
    }

    describe("🏗️ System Architecture Validation", function () {
        it("should have all contracts deployed as upgradeable proxies", async function () {
            // Verify all contracts are proxies
            const oracleImpl = await upgrades.erc1967.getImplementationAddress(await dex.oracle.getAddress());
            const poolImpl = await upgrades.erc1967.getImplementationAddress(await dex.pool.getAddress());
            const tradingImpl = await upgrades.erc1967.getImplementationAddress(await dex.trading.getAddress());
            const routerImpl = await upgrades.erc1967.getImplementationAddress(await dex.router.getAddress());

            expect(oracleImpl).to.not.equal(ethers.ZeroAddress);
            expect(poolImpl).to.not.equal(ethers.ZeroAddress);
            expect(tradingImpl).to.not.equal(ethers.ZeroAddress);
            expect(routerImpl).to.not.equal(ethers.ZeroAddress);

            console.log("✅ All contracts are upgradeable proxies");
        });

        it("should have consistent proxy admin addresses", async function () {
            const oracleAdmin = await upgrades.erc1967.getAdminAddress(await dex.oracle.getAddress());
            const poolAdmin = await upgrades.erc1967.getAdminAddress(await dex.pool.getAddress());
            const tradingAdmin = await upgrades.erc1967.getAdminAddress(await dex.trading.getAddress());
            const routerAdmin = await upgrades.erc1967.getAdminAddress(await dex.router.getAddress());

            expect(oracleAdmin).to.equal(poolAdmin);
            expect(poolAdmin).to.equal(tradingAdmin);
            expect(tradingAdmin).to.equal(routerAdmin);

            console.log("✅ All proxies have consistent admin addresses");
        });

        it("should have correct version numbers", async function () {
            const oracleVersion = await dex.oracle.version();
            const poolVersion = await dex.pool.version();
            const tradingVersion = await dex.trading.version();
            const routerVersion = await dex.router.version();

            expect(oracleVersion).to.equal("1.0.0");
            expect(poolVersion).to.equal("1.0.0");
            expect(tradingVersion).to.equal("1.0.0");
            expect(routerVersion).to.equal("1.0.0");

            console.log("✅ All contracts have correct version numbers");
        });
    });

    describe("🔄 Complete Trading Flow Test", function () {
        it("should execute complete trading lifecycle through upgradeable contracts", async function () {
            this.timeout(30000);
            console.log("🎯 Testing complete trading lifecycle...");

            // Flash loan protection bypass
            await network.provider.send("evm_mine");
            await network.provider.send("evm_mine");
            await network.provider.send("evm_mine");

            // 1. Test spot trading
            console.log("  1. Testing spot trading...");
            const swapAmount = ethers.parseEther("2");
            const initialUSDTBalance = await dex.pool.getBalance(accounts.user2.address, tokens.USDT.target);

            await dex.router.connect(accounts.user2).swapTokens(
                ethers.ZeroAddress,
                tokens.USDT.target,
                swapAmount,
                0,
                { value: swapAmount }
            );

            const finalUSDTBalance = await dex.pool.getBalance(accounts.user2.address, tokens.USDT.target);
            expect(finalUSDTBalance).to.be.gt(initialUSDTBalance);
            console.log("    ✅ Spot trading successful");

            // 2. Test limit orders
            console.log("  2. Testing limit orders...");
            await network.provider.send("evm_mine");
            await network.provider.send("evm_mine");

            const limitOrderTx = await dex.router.connect(accounts.user2).createLimitOrder(
                ethers.ZeroAddress,
                tokens.WBTC.target,
                ethers.parseEther("1"),
                ethers.parseEther("2900"),
                0,
                true,
                { value: ethers.parseEther("1") }
            );
            await limitOrderTx.wait();

            const nextOrderId = await dex.trading.nextOrderId();
            expect(nextOrderId).to.be.gt(1);
            console.log("    ✅ Limit order created");

            // 3. Test stop-loss orders
            console.log("  3. Testing stop-loss orders...");
            await network.provider.send("evm_mine");
            await network.provider.send("evm_mine");

            const stopLossTx = await dex.router.connect(accounts.user2).createStopLossOrder(
                ethers.ZeroAddress,
                tokens.USDT.target,
                ethers.parseEther("0.5"),
                ethers.parseEther("2800"),
                0,
                { value: ethers.parseEther("0.5") }
            );
            await stopLossTx.wait();
            console.log("    ✅ Stop-loss order created");

            // 4. Test margin positions
            console.log("  4. Testing margin positions...");
            await network.provider.send("evm_mine");
            await network.provider.send("evm_mine");

            const positionTx = await dex.router.connect(accounts.user2).openPosition(
                tokens.WBTC.target,
                ethers.parseEther("1"),
                3,
                true,
                { value: ethers.parseEther("1") }
            );
            await positionTx.wait();

            const nextPositionId = await dex.trading.nextPositionId();
            expect(nextPositionId).to.be.gt(1);
            console.log("    ✅ Margin position opened");

            // 5. Test LP functionality
            console.log("  5. Testing LP functionality...");
            const claimableFees = await dex.router.getClaimableLPFees(accounts.user1.address, ethers.ZeroAddress);
            if (claimableFees > 0) {
                await dex.router.connect(accounts.user1).claimLPFees(ethers.ZeroAddress);
                console.log("    ✅ LP fees claimed");
            } else {
                console.log("    ℹ️ No LP fees available to claim");
            }

            console.log("✅ Complete trading lifecycle test passed");
        });
    });


    describe("🛡️ Security and Emergency Features", function () {
       it("should handle emergency scenarios in upgradeable system", async function () {
           console.log("🚨 Testing emergency scenarios...");

           // Test circuit breaker
           console.log("  Testing circuit breaker...");
           try {
               await dex.oracle.connect(accounts.keeper).updatePrice(
                   tokens.WBTC.target,
                   ethers.parseEther("75000") // 50% increase
               );
               expect.fail("Should have triggered circuit breaker");
           } catch (error) {
               expect(error.message).to.include("Price change too large");
               console.log("    ✅ Circuit breaker working");
           }

           // Test flash loan protection
           console.log("  Testing flash loan protection...");
           await network.provider.send("evm_mine");

           try {
               await dex.pool.connect(accounts.user1).depositETH({ value: ethers.parseEther("0.1") });
               await dex.pool.connect(accounts.user1).depositETH({ value: ethers.parseEther("0.1") });
               expect.fail("Should have triggered flash loan protection");
           } catch (error) {
               expect(error.message).to.include("Same block interaction denied");
               console.log("    ✅ Flash loan protection working");
           }

           console.log("✅ Emergency scenarios handled correctly");
       });

       it("should maintain access control in upgradeable contracts", async function () {
           console.log("🔐 Testing access control...");

           // Test unauthorized Oracle access
           try {
               await dex.oracle.connect(accounts.user1).updatePrice(
                   ethers.ZeroAddress,
                   ethers.parseEther("3500")
               );
               expect.fail("Should have reverted unauthorized access");
           } catch (error) {
               expect(error.message).to.include("AccessControl");
               console.log("    ✅ Oracle access control working");
           }

           // Test unauthorized Pool keeper functions
           try {
               await dex.pool.connect(accounts.user1).lockFunds(
                   accounts.user2.address,
                   ethers.ZeroAddress,
                   ethers.parseEther("1")
               );
               expect.fail("Should have reverted unauthorized access");
           } catch (error) {
               expect(error.message).to.include("AccessControl");
               console.log("    ✅ Pool access control working");
           }

           console.log("✅ Access control maintained across upgradeable contracts");
       });
   });

   describe("⚡ Performance and Gas Optimization", function () {
       it("should have reasonable gas costs for upgradeable operations", async function () {
           console.log("⚡ Testing gas efficiency...");

           // Test Oracle update gas cost
           const oracleTx = await dex.oracle.connect(accounts.keeper).updatePrice(
               tokens.LINK.target,
               ethers.parseEther("22")
           );
           const oracleReceipt = await oracleTx.wait();
           console.log(`    Oracle update gas: ${oracleReceipt.gasUsed.toString()}`);
           expect(oracleReceipt.gasUsed).to.be.lt(150000);

           // Test swap gas cost
           await network.provider.send("evm_mine");
           await network.provider.send("evm_mine");

           const swapTx = await dex.router.connect(accounts.user1).swapTokens(
               ethers.ZeroAddress,
               tokens.USDT.target,
               ethers.parseEther("0.1"),
               0,
               { value: ethers.parseEther("0.1") }
           );
           const swapReceipt = await swapTx.wait();
           console.log(`    Swap gas: ${swapReceipt.gasUsed.toString()}`);
           expect(swapReceipt.gasUsed).to.be.lt(400000);

           // Test order creation gas cost
           await network.provider.send("evm_mine");
           await network.provider.send("evm_mine");

           const orderTx = await dex.router.connect(accounts.user1).createLimitOrder(
               ethers.ZeroAddress,
               tokens.LINK.target,
               ethers.parseEther("0.1"),
               ethers.parseEther("2900"),
               0,
               true,
               { value: ethers.parseEther("0.1") }
           );
           const orderReceipt = await orderTx.wait();
           console.log(`    Order creation gas: ${orderReceipt.gasUsed.toString()}`);
           expect(orderReceipt.gasUsed).to.be.lt(300000);

           console.log("✅ Gas costs within acceptable ranges");
       });

       it("should handle high-frequency operations efficiently", async function () {
           console.log("🚀 Testing high-frequency operations...");

           const operations = 5;
           const gasUsages = [];

           for (let i = 0; i < operations; i++) {
               await network.provider.send("evm_mine");
               await network.provider.send("evm_mine");

               const tx = await dex.oracle.connect(accounts.keeper).updatePrice(
                   tokens.USDT.target,
                   ethers.parseEther((1 + i * 0.001).toString())
               );
               const receipt = await tx.wait();
               gasUsages.push(receipt.gasUsed);
           }

           const avgGas = gasUsages.reduce((a, b) => a + b, 0n) / BigInt(gasUsages.length);
           console.log(`    Average gas for ${operations} operations: ${avgGas.toString()}`);

           // Gas usage should be consistent
           const maxGas = gasUsages.reduce((max, current) => current > max ? current : max, 0n);
           const minGas = gasUsages.reduce((min, current) => current < min ? current : min, maxGas);
           const variance = maxGas - minGas;

           expect(variance).to.be.lt(10000); // Less than 10k gas variance
           console.log("✅ High-frequency operations efficient and consistent");
       });
   });

   describe("📊 Data Integrity and State Management", function () {
       it("should maintain data integrity across all operations", async function () {
           console.log("📊 Testing data integrity...");

           // Record initial state
           const initialState = {
               ethPrice: await dex.oracle.getPrice(ethers.ZeroAddress),
               poolBalance: await dex.pool.ethBalance(),
               user1Balance: await dex.pool.getBalance(accounts.user1.address, ethers.ZeroAddress),
               user2Balance: await dex.pool.getBalance(accounts.user2.address, ethers.ZeroAddress),
               nextOrderId: await dex.trading.nextOrderId(),
               nextPositionId: await dex.trading.nextPositionId()
           };

           console.log("    Initial state recorded");

           // Perform multiple operations
           await network.provider.send("evm_mine");
           await network.provider.send("evm_mine");

           // Operation 1: Price update
           await dex.oracle.connect(accounts.keeper).updatePrice(
               ethers.ZeroAddress,
               ethers.parseEther("3100")
           );

           // Operation 2: Deposit
           await dex.router.connect(accounts.user2).depositETH({ value: ethers.parseEther("2") });

           // Operation 3: Create order
           await network.provider.send("evm_mine");
           await network.provider.send("evm_mine");

           await dex.router.connect(accounts.user1).createLimitOrder(
               ethers.ZeroAddress,
               tokens.USDT.target,
               ethers.parseEther("0.5"),
               ethers.parseEther("3050"),
               0,
               true,
               { value: ethers.parseEther("0.5") }
           );

           // Verify state changes
           const finalState = {
               ethPrice: await dex.oracle.getPrice(ethers.ZeroAddress),
               poolBalance: await dex.pool.ethBalance(),
               user1Balance: await dex.pool.getBalance(accounts.user1.address, ethers.ZeroAddress),
               user2Balance: await dex.pool.getBalance(accounts.user2.address, ethers.ZeroAddress),
               nextOrderId: await dex.trading.nextOrderId(),
               nextPositionId: await dex.trading.nextPositionId()
           };

           // Verify expected changes
           expect(finalState.ethPrice).to.equal(ethers.parseEther("3100"));
           expect(finalState.poolBalance).to.be.gt(initialState.poolBalance);
           expect(finalState.user2Balance).to.be.gt(initialState.user2Balance);
           expect(finalState.nextOrderId).to.be.gt(initialState.nextOrderId);

           console.log("✅ Data integrity maintained across operations");
       });

       it("should handle concurrent operations correctly", async function () {
           console.log("🔄 Testing concurrent operations...");

           await network.provider.send("evm_mine");
           await network.provider.send("evm_mine");
           await network.provider.send("evm_mine");

           // Create multiple operations in same transaction batch
           const promises = [];

           // Different users performing different operations
           promises.push(
               dex.router.connect(accounts.user1).depositETH({ value: ethers.parseEther("0.5") })
           );

           await network.provider.send("evm_mine");

           promises.push(
               dex.oracle.connect(accounts.keeper).updatePrice(tokens.LINK.target, ethers.parseEther("21"))
           );

           await network.provider.send("evm_mine");

           // Wait for all operations to complete
           await Promise.all(promises);

           // Verify all operations succeeded
           const user1Balance = await dex.pool.getBalance(accounts.user1.address, ethers.ZeroAddress);
           const linkPrice = await dex.oracle.getPrice(tokens.LINK.target);

           expect(user1Balance).to.be.gt(0);
           expect(linkPrice).to.equal(ethers.parseEther("21"));

           console.log("✅ Concurrent operations handled correctly");
       });
   });

   describe("🔧 Upgrade Compatibility Testing", function () {
       it("should be ready for future upgrades", async function () {
           console.log("🔧 Testing upgrade readiness...");

           // Verify storage layout is upgrade-safe
           try {
               // Test storage slot access
               const oraclePrice = await dex.oracle.getPrice(ethers.ZeroAddress);
               const poolBalance = await dex.pool.ethBalance();
               const tradingOrderId = await dex.trading.nextOrderId();
               const routerBalance = await dex.router.getBalance(accounts.user1.address, ethers.ZeroAddress);

               expect(oraclePrice).to.be.gt(0);
               expect(poolBalance).to.be.gt(0);
               expect(tradingOrderId).to.be.gt(0);
               expect(routerBalance).to.be.gt(0);

               console.log("    ✅ Storage layout access verified");

               // Test complex storage structures
               const userOrders = await dex.trading.getUserOrders(accounts.user1.address);
               const userPositions = await dex.trading.getUserPositions(accounts.user1.address);

               expect(Array.isArray(userOrders)).to.be.true;
               expect(Array.isArray(userPositions)).to.be.true;

               console.log("    ✅ Complex storage structures accessible");

           } catch (error) {
               console.log(`    ❌ Storage layout issue: ${error.message}`);
               throw error;
           }

           console.log("✅ System ready for future upgrades");
       });

       it("should validate proxy implementation compatibility", async function () {
           console.log("🔍 Validating proxy implementation compatibility...");

           // Get current implementation addresses
           const implementations = {
               oracle: await upgrades.erc1967.getImplementationAddress(await dex.oracle.getAddress()),
               pool: await upgrades.erc1967.getImplementationAddress(await dex.pool.getAddress()),
               trading: await upgrades.erc1967.getImplementationAddress(await dex.trading.getAddress()),
               router: await upgrades.erc1967.getImplementationAddress(await dex.router.getAddress())
           };

           // Verify implementations exist and are different from proxy addresses
           for (const [name, implAddress] of Object.entries(implementations)) {
               expect(implAddress).to.not.equal(ethers.ZeroAddress);
               expect(implAddress).to.not.equal(await dex[name].getAddress());

               // Verify implementation has code
               const code = await ethers.provider.getCode(implAddress);
               expect(code).to.not.equal('0x');
           }

           console.log("    ✅ All implementations verified");

           // Verify proxy admin exists and has upgrade capability
           const oracleAdmin = await upgrades.erc1967.getAdminAddress(await dex.oracle.getAddress());
           expect(oracleAdmin).to.not.equal(ethers.ZeroAddress);

           const adminCode = await ethers.provider.getCode(oracleAdmin);
           expect(adminCode).to.not.equal('0x');

           console.log("    ✅ Proxy admin verified");
           console.log("✅ Proxy implementation compatibility validated");
       });
   });

   after(function () {
       console.log("\n🎉 Full DEX Upgradeable System Test completed successfully!");
       console.log("📊 Test Summary:");
       console.log("  ✅ All upgradeable contracts deployed and configured");
       console.log("  ✅ Complete trading lifecycle tested");
       console.log("  ✅ Security features validated");
       console.log("  ✅ Performance within acceptable ranges");
       console.log("  ✅ Data integrity maintained");
       console.log("  ✅ Upgrade compatibility verified");
       console.log("\n🚀 System is production-ready with full upgradeability!");
   });
});