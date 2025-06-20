require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      url: "http://hardhat-node:8545",
      chainId: 31337,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk"
      }
    },
    docker: {
      url: "http://hardhat-node:8545",
      chainId: 31337,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk"
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  }
};