require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("dotenv").config();


module.exports = {
  defaultNetwork: process.env.HARDHAT_NETWORK || "localhost",
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 31337,
      host: '0.0.0.0',
      port: 8545,
      gas: "auto",
      gasPrice: "auto",
      blockGasLimit: 50000000,
      allowUnlimitedContractSize: true
    },
    localhost: {
      url: process.env.HARDHAT_NETWORK === 'docker' ?
        "http://hardhat-node:8545" :
        "http://127.0.0.1:8545",
      chainId: 31337,
      timeout: 60000,
      gas: "auto",
      gasPrice: "auto",
      blockGasLimit: 50000000,
      allowUnlimitedContractSize: true,
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
        "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
      ]
    },
    anvil: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      timeout: 60000,
      gas: "auto",
      gasPrice: "auto",
      blockGasLimit: 50000000,
      allowUnlimitedContractSize: true,
      accounts: [process.env.ANVIL_DEPLOYER_PRIVATE_KEY, process.env.ANVIL_KEEPER_PRIVATE_KEY]
    },
    docker: {
      url: "http://hardhat-node:8545",
      chainId: 31337,
      timeout: 60000,
      gas: "auto",
      gasPrice: "auto",
      blockGasLimit: 50000000,
      allowUnlimitedContractSize: true,
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
        "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
      ]
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      gas: "auto",
      gasPrice: "auto",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      gas: "auto",
      gasPrice: "auto",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};