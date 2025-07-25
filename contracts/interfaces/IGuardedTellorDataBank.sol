// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 @author Tellor Inc.
 @title IGuardedTellorDataBank
 @dev an interface for the GuardedTellorDataBank contract.
*/
interface IGuardedTellorDataBank {
    /**
     * @dev struct to store aggregate oracle data
     */
    struct AggregateData {
        bytes value; // the aggregated oracle value
        uint256 power; // the aggregate power of the reporters
        uint256 attestationTimestamp; // the timestamp of the attestation
        uint256 relayTimestamp; // the timestamp of the relay
    }

    /**
     * @dev returns the current aggregate data for a query ID (guarded - respects pause state)
     * @param _queryId the query ID to retrieve current data for
     * @return _aggregateData the current aggregate data
     * @return _aggregateTimestamp the timestamp of the current aggregate data
     */
    function getCurrentAggregateDataGuarded(bytes32 _queryId) external view returns (AggregateData memory _aggregateData, uint256 _aggregateTimestamp);
}