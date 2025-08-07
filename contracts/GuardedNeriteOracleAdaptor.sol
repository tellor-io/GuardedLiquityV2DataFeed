// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {NeriteAggregatorV3Interface} from "./interfaces/NeriteAggregatorV3Interface.sol";
import {ITellorDataBank} from "./interfaces/ITellorDataBank.sol";
import {GuardedPausable} from "./GuardedPausable.sol";

/**
 @author Tellor Inc.
 @title GuardedNeriteOracleAdaptor
 @dev this contract implements NeriteAggregatorV3Interface to provide Tellor oracle data from a TellorDataBank.
 * It is guarded by a GuardedPausable contract to allow for pausing and unpausing of oracle reads.
 */
contract GuardedNeriteOracleAdaptor is NeriteAggregatorV3Interface, GuardedPausable {
    // Storage
    ITellorDataBank public immutable dataBank; // the Tellor data bank contract to retrieve oracle data from
    bytes32 public immutable queryId; // the specific query ID this adapter serves data for
    uint8 public immutable decimals; // the number of decimals for the price data
    string public name; // the name of the price feed
    uint256 public constant MS_PER_SECOND = 1000; // the number of milliseconds in a second

    /**
     * @dev initializes the adapter with a data bank, query ID, decimal precision, name, and admin
     * @param _tellorDataBank address of the TellorDataBank contract
     * @param _queryId the query ID this adapter will serve data for
     * @param _decimals the number of decimals for the returned price data
     * @param _name the name or description of the price feed
     * @param _admin the address of the admin who can add and remove guardians
     */
    constructor(address _tellorDataBank, bytes32 _queryId, uint8 _decimals, string memory _name, address _admin) GuardedPausable(_admin) {
        dataBank = ITellorDataBank(_tellorDataBank);
        queryId = _queryId;
        decimals = _decimals;
        name = _name;
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
        (ITellorDataBank.AggregateData memory _aggregateData) = dataBank.getCurrentAggregateData(queryId);
        require(_aggregateData.aggregateTimestamp > 0, "GuardedNeriteOracleAdaptor: No data available");
        // decode the oracle value from bytes to uint256
        uint256 _price = abi.decode(_aggregateData.value, (uint256));
        require(_price < uint256(type(int256).max), "GuardedNeriteOracleAdaptor: Price too large");
        // convert aggregateTimestamp to seconds
        return (1, int256(_price), 0, _aggregateData.aggregateTimestamp / MS_PER_SECOND, 0);
    }
}