const { ethers } = require("hardhat");

// npx hardhat run scripts/generateRemoveGuardianCallData.js

async function main() {
    // Guardian addresses to remove (modify this array with your actual guardian addresses)
    const guardianAddresses = [
        "0x1234567890123456789012345678901234567890", // Replace with actual guardian address to remove
        "0x0987654321098765432109876543210987654321", // Replace with actual guardian address to remove
        // Add more addresses as needed
    ];

    console.log("GuardedPausable removeGuardian Call Data Generator");
    console.log("=" .repeat(60));

    // Get the GuardedPausable contract artifact
    const GuardedPausable = await ethers.getContractFactory("GuardedPausable");
    const iface = GuardedPausable.interface;

    console.log("\n📋 Generated Call Data for removeGuardian:");
    console.log("-".repeat(60));

    guardianAddresses.forEach((address, index) => {
        // Validate the address
        if (!ethers.utils.isAddress(address)) {
            console.log(`❌ Invalid address at index ${index}: ${address}`);
            return;
        }

        // Generate the call data
        const callData = iface.encodeFunctionData("removeGuardian", [address]);
        
        console.log(`\n${index + 1}. Guardian to Remove: ${address}`);
        console.log(`   Call Data: ${callData}`);
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
