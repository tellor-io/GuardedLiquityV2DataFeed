// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IGuardedTellorDataBank} from "./interfaces/IGuardedTellorDataBank.sol";

/**
 @author Tellor Inc.
 @title GuardedTellorChainlinkAdapter
 @dev this contract implements Chainlink's AggregatorV3Interface to provide Tellor oracle data
 * in a format compatible with Chainlink price feeds. It retrieves data from a GuardedTellorDataBank
 * and formats it according to Chainlink's expected return structure. This enables easy migration
 * from Chainlink to Tellor for applications expecting Chainlink's interface.
*/
contract GuardedTellorChainlinkAdapter is AggregatorV3Interface {
    // Storage
    IGuardedTellorDataBank public tellorDataBank; // the Tellor data bank contract to retrieve oracle data from
    bytes32 public queryId; // the specific query ID this adapter serves data for
    uint8 public decimals; // the number of decimals for the price data

    /**
     * @dev initializes the adapter with a data bank, query ID, and decimal precision
     * @param _tellorDataBank address of the GuardedTellorDataBank contract
     * @param _queryId the query ID this adapter will serve data for
     * @param _decimals the number of decimals for the returned price data
     */
    constructor(address _tellorDataBank, bytes32 _queryId, uint8 _decimals) {
        tellorDataBank = IGuardedTellorDataBank(_tellorDataBank);
        queryId = _queryId;
        decimals = _decimals;
    }

    /**
     * @dev returns the latest round data in Chainlink format using Tellor oracle data
     * @return roundId always returns 1
     * @return answer the latest oracle value converted to int256
     * @return startedAt always returns 0
     * @return updatedAt the timestamp when the data was last updated (in seconds)
     * @return answeredInRound always returns 0
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
        // attempt to retrieve guarded data from Tellor data bank
        try tellorDataBank.getCurrentAggregateDataGuarded(queryId) returns (
            IGuardedTellorDataBank.AggregateData memory _data,
            uint256 _aggregateTimestamp
        ) {
            if (_data.value.length == 0 || _aggregateTimestamp == 0) {
                return (0, 0, 0, 0, 0);
            }
            // decode the oracle value from bytes to uint256, then convert to int256
            uint256 _valueUint = abi.decode(_data.value, (uint256));
            // convert aggregateTimestamp to seconds
            return (1, int256(_valueUint), 0, _aggregateTimestamp / 1000, 0);
        } catch {
            // return zero values if data retrieval fails (e.g., when paused or no data available)
            return (0, 0, 0, 0, 0);
        }
    }
}
