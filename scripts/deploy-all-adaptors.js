#!/usr/bin/env node

// Script for deploying multiple GuardedLiquityV2OracleAdaptor contracts
// Usage: node scripts/deploy-all-adaptors.js <network>
// Example: node scripts/deploy-all-adaptors.js sepolia

const { execSync } = require('child_process');
const { ethers } = require('hardhat');

// ================================
// UTILITY FUNCTIONS
// ================================

const unique_id = "nov6";

function generateQueryId(feedName) {
  // Parse feedName like "ETH/USD" into asset and currency
  const [asset, currency] = feedName.toLowerCase().split('/');
  if (!asset || !currency) {
    throw new Error(`Invalid feedName format: ${feedName}. Expected format: "ASSET/CURRENCY"`);
  }
  
  // Create the query data following Tellor's SpotPrice format
  const abiCoder = new ethers.AbiCoder();
  const queryDataArgs = abiCoder.encode(["string", "string"], [asset, currency]);
  const queryData = abiCoder.encode(["string", "bytes"], ["SpotPrice", queryDataArgs]);
  const queryId = ethers.keccak256(queryData);
  
  return queryId;
}

function generateDeploymentId(network, projectName, feedName) {
  // Convert to lowercase and replace "/" with ""
  const cleanProjectName = projectName.toLowerCase();
  const cleanFeedName = feedName.toLowerCase().replace('/', '');
  
  return `${network}-${cleanProjectName}-${cleanFeedName}-${unique_id}`;
}

// ================================
// CONFIGURATION - EDIT THIS SECTION
// ================================

const SEPOLIA_CONFIG = {
  dataBankAddress: "0xF03B401966eF4c32e7Cef769c4BB2833BaC0eb9a",
  adminAddress: "0xfE2952AD10262C6b466070CA34dBB7fA54b882e3",
  decimals: 18,
  contracts: [
    {
      projectName: "projectA",
      feedName: "ATOM/USD"
    },
    {
      projectName: "projectB", 
      feedName: "BTC/USD"
    },
    {
      projectName: "projectA",
      feedName: "ETH/USD"
    },
    {
      projectName: "projectB",
      feedName: "fBTC/USD"
    },
    {
      projectName: "projectA",
      feedName: "KING/USD"
    },
    {
      projectName: "projectB",
      feedName: "rETH/USD"
    },
    {
      projectName: "projectA",
      feedName: "SAGA/USD"
    },
    {
      projectName: "projectB",
      feedName: "stATOM/USD"
    },
    {
      projectName: "projectA",
      feedName: "sUSDe/USD"
    },
    {
      projectName: "projectB",
      feedName: "sUSDS/USD"
    },
    {
      projectName: "projectA",
      feedName: "tBTC/USD"
    },
    {
      projectName: "projectB",
      feedName: "USDC/USD"
    },
    {
      projectName: "projectA",
      feedName: "USDN/USD"
    },
    {
      projectName: "projectB",
      feedName: "USDT/USD"
    },
    {
      projectName: "projectA",
      feedName: "wstETH/USD"
    },
    {
      projectName: "projectB",
      feedName: "yUSD/USD"
    },
    {
      projectName: "projectA",
      feedName: "vyUSD/USD"
    },
    {
      projectName: "projectB",
      feedName: "sUSN/USD"
    },
    {
      projectName: "projectA",
      feedName: "sfrxUSD/USD"
    }
    // add more contracts here as needed
  ]
};

const SAGAEVM_CONFIG = {
  dataBankAddress: "0x6f250229af8D83c51500f3565b10E93d8907B644", // saga data bank address
  adminAddress: "0x0000000000000000000000000000000000000000",   // saga admin address
  decimals: 18,
  contracts: [
    {
      projectName: "projectA",
      feedName: "ATOM/USD"
    },
    {
      projectName: "projectB", 
      feedName: "BTC/USD"
    },
    {
      projectName: "projectA",
      feedName: "ETH/USD"
    },
    {
      projectName: "projectB",
      feedName: "fBTC/USD"
    },
    {
      projectName: "projectA",
      feedName: "KING/USD"
    },
    {
      projectName: "projectB",
      feedName: "rETH/USD"
    },
    {
      projectName: "projectA",
      feedName: "SAGA/USD"
    },
    {
      projectName: "projectB",
      feedName: "stATOM/USD"
    },
    {
      projectName: "projectA",
      feedName: "sUSDe/USD"
    },
    {
      projectName: "projectB",
      feedName: "sUSDS/USD"
    },
    {
      projectName: "projectA",
      feedName: "tBTC/USD"
    },
    {
      projectName: "projectB",
      feedName: "USDC/USD"
    },
    {
      projectName: "projectA",
      feedName: "USDN/USD"
    },
    {
      projectName: "projectB",
      feedName: "USDT/USD"
    },
    {
      projectName: "projectA",
      feedName: "wstETH/USD"
    },
    {
      projectName: "projectB",
      feedName: "yUSD/USD"
    },
    {
      projectName: "projectA",
      feedName: "vyUSD/USD"
    },
    {
      projectName: "projectB",
      feedName: "sUSN/USD"
    },
    {
      projectName: "projectA",
      feedName: "sfrxUSD/USD"
    }
    // add more contracts here as needed
  ]
};

const DEFAULT_CONFIG = {
  dataBankAddress: "0x0000000000000000000000000000000000000000", // data bank address
  adminAddress: "0x0000000000000000000000000000000000000000",   // admin address
  decimals: 18,
  contracts: [
    {
      projectName: "projectA",
      feedName: "BTC/USD"
    },
    {
      projectName: "projectB",
      feedName: "ETH/USD"
    }
  ]
}

// ================================
// SCRIPT LOGIC - DON'T EDIT BELOW
// ================================

function getConfig(network) {
  switch (network) {
    case 'nothingnet':
      return SEPOLIA_CONFIG;
    case 'sagaevm':
      return SAGAEVM_CONFIG;
    default:
      return DEFAULT_CONFIG;
  }
}

function sleep(seconds) {
  console.log(`Sleeping for ${seconds} seconds...`);
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function deployContract(network, config, contract) {
  console.log(`\n📦 Deploying ${contract.projectName} ${contract.feedName} adaptor...`);
  
  // Generate queryId and deploymentId dynamically
  const queryId = generateQueryId(contract.feedName);
  const deploymentId = generateDeploymentId(network, contract.projectName, contract.feedName);
  
  console.log(`Generated queryId: ${queryId}`);
  console.log(`Generated deploymentId: ${deploymentId}`);
  
  const parameters = JSON.stringify({
    "GuardedLiquityV2OracleAdaptorModule": {
      dataBankAddress: config.dataBankAddress,
      queryId: queryId,
      decimals: config.decimals,
      projectName: contract.projectName,
      feedName: contract.feedName,
      adminAddress: config.adminAddress
    }
  });

  const command = `echo "y" | npx hardhat ignition deploy ignition/modules/GuardedLiquityV2OracleAdaptor.js --network ${network} --deployment-id ${deploymentId} --parameters '${parameters}'`;
  
  console.log(`Running: ${command}`);
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ Successfully deployed ${contract.projectName} ${contract.feedName}`);
    return deploymentId;
  } catch (error) {
    console.error(`❌ Failed to deploy ${contract.projectName} ${contract.feedName}:`, error.message);
    throw error;
  }
}

async function verifyContract(deploymentId) {
  console.log(`\n🔍 Verifying ${deploymentId}...`);
  
  try {
    const command = `npx hardhat ignition verify ${deploymentId} --include-unrelated-contracts`;
    console.log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ Successfully verified ${deploymentId}`);
  } catch (error) {
    console.error(`❌ Failed to verify ${deploymentId}:`, error.message);
    // don't throw - we want to try to verify other contracts even if one fails
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node scripts/deploy-all-adaptors.js <network>

Networks: sepolia, sagaevm

Examples:
  node scripts/deploy-all-adaptors.js sepolia
  node scripts/deploy-all-adaptors.js sagaevm
`);
    process.exit(1);
  }

  const network = args[0];
  
  try {
    const config = getConfig(network);
    const deploymentIds = [];
    
    console.log(`🚀 Starting deployment of ${config.contracts.length} contracts to ${network}...`);
    console.log(`Data Bank Address: ${config.dataBankAddress}`);
    console.log(`Admin Address: ${config.adminAddress}\n`);
    
    // Deploy all contracts sequentially
    for (const contract of config.contracts) {
      const deploymentId = await deployContract(network, config, contract);
      deploymentIds.push(deploymentId);
    }
    
    console.log(`\n🎉 All contracts deployed successfully!`);
    console.log(`Deployed contracts: ${deploymentIds.join(', ')}`);
    
    // Wait before verification
    await sleep(120);
    
    console.log(`\n🔍 Starting contract verification...`);
    
    // Verify all contracts
    for (const deploymentId of deploymentIds) {
      await verifyContract(deploymentId);
    }
    
    console.log(`\n✨ Deployment and verification completed!`);
    console.log(`\nDeployment IDs:`);
    deploymentIds.forEach(id => console.log(`  - ${id}`));
    
  } catch (error) {
    console.error(`\n💥 Deployment failed:`, error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 