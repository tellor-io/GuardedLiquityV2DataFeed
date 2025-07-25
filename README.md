# GuardedTellorChainlinkAdapter

GuardedTellorChainlinkAdapter provides Chainlink-compatible oracle data from Tellor with guardian pause functionality. This repository contains three main contracts:

- **GuardedTellorDataBank**: Stores and validates Tellor oracle data with guardian pause controls
- **GuardedTellorChainlinkAdapter**: Implements Chainlink's AggregatorV3Interface to serve Tellor data in Chainlink format
- **GuardedPausable**: Base contract providing guardian management and pause functionality

The adapter allows existing Chainlink-based applications to easily migrate to Tellor oracle data while maintaining the same interface. Guardians can pause the system when needed, causing oracle reads to return zero values for safety.

## Install
```shell
git clone https://github.com/tellor-io/GuardedTellorChainlinkAdapter.git
cd GuardedTellorChainlinkAdapter
npm i
```

## Run Tests
```shell
npx hardhat test
```

## Deployment

### Setup Config Variables
Setup config variables for `INFURA_API_KEY`, `PK`, and `ETHERSCAN_API_KEY`:

```shell
npx hardhat vars set INFURA_API_KEY
```

### Deploy GuardedTellorDataBank

Set constructor variables in `ignition/modules/GuardedTellorDataBank.js`:

```javascript
const DATA_BRIDGE_ADDRESS = "0x0000000000000000000000000000000000000000";
const GUARDIAN_ADDRESS = "0x0000000000000000000000000000000000000000";
```

Deploy:

```shell
npx hardhat ignition deploy ignition/modules/GuardedTellorDataBank.js --network sepolia --deployment-id sepolia-databank
```

### Deploy GuardedTellorChainlinkAdapter

Set constructor variables in `ignition/modules/GuardedTellorChainlinkAdapter.js`:

```javascript
const TELLOR_DATA_BANK_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DECIMALS = 18;
```

Deploy:

```shell
npx hardhat ignition deploy ignition/modules/GuardedTellorChainlinkAdapter.js --network sepolia --deployment-id sepolia-adapter
```

### Setup Your EVM Network

In hardhat.config.js, set your EVM network:

```javascript
networks: {
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [PK],
    },
  },
```

### Verify
Verify the contracts:

```shell
npx hardhat ignition verify sepolia-databank
npx hardhat ignition verify sepolia-adapter
```