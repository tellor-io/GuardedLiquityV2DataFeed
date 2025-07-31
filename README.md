[![Tests](https://github.com/tellor-io/GuardedNeriteDataFeed/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/tellor-io/GuardedNeriteDataFeed/actions/workflows/tests.yml)

# GuardedNeriteDataFeed

GuardedNeriteDataFeed provides Tellor oracle data for Nerite. This repository contains two main contracts:

- **GuardedNeriteDataFeed**: Stores and validates Tellor oracle data with guardian pause controls, and allows for data retrieval via a Chainlink-compatible `latestRoundData()` function. A separate instance of this contract is deployed for each price feed.
- **GuardedPausable**: Base contract providing guardian management and pause functionality

## Install
```shell
git clone https://github.com/tellor-io/GuardedNeriteDataFeed.git
cd GuardedNeriteDataFeed
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

### Deploy GuardedNeriteDataFeed

Set constructor variables in `ignition/modules/GuardedNeriteDataFeed.js`:

```javascript
const DATA_BRIDGE_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ADMIN_ADDRESS = "0x0000000000000000000000000000000000000000";
```

Deploy:

```shell
npx hardhat ignition deploy ignition/modules/GuardedNeriteDataFeed.js --network sepolia --deployment-id sepolia-eth-usd-feed
```

### Verify
Verify the contracts:

```shell
npx hardhat ignition verify sepolia-eth-usd-feed
```

## Maintainers <a name="maintainers"> </a>
This repository is maintained by the [Tellor team](https://github.com/orgs/tellor-io/people)


## How to Contribute<a name="how2contribute"> </a>  

Check out our issues log here on Github or feel free to reach out anytime [info@tellor.io](mailto:info@tellor.io)

## Copyright

Tellor Inc. 2025