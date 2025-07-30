require("@nomicfoundation/hardhat-toolbox");
const { vars } = require("hardhat/config");

// Get environment variables with fallbacks to avoid errors during test discovery
const INFURA_API_KEY = vars.get("INFURA_API_KEY", "");
const PK = vars.get("PK", "0x0000000000000000000000000000000000000000000000000000000000000001");
const ETHERSCAN_API_KEY = vars.get("ETHERSCAN_API_KEY", "");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 300
          }
        }
      },
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 300
          }
        }
      }
    ]
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true
    },
    sepolia: {
      url: INFURA_API_KEY ? `https://sepolia.infura.io/v3/${INFURA_API_KEY}` : "",
      accounts: PK ? [PK] : [],
    },
    sagaevm: {
      url: "https://sagaevm.jsonrpc.sagarpc.io",
      accounts: [PK],
      gas: 10000000,
      gasPrice: 5000000000
    }
  },
  etherscan: {
    apiKey: {
      'sagaevm': 'empty',
      'sepolia': ETHERSCAN_API_KEY
    },
    customChains: [
      {
        network: "sagaevm",
        chainId: 5464,
        urls: {
          apiURL: "https://api-sagaevm.sagaexplorer.io/api",
          browserURL: "https://sagaevm.sagaexplorer.io:443"
        }
      }
    ]
  }
};