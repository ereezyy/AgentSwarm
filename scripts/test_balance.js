// scripts/test_balance.js
const { SyndicateCore } = require('../don/SyndicateCore');

async function main() {
    console.log("--- Syndicate Balance Check ---");
    const core = new SyndicateCore();
    const balance = await core.checkWalletBalance();

    if (balance === null) {
        console.log("Failed to retrieve balance. Check .env for SOLANA_PUBLIC_KEY.");
    } else {
        console.log(`Success: Found ${balance} SOL`);
    }
}

main().catch(console.error);
