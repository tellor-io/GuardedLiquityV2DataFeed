#!/usr/bin/env node

// Simple script to deploy multiple GuardedLiquityV2OracleAdaptor contracts
// Usage: node scripts/deploy-all-adaptors.js <network>
// Example: node scripts/deploy-all-adaptors.js sepolia

const { execSync } = require('child_process');

// ================================
// CONFIGURATION - EDIT THIS SECTION
// ================================

unique_id = "sep23-test1"

const SEPOLIA_CONFIG = {
  dataBankAddress: "0x6f250229af8D83c51500f3565b10E93d8907B644",
  adminAddress: "0xC69f43741D379cE93bdaAC9b5135EA3e697df1F8",
  decimals: 18,
  contracts: [
    {
      projectName: "ProjectA",
      feedName: "ETH/USD",
      queryId: "0x0000000000000000000000000000000000000000000000000000000000000001",
      deploymentId: "sepolia-projecta-ethusd-" + unique_id
    },
    {
      projectName: "ProjectA", 
      feedName: "BTC/USD",
      queryId: "0x0000000000000000000000000000000000000000000000000000000000000002",
      deploymentId: "sepolia-projecta-btcusd-" + unique_id
    },
    {
      projectName: "ProjectB",
      feedName: "ETH/USD", 
      queryId: "0x0000000000000000000000000000000000000000000000000000000000000003",
      deploymentId: "sepolia-projectb-ethusd-" + unique_id
    }
    // add more contracts here as needed
  ]
};

const SAGAEVM_CONFIG = {
  dataBankAddress: "0x6f250229af8D83c51500f3565b10E93d8907B644", // saga data bank address
  adminAddress: "0xC69f43741D379cE93bdaAC9b5135EA3e697df1F8",   // saga admin address
  decimals: 18,
  contracts: [
    {
      projectName: "ProjectA",
      feedName: "ETH/USD",
      queryId: "0x0000000000000000000000000000000000000000000000000000000000000001",
      deploymentId: "sagaevm-projecta-ethusd-" + unique_id
    },
    {
      projectName: "ProjectB",
      feedName: "BTC/USD",
      queryId: "0x0000000000000000000000000000000000000000000000000000000000000002", 
      deploymentId: "sagaevm-projectb-btcusd-" + unique_id
    },
    {
      projectName: "ProjectC",
      feedName: "ETH/USD",
      queryId: "0x0000000000000000000000000000000000000000000000000000000000000003",
      deploymentId: "sagaevm-projectc-ethusd-" + unique_id
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
  
  const parameters = JSON.stringify({
    "GuardedLiquityV2OracleAdaptorModule": {
      dataBankAddress: config.dataBankAddress,
      queryId: contract.queryId,
      decimals: config.decimals,
      projectName: contract.projectName,
      feedName: contract.feedName,
      adminAddress: config.adminAddress
    }
  });

  const command = `npx hardhat ignition deploy ignition/modules/GuardedLiquityV2OracleAdaptor.js --network ${network} --deployment-id ${contract.deploymentId} --parameters '${parameters}'`;
  
  console.log(`Running: ${command}`);
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ Successfully deployed ${contract.projectName} ${contract.feedName}`);
    return contract.deploymentId;
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