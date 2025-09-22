const { ethers } = require("hardhat");

// npx hardhat run scripts/generateAddGuardianCallData.js

async function main() {
    // Guardian addresses to add (modify this array with your actual guardian addresses)
    const guardianAddresses = [
        "0x9eB18BDEc30347442d5Fa7A16B440b02e80A7450", // spuddy
        "0xbC2cA5012c69b252d4fbef08E8b80fBa4f63cD99", // caleb
        // Add more addresses as needed
    ];

    console.log("GuardedPausable addGuardian Call Data Generator");
    console.log("=" .repeat(60));

    // Get the GuardedPausable contract artifact
    const GuardedPausable = await ethers.getContractFactory("GuardedPausable");
    const iface = GuardedPausable.interface;

    console.log("\n📋 Generated Call Data for addGuardian:");
    console.log("-".repeat(60));

    guardianAddresses.forEach((address, index) => {
        // Validate the address
        if (!ethers.isAddress(address)) {
            console.log(`❌ Invalid address at index ${index}: ${address}`);
            return;
        }

        // Generate the call data
        const callData = iface.encodeFunctionData("addGuardian", [address]);
        
        console.log(`\n${index + 1}. Guardian: ${address}`);
        console.log(`   Call Data: ${callData}`);
    });

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        process.exit(1);
    });
