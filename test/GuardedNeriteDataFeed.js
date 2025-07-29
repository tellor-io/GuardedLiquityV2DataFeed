const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const h = require("./customHelpers.js");
const TellorDataBridgeArtifact = require("usingtellorlayer/artifacts/contracts/testing/bridge/TellorDataBridge.sol/TellorDataBridge.json");

describe("GuardedNeriteDataFeed", function () {
  // Test data for ETH/USD price queries
  const abiCoder = new ethers.AbiCoder();
  const ETH_USD_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["eth", "usd"]);
  const ETH_USD_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", ETH_USD_QUERY_DATA_ARGS]);
  const ETH_USD_QUERY_ID = h.hash(ETH_USD_QUERY_DATA);

  // constants for testing
  const UNBONDING_PERIOD = 86400 * 7 * 3; // 3 weeks
  const MAX_DATA_AGE = 24 * 60 * 60; // 24 hours
  const MAX_ATTESTATION_AGE = 10 * 60; // 10 minutes
  const OPTIMISTIC_DELAY = 12 * 60 * 60; // 12 hours
  const MS_PER_SECOND = 1000;
  const DECIMALS = 18;
  const STALENESS_THRESHOLD = 3600 * 25; // 25 hours staleness threshold

  // Fixture to deploy contracts for testing
  async function deployGuardedNeriteDataFeedFixture() {
    const [deployer, admin, guardian2, nonGuardian] = await ethers.getSigners();
    
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
    const dataBridge = await TellorDataBridge.deploy(admin.address);
    await dataBridge.init(threshold, valTimestamp, UNBONDING_PERIOD, valCheckpoint);

    // Deploy GuardedNeriteDataFeed with dataBridge and admin as the first guardian
    const GuardedNeriteDataFeed = await ethers.getContractFactory("GuardedNeriteDataFeed");
    const guardedDataFeed = await GuardedNeriteDataFeed.deploy(dataBridge.target, ETH_USD_QUERY_ID,admin.address);
    await guardedDataFeed.waitForDeployment();

    // Deploy MockMainnetPriceFeedBase for integration testing
    const MockMainnetPriceFeedBase = await ethers.getContractFactory("MockMainnetPriceFeedBase");
    const mockMainnetPriceFeed = await MockMainnetPriceFeedBase.deploy(guardedDataFeed.target, STALENESS_THRESHOLD);
    await mockMainnetPriceFeed.waitForDeployment();

    return {
      dataBridge,
      guardedDataFeed,
      mockMainnetPriceFeed,
      deployer,
      admin,
      guardian2,
      nonGuardian,
      validators: [val1],
      powers: initialPowers,
      valCheckpoint,
      threshold,
    };
  }

  describe("Deployment", function () {
    it("Should set deployment variables correctly", async function () {
      const { guardedDataFeed, admin, dataBridge } = await loadFixture(deployGuardedNeriteDataFeedFixture);
      // data feed
      expect(await guardedDataFeed.dataBridge()).to.equal(dataBridge.target);
      expect(await guardedDataFeed.queryId()).to.equal(ETH_USD_QUERY_ID);
      expect(await guardedDataFeed.decimals()).to.equal(DECIMALS);
      expect(await guardedDataFeed.MAX_DATA_AGE()).to.equal(MAX_DATA_AGE);
      expect(await guardedDataFeed.MAX_ATTESTATION_AGE()).to.equal(MAX_ATTESTATION_AGE);
      expect(await guardedDataFeed.OPTIMISTIC_DELAY()).to.equal(OPTIMISTIC_DELAY);
      expect(await guardedDataFeed.MS_PER_SECOND()).to.equal(MS_PER_SECOND);
      // pausable
      expect(await guardedDataFeed.guardians(admin.address)).to.equal(true);
      expect(await guardedDataFeed.guardianCount()).to.equal(1);
      expect(await guardedDataFeed.admin()).to.equal(admin.address);
      expect(await guardedDataFeed.paused()).to.equal(false);
    });
  });

  describe("Guardian Management", function () {
    describe("addGuardian", function () {
      it("Should allow admin to add new guardians", async function () {
        const { guardedDataFeed, admin, guardian2 } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        // guardian2 is not a guardian yet
        expect(await guardedDataFeed.guardians(guardian2.address)).to.equal(false);
        expect(await guardedDataFeed.guardianCount()).to.equal(1);

        await expect(guardedDataFeed.connect(admin).addGuardian(guardian2.address))
          .to.emit(guardedDataFeed, "GuardianAdded")
          .withArgs(guardian2.address);
        
        expect(await guardedDataFeed.guardians(guardian2.address)).to.equal(true);
        expect(await guardedDataFeed.guardianCount()).to.equal(2);
      });

      it("Should revert when non-admin tries to add guardian", async function () {
        const { guardedDataFeed, guardian2, nonGuardian, admin } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        await expect(guardedDataFeed.connect(guardian2).addGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");
        expect(await guardedDataFeed.guardians(guardian2.address)).to.equal(false);
        expect(await guardedDataFeed.guardianCount()).to.equal(1);

        // add guardian2
        await guardedDataFeed.connect(admin).addGuardian(guardian2.address);
        expect(await guardedDataFeed.guardians(guardian2.address)).to.equal(true);
        expect(await guardedDataFeed.guardianCount()).to.equal(2);

        // add guardian2 tries to add nonGuardian
        await expect(guardedDataFeed.connect(guardian2).addGuardian(nonGuardian.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");
      });

      it("Should revert when trying to add existing guardian", async function () {
        const { guardedDataFeed, admin, guardian2 } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        // Add guardian2 first
        await guardedDataFeed.connect(admin).addGuardian(guardian2.address);
        
        // Try to add guardian2 again
        await expect(guardedDataFeed.connect(admin).addGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Guardian already exists");
      });
    });

    describe("removeGuardian", function () {
      it("Should allow admin to remove guardians", async function () {
        const { guardedDataFeed, admin, guardian2 } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        // Add guardian2 
        await guardedDataFeed.connect(admin).addGuardian(guardian2.address);
        expect(await guardedDataFeed.guardianCount()).to.equal(2);
        expect(await guardedDataFeed.guardians(guardian2)).to.equal(true);
        
        // Remove guardian2
        await expect(guardedDataFeed.connect(admin).removeGuardian(guardian2.address))
          .to.emit(guardedDataFeed, "GuardianRemoved")
          .withArgs(guardian2.address);
        
        expect(await guardedDataFeed.guardians(guardian2)).to.equal(false);
        expect(await guardedDataFeed.guardianCount()).to.equal(1);
      });

      it("Should revert when non-admin tries to remove guardian", async function () {
        const { guardedDataFeed, admin, guardian2 } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        await expect(guardedDataFeed.connect(guardian2).removeGuardian(admin.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");

        // add guardian2
        await guardedDataFeed.connect(admin).addGuardian(guardian2.address);
        expect(await guardedDataFeed.guardians(guardian2)).to.equal(true);
        expect(await guardedDataFeed.guardianCount()).to.equal(2);

        await expect(guardedDataFeed.connect(guardian2).removeGuardian(admin.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");
      });

      it("Should revert when trying to remove non-existent guardian", async function () {
        const { guardedDataFeed, admin, guardian2 } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        await expect(guardedDataFeed.connect(admin).removeGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Guardian does not exist");
      });

      it("Should be able to remove admin", async function () {
        const { guardedDataFeed, admin } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        expect(await guardedDataFeed.admin()).to.equal(admin.address);
        expect(await guardedDataFeed.guardians(admin)).to.equal(true);
        expect(await guardedDataFeed.guardianCount()).to.equal(1);
        await expect(guardedDataFeed.connect(admin).removeGuardian(admin.address))
          .to.emit(guardedDataFeed, "AdminRemoved");
        expect(await guardedDataFeed.admin()).to.equal("0x0000000000000000000000000000000000000000");
        expect(await guardedDataFeed.guardians(admin)).to.equal(false);
        expect(await guardedDataFeed.guardianCount()).to.equal(0);
      });
    });
  });

  describe("Pause/Unpause Functionality", function () {
    describe("pause", function () {
      it("Should allow guardians to pause the contract", async function () {
        const { guardedDataFeed, admin, guardian2 } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        await expect(guardedDataFeed.connect(admin).pause())
          .to.emit(guardedDataFeed, "Paused");
        
        expect(await guardedDataFeed.paused()).to.equal(true);

        await guardedDataFeed.connect(admin).addGuardian(guardian2.address);
        expect(await guardedDataFeed.guardians(guardian2)).to.equal(true);
        expect(await guardedDataFeed.guardianCount()).to.equal(2);

        await guardedDataFeed.connect(admin).unpause();
        expect(await guardedDataFeed.paused()).to.equal(false);

        await guardedDataFeed.connect(guardian2).pause();
        expect(await guardedDataFeed.paused()).to.equal(true);
      });

      it("Should revert when non-guardian tries to pause", async function () {
        const { guardedDataFeed, nonGuardian } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        await expect(guardedDataFeed.connect(nonGuardian).pause())
          .to.be.revertedWith("GuardedPausable: Not a guardian");

        expect(await guardedDataFeed.paused()).to.equal(false);
      });

      it("Should revert when trying to pause already paused contract", async function () {
        const { guardedDataFeed, admin } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        // Pause first
        await guardedDataFeed.connect(admin).pause();
        
        // Try to pause again
        await expect(guardedDataFeed.connect(admin).pause())
          .to.be.revertedWith("GuardedPausable: Already paused");
      });
    });

    describe("unpause", function () {
      it("Should allow guardians to unpause the contract", async function () {
        const { guardedDataFeed, admin } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        // Pause first
        await guardedDataFeed.connect(admin).pause();
        expect(await guardedDataFeed.paused()).to.equal(true);
        
        // Unpause
        await expect(guardedDataFeed.connect(admin).unpause())
          .to.emit(guardedDataFeed, "Unpaused");
        
        expect(await guardedDataFeed.paused()).to.equal(false);
      });

      it("Should revert when non-guardian tries to unpause", async function () {
        const { guardedDataFeed, admin, nonGuardian } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        // Pause first
        await guardedDataFeed.connect(admin).pause();
        
        await expect(guardedDataFeed.connect(nonGuardian).unpause())
          .to.be.revertedWith("GuardedPausable: Not a guardian");
      });

      it("Should revert when trying to unpause already unpaused contract", async function () {
        const { guardedDataFeed, admin } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        await expect(guardedDataFeed.connect(admin).unpause())
          .to.be.revertedWith("GuardedPausable: Already unpaused");
      });
    });
  });

  describe("Oracle Data Updates", function () {
    describe("updateOracleData", function () {
      it("Should successfully update oracle data with valid consensus data", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        // Mock ETH/USD price value
        const mockPrice = h.toWei("2000");
        const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
        
        // Prepare oracle data
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint
        );
        
        // Update oracle data
        await expect(guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.emit(guardedDataFeed, "OracleUpdated")
          .withArgs(ETH_USD_QUERY_ID, mockPrice, attestData.report.aggregatePower);
        
        // Check that data was stored correctly
        expect(await guardedDataFeed.getAggregateValueCount()).to.equal(1);
        
        const aggData = await guardedDataFeed.data(0);
        expect(aggData.aggregateTimestamp).to.equal(attestData.report.timestamp);
        
        expect(aggData.price).to.equal(mockPrice);
        expect(aggData.power).to.equal(attestData.report.aggregatePower);
      });

      it("Should handle multiple oracle data updates with increasing timestamps", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockPrice1 = h.toWei("2000");
        const mockPrice2 = h.toWei("2100");
        const mockValue1 = abiCoder.encode(["uint256"], [mockPrice1]);
        const mockValue2 = abiCoder.encode(["uint256"], [mockPrice2]);
        
        // First update
        let { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue1,
          validators,
          powers,
          valCheckpoint
        );
        
        await guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs);
        expect(await guardedDataFeed.getAggregateValueCount()).to.equal(1);
        
        // Wait some time before second update
        await time.increase(60);
        
        // Second update with newer timestamp
        ({ attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue2,
          validators,
          powers,
          valCheckpoint
        ));
        
        await guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs);
        expect(await guardedDataFeed.getAggregateValueCount()).to.equal(2);
        
        // Check latest data
        const aggData = await guardedDataFeed.data(1);
        expect(aggData.aggregateTimestamp).to.equal(attestData.report.timestamp);
        expect(aggData.price).to.equal(mockPrice2);
        expect(aggData.power).to.equal(attestData.report.aggregatePower);
      });

      it("Should revert when data is too old", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockValue = abiCoder.encode(["uint256"], [h.toWei("2000")]);
        
        // Use our custom helper to create oracle data that's 25 hours old (past MAX_DATA_AGE of 24 hours)
        const { attestData, currentValidatorSet, sigs } = await h.prepareOldOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint,
          25 // 25 hours old
        );
        
        await expect(guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedNeriteDataFeed: Data too old");
      });

      it("Should revert when attestation is too old", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockPrice = h.toWei("2000");
        const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
        
        // Use our custom helper to create oracle data with attestation that's 15 minutes old (past MAX_ATTESTATION_AGE of 10 minutes)
        const { attestData, currentValidatorSet, sigs } = await h.prepareOldAttestationData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint,
          15 // 15 minutes old attestation
        );
        
        await expect(guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedNeriteDataFeed: Attestation too old");
      });

      it("Should revert when timestamp is not monotonically increasing", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockPrice1 = h.toWei("2000");
        const mockPrice2 = h.toWei("2100");
        const mockValue1 = abiCoder.encode(["uint256"], [mockPrice1]);
        const mockValue2 = abiCoder.encode(["uint256"], [mockPrice2]);
        
        // First update with current timestamp
        let { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue1,
          validators,
          powers,
          valCheckpoint
        );
        
        await guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs);
        const firstTimestamp = attestData.report.timestamp;
        
        // Try to update with older timestamp - use our custom helper
        const olderTimestamp = firstTimestamp - 10000; // 10 seconds earlier
        const { attestData: olderAttestData, currentValidatorSet: currentValidatorSet2, sigs: sigs2 } = await h.prepareOracleDataWithTimestamp(
          ETH_USD_QUERY_ID,
          mockValue2,
          validators,
          powers,
          valCheckpoint,
          olderTimestamp
        );
        
        // This should fail timestamp validation
        await expect(guardedDataFeed.updateOracleData(olderAttestData, currentValidatorSet2, sigs2))
          .to.be.revertedWith("GuardedNeriteDataFeed: Report timestamp must increase");
      });

      it("Should successfully handle optimistic oracle data", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockPrice = h.toWei("2000");
        const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
        
        // Set custom values for optimistic data
        blocky = await h.getBlock();
        // optimistic delay + 1 hours ago
        aggregateTimestamp = blocky.timestamp - OPTIMISTIC_DELAY - 3600;
        // 1 second ago
        attestationTimestamp = blocky.timestamp - 1;
        // previous timestamp is 0
        previousTimestamp = 0;
        // next timestamp is 1 second ago
        nextTimestamp = blocky.timestamp - 1;
        // last consensus timestamp is before the aggregate timestamp
        lastConsensusTimestamp = aggregateTimestamp - 3600;
        // aggregate power is threshold / 2 + 1
        aggregatePower = threshold / 2 + 1;


        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint,
          {
            aggregateTimestamp: aggregateTimestamp * 1000,
            attestationTimestamp: attestationTimestamp * 1000,
            previousTimestamp: previousTimestamp * 1000,
            nextTimestamp: nextTimestamp * 1000,
            lastConsensusTimestamp: lastConsensusTimestamp * 1000,
            aggregatePower: aggregatePower
          }
        );
        
        // This should succeed if all optimistic data validation passes
        await expect(guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.emit(guardedDataFeed, "OracleUpdated")
          .withArgs(ETH_USD_QUERY_ID, mockPrice, attestData.report.aggregatePower);
        
        // Verify data was stored
        expect(await guardedDataFeed.getAggregateValueCount()).to.equal(1);

        const aggData = await guardedDataFeed.data(0);
        expect(aggData.aggregateTimestamp).to.equal(attestData.report.timestamp);
        expect(aggData.price).to.equal(mockPrice);
        expect(aggData.power).to.equal(attestData.report.aggregatePower);
      });

      it("Should revert with insufficient power for optimistic data", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockPrice = h.toWei("2000");
        const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
        
        // Set custom values for optimistic data
        blocky = await h.getBlock();
        // optimistic delay + 1 hours ago
        aggregateTimestamp = blocky.timestamp - OPTIMISTIC_DELAY - 3600;
        // 1 second ago
        attestationTimestamp = blocky.timestamp - 1;
        // previous timestamp is 0
        previousTimestamp = 0;
        // next timestamp is 1 second ago
        nextTimestamp = blocky.timestamp - 1;
        // last consensus timestamp is before the aggregate timestamp
        lastConsensusTimestamp = aggregateTimestamp - 3600;
        // aggregate power is threshold / 2
        insufficientPower = threshold / 2; 

        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint,
          {
            aggregateTimestamp: aggregateTimestamp * 1000,
            attestationTimestamp: attestationTimestamp * 1000,
            previousTimestamp: previousTimestamp * 1000,
            nextTimestamp: nextTimestamp * 1000,
            lastConsensusTimestamp: lastConsensusTimestamp * 1000,
            aggregatePower: insufficientPower
          }
        );
        
        await expect(guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedNeriteDataFeed: Insufficient optimistic report power");
      });

      it("Should revert optimistic data when dispute period hasn't passed", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockPrice = h.toWei("2000");
        const mockValue = abiCoder.encode(["uint256"], [mockPrice]);

        // Set custom values for optimistic data
        blocky = await h.getBlock();
        // optimistic delay - 1 hours ago
        aggregateTimestamp = blocky.timestamp - OPTIMISTIC_DELAY + 3600;
        // 1 second ago
        attestationTimestamp = blocky.timestamp - 1;
        // previous timestamp is 0
        previousTimestamp = 0;
        // next timestamp is 1 second ago
        nextTimestamp = blocky.timestamp - 1;
        // last consensus timestamp is before the aggregate timestamp
        lastConsensusTimestamp = aggregateTimestamp - 3600;
        // aggregate power is threshold / 2 + 1
        aggregatePower = threshold / 2 + 1; 
        
        // Use our helper to create optimistic data with insufficient delay (6 hours < 12 hour requirement)
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint,
          {
            aggregateTimestamp: aggregateTimestamp * 1000,
            attestationTimestamp: attestationTimestamp * 1000,
            previousTimestamp: previousTimestamp * 1000,
            nextTimestamp: nextTimestamp * 1000,
            lastConsensusTimestamp: lastConsensusTimestamp * 1000,
            aggregatePower: aggregatePower
          }
        );
        
        await expect(guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedNeriteDataFeed: Dispute period not passed");
      });

      it("Should revert when more recent optimistic report is available", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockPrice = h.toWei("2000");
        const mockValue = abiCoder.encode(["uint256"], [mockPrice]);

        // Set custom values for optimistic data
        blocky = await h.getBlock();
        // optimistic delay + 1 hours ago
        aggregateTimestamp = blocky.timestamp - OPTIMISTIC_DELAY - 3600;
        // 1 second ago
        attestationTimestamp = blocky.timestamp - 1;
        // previous timestamp is 0
        previousTimestamp = 0;
        // next timestamp is optimistic but later than aggregate timestamp
        nextTimestamp = blocky.timestamp - OPTIMISTIC_DELAY - 1000;
        // last consensus timestamp is before the aggregate timestamp
        lastConsensusTimestamp = aggregateTimestamp - 3600;
        // aggregate power is threshold / 2 + 1
        aggregatePower = threshold / 2 + 1; 
        // Create data with nextTimestamp optimistic
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint,
          {
            aggregateTimestamp: aggregateTimestamp * 1000,
            attestationTimestamp: attestationTimestamp * 1000,
            previousTimestamp: previousTimestamp * 1000,
            nextTimestamp: nextTimestamp * 1000,
            lastConsensusTimestamp: lastConsensusTimestamp * 1000,
            aggregatePower: aggregatePower
          }
        );
        
        await expect(guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedNeriteDataFeed: More recent optimistic report available");
      });

      it("Should successfully handle consensus data vs optimistic data", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockPrice1 = h.toWei("2000");
        const mockPrice2 = h.toWei("2100");
        const mockValue1 = abiCoder.encode(["uint256"], [mockPrice1]);
        const mockValue2 = abiCoder.encode(["uint256"], [mockPrice2]);
        
        // First, add consensus data
        const { attestData: consensusData, currentValidatorSet, sigs: consensusSigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue1,
          validators,
          powers,
          valCheckpoint
        );
        
        await guardedDataFeed.updateOracleData(consensusData, currentValidatorSet, consensusSigs);
        expect(await guardedDataFeed.getAggregateValueCount()).to.equal(1);

        latestRoundData = await guardedDataFeed.latestRoundData();
        expect(latestRoundData.roundId).to.equal(1);
        expect(latestRoundData.answer).to.equal(mockPrice1);
        expect(latestRoundData.startedAt).to.equal(0);
        expect(latestRoundData.updatedAt).to.equal(consensusData.report.timestamp / 1000);
        expect(latestRoundData.answeredInRound).to.equal(0);
        
        // Wait some time, then add optimistic data
        await time.increase(24 * 3600); // 24 hours

        // Set custom values for optimistic data
        blocky = await h.getBlock();
        // optimistic delay + 1 hours ago
        aggregateTimestamp = blocky.timestamp - OPTIMISTIC_DELAY - 3600;
        // 1 second ago
        attestationTimestamp = blocky.timestamp - 1;
        // previous timestamp is 0
        previousTimestamp = 0;
        // next timestamp hasn't passed optimistic delay
        nextTimestamp = blocky.timestamp - OPTIMISTIC_DELAY + 3600;
        // last consensus timestamp is before the aggregate timestamp
        lastConsensusTimestamp = aggregateTimestamp - 3600;
        // aggregate power is threshold / 2 + 1
        aggregatePower = threshold / 2 + 1; 

        const { attestData: optimisticData, currentValidatorSet: optimisticCurrentValidatorSet, sigs: optimisticSigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue2,
          validators,
          powers,
          valCheckpoint,
          {
            aggregateTimestamp: aggregateTimestamp * 1000,
            attestationTimestamp: attestationTimestamp * 1000,
            previousTimestamp: previousTimestamp * 1000,
            nextTimestamp: nextTimestamp * 1000,
            lastConsensusTimestamp: lastConsensusTimestamp * 1000,
            aggregatePower: aggregatePower
          }
        );

        await guardedDataFeed.updateOracleData(optimisticData, optimisticCurrentValidatorSet, optimisticSigs);
        expect(await guardedDataFeed.getAggregateValueCount()).to.equal(2);
        
        // Verify the latest data is the optimistic data
        const aggData = await guardedDataFeed.data(1);
        expect(aggData.aggregateTimestamp).to.equal(optimisticData.report.timestamp);
        expect(aggData.price).to.equal(mockPrice2);
        expect(aggData.power).to.equal(optimisticData.report.aggregatePower);

        latestRoundData = await guardedDataFeed.latestRoundData();
        expect(latestRoundData.roundId).to.equal(1);
        expect(latestRoundData.answer).to.equal(mockPrice2);
        expect(latestRoundData.startedAt).to.equal(0);
        expect(latestRoundData.updatedAt).to.equal(optimisticData.report.timestamp / 1000);
        expect(latestRoundData.answeredInRound).to.equal(0);
      });

      it("Should revert optimistic data when newer consensus data is available", async function () {
         const { guardedDataFeed, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockValue = abiCoder.encode(["uint256"], [h.toWei("2000")]);

        // Set custom values for optimistic data
        blocky = await h.getBlock();
        // optimistic delay + 1 hours ago
        aggregateTimestamp = blocky.timestamp - OPTIMISTIC_DELAY - 3600;
        // 1 second ago
        attestationTimestamp = blocky.timestamp - 1;
        // previous timestamp is 0
        previousTimestamp = 0;
        // next timestamp is 1 second ago
        nextTimestamp = blocky.timestamp - 1;
        // last consensus timestamp is after the aggregate timestamp
        lastConsensusTimestamp = aggregateTimestamp + 1;
        // aggregate power is threshold / 2 + 1
        aggregatePower = threshold / 2 + 1; 
        
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint,
          {
            aggregateTimestamp: aggregateTimestamp * 1000,
            attestationTimestamp: attestationTimestamp * 1000,
            previousTimestamp: previousTimestamp * 1000,
            nextTimestamp: nextTimestamp * 1000,
            lastConsensusTimestamp: lastConsensusTimestamp * 1000,
            aggregatePower: aggregatePower
          }
        );
        
        await expect(guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedNeriteDataFeed: Newer consensus data available");
      });

      it("Should revert when query ID is incorrect", async function () {
        const { guardedDataFeed, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        const mockPrice = h.toWei("2000");
        const mockValue = abiCoder.encode(["uint256"], [mockPrice]);

        BAD_QUERY_ID = h.hash(abiCoder.encode(["string"], ["bad_query_id"]));

        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          BAD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint
        );

        await expect(guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedNeriteDataFeed: Incorrect query ID");
      });
    });
  });

  describe("Data Retrieval Functions", function () {
    beforeEach(async function () {
      // Set up some test data for retrieval tests
      const { guardedDataFeed, validators, powers, valCheckpoint, admin } = await loadFixture(deployGuardedNeriteDataFeedFixture);
      this.guardedDataFeed = guardedDataFeed;
      
      const mockPrice = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs);
      blocky = await h.getBlock();
      this.testTimestamp = attestData.report.timestamp;
      this.testValue = mockPrice;
      this.testPower = attestData.report.aggregatePower;
      this.testAttestationTimestamp = attestData.attestationTimestamp;
      this.admin = admin;
      this.testRelayTimestamp = blocky.timestamp;
    });

    describe("getAggregateValueCount", function () {
      it("Should return correct count of stored values", async function () {
        expect(await this.guardedDataFeed.getAggregateValueCount()).to.equal(1);
      });
    });

    describe("latestRoundData", function () {
      it("Should return current data when unpaused", async function () {
        const latestRoundData = await this.guardedDataFeed.latestRoundData();
        
        expect(latestRoundData.roundId).to.equal(1);
        expect(latestRoundData.answer).to.equal(this.testValue);
        expect(latestRoundData.startedAt).to.equal(0);
        expect(latestRoundData.updatedAt).to.equal(this.testTimestamp / 1000);
        expect(latestRoundData.answeredInRound).to.equal(0);
      });

      it("Should revert when paused", async function () {        
        await this.guardedDataFeed.connect(this.admin).pause();
        
        await expect(this.guardedDataFeed.latestRoundData())
          .to.be.revertedWith("GuardedPausable: Tellor is paused");
      });

      it("Should return current data when paused and then unpaused", async function () {
        const latestRoundDataBeforePause = await this.guardedDataFeed.latestRoundData();

        expect(latestRoundDataBeforePause.roundId).to.equal(1);
        expect(latestRoundDataBeforePause.answer).to.equal(this.testValue);
        expect(latestRoundDataBeforePause.startedAt).to.equal(0);
        expect(latestRoundDataBeforePause.updatedAt).to.equal(this.testTimestamp / 1000);
        expect(latestRoundDataBeforePause.answeredInRound).to.equal(0);

        await this.guardedDataFeed.connect(this.admin).pause();

        await expect(this.guardedDataFeed.latestRoundData())
          .to.be.revertedWith("GuardedPausable: Tellor is paused");

        await this.guardedDataFeed.connect(this.admin).unpause();

        const latestRoundDataAfterUnpause = await this.guardedDataFeed.latestRoundData();

        expect(latestRoundDataAfterUnpause.roundId).to.equal(1);
        expect(latestRoundDataAfterUnpause.answer).to.equal(this.testValue);
        expect(latestRoundDataAfterUnpause.startedAt).to.equal(0);
        expect(latestRoundDataAfterUnpause.updatedAt).to.equal(this.testTimestamp / 1000);
        expect(latestRoundDataAfterUnpause.answeredInRound).to.equal(0);
      });

      it("Should revert when no data is available", async function () {
        // deploy a new guarded data feed
        const { guardedDataFeed } = await loadFixture(deployGuardedNeriteDataFeedFixture);
        
        await expect(guardedDataFeed.latestRoundData())
          .to.be.revertedWith("GuardedNeriteDataFeed: No data available");
      });
    });

    describe("decimals", function () {
      it("Should return correct decimals", async function () {
        expect(await this.guardedDataFeed.decimals()).to.equal(DECIMALS);
      });
    });
  });

  describe("Integration Tests", function () {
    beforeEach(async function () {
      // Set up some test data for retrieval tests
      const { guardedDataFeed, validators, powers, valCheckpoint, admin, mockMainnetPriceFeed, threshold } = await loadFixture(deployGuardedNeriteDataFeedFixture);
      this.guardedDataFeed = guardedDataFeed;
      
      const mockPrice = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs);
      blocky = await h.getBlock();
      this.testTimestamp = attestData.report.timestamp;
      this.testValue = mockPrice;
      this.testPower = attestData.report.aggregatePower;
      this.testAttestationTimestamp = attestData.attestationTimestamp;
      this.admin = admin;
      this.testRelayTimestamp = blocky.timestamp;
      this.mockMainnetPriceFeed = mockMainnetPriceFeed;
      this.threshold = threshold;
      this.validators = validators;
      this.powers = powers;
      this.valCheckpoint = valCheckpoint;
    });

    describe("deployment", function () {
      it("Should set correct variables", async function () {
        const ethUsdOracle = await this.mockMainnetPriceFeed.ethUsdOracle();
        expect(ethUsdOracle.aggregator).to.equal(this.guardedDataFeed.target);
        expect(ethUsdOracle.stalenessThreshold).to.equal(STALENESS_THRESHOLD);
        expect(ethUsdOracle.decimals).to.equal(DECIMALS);
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(0);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
      });
    });

    describe("fetchPriceMock", function () {
      it("Should retrieve the correct price", async function () {
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(this.testValue);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
      });

      it("Should shut down when the oracle paused", async function () {
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(this.testValue);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);

        await this.guardedDataFeed.connect(this.admin).pause();
        
        await this.mockMainnetPriceFeed.fetchPriceMock();

        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(0);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(true);
      });

      it("Should fetch multiple prices", async function () {
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(this.testValue);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);

        // relay more data to data feed
        await time.increase(3600);
        const mockPrice2 = h.toWei("2100");
        const mockValue2 = abiCoder.encode(["uint256"], [mockPrice2]);
        const { attestData: attestData2, currentValidatorSet: currentValidatorSet2, sigs: sigs2 } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue2,
          this.validators,
          this.powers,
          this.valCheckpoint
        );

        await this.guardedDataFeed.updateOracleData(attestData2, currentValidatorSet2, sigs2);

        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(mockPrice2);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);

        // relay more data to data feed
        const mockPrice3 = h.toWei("2200");
        const mockValue3 = abiCoder.encode(["uint256"], [mockPrice3]);
        const { attestData: attestData3, currentValidatorSet: currentValidatorSet3, sigs: sigs3 } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue3,
          this.validators,
          this.powers,
          this.valCheckpoint
        );

        await this.guardedDataFeed.updateOracleData(attestData3, currentValidatorSet3, sigs3);

        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(mockPrice3);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
      });

      it("Submit and retrieve 20 prices", async function () {
        for (let i = 0; i < 20; i++) {
          const mockPrice = h.toWei(String(2000 + i));
          const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
          const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
            ETH_USD_QUERY_ID,
            mockValue,
            this.validators,
            this.powers,
            this.valCheckpoint
          );

          await this.guardedDataFeed.updateOracleData(attestData, currentValidatorSet, sigs);
          await this.mockMainnetPriceFeed.fetchPriceMock();
          expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(mockPrice);
          expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
          await time.increase(60);
        }
      });
    });
  });
});
