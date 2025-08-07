// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "usingtellorlayer/contracts/interfaces/ITellorDataBridge.sol";
import {ITellorDataBank} from "./interfaces/ITellorDataBank.sol";

/**
 @author Tellor Inc.
 @title TellorDataBank
 @dev this contract is used to store data for multiple data feeds. It prioritizes consensus data,
 and falls back to optimistic data if consensus data is not available. It has hardcoded preferences
 for max data age, max attestation age, optimistic delay, and optimistic power threshold.
*/
contract TellorDataBank is ITellorDataBank {
    // Storage
    ITellorDataBridge public immutable dataBridge; // interface to the Tellor data bridge
    mapping(bytes32 => AggregateData[]) public data; // queryId -> aggregate data array
    uint256 public constant MAX_DATA_AGE = 24 hours; // the max age of relayed data
    uint256 public constant MAX_ATTESTATION_AGE = 10 minutes; // the max age of an attestation
    uint256 public constant MS_PER_SECOND = 1000; // the number of milliseconds in a second
    uint256 public constant OPTIMISTIC_DELAY = 12 hours; // the min time from report to attestation for nonconsensus data

    // Events
    event OracleUpdated(bytes32 indexed queryId, OracleAttestationData attestData);

    // Functions
    /**
     * @dev initializes the TellorDataBank with a data bridge
     * @param _dataBridge address of the Tellor data bridge contract
     */
    constructor(address _dataBridge) {
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
        data[_attestData.queryId].push(AggregateData(
            _attestData.report.value, 
            _attestData.report.aggregatePower, 
            _attestData.report.timestamp,
            _attestData.attestationTimestamp, 
            block.timestamp
        ));
        emit OracleUpdated(_attestData.queryId, _attestData);
    }

    // Getter functions

    /**
     * @dev returns the aggregate data for a given query ID and index
     * @param _queryId the query ID to get the aggregate data for
     * @param _index the index of the aggregate data to get
     * @return _aggregateData the aggregate data
     */
    function getAggregateByIndex(bytes32 _queryId, uint256 _index) external view returns (AggregateData memory _aggregateData) {
        return data[_queryId][_index];
    }

    /**
     * @dev returns the total number of aggregate values
     * @param _queryId the query ID to get the aggregate value count for
     * @return number of aggregate values stored
     */
    function getAggregateValueCount(bytes32 _queryId) external view returns (uint256) {
        return data[_queryId].length;
    }

    /**
     * @dev returns the current aggregate data for a given query ID
     * @param _queryId the query ID to get the current aggregate data for
     * @return _aggregateData the current aggregate data
     */
    function getCurrentAggregateData(bytes32 _queryId) external view returns (AggregateData memory _aggregateData) {
        return _getCurrentAggregateData(_queryId);
    }

    // Internal functions
    /**
     * @dev internal function to get the current aggregate data for a query ID
     * @param _queryId the query ID to get the current aggregate data for
     * @return _aggregateData the current aggregate data
     */
    function _getCurrentAggregateData(bytes32 _queryId) internal view returns (AggregateData memory _aggregateData) {
        if (data[_queryId].length == 0) {
            return (AggregateData(bytes(""), 0, 0, 0, 0));
        }
        _aggregateData = data[_queryId][data[_queryId].length - 1];
        return _aggregateData;
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
        require(block.timestamp - (_attestData.report.timestamp / MS_PER_SECOND) < MAX_DATA_AGE, "TellorDataBank: Data too old");
        // check that the attestation is not too old
        require(block.timestamp - (_attestData.attestationTimestamp / MS_PER_SECOND) < MAX_ATTESTATION_AGE, "TellorDataBank: Attestation too old");
        // check that timestamps are monotonically increasing
        AggregateData memory _previousData = _getCurrentAggregateData(_attestData.queryId);
        if (_previousData.aggregateTimestamp > 0) {
            require(_attestData.report.timestamp > _previousData.aggregateTimestamp, "TellorDataBank: Report timestamp must increase");
        }
        // check that the current block timestamp is greater than or equal to the report timestamp
        require(block.timestamp >= (_attestData.report.timestamp / MS_PER_SECOND), "TellorDataBank: Report timestamp is in the future");
        // check if there's a more recent optimistic report available
        if (_attestData.report.nextTimestamp != 0) {
            require(block.timestamp - (_attestData.report.nextTimestamp / MS_PER_SECOND) < OPTIMISTIC_DELAY, "TellorDataBank: More recent optimistic report available");
        }
        // handle optimistic vs consensus data verification
        if (_attestData.report.timestamp != _attestData.report.lastConsensusTimestamp) {
            // using optimistic data - additional checks required
            require(_attestData.report.lastConsensusTimestamp < _attestData.report.timestamp, "TellorDataBank: Newer consensus data available");
            require((_attestData.attestationTimestamp - _attestData.report.timestamp) / MS_PER_SECOND >= OPTIMISTIC_DELAY, "TellorDataBank: Dispute period not passed");
            require(_attestData.report.aggregatePower > dataBridge.powerThreshold() / 2, "TellorDataBank: Insufficient optimistic report power");
        } 
        // verify signatures and data integrity through the data bridge
        dataBridge.verifyOracleData(_attestData, _currentValidatorSet, _sigs);
    }
}