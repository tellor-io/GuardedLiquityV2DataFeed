const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const h = require("./customHelpers.js");
const TellorDataBridgeArtifact = require("usingtellorlayer/artifacts/contracts/testing/bridge/TellorDataBridge.sol/TellorDataBridge.json");

describe("GuardedTellorDataBank", function () {
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

  // Fixture to deploy contracts for testing
  async function deployGuardedTellorDataBankFixture() {
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

    // Deploy GuardedTellorDataBank with dataBridge and guardian1 as the first guardian
    const GuardedTellorDataBank = await ethers.getContractFactory("GuardedTellorDataBank");
    const guardedDataBank = await GuardedTellorDataBank.deploy(dataBridge.target, guardian1.address);
    await guardedDataBank.waitForDeployment();

    return {
      dataBridge,
      guardedDataBank,
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
    it("Should set the correct data bridge address", async function () {
      const { guardedDataBank, dataBridge } = await loadFixture(deployGuardedTellorDataBankFixture);
      
      expect(await guardedDataBank.dataBridge()).to.equal(dataBridge.target);
    });

    it("Should set the first guardian correctly", async function () {
      const { guardedDataBank, guardian1 } = await loadFixture(deployGuardedTellorDataBankFixture);
      
      expect(await guardedDataBank.guardians(guardian1.address)).to.equal(true);
      expect(await guardedDataBank.guardianCount()).to.equal(1);
    });

    it("Should start in unpaused state", async function () {
      const { guardedDataBank } = await loadFixture(deployGuardedTellorDataBankFixture);
      
      expect(await guardedDataBank.paused()).to.equal(false);
    });

    it("Should set correct constants", async function () {
      const { guardedDataBank } = await loadFixture(deployGuardedTellorDataBankFixture);
      
      expect(await guardedDataBank.MAX_DATA_AGE()).to.equal(MAX_DATA_AGE);
      expect(await guardedDataBank.MAX_ATTESTATION_AGE()).to.equal(MAX_ATTESTATION_AGE);
      expect(await guardedDataBank.OPTIMISTIC_DELAY()).to.equal(OPTIMISTIC_DELAY);
      expect(await guardedDataBank.MS_PER_SECOND()).to.equal(MS_PER_SECOND);
    });
  });

  describe("Guardian Management", function () {
    describe("addGuardian", function () {
      it("Should allow guardians to add new guardians", async function () {
        const { guardedDataBank, guardian1, guardian2 } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        expect(await guardedDataBank.guardians(guardian2.address)).to.equal(false);
        expect(await guardedDataBank.guardianCount()).to.equal(1);

        await expect(guardedDataBank.connect(guardian1).addGuardian(guardian2.address))
          .to.emit(guardedDataBank, "GuardianAdded")
          .withArgs(guardian2.address);
        
        expect(await guardedDataBank.guardians(guardian2.address)).to.equal(true);
        expect(await guardedDataBank.guardianCount()).to.equal(2);
      });

      it("Should revert when non-guardian tries to add guardian", async function () {
        const { guardedDataBank, guardian2, nonGuardian } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        await expect(guardedDataBank.connect(nonGuardian).addGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Not a guardian");
        expect(await guardedDataBank.guardians(guardian2.address)).to.equal(false);
        expect(await guardedDataBank.guardianCount()).to.equal(1);
      });

      it("Should revert when trying to add existing guardian", async function () {
        const { guardedDataBank, guardian1, guardian2 } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        // Add guardian2 first
        await guardedDataBank.connect(guardian1).addGuardian(guardian2.address);
        
        // Try to add guardian2 again
        await expect(guardedDataBank.connect(guardian1).addGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Guardian already exists");
      });
    });

    describe("removeGuardian", function () {
      it("Should allow guardians to remove other guardians", async function () {
        const { guardedDataBank, guardian1, guardian2 } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        // Add guardian2 first
        await guardedDataBank.connect(guardian1).addGuardian(guardian2.address);
        expect(await guardedDataBank.guardianCount()).to.equal(2);
        
        // Remove guardian1
        await expect(guardedDataBank.connect(guardian2).removeGuardian(guardian1.address))
          .to.emit(guardedDataBank, "GuardianRemoved")
          .withArgs(guardian1.address);
        
        expect(await guardedDataBank.guardians(guardian1.address)).to.equal(false);
        expect(await guardedDataBank.guardianCount()).to.equal(1);
      });

      it("Should revert when non-guardian tries to remove guardian", async function () {
        const { guardedDataBank, guardian1, nonGuardian } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        await expect(guardedDataBank.connect(nonGuardian).removeGuardian(guardian1.address))
          .to.be.revertedWith("GuardedPausable: Not a guardian");
      });

      it("Should revert when trying to remove non-existent guardian", async function () {
        const { guardedDataBank, guardian1, guardian2 } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        await expect(guardedDataBank.connect(guardian1).removeGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Guardian does not exist");
      });

      it("Should revert when trying to remove the last guardian", async function () {
        const { guardedDataBank, guardian1 } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        await expect(guardedDataBank.connect(guardian1).removeGuardian(guardian1.address))
          .to.be.revertedWith("GuardedPausable: Cannot remove last guardian");
      });
    });
  });

  describe("Pause/Unpause Functionality", function () {
    describe("pause", function () {
      it("Should allow guardians to pause the contract", async function () {
        const { guardedDataBank, guardian1 } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        await expect(guardedDataBank.connect(guardian1).pause())
          .to.emit(guardedDataBank, "Paused");
        
        expect(await guardedDataBank.paused()).to.equal(true);
      });

      it("Should revert when non-guardian tries to pause", async function () {
        const { guardedDataBank, nonGuardian } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        await expect(guardedDataBank.connect(nonGuardian).pause())
          .to.be.revertedWith("GuardedPausable: Not a guardian");
      });

      it("Should revert when trying to pause already paused contract", async function () {
        const { guardedDataBank, guardian1 } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        // Pause first
        await guardedDataBank.connect(guardian1).pause();
        
        // Try to pause again
        await expect(guardedDataBank.connect(guardian1).pause())
          .to.be.revertedWith("GuardedPausable: Already paused");
      });
    });

    describe("unpause", function () {
      it("Should allow guardians to unpause the contract", async function () {
        const { guardedDataBank, guardian1 } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        // Pause first
        await guardedDataBank.connect(guardian1).pause();
        expect(await guardedDataBank.paused()).to.equal(true);
        
        // Unpause
        await expect(guardedDataBank.connect(guardian1).unpause())
          .to.emit(guardedDataBank, "Unpaused");
        
        expect(await guardedDataBank.paused()).to.equal(false);
      });

      it("Should revert when non-guardian tries to unpause", async function () {
        const { guardedDataBank, guardian1, nonGuardian } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        // Pause first
        await guardedDataBank.connect(guardian1).pause();
        
        await expect(guardedDataBank.connect(nonGuardian).unpause())
          .to.be.revertedWith("GuardedPausable: Not a guardian");
      });

      it("Should revert when trying to unpause already unpaused contract", async function () {
        const { guardedDataBank, guardian1 } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        await expect(guardedDataBank.connect(guardian1).unpause())
          .to.be.revertedWith("GuardedPausable: Already unpaused");
      });
    });
  });

  describe("Oracle Data Updates", function () {
    describe("updateOracleData", function () {
      it("Should successfully update oracle data with valid consensus data", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        // Mock ETH/USD price value
        const mockValue = abiCoder.encode(["uint256"], [h.toWei("2000")]);
        
        // Prepare oracle data
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint
        );
        
        // Update oracle data
        await expect(guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.emit(guardedDataBank, "OracleUpdated")
          .withArgs(ETH_USD_QUERY_ID, mockValue, attestData.report.aggregatePower);
        
        // Check that data was stored correctly
        expect(await guardedDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
        
        const timestamp = await guardedDataBank.getAggregateTimestampByIndex(ETH_USD_QUERY_ID, 0);
        expect(timestamp).to.equal(attestData.report.timestamp);
        
        const aggregateData = await guardedDataBank.getAggregateDataByTimestamp(ETH_USD_QUERY_ID, timestamp);
        expect(aggregateData.value).to.equal(mockValue);
        expect(aggregateData.power).to.equal(attestData.report.aggregatePower);
      });

      it("Should handle multiple oracle data updates with increasing timestamps", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        const mockValue1 = abiCoder.encode(["uint256"], [h.toWei("2000")]);
        const mockValue2 = abiCoder.encode(["uint256"], [h.toWei("2100")]);
        
        // First update
        let { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue1,
          validators,
          powers,
          valCheckpoint
        );
        
        await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
        expect(await guardedDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
        
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
        
        await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
        expect(await guardedDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(2);
        
        // Check latest data
        const latestTimestamp = await guardedDataBank.getAggregateTimestampByIndex(ETH_USD_QUERY_ID, 1);
        const latestData = await guardedDataBank.getAggregateDataByTimestamp(ETH_USD_QUERY_ID, latestTimestamp);
        expect(latestData.value).to.equal(mockValue2);
      });

      it("Should revert when data is too old", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorDataBankFixture);
        
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
        
        await expect(guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedTellorDataBank: Data too old");
      });

      it("Should revert when attestation is too old", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        const mockValue = abiCoder.encode(["uint256"], [h.toWei("2000")]);
        
        // Use our custom helper to create oracle data with attestation that's 15 minutes old (past MAX_ATTESTATION_AGE of 10 minutes)
        const { attestData, currentValidatorSet, sigs } = await h.prepareOldAttestationData(
          ETH_USD_QUERY_ID,
          mockValue,
          validators,
          powers,
          valCheckpoint,
          15 // 15 minutes old attestation
        );
        
        await expect(guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedTellorDataBank: Attestation too old");
      });

      it("Should revert when timestamp is not monotonically increasing", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        const mockValue1 = abiCoder.encode(["uint256"], [h.toWei("2000")]);
        const mockValue2 = abiCoder.encode(["uint256"], [h.toWei("2100")]);
        
        // First update with current timestamp
        let { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue1,
          validators,
          powers,
          valCheckpoint
        );
        
        await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
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
        await expect(guardedDataBank.updateOracleData(olderAttestData, currentValidatorSet2, sigs2))
          .to.be.revertedWith("GuardedTellorDataBank: Report timestamp must increase");
      });

      it("Should successfully handle optimistic oracle data", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedTellorDataBankFixture);
        
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
        await expect(guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.emit(guardedDataBank, "OracleUpdated")
          .withArgs(ETH_USD_QUERY_ID, mockValue, attestData.report.aggregatePower);
        
        // Verify data was stored
        expect(await guardedDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
      });

      it("Should revert with insufficient power for optimistic data", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint, dataBridge, threshold } = await loadFixture(deployGuardedTellorDataBankFixture);
        
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
        
        await expect(guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedTellorDataBank: Insufficient optimistic report power");
      });

      it("Should revert optimistic data when dispute period hasn't passed", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        const mockValue = abiCoder.encode(["uint256"], [h.toWei("2000")]);

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
        
        await expect(guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedTellorDataBank: Dispute period not passed. request new attestations");
      });

      it("Should revert when more recent optimistic report is available", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedTellorDataBankFixture);
        
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
        nextTimestamp = blocky.timestamp - OPTIMISTIC_DELAY - 1000;
        // last consensus timestamp is before the aggregate timestamp
        lastConsensusTimestamp = aggregateTimestamp - 3600;
        // aggregate power is threshold / 2 + 1
        aggregatePower = threshold / 2 + 1; 
        // Create data with nextTimestamp set (indicating more recent data exists)
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
        
        await expect(guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedTellorDataBank: More recent optimistic report available");
      });

      it("Should successfully handle consensus data vs optimistic data", async function () {
        const { guardedDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedTellorDataBankFixture);
        
        const mockValue1 = abiCoder.encode(["uint256"], [h.toWei("2000")]);
        const mockValue2 = abiCoder.encode(["uint256"], [h.toWei("2100")]);
        
        // First, add consensus data
        const { attestData: consensusData, currentValidatorSet, sigs: consensusSigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue1,
          validators,
          powers,
          valCheckpoint
        );
        
        await guardedDataBank.updateOracleData(consensusData, currentValidatorSet, consensusSigs);
        expect(await guardedDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
        
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

        await guardedDataBank.updateOracleData(optimisticData, optimisticCurrentValidatorSet, optimisticSigs);
        expect(await guardedDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(2);
        
        // Verify the latest data is the optimistic data
        const [latestData,] = await guardedDataBank.getCurrentAggregateDataUnGuarded(ETH_USD_QUERY_ID);
        expect(latestData.value).to.equal(mockValue2);
      });

       it("Should revert optimistic data when newer consensus data is available", async function () {
         const { guardedDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedTellorDataBankFixture);
        
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
        
        await expect(guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("GuardedTellorDataBank: Newer consensus data available");
      });
    });
  });

  describe("Data Retrieval Functions", function () {
    beforeEach(async function () {
      // Set up some test data for retrieval tests
      const { guardedDataBank, validators, powers, valCheckpoint, guardian1 } = await loadFixture(deployGuardedTellorDataBankFixture);
      this.guardedDataBank = guardedDataBank;
      
      const mockValue = abiCoder.encode(["uint256"], [h.toWei("2000")]);
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      blocky = await h.getBlock();
      this.testTimestamp = attestData.report.timestamp;
      this.testValue = mockValue;
      this.testPower = attestData.report.aggregatePower;
      this.testAttestationTimestamp = attestData.attestationTimestamp;
      this.guardian1 = guardian1;
      this.testRelayTimestamp = blocky.timestamp;
    });

    describe("getAggregateValueCount", function () {
      it("Should return correct count of stored values", async function () {
        expect(await this.guardedDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
        
        // Query ID that doesn't exist should return 0
        const randomQueryId = h.hash(abiCoder.encode(["string"], ["nonexistent"]));
        expect(await this.guardedDataBank.getAggregateValueCount(randomQueryId)).to.equal(0);
      });
    });

    describe("getAggregateDataByTimestamp", function () {
      it("Should return correct data for valid timestamp", async function () {
        const data = await this.guardedDataBank.getAggregateDataByTimestamp(ETH_USD_QUERY_ID, this.testTimestamp);
        
        expect(data.value).to.equal(this.testValue);
        expect(data.power).to.equal(this.testPower);
        expect(BigInt(data.attestationTimestamp)).to.equal(BigInt(this.testAttestationTimestamp));
        expect(BigInt(data.relayTimestamp)).to.equal(BigInt(this.testRelayTimestamp));
      });

      it("Should return empty data for non-existent timestamp", async function () {
        const data = await this.guardedDataBank.getAggregateDataByTimestamp(ETH_USD_QUERY_ID, 999999);
        
        expect(data.value).to.equal("0x");
        expect(data.power).to.equal(0);
        expect(data.attestationTimestamp).to.equal(0);
        expect(data.relayTimestamp).to.equal(0);
      });
    });

    describe("getAggregateTimestampByIndex", function () {
      it("Should return correct timestamp for valid index", async function () {
        const timestamp = await this.guardedDataBank.getAggregateTimestampByIndex(ETH_USD_QUERY_ID, 0);
        expect(timestamp).to.equal(this.testTimestamp);
      });
    });

    describe("getCurrentAggregateDataGuarded", function () {
      it("Should return current data when unpaused", async function () {
        const [data, timestamp] = await this.guardedDataBank.getCurrentAggregateDataGuarded(ETH_USD_QUERY_ID);
        
        expect(data.value).to.equal(this.testValue);
        expect(data.power).to.equal(this.testPower);
        expect(BigInt(data.attestationTimestamp)).to.equal(BigInt(this.testAttestationTimestamp));
        expect(BigInt(data.relayTimestamp)).to.equal(BigInt(this.testRelayTimestamp));
        expect(timestamp).to.equal(this.testTimestamp);
      });

      it("Should revert when paused", async function () {        
        await this.guardedDataBank.connect(this.guardian1).pause();
        
        await expect(this.guardedDataBank.getCurrentAggregateDataGuarded(ETH_USD_QUERY_ID))
          .to.be.revertedWith("GuardedPausable: Tellor is paused");
      });

      it("Should return current data when paused and then unpaused", async function () {
        const [dataBeforePause, timestampBeforePause] = await this.guardedDataBank.getCurrentAggregateDataGuarded(ETH_USD_QUERY_ID);

        expect(dataBeforePause.value).to.equal(this.testValue);
        expect(dataBeforePause.power).to.equal(this.testPower);
        expect(timestampBeforePause).to.equal(this.testTimestamp);

        await this.guardedDataBank.connect(this.guardian1).pause();

        await expect(this.guardedDataBank.getCurrentAggregateDataGuarded(ETH_USD_QUERY_ID))
          .to.be.revertedWith("GuardedPausable: Tellor is paused");

        await this.guardedDataBank.connect(this.guardian1).unpause();

        const [dataAfterUnpause, timestampAfterUnpause] = await this.guardedDataBank.getCurrentAggregateDataGuarded(ETH_USD_QUERY_ID);

        expect(dataAfterUnpause.value).to.equal(this.testValue);
        expect(dataAfterUnpause.power).to.equal(this.testPower);
        expect(timestampAfterUnpause).to.equal(this.testTimestamp);
      });

      it("Should return empty data for non-existent query ID", async function () {
        const randomQueryId = h.hash(abiCoder.encode(["string"], ["nonexistent"]));
        const [data, timestamp] = await this.guardedDataBank.getCurrentAggregateDataGuarded(randomQueryId);
        
        expect(data.value).to.equal("0x");
        expect(data.power).to.equal(0);
        expect(timestamp).to.equal(0);
      });
    });

    describe("getCurrentAggregateDataUnGuarded", function () {
      it("Should return current data when unpaused", async function () {
        const [data, timestamp] = await this.guardedDataBank.getCurrentAggregateDataUnGuarded(ETH_USD_QUERY_ID);
        
        expect(data.value).to.equal(this.testValue);
        expect(data.power).to.equal(this.testPower);
        expect(BigInt(data.attestationTimestamp)).to.equal(BigInt(this.testAttestationTimestamp));
        expect(BigInt(data.relayTimestamp)).to.equal(BigInt(this.testRelayTimestamp));
        expect(timestamp).to.equal(this.testTimestamp);
      });

      it("Should return current data even when paused", async function () {
        await this.guardedDataBank.connect(this.guardian1).pause();
        
        const [data, timestamp] = await this.guardedDataBank.getCurrentAggregateDataUnGuarded(ETH_USD_QUERY_ID);
        
        expect(data.value).to.equal(this.testValue);
        expect(data.power).to.equal(this.testPower);
        expect(BigInt(data.attestationTimestamp)).to.equal(BigInt(this.testAttestationTimestamp));
        expect(BigInt(data.relayTimestamp)).to.equal(BigInt(this.testRelayTimestamp));
        expect(timestamp).to.equal(this.testTimestamp);
      });
    });
  });

  describe("Multiple Query IDs", function () {
    it("Should handle data for different query IDs independently", async function () {
      const { guardedDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedTellorDataBankFixture);
      
      // Create second query ID for BTC/USD
      const BTC_USD_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["btc", "usd"]);
      const BTC_USD_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", BTC_USD_QUERY_DATA_ARGS]);
      const BTC_USD_QUERY_ID = h.hash(BTC_USD_QUERY_DATA);
      
      const ethValue = abiCoder.encode(["uint256"], [h.toWei("2000")]);
      const btcValue = abiCoder.encode(["uint256"], [h.toWei("50000")]);
      
      // Update ETH/USD data
      let { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        ethValue,
        validators,
        powers,
        valCheckpoint
      );
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Wait and update BTC/USD data
      await time.increase(60);
      ({ attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        BTC_USD_QUERY_ID,
        btcValue,
        validators,
        powers,
        valCheckpoint
      ));
      await guardedDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
      
      // Check both query IDs have independent data
      expect(await guardedDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
      expect(await guardedDataBank.getAggregateValueCount(BTC_USD_QUERY_ID)).to.equal(1);
      
      const [ethData,] = await guardedDataBank.getCurrentAggregateDataUnGuarded(ETH_USD_QUERY_ID);
      const [btcData,] = await guardedDataBank.getCurrentAggregateDataUnGuarded(BTC_USD_QUERY_ID);
      
      expect(ethData.value).to.equal(ethValue);
      expect(btcData.value).to.equal(btcValue);
    });
  });
});
