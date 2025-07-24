# GuardedTellorChainlinkAdapter

GuardedTellorChainlinkAdapter is an adapter contract which adds a _pause_ functionality for tellor oracle users. User contracts can read tellor data through this guarded contract, but when this contract is paused, oracle reads revert. This contract gets deployed with two arguments: [the tellor oracle address](https://docs.tellor.io/tellor/the-basics/contracts-reference), and the first _guardian_ address. Any guardian can pause and unpause the contract at any time. Also, a guardian can add or remove other guardians. Under normal operations, this contract uses the evm `call` method (via a fallback function) to pass contract calls to the tellor oracle, and then passes any returned data to the caller.

This contract does not directly affect the tellor oracle contract.
## Contract






## Install
```shell
git clone https://github.com/tellor-io/GuardedTellorCaller.git
cd GuardedTellorCaller
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

### Set Constructor Variables
Set `TELLOR_ADDRESS` and `GUARDIAN_ADDRESS` in `ignition/modules/GuardedTellorCaller.js`:

```javascript
const TELLOR_ADDRESS = "0x0000000000000000000000000000000000000000";
const GUARDIAN_ADDRESS = "0x0000000000000000000000000000000000000000";
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

### Deploy
Deploy the contract:

```shell
npx hardhat ignition deploy ignition/modules/GuardedTellorCaller.js --network sepolia --deployment-id sepolia-deployment
```

### Verify
Verify the contract:

```shell
npx hardhat ignition verify sepolia-deployment
```