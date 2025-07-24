// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {GuardedTellorDataBank} from "./GuardedTellorDataBank.sol";

contract GuardedTellorChainlinkAdapter is AggregatorV3Interface {
    GuardedTellorDataBank public tellorDataBank;
    bytes32 public queryId;
    uint8 public decimals;

    constructor(address _tellorDataBank, bytes32 _queryId, uint8 _decimals) {
        tellorDataBank = GuardedTellorDataBank(_tellorDataBank);
        queryId = _queryId;
        decimals = _decimals;
    }

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
        try tellorDataBank.getCurrentAggregateDataGuarded(queryId) returns (
            GuardedTellorDataBank.AggregateData memory _data,
            uint256 _aggregateTimestamp
        ) {
            uint256 _valueUint = abi.decode(_data.value, (uint256));
            return (1, int256(_valueUint), 0, _aggregateTimestamp, 0);
        } catch {
            return (0, 0, 0, 0, 0);
        }
    }
}
