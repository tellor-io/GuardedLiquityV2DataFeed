// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 @author Tellor Inc.
 @title GuardedPausable
 @dev This contract acts as a pausable parent contract. It allows
 * guardians to pause the contract in case of emergencies or attacks. 
 * The contract maintains a list of guardian addresses who can each manage 
 * the pause state. An admin address can add/remove guardians. 
 * Child contracts should add the _onlyUnpaused() function to any functions 
 * they wish to be pausable.
*/
contract GuardedPausable {
    // Storage
    address public admin; // address of the admin who can add/remove guardians
    mapping(address => bool) public guardians; // mapping of guardian addresses to their status
    address[] public guardianList; // array to store guardian addresses for easy querying
    mapping(address => uint256) public guardianIndex; // mapping to track guardian position in array
    bool public paused; // whether the contract is currently paused

    // Events
    event AdminRemoved();
    event AdminUpdated(address indexed newAdmin);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);
    event Paused();
    event Unpaused();

    // Functions
    /**
     * @dev Initializes the GuardedPausable with an admin address
     * @param _admin address of the initial admin who can add/remove guardians
     */
    constructor(address _admin) {
        admin = _admin;
        _addGuardian(_admin);
    }

    /**
     * @dev Allows admin to add a new guardian
     * @param _newGuardian address of the new guardian to add
     */
    function addGuardian(address _newGuardian) public {
        require(msg.sender == admin, "GuardedPausable: Not an admin");
        require(!guardians[_newGuardian], "GuardedPausable: Guardian already exists");
        _addGuardian(_newGuardian);
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
     * @dev Allows admin to remove a guardian
     * @param _guardian address of the guardian to remove
     */
    function removeGuardian(address _guardian) public {
        require(msg.sender == admin, "GuardedPausable: Not an admin");
        require(guardians[_guardian], "GuardedPausable: Guardian does not exist");
        if (_guardian == admin) {
            require(guardianCount() == 1, "GuardedPausable: Cannot remove admin if there are other guardians");
            admin = address(0);
            emit AdminRemoved();
        }
        _removeGuardian(_guardian);
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

    /**
     * @dev Allows admin to update the admin address
     * @param _newAdmin address of the new admin
     */
    function updateAdmin(address _newAdmin) public {
        require(msg.sender == admin, "GuardedPausable: Not an admin");
        require(_newAdmin != admin, "GuardedPausable: New admin cannot be the same as the current admin");
        // if new admin is not a guardian, add them
        if (!guardians[_newAdmin] && _newAdmin != address(0)) {
            _addGuardian(_newAdmin);
        }
        if (guardians[admin]) {
            _removeGuardian(admin);
        }
        admin = _newAdmin;
        emit AdminUpdated(_newAdmin);
    }

    // View functions
    /**
     * @dev Returns an array of all guardian addresses
     * @return Array of guardian addresses
     */
    function getGuardianAddresses() public view returns (address[] memory) {
        return guardianList;
    }

    /**
     * @dev Returns a guardian address at a specific index
     * @param index The index of the guardian to retrieve
     * @return The guardian address at the given index
     */
    function getGuardianAtIndex(uint256 index) public view returns (address) {
        require(index < guardianList.length, "GuardedPausable: Index out of bounds");
        return guardianList[index];
    }

    /**
     * @dev Returns the number of guardians
     * @return Number of guardians
     */
    function guardianCount() public view returns (uint256) {
        return guardianList.length;
    }

    // internal functions
    /**
     * @dev Adds a guardian to the guardian list
     * @param _guardian address of the guardian to add
     */
    function _addGuardian(address _guardian) internal {
        guardians[_guardian] = true;
        guardianList.push(_guardian);
        guardianIndex[_guardian] = guardianList.length - 1;
        emit GuardianAdded(_guardian);
    }

    /**
     * @dev Removes a guardian from the guardian list
     * @param _guardian address of the guardian to remove
     */
    function _removeGuardian(address _guardian) internal {
        // Remove from array efficiently
        uint256 index = guardianIndex[_guardian];
        uint256 lastIndex = guardianList.length - 1;
        
        if (index != lastIndex) {
            // Move the last element to the position of the element to delete
            address lastGuardian = guardianList[lastIndex];
            guardianList[index] = lastGuardian;
            guardianIndex[lastGuardian] = index;
        }
        
        guardianList.pop();
        delete guardianIndex[_guardian];
        guardians[_guardian] = false;
        emit GuardianRemoved(_guardian);
    }

    /**
     * @dev Reverts if the contract is paused
     */
    function _onlyUnpaused() internal view {
        require(!paused, "GuardedPausable: Tellor is paused");
    }
}