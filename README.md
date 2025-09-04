[![Tests](https://github.com/tellor-io/GuardedLiquityV2DataFeed/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/tellor-io/GuardedLiquityV2DataFeed/actions/workflows/tests.yml)

# GuardedLiquityV2DataFeed

GuardedLiquityV2DataFeed provides Tellor oracle data for Liquity V2. This repository contains three main contracts:

- **TellorDataBank**: Stores and validates Tellor oracle data for multiple query IDs. Handles both consensus and optimistic data from the Tellor layer bridge.
- **GuardedLiquityV2OracleAdaptor**: Provides a Chainlink-compatible `latestRoundData()` interface for a specific query ID, with guardian pause controls. A separate instance is deployed for each price feed.
- **GuardedPausable**: Base contract providing guardian management and pause functionality


## Disclaimer
[!WARNING]
The GuardedLiquityV2OracleAdaptor.sol allows pausing and unpausing of data flow via permissioned addresses. Thresholds triggering pauses are externally defined and may change at the team’s discretion. There is no guarantee that a pause will occur before any losses are incurred, and pauses or unpauses may themselves result in losses. Users accept all risks. The team is not liable for any losses or disruptions resulting from the use of this Adaptor.


## Install
```shell
git clone https://github.com/tellor-io/GuardedLiquityV2DataFeed.git
cd GuardedLiquityV2DataFeed
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

### Deploy TellorDataBank

Set constructor variables in `ignition/modules/TellorDataBank.js`:

```javascript
const DATA_BRIDGE_ADDRESS = "0x0000000000000000000000000000000000000000";
```

Deploy:

```shell
npx hardhat ignition deploy ignition/modules/TellorDataBank.js --network sepolia --deployment-id sepolia-data-bank
```

### Deploy GuardedLiquityV2OracleAdaptor

Set constructor variables in `ignition/modules/GuardedLiquityV2OracleAdaptor.js`:

```javascript
const DATA_BANK_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DECIMALS = 18;
const PROJECT_NAME = "ProjectA";
const FEED_NAME = "ETH/USD";
const ADMIN_ADDRESS = "0x0000000000000000000000000000000000000000";
```

Deploy:

```shell
npx hardhat ignition deploy ignition/modules/GuardedLiquityV2OracleAdaptor.js --network sepolia --deployment-id sepolia-eth-usd-adaptor
```

### Verify
Verify the contracts:

```shell
npx hardhat ignition verify sepolia-data-bank
npx hardhat ignition verify sepolia-eth-usd-adaptor
```

## Maintainers <a name="maintainers"> </a>
This repository is maintained by the [Tellor team](https://github.com/orgs/tellor-io/people)


## How to Contribute<a name="how2contribute"> </a>  

Check out our issues log here on Github or feel free to reach out anytime [info@tellor.io](mailto:info@tellor.io)

## Copyright

Tellor Inc. 2025