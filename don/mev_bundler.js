// don/mev_bundler.js - MAXIMUM EXTRACTABLE VALUE PROTECTION
// Wraps transactions in Jito Bundles for priority inclusion and anti-sandwich protection.

let searcherClient, Bundle;
try {
    searcherClient = require('jito-ts/dist/sdk/block-engine/searcher').searcherClient;
    Bundle = require('jito-ts/dist/sdk/block-engine/types').Bundle;
} catch (e) {
    // Jito SDK not installed or path changed
    searcherClient = null;
    Bundle = null;
}

const { PublicKey } = require('@solana/web3.js');
const chalk = require('chalk');
require('dotenv').config();

// Jito Block Engine URLs (mainnet)
const BLOCK_ENGINE_URL = 'amsterdam.mainnet.block-engine.jito.wtf';

class MevBundler {
    constructor(walletKeypair, connection) {
        this.wallet = walletKeypair;
        this.connection = connection;
        this.client = null;

        // Jito Client Initialization
        // FIX: Removed authKeypair (2nd arg) as Jito mainnet no longer requires it for standard bundles
        try {
            // No authKeypair needed for standard bundles now
            this.client = searcherClient(BLOCK_ENGINE_URL, undefined, {
                grpcOptions: { 'grpc.keepalive_time_ms': 10000 }
            });
            console.log(chalk.blue(`[MEV BUNDLER]: Jito Client Initialized. Protected Mode Active.`));
        } catch (e) {
            console.log(chalk.yellow(`[MEV BUNDLER]: Failed to init Jito client: ${e.message}`));
            this.client = null;
        }
    }

    async sendBundle(transaction, tipAmount = 100000) { // 0.0001 SOL tip
        // Fallback or if client failed to init
        if (!this.client) {
            // console.log(chalk.gray(`[MEV BUNDLER]: Jito inactive. Sending raw transaction...`)); // Reduced log noise
            return null; // Return null so caller uses standard sendAndConfirm
        }

        try {
            const latestBlockhash = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = latestBlockhash.blockhash;
            transaction.sign(this.wallet);

            const bundle = new Bundle([transaction], 5);
            const bundleId = await this.client.sendBundle(bundle);
            console.log(chalk.green(`[MEV BUNDLER]: 🚀 Bundle Sent! ID: ${bundleId}`));
            return bundleId;
        } catch (e) {
            console.error(chalk.red(`[MEV BUNDLER]: Bundle Execution Failed: ${e.message}`));
            return null;
        }
    }
}

module.exports = MevBundler;
