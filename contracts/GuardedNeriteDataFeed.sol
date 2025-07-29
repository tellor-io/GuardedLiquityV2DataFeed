// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "usingtellorlayer/contracts/interfaces/ITellorDataBridge.sol";
import { GuardedPausable } from "./GuardedPausable.sol";
import { NeriteAggregatorV3Interface } from "./interfaces/NeriteAggregatorV3Interface.sol";

/**
 @author Tellor Inc.
 @title GuardedNeriteDataFeed
 @dev this contract is used to store data for a single price feed. It is 
 * guarded by a GuardedPausable contract, which can pause data feed reads and 
 * add/remove guardians. Pausing only affects the latestRoundData function.
*/
contract GuardedNeriteDataFeed is GuardedPausable, NeriteAggregatorV3Interface {

    // Storage
    /**
     * @dev struct to store aggregate oracle data
     */
    struct AggregateData {
        int256 price; // the price of the asset
        uint256 power; // the aggregate power of the reporters
        uint256 aggregateTimestamp; // the timestamp of the aggregate
        uint256 attestationTimestamp; // the timestamp of the attestation
        uint256 relayTimestamp; // the timestamp of the relay
    }

    ITellorDataBridge public immutable dataBridge; // interface to the Tellor data bridge
    AggregateData[] public data; // timestamp -> aggregate data
    uint8 public constant DECIMALS = 18; // the number of decimals for the price data
    uint256 public constant MAX_DATA_AGE = 24 hours; // the max age of relayed data
    uint256 public constant MAX_ATTESTATION_AGE = 10 minutes; // the max age of an attestation
    uint256 public constant MS_PER_SECOND = 1000; // the number of milliseconds in a second
    uint256 public constant OPTIMISTIC_DELAY = 12 hours; // the min time from report to attestation for nonconsensus data
    bytes32 public immutable queryId; // the query ID to retrieve current data for

    // Events
    event OracleUpdated(bytes32 indexed queryId, int256 price, uint256 power);

    // Functions
    /**
     * @dev initializes the GuardedNeriteDataFeed with a data bridge, query ID, and admin
     * @param _dataBridge address of the Tellor data bridge contract
     * @param _queryId the query ID to retrieve current data for
     * @param _admin address of the admin who can pause/unpause the contract
     */
    constructor(address _dataBridge, bytes32 _queryId, address _admin) GuardedPausable(_admin) {
        dataBridge = ITellorDataBridge(_dataBridge);
        queryId = _queryId;
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
        int256 _price = int256(abi.decode(_attestData.report.value, (uint256)));
        data.push(AggregateData(
            _price, 
            _attestData.report.aggregatePower, 
            _attestData.report.timestamp,
            _attestData.attestationTimestamp, 
            block.timestamp
        ));
        emit OracleUpdated(_attestData.queryId, int256(_price), _attestData.report.aggregatePower);
    }

    // Getter functions
    /**
     * @dev returns the decimals for the price data
     * @return the number of decimals for the price data
     */
    function decimals() external pure returns (uint8) {
        return DECIMALS;
    }

    /**
     * @dev returns the total number of aggregate values
     * @return number of aggregate values stored
     */
    function getAggregateValueCount() external view returns (uint256) {
        return data.length;
    }

    /**
     * @dev returns the latest round data in Chainlink format using Tellor oracle data
     * @return roundId always returns 1 (not used)
     * @return answer the latest oracle value converted to int256
     * @return startedAt always returns 0 (not used)
     * @return updatedAt the timestamp when the data was last updated (in seconds)
     * @return answeredInRound always returns 0 (not used)
     */
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        _onlyUnpaused();
        (AggregateData memory _aggregateData) = _getCurrentAggregateData();
        require(_aggregateData.aggregateTimestamp > 0, "GuardedNeriteDataFeed: No data available");
        // convert aggregateTimestamp to seconds
        return (1, _aggregateData.price, 0, _aggregateData.aggregateTimestamp / MS_PER_SECOND, 0);
    }

    // Internal functions
    /**
     * @dev internal function to get the current aggregate data for a query ID
     * @return _aggregateData the current aggregate data
     */
    function _getCurrentAggregateData() internal view returns (AggregateData memory _aggregateData) {
        if (data.length == 0) {
            return (AggregateData(0, 0, 0, 0, 0));
        }
        _aggregateData = data[data.length - 1];
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
        // check that the query ID is correct
        require(_attestData.queryId == queryId, "GuardedNeriteDataFeed: Incorrect query ID");
        // check that the data is not too old
        require(block.timestamp - (_attestData.report.timestamp / MS_PER_SECOND) < MAX_DATA_AGE, "GuardedNeriteDataFeed: Data too old");
        // check that the attestation is not too old
        require(block.timestamp - (_attestData.attestationTimestamp / MS_PER_SECOND) < MAX_ATTESTATION_AGE, "GuardedNeriteDataFeed: Attestation too old");
        // check that timestamps are monotonically increasing
        AggregateData memory _previousData = _getCurrentAggregateData();
        if (_previousData.aggregateTimestamp > 0) {
            require(_attestData.report.timestamp > _previousData.aggregateTimestamp, "GuardedNeriteDataFeed: Report timestamp must increase");
        }
        // check that the current block timestamp is greater than or equal to the report timestamp
        require(block.timestamp >= (_attestData.report.timestamp / MS_PER_SECOND), "GuardedNeriteDataFeed: Report timestamp is in the future");
        // check if there's a more recent optimistic report available
        if (_attestData.report.nextTimestamp != 0) {
            require(block.timestamp - (_attestData.report.nextTimestamp / MS_PER_SECOND) < OPTIMISTIC_DELAY, "GuardedNeriteDataFeed: More recent optimistic report available");
        }
        // handle optimistic vs consensus data verification
        if (_attestData.report.timestamp != _attestData.report.lastConsensusTimestamp) {
            // using optimistic data - additional checks required
            require(_attestData.report.lastConsensusTimestamp < _attestData.report.timestamp, "GuardedNeriteDataFeed: Newer consensus data available");
            require((_attestData.attestationTimestamp - _attestData.report.timestamp) / MS_PER_SECOND >= OPTIMISTIC_DELAY, "GuardedNeriteDataFeed: Dispute period not passed");
            require(_attestData.report.aggregatePower > dataBridge.powerThreshold() / 2, "GuardedNeriteDataFeed: Insufficient optimistic report power");
        } 
        // verify signatures and data integrity through the data bridge
        dataBridge.verifyOracleData(_attestData, _currentValidatorSet, _sigs);
    }
}