const {ethers, network} = require("hardhat");
const fs = require('fs');

class PriceGenerator {
    constructor() {

        this.TIMING_CONFIG = {
            PRICE_UPDATE_INTERVAL: 300000,
            DISPLAY_UPDATE_INTERVAL: 50000,
            PAUSE_CHECK_INTERVAL: 3000,
            INDIVIDUAL_UPDATE_DELAY: 1000,
            NONCE_RETRY_DELAY: 2000,
            CONNECTION_RETRY_DELAY: 2000,
            VOLATILE_EVENT_DELAY: 200,
            ETH_VOLATILE_EVENT_DELAY: 30000,
            TOKEN_VOLATILE_EVENT_DELAY: 60000
        };

        this.STORAGE_LIMITS = {
            PRICE_HISTORY_MAX: 100,
            ERROR_LOG_MAX: 10
        };

        this.GAS_MULTIPLIERS = {
            OPTIMAL_GAS_MULTIPLIER: 120,
            ERROR_GAS_MULTIPLIER: 110,
            MULTIPLIER_BASE: 100
        };

        this.VOLATILITY_CONFIG = {
            ETH_VOLATILITY: 0.01,
            HIGH_PRICE_VOLATILITY: 0.04,
            MID_PRICE_VOLATILITY: 0.05,
            LOW_PRICE_VOLATILITY: 0.001,
            DEFAULT_VOLATILITY: 0.03,
            BASE_VOLATILITY: 0.02,
            HIGH_PRICE_THRESHOLD: 10000,
            MID_PRICE_THRESHOLD: 10,
            LOW_PRICE_THRESHOLD: 2
        };

        this.loadConfig();
        this.currentPrices = {...this.config.initialPrices};
        this.priceHistory = {};
        this.isRunning = false;
        this.tokenSymbols = ['ETH', ...Object.keys(this.config.tokens || {})];
        this.pauseCheckInterval = null;
        this.errorLog = [];
        this.currentGasPrice = BigInt("1000000000");
        this.lastNonce = 0;

        Object.keys(this.currentPrices).forEach(symbol => {
            this.priceHistory[symbol] = [{
                price: this.currentPrices[symbol],
                timestamp: Date.now()
            }];
        });
    }

    loadConfig() {
        const configPaths = [
            './config/anvil_upgradeable-config.json',
            './config/anvil_final-config.json',
            './config/upgradeable-config.json'
        ];

        for (const configPath of configPaths) {
            if (fs.existsSync(configPath)) {
                console.log(`📋 Loading config: ${configPath}`);
                this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return;
            }
        }

        throw new Error("❌ No config found. Run: npm run prod:deploy");
    }

    async initialize() {
        console.log("Initializing Price Generator...");
        console.log("Network:", network.name);
        console.log("RPC URL:", network.config.url || "default");

        try {
            const signers = await ethers.getSigners();
            console.log(`Found ${signers.length} signers`);

            if (signers.length < 2) {
                throw new Error(`Not enough signers: expected at least 2, got ${signers.length}`);
            }

            const [deployer, keeper] = signers;
            this.keeper = keeper;
            this.deployer = deployer;

            console.log("Keeper address:", keeper.address);
            console.log("Deployer address:", deployer.address);

            this.router = await ethers.getContractAt("RouterUpgradeable", this.config.contracts.Router);

            if (this.config.contracts.AccessControl) {
                this.accessControl = await ethers.getContractAt("AccessControlContract", this.config.contracts.AccessControl);
                console.log("AccessControl address:", this.accessControl.target);
            } else {
                console.log("⚠️ AccessControl not available, using basic status checks");
            }

            console.log("Router address:", this.router.target);
            console.log("Price Generator initialized with Router proxy");
            console.log("Available tokens:", this.tokenSymbols);
            console.log("Initial prices:", this.currentPrices);

            this.lastNonce = await this.keeper.getNonce();
            console.log("Initial keeper nonce:", this.lastNonce);
        } catch (error) {
            console.error("Failed to initialize:", error);
            throw error;
        }
    }

    async getOptimalGasPrice() {
        try {
            const feeData = await ethers.provider.getFeeData();
            if (feeData.gasPrice) {
                this.currentGasPrice = feeData.gasPrice * BigInt(this.GAS_MULTIPLIERS.OPTIMAL_GAS_MULTIPLIER) / BigInt(this.GAS_MULTIPLIERS.MULTIPLIER_BASE);
            } else if (feeData.maxFeePerGas) {
                this.currentGasPrice = feeData.maxFeePerGas;
            }
            return this.currentGasPrice;
        } catch (error) {
            this.currentGasPrice = this.currentGasPrice * BigInt(this.GAS_MULTIPLIERS.ERROR_GAS_MULTIPLIER) / BigInt(this.GAS_MULTIPLIERS.MULTIPLIER_BASE);
            return this.currentGasPrice;
        }
    }

    async checkSystemStatus() {
        try {
            const provider = ethers.provider;
            await provider.getBlockNumber();

            if (this.accessControl) {
                const isPaused = await this.accessControl.emergencyStop();
                return !isPaused;
            }

            return true;
        } catch (error) {
            if (error.message.includes("other side closed") || error.message.includes("CONNECTION ERROR")) {
                console.log("⚠️ Network connection lost, attempting to reconnect...");
                await new Promise(resolve => setTimeout(resolve, this.TIMING_CONFIG.CONNECTION_RETRY_DELAY));
                return false;
            }
            this.logError("Error checking system status", error.message);
            return false;
        }
    }

    logError(context, message) {
        const timestamp = new Date().toLocaleTimeString();
        const errorEntry = `[${timestamp}] ${context}: ${message}`;
        this.errorLog.push(errorEntry);
        if (this.errorLog.length > this.STORAGE_LIMITS.ERROR_LOG_MAX) {
            this.errorLog = this.errorLog.slice(-this.STORAGE_LIMITS.ERROR_LOG_MAX);
        }
        console.log(`❌ ${errorEntry}`);
    }

    async waitForSystemUnpause() {
        console.log("🔴 System is paused! Waiting for unpause...");
        console.log("💡 Run 'npm run unpause' in another terminal to unpause the system");

        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                const isOperational = await this.checkSystemStatus();
                if (isOperational) {
                    console.log("🟢 System is now operational! Resuming price updates...");
                    clearInterval(checkInterval);
                    resolve();
                }
            }, this.TIMING_CONFIG.PAUSE_CHECK_INTERVAL);
        });
    }

    generateRandomPrice(currentPrice, volatility = this.VOLATILITY_CONFIG.BASE_VOLATILITY) {
        const change = (Math.random() - 0.5) * 2 * volatility;
        const newPrice = parseFloat(currentPrice) * (1 + change);
        return Math.max(newPrice, 0.01).toFixed(6);
    }

    getVolatilityForSymbol(symbol) {
        const basePrice = parseFloat(this.config.initialPrices[symbol] || "1");
        if (basePrice >= this.VOLATILITY_CONFIG.HIGH_PRICE_THRESHOLD) return this.VOLATILITY_CONFIG.HIGH_PRICE_VOLATILITY;
        if (basePrice >= this.VOLATILITY_CONFIG.MID_PRICE_THRESHOLD) return this.VOLATILITY_CONFIG.MID_PRICE_VOLATILITY;
        if (basePrice <= this.VOLATILITY_CONFIG.LOW_PRICE_THRESHOLD) return this.VOLATILITY_CONFIG.LOW_PRICE_VOLATILITY;
        return this.VOLATILITY_CONFIG.DEFAULT_VOLATILITY;
    }

    async updatePrices() {
        try {
            const isOperational = await this.checkSystemStatus();
            if (!isOperational) {
                await this.waitForSystemUnpause();
                return;
            }

            const tokens = [];
            const prices = [];
            const updates = {};

            for (const [symbol, currentPrice] of Object.entries(this.currentPrices)) {
                const volatility = symbol === 'ETH' ? this.VOLATILITY_CONFIG.ETH_VOLATILITY : this.getVolatilityForSymbol(symbol);

                const newPrice = this.generateRandomPrice(currentPrice, volatility);
                this.currentPrices[symbol] = newPrice;
                updates[symbol] = newPrice;

                this.priceHistory[symbol].push({
                    price: newPrice,
                    timestamp: Date.now()
                });

                if (this.priceHistory[symbol].length > this.STORAGE_LIMITS.PRICE_HISTORY_MAX) {
                    this.priceHistory[symbol] = this.priceHistory[symbol].slice(-this.STORAGE_LIMITS.PRICE_HISTORY_MAX);
                }

                if (symbol === 'ETH') {
                    tokens.push(ethers.ZeroAddress);
                } else {
                    const tokenAddress = this.config.tokens[symbol]?.address;
                    if (tokenAddress) {
                        tokens.push(tokenAddress);
                    }
                }

                prices.push(ethers.parseEther(newPrice));
            }

            if (tokens.length > 0) {
                console.log(`[${new Date().toLocaleTimeString()}] Updating prices via Router...`);

                const gasPrice = await this.getOptimalGasPrice();
                console.log(`Using gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

                await this.updatePricesIndividually(tokens, prices, updates);
            }

        } catch (error) {
            if (error.message.includes("System paused")) {
                console.log("🔴 System paused during price update");
                await this.waitForSystemUnpause();
            } else {
                this.logError("Price update error", error.message);
            }
        }
    }

    async updatePricesIndividually(tokens, prices, updates) {
        console.log(`[${new Date().toLocaleTimeString()}] Updating prices individually...`);

        const gasPrice = await this.getOptimalGasPrice();

        for (let i = 0; i < tokens.length; i++) {
            try {
                await new Promise(resolve => setTimeout(resolve, this.TIMING_CONFIG.INDIVIDUAL_UPDATE_DELAY));

                const currentNonce = await this.keeper.getNonce();

                const tx = await this.router.connect(this.keeper).updateOraclePrice(tokens[i], prices[i], {
                    gasLimit: 300000,
                    gasPrice: gasPrice,
                    nonce: currentNonce
                });
                await tx.wait();

                const symbol = tokens[i] === ethers.ZeroAddress ? 'ETH' :
                    Object.keys(this.config.tokens || {}).find(s => this.config.tokens[s].address === tokens[i]);

                console.log(`[${new Date().toLocaleTimeString()}] ✅ ${symbol}: ${updates[symbol]}`);
            } catch (error) {
                const symbol = tokens[i] === ethers.ZeroAddress ? 'ETH' :
                    Object.keys(this.config.tokens || {}).find(s => this.config.tokens[s].address === tokens[i]);

                if (error.message.includes("Price change too large")) {
                    console.log(`[${new Date().toLocaleTimeString()}] ❌ ${symbol}: Circuit breaker triggered`);
                } else if (error.message.includes("nonce")) {
                    console.log(`[${new Date().toLocaleTimeString()}] ⚠️ ${symbol}: Nonce issue, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, this.TIMING_CONFIG.NONCE_RETRY_DELAY));
                    i--;
                } else {
                    this.logError(`Individual update ${symbol}`, error.message);
                }
            }
        }
    }

    getPriceStats(symbol) {
        const history = this.priceHistory[symbol];
        if (!history || history.length < 2) {
            if (this.currentPrices[symbol]) {
                return {
                    current: parseFloat(this.currentPrices[symbol]).toFixed(6),
                    change: "0.00",
                    min24h: parseFloat(this.currentPrices[symbol]).toFixed(6),
                    max24h: parseFloat(this.currentPrices[symbol]).toFixed(6)
                };
            }
            return null;
        }

        const prices = history.map(h => parseFloat(h.price));
        const current = prices[prices.length - 1];
        const previous = prices[prices.length - 2];
        const change = ((current - previous) / previous * 100);

        const min24h = Math.min(...prices.slice(-24));
        const max24h = Math.max(...prices.slice(-24));

        return {
            current: current.toFixed(6),
            change: change.toFixed(2),
            min24h: min24h.toFixed(6),
            max24h: max24h.toFixed(6)
        };
    }

    async printPriceBoard() {
        let isOperational = true;
        let systemStatus = "🟢 OPERATIONAL";

        try {
            isOperational = await this.checkSystemStatus();
            systemStatus = isOperational ? "🟢 OPERATIONAL" : "🔴 PAUSED";
        } catch (error) {
            systemStatus = "⚠️ CONNECTION";
        }

        console.log("\n" + "=".repeat(80));
        console.log(` LIVE PRICE FEED via Router [${systemStatus}]`);
        console.log("=".repeat(80));
        console.log("Symbol".padEnd(10) + "Price".padEnd(15) + "Change%".padEnd(12) + "24h Low".padEnd(12) + "24h High");
        console.log("-".repeat(80));

        for (const symbol of this.tokenSymbols) {
            if (this.currentPrices[symbol]) {
                const stats = this.getPriceStats(symbol);
                if (stats) {
                    const changeColor = parseFloat(stats.change) >= 0 ? '+' : '';
                    console.log(
                        symbol.padEnd(10) +
                        `${stats.current}`.padEnd(15) +
                        `${changeColor}${stats.change}%`.padEnd(12) +
                        `${stats.min24h}`.padEnd(12) +
                        `${stats.max24h}`
                    );
                } else {
                    console.log(
                        symbol.padEnd(10) +
                        `${this.currentPrices[symbol]}`.padEnd(15) +
                        "0.00%".padEnd(12) +
                        `${this.currentPrices[symbol]}`.padEnd(12) +
                        `${this.currentPrices[symbol]}`
                    );
                }
            }
        }

        console.log("-".repeat(80));
        console.log(`Last update: ${new Date().toLocaleTimeString()} (via Router)`);
        console.log(`Gas price: ${ethers.formatUnits(this.currentGasPrice, 'gwei')} gwei`);

        if (this.errorLog.length > 0) {
            console.log("\n📝 Recent errors:");
            this.errorLog.slice(-3).forEach(error => console.log(`   ${error}`));
        }

        if (!isOperational && systemStatus !== "⚠️ CONNECTION") {
            console.log("🚨 SYSTEM PAUSED - Run 'npm run unpause' to resume");
        }

        console.log("Press Ctrl+C to stop price generation\n");
    }

    async start() {
        if (this.isRunning) return;

        this.isRunning = true;
        console.log("Starting price generator with Router proxy...");

        const updateInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(updateInterval);
                return;
            }

            await this.updatePrices();
        }, this.TIMING_CONFIG.PRICE_UPDATE_INTERVAL);

        const displayInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(displayInterval);
                return;
            }
            await this.printPriceBoard();
        }, this.TIMING_CONFIG.DISPLAY_UPDATE_INTERVAL);

        process.on('SIGINT', () => {
            console.log("\nStopping price generator...");
            this.isRunning = false;
            clearInterval(updateInterval);
            clearInterval(displayInterval);
            process.exit(0);
        });
    }

    async generateVolatileEvent(symbol, multiplier = 1.5) {
        if (!this.currentPrices[symbol]) {
            console.log(`Symbol ${symbol} not found in current prices`);
            return;
        }

        console.log(`\n🚨 VOLATILE EVENT: ${symbol} price shock via Router!`);

        const currentPrice = parseFloat(this.currentPrices[symbol]);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const shockPrice = (currentPrice * (1 + direction * 0.1 * multiplier)).toFixed(6);

        this.currentPrices[symbol] = shockPrice;

        this.priceHistory[symbol].push({
            price: shockPrice,
            timestamp: Date.now()
        });

        const tokenAddress = symbol === 'ETH' ?
            ethers.ZeroAddress :
            this.config.tokens[symbol]?.address;

        if (tokenAddress) {
            try {
                const isOperational = await this.checkSystemStatus();
                if (!isOperational) {
                    console.log("🔴 Cannot execute volatile event - system is paused");
                    return;
                }

                console.log(`[${new Date().toLocaleTimeString()}] Executing volatile event via Router...`);

                await new Promise(resolve => setTimeout(resolve, this.TIMING_CONFIG.VOLATILE_EVENT_DELAY));

                const gasPrice = await this.getOptimalGasPrice();
                const currentNonce = await this.keeper.getNonce();

                const tx = await this.router.connect(this.keeper).updateOraclePrice(
                    tokenAddress,
                    ethers.parseEther(shockPrice),
                    {
                        gasLimit: 300000,
                        gasPrice: gasPrice,
                        nonce: currentNonce
                    }
                );
                await tx.wait();

                console.log(`${symbol} price ${direction > 0 ? 'surged' : 'crashed'} to ${shockPrice} via Router`);
            } catch (error) {
                if (error.message.includes("System paused")) {
                    console.log("🔴 Volatile event triggered system pause - this is normal behavior");
                } else if (error.message.includes("Price change too large")) {
                    console.log("🔴 Volatile event rejected by circuit breaker - this is normal protection");
                } else if (error.message.includes("nonce")) {
                    console.log("⚠️ Volatile event nonce conflict - will retry next cycle");
                } else {
                    this.logError("Volatile event", error.message);
                }
            }
        }
    }
}

async function main() {
    const generator = new PriceGenerator();
    await generator.initialize();

    const tokenSymbols = generator.tokenSymbols.filter(s => s !== 'ETH');
    if (tokenSymbols.length > 0) {
        setTimeout(() => generator.generateVolatileEvent('ETH', 2), generator.TIMING_CONFIG.ETH_VOLATILE_EVENT_DELAY);
        setTimeout(() => generator.generateVolatileEvent(tokenSymbols[0], 1.5), generator.TIMING_CONFIG.TOKEN_VOLATILE_EVENT_DELAY);
    }

    await generator.start();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = PriceGenerator;

/*
* TIMING_CONFIG - основные интервалы и задержки

Интервалы обновления цен и отображения
Задержки между операциями и при ошибках
Тайминги volatile events


STORAGE_LIMITS - лимиты хранения данных

Максимум записей в истории цен
Максимум записей в логе ошибок


GAS_MULTIPLIERS - настройки газа

Мультипликаторы для оптимального и аварийного газа
Базовое значение для расчетов


VOLATILITY_CONFIG - настройки волатильности

Различные уровни волатильности для разных типов токенов
Пороговые значения цен для определения волатильности
* */