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
        // Initialize Jito client without authKeypair as it is no longer required for standard bundles on mainnet
        try {
            this.client = searcherClient(BLOCK_ENGINE_URL, undefined, {
                grpcOptions: { 'grpc.keepalive_time_ms': 10000 }
            });
            console.log(chalk.blue(`[MEV BUNDLER]: Jito Client Initialized. Protected Mode Active.`));
        } catch (e) {
            console.log(chalk.yellow(`[MEV BUNDLER]: Failed to init Jito client: ${e.message}`));
            this.client = null;
        }
    }

    async sendBundle(transaction, tipAmount = 1000000) { // Default 0.001 SOL tip for immediate block inclusion
        // Fallback or if client failed to init
        if (!this.client) {
            // console.log(chalk.gray(`[MEV BUNDLER]: Jito inactive. Sending raw transaction...`)); // Reduced log noise
            return null; // Return null so caller uses standard sendAndConfirm
        }

        try {
            console.log(chalk.magenta(`[MEV BUNDLER]: 🛡️ Injecting Priority Fee (${tipAmount} lamports) & Wrapping Bundle...`));

            // Jito requires a tip instruction to their fee account
            const { SystemProgram, TransactionInstruction } = require('@solana/web3.js');
            const JITO_TIP_ACCOUNTS = [
                "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
                "HFqU5x63VTqvQss8hp11i4bD44PvwucfZ2bU7gRe",
                "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
                "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
                "DfXygSm4jCqDg6qhJaNw5BLqE3vwh7VBi5iqPjqj1tom",
                "ADuUkR4vk3Gj2cqGOn8aBo5Q1GRgk2nDZ2mHBk9BCbE5",
                "DttWaMuVvTiDuNwGTn8f8xfE1CTXEbZRrFPnKrUUXdet",
                "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"
            ];
            const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);

            const tipInstruction = SystemProgram.transfer({
                fromPubkey: this.wallet.publicKey,
                toPubkey: tipAccount,
                lamports: tipAmount
            });

            // Append tip instruction
            transaction.add(tipInstruction);

            const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = latestBlockhash.blockhash;
            transaction.sign(this.wallet);

            // Create bundle of 1 transaction with block engine
            const bundle = new Bundle([transaction], 5);
            const bundleId = await this.client.sendBundle(bundle);
            console.log(chalk.green.bold(`[MEV BUNDLER]: 🚀 BUNDLE SECURED IN FAST LANE! ID: ${bundleId}`));
            return bundleId;
        } catch (e) {
            console.error(chalk.red(`[MEV BUNDLER]: Bundle Execution Failed: ${e.message}`));
            return null;
        }
    }
}

module.exports = MevBundler;
