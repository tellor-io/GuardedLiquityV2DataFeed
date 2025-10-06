#!/usr/bin/env node

// Simple script to deploy multiple GuardedLiquityV2OracleAdaptor contracts
// Usage: node scripts/deploy-all-adaptors.js <network>
// Example: node scripts/deploy-all-adaptors.js sepolia

const { execSync } = require('child_process');
const { ethers } = require('hardhat');

// ================================
// UTILITY FUNCTIONS
// ================================

const unique_id = "sep23-test2";

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
  dataBankAddress: "0x6f250229af8D83c51500f3565b10E93d8907B644",
  adminAddress: "0xC69f43741D379cE93bdaAC9b5135EA3e697df1F8",
  decimals: 18,
  contracts: [
    {
      projectName: "ProjectA",
      feedName: "ETH/USD"
    },
    {
      projectName: "ProjectA", 
      feedName: "BTC/USD"
    },
    {
      projectName: "ProjectB",
      feedName: "ETH/USD"
    }
    // add more contracts here as needed
  ]
};

const SAGAEVM_CONFIG = {
  dataBankAddress: "0x6f250229af8D83c51500f3565b10E93d8907B644", // saga data bank address
  adminAddress: "0x028dC5dbD026D2A5eE2AEeCa497F585C69053F09",   // saga admin address
  decimals: 18,
  contracts: [
    {
      projectName: "AlphaGrowth",
      feedName: "ATOM/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "BTC/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "ETH/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "fBTC/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "KING/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "rETH/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "SAGA/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "stATOM/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "sUSDe/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "sUSDS/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "tBTC/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "USDC/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "USDN/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "USDT/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "wstETH/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "yUSD/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "vyUSD/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "sUSN/USD"
    },
    {
      projectName: "AlphaGrowth",
      feedName: "sfrxUSD/USD"
    }
    // add more contracts here as needed
  ]
};

// ================================
// SCRIPT LOGIC - DON'T EDIT BELOW
// ================================

function getConfig(network) {
  switch (network) {
    case 'sepolia':
      return SEPOLIA_CONFIG;
    case 'sagaevm':
      return SAGAEVM_CONFIG;
    default:
      throw new Error(`Unsupported network: ${network}. Use 'sepolia' or 'sagaevm'`);
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

  const command = `npx hardhat ignition deploy ignition/modules/GuardedLiquityV2OracleAdaptor.js --network ${network} --deployment-id ${deploymentId} --parameters '${parameters}'`;
  
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