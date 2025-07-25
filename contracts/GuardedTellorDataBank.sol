// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "usingtellorlayer/contracts/interfaces/ITellorDataBridge.sol";
import { GuardedPausable } from "./GuardedPausable.sol";

/**
 @author Tellor Inc.
 @title GuardedTellorDataBank
 @dev this contract is used to store data for multiple price feeds. It prioritizes faster consensus data, but falls back to
 * optimistic data if the consensus data is not available. It is guarded by a GuardedPausable contract, which can pause 
 * the data bank and add/remove guardians. Pausing only affects the getCurrentAggregateDataGuarded function.
*/
contract GuardedTellorDataBank is GuardedPausable {

    // Storage
    /**
     * @dev struct to store aggregate oracle data
     */
    struct AggregateData {
        bytes value; // the aggregated oracle value
        uint256 power; // the aggregate power of the reporters
        uint256 attestationTimestamp; // the timestamp of the attestation
        uint256 relayTimestamp; // the timestamp of the relay
    }

    ITellorDataBridge public dataBridge; // interface to the Tellor data bridge
    mapping(bytes32 => uint256[]) public timestamps; // queryId -> aggregate data timestamps
    mapping(bytes32 => mapping(uint256 => AggregateData)) public data; // queryId -> timestamp -> aggregate data
    uint256 public constant MAX_DATA_AGE = 24 hours; // the max age of relayed data
    uint256 public constant MAX_ATTESTATION_AGE = 10 minutes; // the max age of an attestation
    uint256 public constant OPTIMISTIC_DELAY = 12 hours; // the min time from report to attestation for nonconsensus data
    uint256 public constant MS_PER_SECOND = 1000; // the number of milliseconds in a second

    // Events
    event OracleUpdated(bytes32 indexed queryId, bytes value, uint256 power);

    // Functions
    /**
     * @dev initializes the GuardedTellorDataBank with a data bridge and first guardian
     * @param _dataBridge address of the Tellor data bridge contract
     * @param _firstGuardian address of the initial guardian who can pause/unpause the contract
     */
    constructor(address _dataBridge, address _firstGuardian) GuardedPausable(_firstGuardian) {
        dataBridge = ITellorDataBridge(_dataBridge);
    }

    /**
     * @dev updates oracle data with new attestation data after verification
     * @param _attestData the oracle attestation data to be stored
     * @param _currentValidatorSet array of current validators
     * @param _sigs array of validator signatures
     */
    function updateOracleData(
        OracleAttestationData calldata _attestData,
        Validator[] calldata _currentValidatorSet,
        Signature[] calldata _sigs
    ) external {
        _verifyOracleData(
            _attestData,
            _currentValidatorSet,
            _sigs
        );
        timestamps[_attestData.queryId].push(_attestData.report.timestamp);
        data[_attestData.queryId][_attestData.report.timestamp] = AggregateData(
            _attestData.report.value, 
            _attestData.report.aggregatePower, 
            _attestData.attestationTimestamp, 
            block.timestamp
        );
        emit OracleUpdated(_attestData.queryId, _attestData.report.value, _attestData.report.aggregatePower);
    }

    // Getter functions
    /**
     * @dev returns the total number of aggregate values for a given query ID
     * @param _queryId the query ID to check
     * @return number of aggregate values stored
     */
    function getAggregateValueCount(bytes32 _queryId) external view returns (uint256) {
        return timestamps[_queryId].length;
    }

    /**
     * @dev returns aggregate data for a specific query ID and timestamp
     * @param _queryId the query ID to retrieve data for
     * @param _timestamp the specific timestamp to retrieve data for
     * @return aggregate data for the specified query and timestamp
     */
    function getAggregateDataByTimestamp(bytes32 _queryId, uint256 _timestamp) external view returns (AggregateData memory) {
        return data[_queryId][_timestamp];
    }

    /**
     * @dev returns the timestamp at a specific index for a given query ID
     * @param _queryId the query ID to check
     * @param _index the index in the timestamps array
     * @return timestamp at the specified index
     */
    function getAggregateTimestampByIndex(bytes32 _queryId, uint256 _index) external view returns (uint256) {
        return timestamps[_queryId][_index];
    }

    /**
     * @dev returns the current aggregate data for a query ID (guarded - respects pause state)
     * @param _queryId the query ID to retrieve current data for
     * @return _aggregateData the current aggregate data
     * @return _aggregateTimestamp the timestamp of the current aggregate data
     */
    function getCurrentAggregateDataGuarded(bytes32 _queryId) external view returns (AggregateData memory _aggregateData, uint256 _aggregateTimestamp) {
        _onlyUnpaused();
        return _getCurrentAggregateData(_queryId);
    }

    /**
     * @dev returns the current aggregate data for a query ID (unguarded - ignores pause state)
     * @param _queryId the query ID to retrieve current data for
     * @return _aggregateData the current aggregate data
     * @return _aggregateTimestamp the timestamp of the current aggregate data
     */
    function getCurrentAggregateDataUnGuarded(bytes32 _queryId) external view returns (AggregateData memory _aggregateData, uint256 _aggregateTimestamp) {
        return _getCurrentAggregateData(_queryId);
    }

    // Internal functions
    /**
     * @dev internal function to get the current aggregate data for a query ID
     * @param _queryId the query ID to retrieve current data for
     * @return _aggregateData the current aggregate data
     * @return _aggregateTimestamp the timestamp of the current aggregate data
     */
    function _getCurrentAggregateData(bytes32 _queryId) internal view returns (AggregateData memory _aggregateData, uint256 _aggregateTimestamp) {
        _aggregateTimestamp = _getCurrentAggregateTimestamp(_queryId);
        if (_aggregateTimestamp == 0) {
            return (AggregateData(bytes(""), 0, 0, 0), 0);
        }
        _aggregateData = data[_queryId][_aggregateTimestamp];
        return (_aggregateData, _aggregateTimestamp);
    }

    /**
     * @dev internal function to get the most recent timestamp for a query ID
     * @param _queryId the query ID to check
     * @return _aggregateTimestamp the most recent timestamp, or 0 if no data exists
     */
    function _getCurrentAggregateTimestamp(bytes32 _queryId) internal view returns (uint256 _aggregateTimestamp) {
        if (timestamps[_queryId].length > 0) {
            return timestamps[_queryId][timestamps[_queryId].length - 1];
        }
        return 0;
    }

    /**
     * @dev internal function to verify oracle data meets all requirements before storage
     * @param _attestData the oracle attestation data to verify
     * @param _currentValidatorSet array of current validators
     * @param _sigs array of validator signatures
     */
    function _verifyOracleData(
        OracleAttestationData calldata _attestData,
        Validator[] calldata _currentValidatorSet,
        Signature[] calldata _sigs
    ) internal view {
        // check that the data is not too old
        require(block.timestamp - (_attestData.report.timestamp / MS_PER_SECOND) < MAX_DATA_AGE, "GuardedTellorDataBank: Data too old");
        // check that the attestation is not too old
        require(block.timestamp - (_attestData.attestationTimestamp / MS_PER_SECOND) < MAX_ATTESTATION_AGE, "GuardedTellorDataBank: Attestation too old");
        // check that timestamps are monotonically increasing
        uint256[] memory _timestamps = timestamps[_attestData.queryId];
        if (_timestamps.length > 0) {
            require(_attestData.report.timestamp > _timestamps[_timestamps.length - 1], "GuardedTellorDataBank: Report timestamp must increase");
        }
        // check that the current block timestamp is greater than or equal to the report timestamp
        require(block.timestamp >= (_attestData.report.timestamp / MS_PER_SECOND), "GuardedTellorDataBank: Report timestamp is in the future");
        // check if there's a more recent optimistic report available
        if (_attestData.report.nextTimestamp != 0) {
            require(block.timestamp - (_attestData.report.nextTimestamp / MS_PER_SECOND) < OPTIMISTIC_DELAY, "GuardedTellorDataBank: More recent optimistic report available");
        }
        // handle optimistic vs consensus data verification
        if (_attestData.report.timestamp != _attestData.report.lastConsensusTimestamp) {
            // using optimistic data - additional checks required
            require(_attestData.report.lastConsensusTimestamp < _attestData.report.timestamp, "GuardedTellorDataBank: Newer consensus data available");
            require((_attestData.attestationTimestamp - _attestData.report.timestamp) / MS_PER_SECOND >= OPTIMISTIC_DELAY, "GuardedTellorDataBank: Dispute period not passed. request new attestations");
            require(_attestData.report.aggregatePower > dataBridge.powerThreshold() / 2, "GuardedTellorDataBank: Insufficient optimistic report power");
        } 
        // verify signatures and data integrity through the data bridge
        dataBridge.verifyOracleData(_attestData, _currentValidatorSet, _sigs);
    }
}