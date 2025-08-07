// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../interfaces/LiquityV2OracleAggregatorV3Interface.sol";

/**
 @author Tellor Inc.
 @title MockMainnetPriceFeedBase
 @dev this contract simulates how MainnetPriceFeedBase and other price feed contracts
 * interact with Chainlink price feeds. It's used for testing the GuardedNeriteDataFeed
*/
contract MockMainnetPriceFeedBase {
    // Determines where the PriceFeed sources data from. Possible states:
    // - primary: Uses the primary price calcuation, which depends on the specific feed
    // - ETHUSDxCanonical: Uses Chainlink's ETH-USD multiplied by the LST' canonical rate
    // - lastGoodPrice: the last good price recorded by this PriceFeed.
    // PriceSource public priceSource;

    // Last good price tracker for the derived USD price
    uint256 public lastGoodPrice;
    bool public shutDown;

    struct Oracle {
        LiquityV2OracleAggregatorV3Interface aggregator;
        uint256 stalenessThreshold;
        uint8 decimals;
    }

    struct ChainlinkResponse {
        uint80 roundId;
        int256 answer;
        uint256 timestamp;
        bool success;
    }

    error InsufficientGasForExternalCall();

    event ShutDownFromOracleFailure(address _failedOracleAddr);

    Oracle public ethUsdOracle;


    constructor(address _ethUsdOracleAddress, uint256 _ethUsdStalenessThreshold) {
        // Store ETH-USD oracle
        ethUsdOracle.aggregator = LiquityV2OracleAggregatorV3Interface(_ethUsdOracleAddress);
        ethUsdOracle.stalenessThreshold = _ethUsdStalenessThreshold;
        ethUsdOracle.decimals = ethUsdOracle.aggregator.decimals();

        assert(ethUsdOracle.decimals == 8 || ethUsdOracle.decimals == 18);
    }

    function fetchPriceMock() public {
        assert(shutDown == false);

        (uint256 scaledPrice, bool oracleIsDown) = _getOracleAnswer(ethUsdOracle);

        if (oracleIsDown) {
            shutDown = true;
        }

        lastGoodPrice = scaledPrice;
    } 

    function _getOracleAnswer(Oracle memory _oracle) internal view returns (uint256, bool) {
        ChainlinkResponse memory chainlinkResponse = _getCurrentChainlinkResponse(_oracle.aggregator);

        uint256 scaledPrice;
        bool oracleIsDown;
        // Check oracle is serving an up-to-date and sensible price. If not, shut down this collateral branch.
        if (!_isValidChainlinkPrice(chainlinkResponse, _oracle.stalenessThreshold)) {
            oracleIsDown = true;
        } else {
            scaledPrice = _scaleChainlinkPriceTo18decimals(chainlinkResponse.answer, _oracle.decimals);
        }

        return (scaledPrice, oracleIsDown);
    }

    function _getCurrentChainlinkResponse(LiquityV2OracleAggregatorV3Interface _aggregator)
        internal
        view
        returns (ChainlinkResponse memory chainlinkResponse)
    {
        uint256 gasBefore = gasleft();

        // Try to get latest price data:
        try _aggregator.latestRoundData() returns (
            uint80 roundId, int256 answer, uint256, /* startedAt */ uint256 updatedAt, uint80 /* answeredInRound */
        ) {
            // If call to Chainlink succeeds, return the response and success = true
            chainlinkResponse.roundId = roundId;
            chainlinkResponse.answer = answer;
            chainlinkResponse.timestamp = updatedAt;
            chainlinkResponse.success = true;

            return chainlinkResponse;
        } catch {
            // Require that enough gas was provided to prevent an OOG revert in the call to Chainlink
            // causing a shutdown. Instead, just revert. Slightly conservative, as it includes gas used
            // in the check itself.
            if (gasleft() <= gasBefore / 64) revert InsufficientGasForExternalCall();


            // If call to Chainlink aggregator reverts, return a zero response with success = false
            return chainlinkResponse;
        }
    }

    // False if:
    // - Call to Chainlink aggregator reverts
    // - price is too stale, i.e. older than the oracle's staleness threshold
    // - Price answer is 0 or negative
    function _isValidChainlinkPrice(ChainlinkResponse memory chainlinkResponse, uint256 _stalenessThreshold)
        internal
        view
        returns (bool)
    {
        return chainlinkResponse.success && block.timestamp - chainlinkResponse.timestamp < _stalenessThreshold
            && chainlinkResponse.answer > 0;
    }

    // Trust assumption: Chainlink won't change the decimal precision on any feed used in v2 after deployment
    function _scaleChainlinkPriceTo18decimals(int256 _price, uint256 _decimals) internal pure returns (uint256) {
        // Scale an int price to a uint with 18 decimals
        return uint256(_price) * 10 ** (18 - _decimals);
    }
}
