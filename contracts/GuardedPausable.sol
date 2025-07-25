// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 @author Tellor Inc.
 @title GuardedTellorCaller
 @dev This contract acts as a pausable parent contract. It allows
 * designated guardians to pause the contract in case of emergencies
 * or attacks. The contract maintains a list of guardian addresses who can
 * collectively manage the pause state and guardian membership. Child contracts
 * should add the _onlyUnpaused() function to any functions they wish to be pausable.
*/
contract GuardedPausable {
    // Storage
    mapping(address => bool) public guardians; // mapping of guardian addresses to their status
    bool public paused; // whether the contract is currently paused
    uint256 public guardianCount; // total number of active guardians

    // Events
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);
    event Paused();
    event Unpaused();

    // Functions
    /**
     * @dev Initializes the GuardedPausable with a first guardian
     * @param _firstGuardian address of the initial guardian who can pause/unpause the contract
     */
    constructor(address _firstGuardian) {
        guardians[_firstGuardian] = true;
        guardianCount++;
    }

    /**
     * @dev Allows an existing guardian to add a new guardian
     * @param _newGuardian address of the new guardian to add
     */
    function addGuardian(address _newGuardian) public {
        require(guardians[msg.sender], "GuardedPausable: Not a guardian");
        require(!guardians[_newGuardian], "GuardedPausable: Guardian already exists");
        guardians[_newGuardian] = true;
        guardianCount++;
        emit GuardianAdded(_newGuardian);
    }

    /**
     * @dev Allows an existing guardian to remove another guardian
     * @param _guardian address of the guardian to remove
     */
    function removeGuardian(address _guardian) public {
        require(guardians[msg.sender], "GuardedPausable: Not a guardian");
        require(guardians[_guardian], "GuardedPausable: Guardian does not exist");
        require(guardianCount > 1, "GuardedPausable: Cannot remove last guardian");
        guardians[_guardian] = false;
        guardianCount--;
        emit GuardianRemoved(_guardian);
    }

    /**
     * @dev Allows a guardian to pause the contract, preventing oracle calls
     */
    function pause() public {
        require(guardians[msg.sender], "GuardedPausable: Not a guardian");
        require(!paused, "GuardedPausable: Already paused");
        paused = true;
        emit Paused();
    }

    /**
     * @dev Allows a guardian to unpause the contract, resuming oracle calls
     */
    function unpause() public {
        require(guardians[msg.sender], "GuardedPausable: Not a guardian");
        require(paused, "GuardedPausable: Already unpaused");
        paused = false;
        emit Unpaused();
    }

    function _onlyUnpaused() internal view {
        require(!paused, "GuardedPausable: Tellor is paused");
    }
}