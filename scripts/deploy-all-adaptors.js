#!/usr/bin/env node

// Simple script to deploy multiple GuardedLiquityV2OracleAdaptor contracts
// Usage: node scripts/deploy-all-adaptors.js <network>
// Example: node scripts/deploy-all-adaptors.js sepolia

const { execSync } = require('child_process');

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
      feedName: "ETH/USD",
      queryId: "0x0000000000000000000000000000000000000000000000000000000000000001",
      deploymentId: "sepolia-projecta-ethusd"
    },
    {
      projectName: "ProjectA", 
      feedName: "BTC/USD",
      queryId: "0x0000000000000000000000000000000000000000000000000000000000000002",
      deploymentId: "sepolia-projecta-btcusd"
    },
    {
      projectName: "ProjectB",
      feedName: "ETH/USD", 
      queryId: "0x0000000000000000000000000000000000000000000000000000000000000003",
      deploymentId: "sepolia-projectb-ethusd"
    }
    // add more contracts here as needed
  ]
};

const SAGAEVM_CONFIG = {
  dataBankAddress: "0x6f250229af8D83c51500f3565b10E93d8907B644", // update with actual saga address
  adminAddress: "0xC69f43741D379cE93bdaAC9b5135EA3e697df1F8",   // update with actual saga admin
  decimals: 18,
  contracts: [
    {
      projectName: "COLT",
      feedName: "USDN/USD",
      queryId: "0xe010d752f28dcd2804004d0b57ab1bdc4eca092895d49160204120af11d15f3e",
      deploymentId: "sagaevm-projecta-usdnusd"
    },
    {
      projectName: "COLT",
      feedName: "SUSDS/USD",
      queryId: "0x59ae85cec665c779f18255dd4f3d97821e6a122691ee070b9a26888bc2a0e45a", 
      deploymentId: "sagaevm-projectb-susdsusd"
    },
    {
      projectName: "COLT",
      feedName: "yUSD/USD",
      queryId: "0x35155b44678db9e9e021c2cf49dd20c31b49e03415325c2beffb5221cf63882d",
      deploymentId: "sagaevm-projectc-yusdusd"
    },
    {
        projectName: "COLT",
        feedName: "sUSDe/USD",
        queryId: "0x03731257e35c49e44b267640126358e5decebdd8f18b5e8f229542ec86e318cf",
        deploymentId: "sagaevm-colt-susdeusd"
      },
      {
        projectName: "Mustang",
        feedName: "tBTC/USD",
        queryId: "0x76b504e33305a63a3b80686c0b7bb99e7697466927ba78e224728e80bfaaa0be", 
        deploymentId: "sagaevm-mustang-tbtcusd"
      },
      {
        projectName: "Mustang",
        feedName: "rETH/USD",
        queryId: "0x0bc2d41117ae8779da7623ee76a109c88b84b9bf4d9b404524df04f7d0ca4ca7",
        deploymentId: "sagaevm-mustang-rethusd"
      },
      {
        projectName: "Mustang",
        feedName: "wstETH/USD",
        queryId: "0x1962cde2f19178fe2bb2229e78a6d386e6406979edc7b9a1966d89d83b3ebf2e",
        deploymentId: "sagaevm-mustang-wstethusd"
      },
      {
        projectName: "Mustang",
        feedName: "KING/USD",
        queryId: "0xd62f132d9d04dde6e223d4366c48b47cd9f90228acdc6fa755dab93266db5176",
        deploymentId: "sagaevm-mustang-kingusd"
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
    //   const deploymentId = await deployContract(network, config, contract);
      deploymentIds.push(contract.deploymentId);
    }
    
    console.log(`\n🎉 All contracts deployed successfully!`);
    console.log(`Deployed contracts: ${deploymentIds.join(', ')}`);
    
    // Wait before verification
    // await sleep(120);
    
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