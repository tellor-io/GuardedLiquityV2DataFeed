const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const h = require("./customHelpers.js");
const TellorDataBridgeArtifact = require("usingtellorlayer/artifacts/contracts/testing/bridge/TellorDataBridge.sol/TellorDataBridge.json");

describe("GuardedTellorChainlinkAdapter", function () {
  // Test data for ETH/USD price queries
  const abiCoder = new ethers.AbiCoder();
  const ETH_USD_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["eth", "usd"]);
  const ETH_USD_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", ETH_USD_QUERY_DATA_ARGS]);
  const ETH_USD_QUERY_ID = h.hash(ETH_USD_QUERY_DATA);

  // constants for testing
  const UNBONDING_PERIOD = 86400 * 7 * 3; // 3 weeks
  const DECIMALS = 18; // 18 decimals for price feed
  const STALENESS_THRESHOLD = 3600 * 25; // 25 hours staleness threshold

  // Fixture to deploy contracts for testing
  async function deployGuardedTellorChainlinkAdapterFixture() {
    const [deployer, guardian1, guardian2, nonGuardian] = await ethers.getSigners();
    
    // Deploy TellorDataBridge
    const threshold = 66;
    const val1 = ethers.Wallet.createRandom();
    const initialValAddrs = [val1.address];
    const initialPowers = [100];
    const blocky = await h.getBlock();
    const valTimestamp = (blocky.timestamp - 2) * 1000;
    const newValHash = await h.calculateValHash(initialValAddrs, initialPowers);
    const valCheckpoint = h.calculateValCheckpoint(newValHash, threshold, valTimestamp);
    
    const TellorDataBridge = await ethers.getContractFactory(TellorDataBridgeArtifact.abi, TellorDataBridgeArtifact.bytecode);
    const dataBridge = await TellorDataBridge.deploy(guardian1.address);
    await dataBridge.init(threshold, valTimestamp, UNBONDING_PERIOD, valCheckpoint);

    // Deploy GuardedTellorDataBank
    const GuardedTellorDataBank = await ethers.getContractFactory("GuardedTellorDataBank");
    const guardedDataBank = await GuardedTellorDataBank.deploy(dataBridge.target, guardian1.address);
    await guardedDataBank.waitForDeployment();

    // Deploy GuardedTellorChainlinkAdapter
    const GuardedTellorChainlinkAdapter = await ethers.getContractFactory("GuardedTellorChainlinkAdapter");
    const adapter = await GuardedTellorChainlinkAdapter.deploy(guardedDataBank.target, ETH_USD_QUERY_ID, DECIMALS);
    await adapter.waitForDeployment();

    // Deploy MockMainnetPriceFeedBase for integration testing
    const MockMainnetPriceFeedBase = await ethers.getContractFactory("MockMainnetPriceFeedBase");
    const mockMainnetPriceFeed = await MockMainnetPriceFeedBase.deploy(adapter.target, STALENESS_THRESHOLD);
    await mockMainnetPriceFeed.waitForDeployment();

    return {
      dataBridge,
      guardedDataBank,
      adapter,
      mockMainnetPriceFeed,
      deployer,
      guardian1,
      guardian2,
      nonGuardian,
      validators: [val1],
      powers: initialPowers,
      valCheckpoint,
      threshold,
    };
  }

  describe("Deployment", function () {
    it("Should set the correct data bank address", async function () {
      const { adapter, guardedDataBank } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      expect(await adapter.tellorDataBank()).to.equal(guardedDataBank.target);
    });

    it("Should set the correct query ID", async function () {
      const { adapter } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      expect(await adapter.queryId()).to.equal(ETH_USD_QUERY_ID);
    });

    it("Should set the correct decimals", async function () {
      const { adapter } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      expect(await adapter.decimals()).to.equal(DECIMALS);
    });
  });

  describe("latestRoundData", function () {
    it("Should return valid data when oracle data is available", async function () {
      const { adapter, guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Mock ETH/USD price value - $2000 with 18 decimals
      const priceValue = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [priceValue]);
      
      // Prepare and submit oracle data
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Call latestRoundData on the adapter
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
      
      // Check returned values
      expect(roundId).to.equal(1); // Always 1 for compatibility
      expect(answer).to.equal(priceValue); // Should match our mock value
      expect(startedAt).to.equal(0); // Always 0 for compatibility
      expect(updatedAt).to.equal(attestData.report.timestamp / 1000); // Should be in seconds
      expect(answeredInRound).to.equal(0); // Always 0 for compatibility
    });

    it("Should return zero values when no oracle data is available", async function () {
      const { adapter } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Call latestRoundData without any oracle data
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
      
      // Should return all zeros when no data is available
      expect(roundId).to.equal(0);
      expect(answer).to.equal(0);
      expect(startedAt).to.equal(0);
      expect(updatedAt).to.equal(0);
      expect(answeredInRound).to.equal(0);
    });

    it("Should return zero values when data bank is paused", async function () {
      const { adapter, guardedDataBank, guardian1, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Add oracle data first
      const priceValue = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [priceValue]);
      
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Verify data is available before pausing
      let [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
      expect(roundId).to.equal(1);
      expect(answer).to.equal(priceValue);
      
      // Pause the data bank
      await guardedDataBank.connect(guardian1).pause();
      
      // Call latestRoundData after pausing
      [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
      
      // Should return all zeros when paused
      expect(roundId).to.equal(0);
      expect(answer).to.equal(0);
      expect(startedAt).to.equal(0);
      expect(updatedAt).to.equal(0);
      expect(answeredInRound).to.equal(0);
    });

    it("Should return valid data after unpausing", async function () {
      const { adapter, guardedDataBank, guardian1, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Add oracle data
      const priceValue = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [priceValue]);
      
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Pause and then unpause
      await guardedDataBank.connect(guardian1).pause();
      await guardedDataBank.connect(guardian1).unpause();
      
      // Call latestRoundData after unpausing
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
      
      // Should return valid data again
      expect(roundId).to.equal(1);
      expect(answer).to.equal(priceValue);
      expect(startedAt).to.equal(0);
      expect(updatedAt).to.equal(attestData.report.timestamp / 1000);
      expect(answeredInRound).to.equal(0);
    });

    it("Should handle multiple price updates correctly", async function () {
      const { adapter, guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // First price update - $2000
      const priceValue1 = h.toWei("2000");
      const mockValue1 = abiCoder.encode(["uint256"], [priceValue1]);
      
      let { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue1,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Check first price
      let [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
      expect(answer).to.equal(priceValue1);
      expect(updatedAt).to.equal(attestData.report.timestamp / 1000);
      
      // Wait and add second price update - $2100
      await time.increase(60);
      
      const priceValue2 = h.toWei("2100");
      const mockValue2 = abiCoder.encode(["uint256"], [priceValue2]);
      
      ({ attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue2,
        validators,
        powers,
        valCheckpoint
      ));
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Check second price (should be the latest)
      [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
      expect(answer).to.equal(priceValue2);
      expect(updatedAt).to.equal(attestData.report.timestamp / 1000);
    });

    it("Should handle different price values correctly", async function () {
      const { adapter, guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      const testPrices = [
        h.toWei("1"),      // $1
        h.toWei("100"),    // $100
        h.toWei("1000"),   // $1000
        h.toWei("50000"),  // $50000
        BigInt("1"),       // 1 wei
        BigInt("999999999999999999"), // Almost 1 ETH
      ];
      
      for (let i = 0; i < testPrices.length; i++) {
        const priceValue = testPrices[i];
        const mockValue = abiCoder.encode(["uint256"], [priceValue]);
        
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint
        );
        
        await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
        
        const [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
        expect(answer).to.equal(priceValue);
        expect(roundId).to.equal(1);
        
        // Wait before next update
        if (i < testPrices.length - 1) {
          await time.increase(60);
        }
      }
    });
  });

  describe("Integration with MockMainnetPriceFeedBase", function () {
    it("Should work correctly with MockMainnetPriceFeedBase.fetchPriceMock", async function () {
      const { adapter, guardedDataBank, mockMainnetPriceFeed, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Add oracle data
      const priceValue = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [priceValue]);
      
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Call fetchPriceMock on mock MainnetPriceFeedBase
      await mockMainnetPriceFeed.fetchPriceMock();
      
      // Check stored values in mock MainnetPriceFeedBase
      expect(await mockMainnetPriceFeed.lastGoodPrice()).to.equal(priceValue);
      expect(await mockMainnetPriceFeed.shutDown()).to.equal(false);
    });

    it("Should handle failures correctly with MockMainnetPriceFeedBase", async function () {
      const { guardedDataBank, mockMainnetPriceFeed, guardian1, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Add oracle data
      const priceValue = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [priceValue]);
      
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);

      // Pause the data bank so adapter returns zero values
      await guardedDataBank.connect(guardian1).pause();
      
      // Call fetchPriceMock on mock MainnetPriceFeedBase - should trigger shutdown
      await mockMainnetPriceFeed.fetchPriceMock();
      
      // Check that mock MainnetPriceFeedBase detected the failure and shut down
      expect(await mockMainnetPriceFeed.shutDown()).to.equal(true);
    });

    it("Should handle shutdown state correctly", async function () {
      const { guardedDataBank, mockMainnetPriceFeed, guardian1 } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // First pause the data bank
      await guardedDataBank.connect(guardian1).pause();
      
      // Fetch price to trigger shutdown
      await mockMainnetPriceFeed.fetchPriceMock();
      expect(await mockMainnetPriceFeed.shutDown()).to.equal(true);
      
      // Now unpause the data bank and try to fetch again - should revert due to shutdown
      await guardedDataBank.connect(guardian1).unpause();
      await expect(mockMainnetPriceFeed.fetchPriceMock()).to.be.reverted; // Should revert due to assert(shutDown == false)
    });

    it("Should handle staleness correctly", async function () {
      const { adapter, guardedDataBank, mockMainnetPriceFeed, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Add oracle data
      const priceValue = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [priceValue]);
      
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Should work fine initially
      await mockMainnetPriceFeed.fetchPriceMock();
      expect(await mockMainnetPriceFeed.shutDown()).to.equal(false);
      expect(await mockMainnetPriceFeed.lastGoodPrice()).to.equal(priceValue);
      
      // Move time forward beyond staleness threshold
      await time.increase(STALENESS_THRESHOLD + 60); // Move past staleness threshold
      
      // Now fetchPriceMock should trigger shutdown due to stale data
      await mockMainnetPriceFeed.fetchPriceMock();
      expect(await mockMainnetPriceFeed.shutDown()).to.equal(true);
    });

    it("Should handle decimals correctly", async function () {
      const { adapter, mockMainnetPriceFeed } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Check that both adapter and mock MainnetPriceFeedBase report the same decimals
      expect(await adapter.decimals()).to.equal(DECIMALS);
      const ethUsdOracle = await mockMainnetPriceFeed.ethUsdOracle()
      expect(ethUsdOracle.decimals).to.equal(DECIMALS)
    });
  });

  describe("Different Query IDs", function () {
    it("Should work correctly with different query IDs", async function () {
      const { guardedDataBank, guardian1, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Create adapter for BTC/USD
      const BTC_USD_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["btc", "usd"]);
      const BTC_USD_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", BTC_USD_QUERY_DATA_ARGS]);
      const BTC_USD_QUERY_ID = h.hash(BTC_USD_QUERY_DATA);
      
      const GuardedTellorChainlinkAdapter = await ethers.getContractFactory("GuardedTellorChainlinkAdapter");
      const btcAdapter = await GuardedTellorChainlinkAdapter.deploy(guardedDataBank.target, BTC_USD_QUERY_ID, 8); // 8 decimals for BTC
      
      // Add data for both ETH and BTC
      const ethValue = abiCoder.encode(["uint256"], [h.toWei("2000")]);
      const btcValue = abiCoder.encode(["uint256"], [BigInt("50000") * BigInt(10**8)]); // $50000 with 8 decimals
      
      // Add ETH data
      let { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        ethValue,
        validators,
        powers,
        valCheckpoint
      );
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Wait and add BTC data
      await time.increase(60);
      ({ attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        BTC_USD_QUERY_ID,
        btcValue,
        validators,
        powers,
        valCheckpoint
      ));
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Create adapters for both
      const GuardedTellorChainlinkAdapterFactory = await ethers.getContractFactory("GuardedTellorChainlinkAdapter");
      const ethAdapter = await GuardedTellorChainlinkAdapterFactory.deploy(guardedDataBank.target, ETH_USD_QUERY_ID, 18);
      
      // Check both adapters return correct data
      const [ethRoundId, ethAnswer, , ethUpdatedAt] = await ethAdapter.latestRoundData();
      const [btcRoundId, btcAnswer, , btcUpdatedAt] = await btcAdapter.latestRoundData();
      
      expect(ethAnswer).to.equal(h.toWei("2000"));
      expect(btcAnswer).to.equal(BigInt("50000") * BigInt(10**8));
      expect(ethRoundId).to.equal(1);
      expect(btcRoundId).to.equal(1);
      expect(btcUpdatedAt).to.be.gt(ethUpdatedAt); // BTC data was added later
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero price values", async function () {
      const { adapter, guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Create oracle data with zero value
      const zeroValue = abiCoder.encode(["uint256"], [0]);
      
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        zeroValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Adapter should return the zero value
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
      expect(roundId).to.equal(1);
      expect(answer).to.equal(0);
      expect(updatedAt).to.equal(attestData.report.timestamp / 1000);
    });

    it("Should handle very large price values", async function () {
      const { adapter, guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorChainlinkAdapterFixture);
      
      // Create oracle data with very large value (near max uint256)
      const largeValue = BigInt("11579208923731619542357098500868790785326998466564056403945758400791312963993");
      const mockValue = abiCoder.encode(["uint256"], [largeValue]);
      
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Adapter should handle the large value correctly
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await adapter.latestRoundData();
      expect(roundId).to.equal(1);
      expect(answer).to.equal(largeValue);
      expect(updatedAt).to.equal(attestData.report.timestamp / 1000);
    });
  });
}); 