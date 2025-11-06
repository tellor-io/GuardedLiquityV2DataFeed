#!/usr/bin/env node

// Script to batch add guardians to all deployed GuardedLiquityV2OracleAdaptor contracts
// Usage: npx hardhat run scripts/add-guardians-batch.js --network sepolia

const { ethers } = require("hardhat");

// ================================
// CONFIGURATION - EDIT THIS SECTION
// ================================

// Guardian addresses to add to all contracts
const GUARDIANS_TO_ADD = [
  "0x7414f2646170738d6b85300daD8929E9753cb2b4", // Replace with actual guardian address 1
  "0xd1d143e293DD1f79Bbc152EC25a79Fe6fCC75315"  // Replace with actual guardian address 2
];

// Contract addresses - you'll need to update these with your actual deployed addresses
const ADAPTOR_ADDRESSES = [
  "0xdD248A8439073727DFbA32752C9E447290b35476",
  "0xC101670D29BD1C11315059E2Ed4D573B4903f31A",
  "0xF77712895a03A4102295DADcf51c3A8735C8E561",
  "0xC99fab80Cc82F6E4fa8F8A2CffCdBA8079b6a61f",
  "0xAAE36F0aC339e5b67D68f7C91BADCA3Ea252CA06",
  "0x11C0901265B0D86E150fe676Fa865EaA692a687f",
  "0x1363b97Bd44dCA5DbbaAf83bc92D8703FDf9320A",
  "0x6A527e84d37C855f48569F1E3536A9dba6294B81",
  "0x8F2Cd70951BaeaEa33e0D46ff5237B8b20A31757",
  "0x9F851b99D6F125656a641731a63E13cc07193C8f",
  "0x746A55326d51254883E676429AaCd0Ff6670f4c1",
  "0x8663D7F674fAf37403c95172828d820aaCEe898d",
  "0xC94886404C3B4F19f0A1961726B7efc8FF6129de",
  "0xe40dC0e5D06605bCd3226b7A5a1E69A3820F8d03",
  "0xef7ba0513f4D0FA89beC184dCdEBD841978D9C8F",
  "0x27b1DE8d94B691f6b81b0A80fD12cdCaeE1DDA86",
  "0x8691281e98329774270A1110F24765a8CEFF2DAF",
  "0x49C639F326c55b7c7cf0506e8c95495d8C2aB7FA",
  "0xc1b092b0A96DFc9719c6979e84098E226b20b6D9",
];

// Network optimization settings
const CONFIG = {
  // Gas settings
  gasLimit: 150000, // Higher gas limit to avoid out-of-gas errors
  gasMultiplier: 1.2, // Multiply estimated gas by this factor
  
  // Retry settings
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds between retries
  
  // Transaction timing
  txDelay: 2000, // 2 seconds between transactions
  confirmationTimeout: 120000, // 2 minutes timeout for confirmations
  
  // Network monitoring
  checkNetworkHealth: true,
  healthCheckDelay: 10000, // 10 seconds between network health checks
};

// ================================
// UTILITY FUNCTIONS
// ================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getNetworkHealth(provider) {
  try {
    const blockNumber = await provider.getBlockNumber();
    const gasPrice = await provider.getGasPrice();
    const network = await provider.getNetwork();
    
    return {
      blockNumber,
      gasPrice: ethers.formatUnits(gasPrice, 'gwei'),
      networkName: network.name,
      chainId: network.chainId.toString()
    };
  } catch (error) {
    console.log(`  ⚠️  Network health check failed: ${error.message}`);
    return null;
  }
}

async function waitForConfirmation(tx, timeout = CONFIG.confirmationTimeout) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const receipt = await tx.wait(1); // Wait for 1 confirmation
      return receipt;
    } catch (error) {
      if (error.code === 'TIMEOUT') {
        console.log(`  ⏳ Still waiting for confirmation... (${Math.round((Date.now() - startTime) / 1000)}s)`);
        await sleep(5000);
        continue;
      }
      throw error;
    }
  }
  
  throw new Error(`Transaction confirmation timeout after ${timeout / 1000} seconds`);
}

// ================================
// MAIN FUNCTIONS
// ================================

async function addGuardianToContract(adaptorAddress, guardianAddress, signer, attempt = 1) {
  try {
    console.log(`Adding guardian ${guardianAddress} to contract ${adaptorAddress}... (attempt ${attempt})`);
    
    // Get contract instance
    const adaptor = await ethers.getContractAt("GuardedLiquityV2OracleAdaptor", adaptorAddress, signer);
    
    // Check if guardian already exists
    const isGuardian = await adaptor.guardians(guardianAddress);
    if (isGuardian) {
      console.log(`  ⚠️  Guardian ${guardianAddress} already exists in contract ${adaptorAddress}`);
      return { success: true, skipped: true };
    }
    
    // Estimate gas
    let gasEstimate;
    try {
      gasEstimate = await adaptor.addGuardian.estimateGas(guardianAddress);
      gasEstimate = gasEstimate * BigInt(Math.floor(CONFIG.gasMultiplier * 100)) / BigInt(100);
    } catch (error) {
      console.log(`  ⚠️  Gas estimation failed, using default: ${error.message}`);
      gasEstimate = BigInt(CONFIG.gasLimit);
    }
    
    // Get current gas price
    const feeData = await signer.provider.getFeeData();
    const gasPrice = feeData.gasPrice;
    
    console.log(`  ⛽ Gas estimate: ${gasEstimate.toString()}, Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
    
    // Submit transaction with optimized settings
    const tx = await adaptor.addGuardian(guardianAddress, {
      gasLimit: gasEstimate,
      gasPrice: gasPrice
    });
    
    console.log(`  📝 Transaction submitted: ${tx.hash}`);
    
    // Wait for confirmation with timeout
    const receipt = await waitForConfirmation(tx, CONFIG.confirmationTimeout);
    console.log(`  ✅ Guardian added successfully! Gas used: ${receipt.gasUsed.toString()}`);
    
    return { 
      success: true, 
      txHash: tx.hash, 
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: ethers.formatUnits(gasPrice, 'gwei')
    };
    
  } catch (error) {
    console.error(`  ❌ Failed to add guardian ${guardianAddress} to contract ${adaptorAddress}:`, error.message);
    
    // Retry logic
    if (attempt < CONFIG.maxRetries && !error.message.includes('already exists')) {
      console.log(`  🔄 Retrying in ${CONFIG.retryDelay / 1000} seconds...`);
      await sleep(CONFIG.retryDelay);
      return addGuardianToContract(adaptorAddress, guardianAddress, signer, attempt + 1);
    }
    
    return { success: false, error: error.message, attempts: attempt };
  }
}

async function getContractInfo(adaptorAddress, signer) {
  try {
    const adaptor = await ethers.getContractAt("GuardedLiquityV2OracleAdaptor", adaptorAddress, signer);
    
    const admin = await adaptor.admin();
    const guardianCount = await adaptor.guardianCount();
    const isPaused = await adaptor.paused();
    
    return {
      admin,
      guardianCount: guardianCount.toString(),
      isPaused,
      name: await adaptor.name(),
      project: await adaptor.project()
    };
  } catch (error) {
    console.error(`Failed to get contract info for ${adaptorAddress}:`, error.message);
    return null;
  }
}

async function main() {
  console.log("🚀 Starting batch guardian addition process...\n");
  
  // Validate configuration
  if (ADAPTOR_ADDRESSES.length === 0) {
    console.error("❌ No adaptor addresses configured. Please update ADAPTOR_ADDRESSES array.");
    process.exit(1);
  }
  
  if (GUARDIANS_TO_ADD.length === 0) {
    console.error("❌ No guardian addresses configured. Please update GUARDIANS_TO_ADD array.");
    process.exit(1);
  }
  
  // Get signer and provider
  const [signer] = await ethers.getSigners();
  const provider = signer.provider;
  
  console.log(`👤 Using signer: ${signer.address}`);
  
  // Check network health
  if (CONFIG.checkNetworkHealth) {
    console.log("\n🔍 Checking network health...");
    const health = await getNetworkHealth(provider);
    if (health) {
      console.log(`  Network: ${health.networkName} (Chain ID: ${health.chainId})`);
      console.log(`  Latest block: ${health.blockNumber}`);
      console.log(`  Gas price: ${health.gasPrice} gwei`);
    }
  }
  
  // Verify signer is admin for all contracts
  console.log("\n🔍 Verifying admin permissions...");
  for (const address of ADAPTOR_ADDRESSES) {
    const info = await getContractInfo(address, signer);
    if (!info) {
      console.error(`❌ Failed to get contract info for ${address}`);
      process.exit(1);
    }
    
    if (info.admin.toLowerCase() !== signer.address.toLowerCase()) {
      console.error(`❌ Signer ${signer.address} is not admin for contract ${address}. Admin is: ${info.admin}`);
      process.exit(1);
    }
    
    console.log(`  ✅ ${address}: ${info.project} ${info.name} (${info.guardianCount} guardians, paused: ${info.isPaused})`);
  }
  
  console.log("\n📊 Summary:");
  console.log(`  - Contracts to update: ${ADAPTOR_ADDRESSES.length}`);
  console.log(`  - Guardians to add per contract: ${GUARDIANS_TO_ADD.length}`);
  console.log(`  - Total transactions: ${ADAPTOR_ADDRESSES.length * GUARDIANS_TO_ADD.length}`);
  console.log(`  - Estimated time: ~${Math.round((ADAPTOR_ADDRESSES.length * GUARDIANS_TO_ADD.length * CONFIG.txDelay) / 1000 / 60)} minutes`);
  console.log(`  - Gas limit per tx: ${CONFIG.gasLimit}`);
  console.log(`  - Max retries per tx: ${CONFIG.maxRetries}\n`);
  
  // Confirm before proceeding
  console.log("⚠️  This will send multiple transactions.");
  console.log("Press Ctrl+C to cancel, or wait 5 seconds to continue...\n");
  
  await sleep(5000);
  
  // Process all contracts
  const results = [];
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let totalGasUsed = BigInt(0);
  const startTime = Date.now();
  
  for (let i = 0; i < ADAPTOR_ADDRESSES.length; i++) {
    const adaptorAddress = ADAPTOR_ADDRESSES[i];
    console.log(`\n📦 Processing contract ${i + 1}/${ADAPTOR_ADDRESSES.length}: ${adaptorAddress}`);
    
    const contractResults = [];
    
    for (const guardianAddress of GUARDIANS_TO_ADD) {
      const result = await addGuardianToContract(adaptorAddress, guardianAddress, signer);
      contractResults.push(result);
      
      if (result.success) {
        if (result.skipped) {
          skipCount++;
        } else {
          successCount++;
          if (result.gasUsed) {
            totalGasUsed += BigInt(result.gasUsed);
          }
        }
      } else {
        failCount++;
      }
      
      // Delay between transactions to avoid nonce conflicts
      if (i < ADAPTOR_ADDRESSES.length - 1 || guardianAddress !== GUARDIANS_TO_ADD[GUARDIANS_TO_ADD.length - 1]) {
        console.log(`  ⏳ Waiting ${CONFIG.txDelay / 1000} seconds before next transaction...`);
        await sleep(CONFIG.txDelay);
      }
    }
    
    results.push({
      contractAddress: adaptorAddress,
      results: contractResults
    });
    
    // Network health check every 5 contracts
    if (CONFIG.checkNetworkHealth && (i + 1) % 5 === 0) {
      console.log(`\n🔍 Network health check after ${i + 1} contracts...`);
      const health = await getNetworkHealth(provider);
      if (health) {
        console.log(`  Latest block: ${health.blockNumber}, Gas price: ${health.gasPrice} gwei`);
      }
      await sleep(CONFIG.healthCheckDelay);
    }
  }
  
  const endTime = Date.now();
  const totalTime = Math.round((endTime - startTime) / 1000);
  
  // Final summary
  console.log("\n🎉 Batch guardian addition completed!");
  console.log("\n📊 Results Summary:");
  console.log(`  ✅ Successful additions: ${successCount}`);
  console.log(`  ⚠️  Skipped (already exists): ${skipCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  ⛽ Total gas used: ${totalGasUsed.toString()}`);
  console.log(`  ⏱️  Total time: ${Math.round(totalTime / 60)} minutes ${totalTime % 60} seconds`);
  console.log(`  📈 Average time per tx: ${Math.round(totalTime / (successCount + skipCount))} seconds`);
  
  // Show detailed results
  console.log("\n📋 Detailed Results:");
  results.forEach((contractResult, index) => {
    console.log(`\nContract ${index + 1}: ${contractResult.contractAddress}`);
    contractResult.results.forEach((result, guardianIndex) => {
      const guardian = GUARDIANS_TO_ADD[guardianIndex];
      if (result.success) {
        if (result.skipped) {
          console.log(`  Guardian ${guardian}: ⚠️  Already exists`);
        } else {
          console.log(`  Guardian ${guardian}: ✅ Added (${result.gasUsed} gas, ${result.gasPrice} gwei)`);
        }
      } else {
        console.log(`  Guardian ${guardian}: ❌ Failed after ${result.attempts} attempts - ${result.error}`);
      }
    });
  });
  
  if (failCount > 0) {
    console.log("\n⚠️  Some transactions failed. You can re-run this script to retry failed transactions.");
    process.exit(1);
  } else {
    console.log("\n✨ All guardians added successfully!");
  }
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
