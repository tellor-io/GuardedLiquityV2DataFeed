# GuardedPausable Guide

GuardedPausable is a parent contract which allows a whitelisted set of "guardians" to pause and unpause certain contract functionality, depending on which child contract's functions invoke `_onlyUnpaused()`. The `GuardedLiquityV2OracleAdaptor` contract uses this to pause and unpause the `latestRoundData()` function. Each instance of the `GuardedLiquityV2OracleAdaptor` contract is separately managed. Adding guardians to all of them, for example, will require submitting separate `addGuardian` calls to each instance.

## Contract Overview

### Admin
The `admin` address, set in the constructor, is the first guardian, and is the only address which can add or remove guardians. The admin address can only be removed after all other guardians have been removed.

### Guardians
`Guardian` addresses are able to pause and unpause the contract at any time. Guardians can only be added or removed by the admin address. To see the total number of guardians (including the admin), you can query `guardianCount()`.

### addGuardian
Adding a guardian requires calling `addGuardian(address)` with the new guardian's address. Only the admin can add guardians. The new address cannot already be a guardian.

### removeGuardian
The admin can remove any guardian (including themselves) by calling `removeGuardian(address)`. However, the admin can only remove themselves if they are the last remaining guardian. When the admin removes themselves, the admin address is set to `address(0)`.

### Pausing
Any guardian can pause the contract by calling `pause()`. Once paused, any child contract functions that include the `_onlyUnpaused()` modifier will revert until the contract is unpaused.

### Unpausing  
Any guardian can unpause the contract by calling `unpause()`. This restores normal functionality to all pausable functions in child contracts.

### Using in Child Contracts
Child contracts should call `_onlyUnpaused()` at the beginning of any function that should be pausable. When the contract is paused, these functions will revert with the message "GuardedPausable: Tellor is paused".

```solidity
function someFunction() public {
    _onlyUnpaused();
    // rest of function logic
}
```

## Contract Interactions

### Adding and Removing Guardians

In the `scripts` folder, you can find scripts to generate the call data for adding and removing guardians.

To add guardians, add the guardian addresses to the `guardianAddresses` array in the script and run it.

```bash
npx hardhat run scripts/generateAddGuardianCallData.js
```

To remove guardians, add the guardian addresses to the `guardianAddresses` array in the script and run it.

```bash
npx hardhat run scripts/generateRemoveGuardianCallData.js
```

You can input the call data into a transaction on the desired chain.

### Pausing and Unpausing

You can pause and unpause the contract by calling `pause()` and `unpause()` respectively. 

The calldata for pausing is as follows:

```bash
0x8456cb59
```

The calldata for unpausing is as follows:

```bash
0x3f4ba83a
```

