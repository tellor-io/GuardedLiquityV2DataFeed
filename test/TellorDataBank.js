const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const h = require("./customHelpers.js");
const TellorDataBridgeArtifact = require("usingtellorlayer/artifacts/contracts/testing/bridge/TellorDataBridge.sol/TellorDataBridge.json");

describe("TellorDataBank and GuardedLiquityV2OracleAdaptor", function () {
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
  async function deployGuardedLiquityV2DataFeedFixture() {
    const [deployer, admin, guardian2, guardian3, nonGuardian] = await ethers.getSigners();
    
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

    // Deploy TellorDataBank
    const TellorDataBank = await ethers.getContractFactory("TellorDataBank");
    const tellorDataBank = await TellorDataBank.deploy(dataBridge.target);
    await tellorDataBank.waitForDeployment();

    // Deploy GuardedLiquityV2OracleAdaptor with tellorDataBank and admin as the first guardian
    const GuardedLiquityV2OracleAdaptor = await ethers.getContractFactory("GuardedLiquityV2OracleAdaptor");
    const guardedLiquityV2OracleAdaptor = await GuardedLiquityV2OracleAdaptor.deploy(tellorDataBank.target, ETH_USD_QUERY_ID, DECIMALS, "ProjectA", "ETH/USD", admin.address);
    await guardedLiquityV2OracleAdaptor.waitForDeployment();

    // Deploy MockMainnetPriceFeedBase for integration testing
    const MockMainnetPriceFeedBase = await ethers.getContractFactory("MockMainnetPriceFeedBase");
    const mockMainnetPriceFeed = await MockMainnetPriceFeedBase.deploy(guardedLiquityV2OracleAdaptor.target, STALENESS_THRESHOLD);
    await mockMainnetPriceFeed.waitForDeployment();

    return {
      dataBridge,
      tellorDataBank,
      guardedLiquityV2OracleAdaptor,
      mockMainnetPriceFeed,
      deployer,
      admin,
      guardian2,
      guardian3,
      nonGuardian,
      validators: [val1],
      powers: initialPowers,
      valCheckpoint,
      threshold,
    };
  }

  describe("Deployment", function () {
    it("Should set deployment variables correctly", async function () {
      const { tellorDataBank, guardedLiquityV2OracleAdaptor, admin, dataBridge } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
      // tellorDataBank
      expect(await tellorDataBank.dataBridge()).to.equal(dataBridge.target);
      expect(await tellorDataBank.MAX_DATA_AGE()).to.equal(MAX_DATA_AGE);
      expect(await tellorDataBank.MAX_ATTESTATION_AGE()).to.equal(MAX_ATTESTATION_AGE);
      expect(await tellorDataBank.OPTIMISTIC_DELAY()).to.equal(OPTIMISTIC_DELAY);
      expect(await tellorDataBank.MS_PER_SECOND()).to.equal(MS_PER_SECOND);
      // oracle adaptor
      expect(await guardedLiquityV2OracleAdaptor.dataBank()).to.equal(tellorDataBank.target);
      expect(await guardedLiquityV2OracleAdaptor.queryId()).to.equal(ETH_USD_QUERY_ID);
      expect(await guardedLiquityV2OracleAdaptor.decimals()).to.equal(DECIMALS);
      expect(await guardedLiquityV2OracleAdaptor.name()).to.equal("ETH/USD");
      expect(await guardedLiquityV2OracleAdaptor.project()).to.equal("ProjectA");
      expect(await guardedLiquityV2OracleAdaptor.MS_PER_SECOND()).to.equal(MS_PER_SECOND);
      // pausable
      expect(await guardedLiquityV2OracleAdaptor.guardians(admin.address)).to.equal(true);
      expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
      expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(admin.address);
      expect(await guardedLiquityV2OracleAdaptor.paused()).to.equal(false);
    });
  });

  describe("Guardian Management", function () {
    describe("addGuardian", function () {
      it("Should allow admin to add new guardians", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // guardian2 is not a guardian yet
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2.address)).to.equal(false);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);

        await expect(guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address))
          .to.emit(guardedLiquityV2OracleAdaptor, "GuardianAdded")
          .withArgs(guardian2.address);
        
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2.address)).to.equal(true);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);
      });

      it("Should revert when non-admin tries to add guardian", async function () {
        const { guardedLiquityV2OracleAdaptor, guardian2, nonGuardian, admin } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        await expect(guardedLiquityV2OracleAdaptor.connect(guardian2).addGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2.address)).to.equal(false);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);

        // add guardian2
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2.address)).to.equal(true);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);

        // add guardian2 tries to add nonGuardian
        await expect(guardedLiquityV2OracleAdaptor.connect(guardian2).addGuardian(nonGuardian.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");
      });

      it("Should revert when trying to add existing guardian", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Add guardian2 first
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        
        // Try to add guardian2 again
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Guardian already exists");
      });
    });

    describe("removeGuardian", function () {
      it("Should allow admin to remove guardians", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Add guardian2 
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2)).to.equal(true);
        
        // Remove guardian2
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).removeGuardian(guardian2.address))
          .to.emit(guardedLiquityV2OracleAdaptor, "GuardianRemoved")
          .withArgs(guardian2.address);
        
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2)).to.equal(false);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
      });

      it("Should revert when non-admin tries to remove guardian", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        await expect(guardedLiquityV2OracleAdaptor.connect(guardian2).removeGuardian(admin.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");

        // add guardian2
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2)).to.equal(true);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);

        await expect(guardedLiquityV2OracleAdaptor.connect(guardian2).removeGuardian(admin.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");
      });

      it("Should revert when trying to remove non-existent guardian", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).removeGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Guardian does not exist");
      });

      it("Should be able to remove admin", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.guardians(admin)).to.equal(true);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).removeGuardian(admin.address))
          .to.emit(guardedLiquityV2OracleAdaptor, "AdminRemoved");
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal("0x0000000000000000000000000000000000000000");
        expect(await guardedLiquityV2OracleAdaptor.guardians(admin)).to.equal(false);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(0);
        // old admin can't add guardian2 now
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");
      });

      it("Should only remove admin when last guardian", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).removeGuardian(admin.address))
          .to.be.revertedWith("GuardedPausable: Cannot remove admin if there are other guardians");
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(admin.address);
        // remove guardian2
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).removeGuardian(guardian2.address))
          .to.emit(guardedLiquityV2OracleAdaptor, "GuardianRemoved")
          .withArgs(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2)).to.equal(false);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
        // remove admin, this time it should work
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).removeGuardian(admin.address))
          .to.emit(guardedLiquityV2OracleAdaptor, "AdminRemoved");
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal("0x0000000000000000000000000000000000000000");
        expect(await guardedLiquityV2OracleAdaptor.guardians(admin)).to.equal(false);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(0);
      });
    });

    describe("updateAdmin", function () {
      it("Should allow admin to update admin", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
        expect(await guardedLiquityV2OracleAdaptor.guardians(admin)).to.equal(true);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2)).to.equal(false);
        await guardedLiquityV2OracleAdaptor.connect(admin).updateAdmin(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
        expect(await guardedLiquityV2OracleAdaptor.guardians(admin)).to.equal(false);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2)).to.equal(true);
      });

      it("Should revert when non-admin tries to update admin", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        await expect(guardedLiquityV2OracleAdaptor.connect(guardian2).updateAdmin(guardian2.address))
          .to.be.revertedWith("GuardedPausable: Not an admin");
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
      });

      it("Should revert when new admin is the same as the current admin", async function () {
        const { guardedLiquityV2OracleAdaptor, admin } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).updateAdmin(admin.address))
          .to.be.revertedWith("GuardedPausable: New admin cannot be the same as the current admin");
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
      });

      it("Should handle when new admin is the zero address", async function () {
        const { guardedLiquityV2OracleAdaptor, admin } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        await guardedLiquityV2OracleAdaptor.connect(admin).updateAdmin("0x0000000000000000000000000000000000000000");
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal("0x0000000000000000000000000000000000000000");
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(0);
      });

      it("Should handle new admin who is already a guardian", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        // add guardian2
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2)).to.equal(true);
        // update admin to guardian2
        await guardedLiquityV2OracleAdaptor.connect(admin).updateAdmin(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2)).to.equal(true);
      });

      it("New admin should be able to add and remove guardians", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2, guardian3 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
        // update admin to guardian2
        await guardedLiquityV2OracleAdaptor.connect(admin).updateAdmin(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(guardian2.address);
        // add guardian3
        await guardedLiquityV2OracleAdaptor.connect(guardian2).addGuardian(guardian3.address);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian3)).to.equal(true);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);
        // remove guardian3
        await guardedLiquityV2OracleAdaptor.connect(guardian2).removeGuardian(guardian3.address);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian3)).to.equal(false);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
        // update admin back to original admin
        await guardedLiquityV2OracleAdaptor.connect(guardian2).updateAdmin(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
      });
    });

    describe("Guardian Query Functions", function () {
      it("Should return correct guardian addresses list", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2, guardian3 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Initially only admin is a guardian
        let guardianAddresses = await guardedLiquityV2OracleAdaptor.getGuardianAddresses();
        expect(guardianAddresses.length).to.equal(1);
        expect(guardianAddresses[0]).to.equal(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
        expect(await guardedLiquityV2OracleAdaptor.getGuardianAtIndex(0)).to.equal(admin.address);
        
        // Add guardian2
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        guardianAddresses = await guardedLiquityV2OracleAdaptor.getGuardianAddresses();
        expect(guardianAddresses.length).to.equal(2);
        expect(guardianAddresses).to.include(admin.address);
        expect(guardianAddresses).to.include(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);
        
        // Add guardian3
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian3.address);
        guardianAddresses = await guardedLiquityV2OracleAdaptor.getGuardianAddresses();
        expect(guardianAddresses.length).to.equal(3);
        expect(guardianAddresses).to.include(admin.address);
        expect(guardianAddresses).to.include(guardian2.address);
        expect(guardianAddresses).to.include(guardian3.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(3);
      });

      it("Should handle guardian removal correctly in query functions", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2, guardian3 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Add multiple guardians
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian3.address);
        
        let guardianAddresses = await guardedLiquityV2OracleAdaptor.getGuardianAddresses();
        expect(guardianAddresses.length).to.equal(3);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(3);
        
        // Remove guardian2
        await guardedLiquityV2OracleAdaptor.connect(admin).removeGuardian(guardian2.address);
        guardianAddresses = await guardedLiquityV2OracleAdaptor.getGuardianAddresses();
        expect(guardianAddresses.length).to.equal(2);
        expect(guardianAddresses).to.include(admin.address);
        expect(guardianAddresses).to.include(guardian3.address);
        expect(guardianAddresses).to.not.include(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);
        
        // Remove guardian3
        await guardedLiquityV2OracleAdaptor.connect(admin).removeGuardian(guardian3.address);
        guardianAddresses = await guardedLiquityV2OracleAdaptor.getGuardianAddresses();
        expect(guardianAddresses.length).to.equal(1);
        expect(guardianAddresses[0]).to.equal(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(1);
      });

      it("Should handle getGuardianAtIndex correctly", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2, guardian3 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Add multiple guardians
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian3.address);
        
        // Test valid indices
        expect(await guardedLiquityV2OracleAdaptor.getGuardianAtIndex(0)).to.equal(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.getGuardianAtIndex(1)).to.equal(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.getGuardianAtIndex(2)).to.equal(guardian3.address);
        
        // Test invalid index
        await expect(guardedLiquityV2OracleAdaptor.getGuardianAtIndex(3))
          .to.be.revertedWith("GuardedPausable: Index out of bounds");
      });

      it("Should maintain correct guardian list after admin update", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2, guardian3 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Add guardians
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian3.address);
        
        let guardianAddresses = await guardedLiquityV2OracleAdaptor.getGuardianAddresses();
        expect(guardianAddresses.length).to.equal(3);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(3);
        
        // Update admin to guardian2 (who is already a guardian)
        await guardedLiquityV2OracleAdaptor.connect(admin).updateAdmin(guardian2.address);
        
        guardianAddresses = await guardedLiquityV2OracleAdaptor.getGuardianAddresses();
        expect(guardianAddresses.length).to.equal(2);
        expect(guardianAddresses).to.include(guardian2.address);
        expect(guardianAddresses).to.include(guardian3.address);
        expect(guardianAddresses).to.not.include(admin.address);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);
        expect(await guardedLiquityV2OracleAdaptor.admin()).to.equal(guardian2.address);
      });
    });
  });

  describe("Pause/Unpause Functionality", function () {
    describe("pause", function () {
      it("Should allow guardians to pause the contract", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, guardian2 } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).pause())
          .to.emit(guardedLiquityV2OracleAdaptor, "Paused");
        
        expect(await guardedLiquityV2OracleAdaptor.paused()).to.equal(true);

        await guardedLiquityV2OracleAdaptor.connect(admin).addGuardian(guardian2.address);
        expect(await guardedLiquityV2OracleAdaptor.guardians(guardian2)).to.equal(true);
        expect(await guardedLiquityV2OracleAdaptor.guardianCount()).to.equal(2);

        await guardedLiquityV2OracleAdaptor.connect(admin).unpause();
        expect(await guardedLiquityV2OracleAdaptor.paused()).to.equal(false);

        await guardedLiquityV2OracleAdaptor.connect(guardian2).pause();
        expect(await guardedLiquityV2OracleAdaptor.paused()).to.equal(true);
      });

      it("Should revert when non-guardian tries to pause", async function () {
        const { guardedLiquityV2OracleAdaptor, nonGuardian } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        await expect(guardedLiquityV2OracleAdaptor.connect(nonGuardian).pause())
          .to.be.revertedWith("GuardedPausable: Not a guardian");

        expect(await guardedLiquityV2OracleAdaptor.paused()).to.equal(false);
      });

      it("Should revert when trying to pause already paused contract", async function () {
        const { guardedLiquityV2OracleAdaptor, admin } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Pause first
        await guardedLiquityV2OracleAdaptor.connect(admin).pause();
        
        // Try to pause again
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).pause())
          .to.be.revertedWith("GuardedPausable: Already paused");
      });
    });

    describe("unpause", function () {
      it("Should allow guardians to unpause the contract", async function () {
        const { guardedLiquityV2OracleAdaptor, admin } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Pause first
        await guardedLiquityV2OracleAdaptor.connect(admin).pause();
        expect(await guardedLiquityV2OracleAdaptor.paused()).to.equal(true);
        
        // Unpause
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).unpause())
          .to.emit(guardedLiquityV2OracleAdaptor, "Unpaused");
        
        expect(await guardedLiquityV2OracleAdaptor.paused()).to.equal(false);
      });

      it("Should revert when non-guardian tries to unpause", async function () {
        const { guardedLiquityV2OracleAdaptor, admin, nonGuardian } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Pause first
        await guardedLiquityV2OracleAdaptor.connect(admin).pause();
        
        await expect(guardedLiquityV2OracleAdaptor.connect(nonGuardian).unpause())
          .to.be.revertedWith("GuardedPausable: Not a guardian");
      });

      it("Should revert when trying to unpause already unpaused contract", async function () {
        const { guardedLiquityV2OracleAdaptor, admin } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        await expect(guardedLiquityV2OracleAdaptor.connect(admin).unpause())
          .to.be.revertedWith("GuardedPausable: Already unpaused");
      });
    });
  });

  describe("Oracle Data Updates", function () {
    describe("updateOracleData", function () {
      it("Should successfully update oracle data with valid consensus data", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        await expect(tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.emit(tellorDataBank, "OracleUpdated")
          .withArgs(ETH_USD_QUERY_ID, h.attestDataStructToArray(attestData));
        
        // Check that data was stored correctly
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
        
        const aggData = await tellorDataBank.getAggregateByIndex(ETH_USD_QUERY_ID, 0);
        expect(aggData.aggregateTimestamp).to.equal(attestData.report.timestamp);
        
        expect(abiCoder.decode(["uint256"], aggData.value)[0]).to.equal(mockPrice);
        expect(aggData.power).to.equal(attestData.report.aggregatePower);
      });

      it("Should handle multiple oracle data updates with increasing timestamps", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        
        await tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
        
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
        
        await tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(2);
        
        // Check latest data
        const aggData = await tellorDataBank.getAggregateByIndex(ETH_USD_QUERY_ID, 1);
        expect(aggData.aggregateTimestamp).to.equal(attestData.report.timestamp);
        expect(abiCoder.decode(["uint256"], aggData.value)[0]).to.equal(mockPrice2);
        expect(aggData.power).to.equal(attestData.report.aggregatePower);
      });

      it("Should revert when data is too old", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        
        await expect(tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("TellorDataBank: Data too old");
      });

      it("Should revert when attestation is too old", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        
        await expect(tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("TellorDataBank: Attestation too old");
      });

      it("Should revert when timestamp is not monotonically increasing", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        
        await tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
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
        await expect(tellorDataBank.updateOracleData(olderAttestData, currentValidatorSet2, sigs2))
          .to.be.revertedWith("TellorDataBank: Report timestamp must increase");
      });

      it("Should successfully handle optimistic oracle data", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        await expect(tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.emit(tellorDataBank, "OracleUpdated")
          .withArgs(ETH_USD_QUERY_ID, h.attestDataStructToArray(attestData));
        
        // Verify data was stored
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);

        const aggData = await tellorDataBank.getAggregateByIndex(ETH_USD_QUERY_ID, 0);
        expect(aggData.aggregateTimestamp).to.equal(attestData.report.timestamp);
        expect(abiCoder.decode(["uint256"], aggData.value)[0]).to.equal(mockPrice);
        expect(aggData.power).to.equal(attestData.report.aggregatePower);
      });

      it("Should revert with insufficient power for optimistic data", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        
        await expect(tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("TellorDataBank: Insufficient optimistic report power");
      });

      it("Should revert optimistic data when dispute period hasn't passed", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        
        await expect(tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("TellorDataBank: Dispute period not passed");
      });

      it("Should revert when more recent optimistic report is available", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        
        await expect(tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("TellorDataBank: More recent optimistic report available");
      });

      it("Should successfully handle consensus data vs optimistic data", async function () {
        const { tellorDataBank, guardedLiquityV2OracleAdaptor, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        
        await tellorDataBank.updateOracleData(consensusData, currentValidatorSet, consensusSigs);
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);

        latestRoundData = await guardedLiquityV2OracleAdaptor.latestRoundData();
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

        await tellorDataBank.updateOracleData(optimisticData, optimisticCurrentValidatorSet, optimisticSigs);
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(2);
        
        // Verify the latest data is the optimistic data
        const aggData = await tellorDataBank.getAggregateByIndex(ETH_USD_QUERY_ID, 1);
        expect(aggData.aggregateTimestamp).to.equal(optimisticData.report.timestamp);
        expect(abiCoder.decode(["uint256"], aggData.value)[0]).to.equal(mockPrice2);
        expect(aggData.power).to.equal(optimisticData.report.aggregatePower);

        latestRoundData = await guardedLiquityV2OracleAdaptor.latestRoundData();
        expect(latestRoundData.roundId).to.equal(1);
        expect(latestRoundData.answer).to.equal(mockPrice2);
        expect(latestRoundData.startedAt).to.equal(0);
        expect(latestRoundData.updatedAt).to.equal(optimisticData.report.timestamp / 1000);
        expect(latestRoundData.answeredInRound).to.equal(0);
      });

      it("Should revert optimistic data when newer consensus data is available", async function () {
         const { tellorDataBank, validators, powers, valCheckpoint, threshold } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
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
        
        await expect(tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs))
          .to.be.revertedWith("TellorDataBank: Newer consensus data available");
      });
    });
  });

  describe("Multi-Query ID Tests for TellorDataBank", function () {
    // Define additional query IDs for testing
    const BTC_USD_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["btc", "usd"]);
    const BTC_USD_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", BTC_USD_QUERY_DATA_ARGS]);
    const BTC_USD_QUERY_ID = h.hash(BTC_USD_QUERY_DATA);

    const ETH_EUR_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["eth", "eur"]);
    const ETH_EUR_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", ETH_EUR_QUERY_DATA_ARGS]);
    const ETH_EUR_QUERY_ID = h.hash(ETH_EUR_QUERY_DATA);

    describe("Storing data for multiple query IDs", function () {
      it("Should store data for different query IDs simultaneously", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Mock price values for different assets
        const ethPrice = h.toWei("2000");
        const btcPrice = h.toWei("45000");
        const ethEurPrice = h.toWei("1800");
        
        const ethValue = abiCoder.encode(["uint256"], [ethPrice]);
        const btcValue = abiCoder.encode(["uint256"], [btcPrice]);
        const ethEurValue = abiCoder.encode(["uint256"], [ethEurPrice]);
        
        // Prepare oracle data for ETH/USD
        const { attestData: ethAttestData, currentValidatorSet: ethValidatorSet, sigs: ethSigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          ethValue,
          validators,
          powers,
          valCheckpoint
        );
        
        // Wait a bit for different timestamps
        await time.increase(1);
        
        // Prepare oracle data for BTC/USD
        const { attestData: btcAttestData, currentValidatorSet: btcValidatorSet, sigs: btcSigs } = await h.prepareOracleData(
          BTC_USD_QUERY_ID,
          btcValue,
          validators,
          powers,
          valCheckpoint
        );
        
        // Wait a bit for different timestamps
        await time.increase(1);
        
        // Prepare oracle data for ETH/EUR
        const { attestData: ethEurAttestData, currentValidatorSet: ethEurValidatorSet, sigs: ethEurSigs } = await h.prepareOracleData(
          ETH_EUR_QUERY_ID,
          ethEurValue,
          validators,
          powers,
          valCheckpoint
        );
        
        // Update oracle data for all three query IDs
        await expect(tellorDataBank.updateOracleData(ethAttestData, ethValidatorSet, ethSigs))
          .to.emit(tellorDataBank, "OracleUpdated")
          .withArgs(ETH_USD_QUERY_ID, h.attestDataStructToArray(ethAttestData));
        
        await expect(tellorDataBank.updateOracleData(btcAttestData, btcValidatorSet, btcSigs))
          .to.emit(tellorDataBank, "OracleUpdated")
          .withArgs(BTC_USD_QUERY_ID, h.attestDataStructToArray(btcAttestData));
        
        await expect(tellorDataBank.updateOracleData(ethEurAttestData, ethEurValidatorSet, ethEurSigs))
          .to.emit(tellorDataBank, "OracleUpdated")
          .withArgs(ETH_EUR_QUERY_ID, h.attestDataStructToArray(ethEurAttestData));
        
        // Verify all data was stored correctly
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
        expect(await tellorDataBank.getAggregateValueCount(BTC_USD_QUERY_ID)).to.equal(1);
        expect(await tellorDataBank.getAggregateValueCount(ETH_EUR_QUERY_ID)).to.equal(1);
        
        // Verify data integrity for each query ID
        const ethData = await tellorDataBank.getAggregateByIndex(ETH_USD_QUERY_ID, 0);
        const btcData = await tellorDataBank.getAggregateByIndex(BTC_USD_QUERY_ID, 0);
        const ethEurData = await tellorDataBank.getAggregateByIndex(ETH_EUR_QUERY_ID, 0);
        
        expect(abiCoder.decode(["uint256"], ethData.value)[0]).to.equal(ethPrice);
        expect(abiCoder.decode(["uint256"], btcData.value)[0]).to.equal(btcPrice);
        expect(abiCoder.decode(["uint256"], ethEurData.value)[0]).to.equal(ethEurPrice);
        
        expect(ethData.aggregateTimestamp).to.equal(ethAttestData.report.timestamp);
        expect(btcData.aggregateTimestamp).to.equal(btcAttestData.report.timestamp);
        expect(ethEurData.aggregateTimestamp).to.equal(ethEurAttestData.report.timestamp);
      });

      it("Should handle multiple updates for the same query ID without affecting others", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Initial prices
        const ethPrice1 = h.toWei("2000");
        const ethPrice2 = h.toWei("2100");
        const btcPrice = h.toWei("45000");
        
        const ethValue1 = abiCoder.encode(["uint256"], [ethPrice1]);
        const ethValue2 = abiCoder.encode(["uint256"], [ethPrice2]);
        const btcValue = abiCoder.encode(["uint256"], [btcPrice]);
        
        // Store initial data for both query IDs
        let { attestData: ethAttestData1, currentValidatorSet: ethValidatorSet1, sigs: ethSigs1 } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          ethValue1,
          validators,
          powers,
          valCheckpoint
        );
        
        await time.increase(1);
        
        const { attestData: btcAttestData, currentValidatorSet: btcValidatorSet, sigs: btcSigs } = await h.prepareOracleData(
          BTC_USD_QUERY_ID,
          btcValue,
          validators,
          powers,
          valCheckpoint
        );
        
        await tellorDataBank.updateOracleData(ethAttestData1, ethValidatorSet1, ethSigs1);
        await tellorDataBank.updateOracleData(btcAttestData, btcValidatorSet, btcSigs);
        
        // Verify initial state
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
        expect(await tellorDataBank.getAggregateValueCount(BTC_USD_QUERY_ID)).to.equal(1);
        
        // Update ETH/USD again
        await time.increase(60);
        
        const { attestData: ethAttestData2, currentValidatorSet: ethValidatorSet2, sigs: ethSigs2 } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          ethValue2,
          validators,
          powers,
          valCheckpoint
        );
        
        await tellorDataBank.updateOracleData(ethAttestData2, ethValidatorSet2, ethSigs2);
        
        // Verify ETH/USD has 2 entries, BTC/USD still has 1
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(2);
        expect(await tellorDataBank.getAggregateValueCount(BTC_USD_QUERY_ID)).to.equal(1);
        
        // Verify latest ETH/USD data
        const latestEthData = await tellorDataBank.getAggregateByIndex(ETH_USD_QUERY_ID, 1);
        expect(abiCoder.decode(["uint256"], latestEthData.value)[0]).to.equal(ethPrice2);
        
        // Verify BTC/USD data is unchanged
        const btcData = await tellorDataBank.getAggregateByIndex(BTC_USD_QUERY_ID, 0);
        expect(abiCoder.decode(["uint256"], btcData.value)[0]).to.equal(btcPrice);
        expect(btcData.aggregateTimestamp).to.equal(btcAttestData.report.timestamp);
      });

      it("Should maintain independent data arrays for different query IDs", async function () {
        const { tellorDataBank, validators, powers, valCheckpoint } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        // Store 3 updates for ETH/USD and 2 updates for BTC/USD
        const ethPrices = [h.toWei("2000"), h.toWei("2100"), h.toWei("2200")];
        const btcPrices = [h.toWei("45000"), h.toWei("46000")];
        
        // Store ETH/USD data
        for (let i = 0; i < ethPrices.length; i++) {
          const ethValue = abiCoder.encode(["uint256"], [ethPrices[i]]);
          const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
            ETH_USD_QUERY_ID,
            ethValue,
            validators,
            powers,
            valCheckpoint
          );
          await tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
          await time.increase(60);
          expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(i + 1);
          expect(await tellorDataBank.getAggregateValueCount(BTC_USD_QUERY_ID)).to.equal(0);
        }
        
        // Store BTC/USD data
        for (let i = 0; i < btcPrices.length; i++) {
          const btcValue = abiCoder.encode(["uint256"], [btcPrices[i]]);
          const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
            BTC_USD_QUERY_ID,
            btcValue,
            validators,
            powers,
            valCheckpoint
          );
          await tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
          await time.increase(60);
          expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(3);
          expect(await tellorDataBank.getAggregateValueCount(BTC_USD_QUERY_ID)).to.equal(i + 1);
        }
        
        // Verify independent counts
        expect(await tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(3);
        expect(await tellorDataBank.getAggregateValueCount(BTC_USD_QUERY_ID)).to.equal(2);
        
        // Verify all ETH/USD data
        for (let i = 0; i < ethPrices.length; i++) {
          const ethData = await tellorDataBank.getAggregateByIndex(ETH_USD_QUERY_ID, i);
          expect(abiCoder.decode(["uint256"], ethData.value)[0]).to.equal(ethPrices[i]);
        }
        
        // Verify all BTC/USD data
        for (let i = 0; i < btcPrices.length; i++) {
          const btcData = await tellorDataBank.getAggregateByIndex(BTC_USD_QUERY_ID, i);
          expect(abiCoder.decode(["uint256"], btcData.value)[0]).to.equal(btcPrices[i]);
        }
      });
    });
  });

  describe("Data Retrieval Functions", function () {
    beforeEach(async function () {
      // Set up some test data for retrieval tests
      const { tellorDataBank, guardedLiquityV2OracleAdaptor, validators, powers, valCheckpoint, admin } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
      this.tellorDataBank = tellorDataBank;
      this.guardedLiquityV2OracleAdaptor = guardedLiquityV2OracleAdaptor;
      
      const mockPrice = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
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
        expect(await this.tellorDataBank.getAggregateValueCount(ETH_USD_QUERY_ID)).to.equal(1);
      });
    });

    describe("latestRoundData", function () {
      it("Should return current data when unpaused", async function () {
        const latestRoundData = await this.guardedLiquityV2OracleAdaptor.latestRoundData();
        
        expect(latestRoundData.roundId).to.equal(1);
        expect(latestRoundData.answer).to.equal(this.testValue);
        expect(latestRoundData.startedAt).to.equal(0);
        expect(latestRoundData.updatedAt).to.equal(this.testTimestamp / 1000);
        expect(latestRoundData.answeredInRound).to.equal(0);
      });

      it("Should revert when paused", async function () {        
        await this.guardedLiquityV2OracleAdaptor.connect(this.admin).pause();
        
        await expect(this.guardedLiquityV2OracleAdaptor.latestRoundData())
          .to.be.revertedWith("GuardedPausable: Tellor is paused");
      });

      it("Should return current data when paused and then unpaused", async function () {
        const latestRoundDataBeforePause = await this.guardedLiquityV2OracleAdaptor.latestRoundData();

        expect(latestRoundDataBeforePause.roundId).to.equal(1);
        expect(latestRoundDataBeforePause.answer).to.equal(this.testValue);
        expect(latestRoundDataBeforePause.startedAt).to.equal(0);
        expect(latestRoundDataBeforePause.updatedAt).to.equal(this.testTimestamp / 1000);
        expect(latestRoundDataBeforePause.answeredInRound).to.equal(0);

        await this.guardedLiquityV2OracleAdaptor.connect(this.admin).pause();

        await expect(this.guardedLiquityV2OracleAdaptor.latestRoundData())
          .to.be.revertedWith("GuardedPausable: Tellor is paused");

        await this.guardedLiquityV2OracleAdaptor.connect(this.admin).unpause();

        const latestRoundDataAfterUnpause = await this.guardedLiquityV2OracleAdaptor.latestRoundData();

        expect(latestRoundDataAfterUnpause.roundId).to.equal(1);
        expect(latestRoundDataAfterUnpause.answer).to.equal(this.testValue);
        expect(latestRoundDataAfterUnpause.startedAt).to.equal(0);
        expect(latestRoundDataAfterUnpause.updatedAt).to.equal(this.testTimestamp / 1000);
        expect(latestRoundDataAfterUnpause.answeredInRound).to.equal(0);
      });

      it("Should revert when no data is available", async function () {
        // deploy a new guarded LiquityV2 oracle adaptor
        const { guardedLiquityV2OracleAdaptor } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
        
        await expect(guardedLiquityV2OracleAdaptor.latestRoundData())
          .to.be.revertedWith("GuardedLiquityV2OracleAdaptor: No data available");
      });
    });

    describe("decimals", function () {
      it("Should return correct decimals", async function () {
        expect(await this.guardedLiquityV2OracleAdaptor.decimals()).to.equal(DECIMALS);
      });
    });
  });

  describe("Integration Tests", function () {
    beforeEach(async function () {
      // Set up some test data for retrieval tests
      const { tellorDataBank, guardedLiquityV2OracleAdaptor, validators, powers, valCheckpoint, admin, mockMainnetPriceFeed, threshold } = await loadFixture(deployGuardedLiquityV2DataFeedFixture);
      this.tellorDataBank = tellorDataBank;
      this.guardedLiquityV2OracleAdaptor = guardedLiquityV2OracleAdaptor;
      
      const mockPrice = h.toWei("2000");
      const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
      const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
        ETH_USD_QUERY_ID,
        mockValue,
        validators,
        powers,
        valCheckpoint
      );
      
      await tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
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
        expect(ethUsdOracle.aggregator).to.equal(this.guardedLiquityV2OracleAdaptor.target);
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

        await this.guardedLiquityV2OracleAdaptor.connect(this.admin).pause();
        
        await this.mockMainnetPriceFeed.fetchPriceMock();

        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(0);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(true);
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

          await this.tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
          await this.mockMainnetPriceFeed.fetchPriceMock();
          expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(mockPrice);
          expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
          await time.increase(60);
        }
      });

      it("Should handle zero price values correctly", async function () {
        // Create oracle data with zero value
        const zeroValue = abiCoder.encode(["uint256"], [0]);
        
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          zeroValue,
          this.validators,
          this.powers,
          this.valCheckpoint
        );
        
        await this.tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);

        // MockMainnetPriceFeedBase should handle zero values
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(0);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(true);
      });

      it("Should handle very large price values correctly", async function () {
        // Create oracle data with very large value (near max uint256)
        const largeValue = BigInt("11579208923731619542357098500868790785326998466564056403945758400791312963993");
        const mockValue = abiCoder.encode(["uint256"], [largeValue]);
        
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          this.validators,
          this.powers,
          this.valCheckpoint
        );
        
        await this.tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
        
        // MockMainnetPriceFeedBase should handle large values correctly
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(largeValue);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
      });

      it("Should handle different price ranges correctly", async function () {
        const testPrices = [
          h.toWei("1"),      // $1
          h.toWei("100"),    // $100
          h.toWei("1000"),   // $1000
          h.toWei("50000"),  // $50000
          BigInt("1"),       // 1 wei
          BigInt("999999999999999999"), // Almost 1 ETH
        ];
        
        for (let i = 0; i < testPrices.length; i++) {
          await time.increase(1);
          const priceValue = testPrices[i];
          const mockValue = abiCoder.encode(["uint256"], [priceValue]);
          
          const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
            ETH_USD_QUERY_ID,
            mockValue,
            this.validators,
            this.powers,
            this.valCheckpoint
          );
          
          await this.tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
          
          await this.mockMainnetPriceFeed.fetchPriceMock();
          expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(priceValue);
          expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
        }
      });

      it("Should handle staleness correctly with MockMainnetPriceFeedBase", async function () {
        // Update with fresh data first
        const mockPrice = h.toWei("2000");
        const mockValue = abiCoder.encode(["uint256"], [mockPrice]);
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          this.validators,
          this.powers,
          this.valCheckpoint
        );

        await this.tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
        
        // Should work fine initially
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(mockPrice);
        
        // Move time forward beyond staleness threshold (25 hours)
        await time.increase(STALENESS_THRESHOLD + 60);
        
        // Now fetchPriceMock should trigger shutdown due to stale data
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(true);
      });

      it("Should handle pause/unpause sequence with multiple price updates", async function () {
        // NOTE: assumes that fetchPriceMock is not called while paused
        // Start with initial data
        const initialPrice = h.toWei("2000");
        const initialValue = abiCoder.encode(["uint256"], [initialPrice]);
        let { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          initialValue,
          this.validators,
          this.powers,
          this.valCheckpoint
        );

        await this.tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
        
        // Verify initial state
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(initialPrice);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);

        // Pause and verify paused
        await this.guardedLiquityV2OracleAdaptor.connect(this.admin).pause();
        expect(await this.guardedLiquityV2OracleAdaptor.paused()).to.equal(true);
        
        // Unpause
        await this.guardedLiquityV2OracleAdaptor.connect(this.admin).unpause();
        
        // Add new data
        await time.increase(60);
        const newPrice = h.toWei("2100");
        const newValue = abiCoder.encode(["uint256"], [newPrice]);
        ({ attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          newValue,
          this.validators,
          this.powers,
          this.valCheckpoint
        ));

        await this.tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);

        // Verify new mock can fetch the updated price
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(newPrice);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
      });

      it("Should handle rapid price updates correctly", async function () {
        const prices = [h.toWei("2000"), h.toWei("2050"), h.toWei("1980"), h.toWei("2100"), h.toWei("1950")];
        
        for (let i = 0; i < prices.length; i++) {
          const mockValue = abiCoder.encode(["uint256"], [prices[i]]);
          const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
            ETH_USD_QUERY_ID,
            mockValue,
            this.validators,
            this.powers,
            this.valCheckpoint
          );

          await this.tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
          
          // Fetch each price and verify
          await this.mockMainnetPriceFeed.fetchPriceMock();
          expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(prices[i]);
          expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
          
          // Small time increase between updates
          await time.increase(1);
        }
      });

      it("Should handle price with many decimals correctly", async function () {
        // Verify decimals match between contracts
        expect(await this.guardedLiquityV2OracleAdaptor.decimals()).to.equal(DECIMALS);
        const ethUsdOracle = await this.mockMainnetPriceFeed.ethUsdOracle();
        expect(ethUsdOracle.decimals).to.equal(DECIMALS);
        
        // Test with price that uses decimal precision
        const precisePrice = h.toWei("2000.123456789");
        const mockValue = abiCoder.encode(["uint256"], [precisePrice]);
        const { attestData, currentValidatorSet, sigs } = await h.prepareOracleData(
          ETH_USD_QUERY_ID,
          mockValue,
          this.validators,
          this.powers,
          this.valCheckpoint
        );

        await this.tellorDataBank.updateOracleData(attestData, currentValidatorSet, sigs);
        
        await this.mockMainnetPriceFeed.fetchPriceMock();
        expect(await this.mockMainnetPriceFeed.lastGoodPrice()).to.equal(precisePrice);
        expect(await this.mockMainnetPriceFeed.shutDown()).to.equal(false);
      });
    });
  });
});
