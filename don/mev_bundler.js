// don/mev_bundler.js - MAXIMUM EXTRACTABLE VALUE PROTECTION
// Wraps transactions in Jito Bundles for priority inclusion and anti-sandwich protection.

let searcher = require('jito-ts/dist/sdk/block-engine/searcher');
let bundle_sdk = require('jito-ts/dist/sdk/block-engine/types');

const { PublicKey, VersionedTransaction, Transaction, SystemProgram } = require('@solana/web3.js');
const chalk = require('chalk');
require('dotenv').config();

// Jito Block Engine URLs (mainnet)
const BLOCK_ENGINE_URL = process.env.JITO_BLOCK_ENGINE_URL || 'amsterdam.mainnet.block-engine.jito.wtf';

class MevBundler {
    constructor(walletKeypair, connection) {
        this.wallet = walletKeypair;
        this.connection = connection;
        this.client = null;

        try {
            // Initialize Jito client
            // Standard bundles on public engines often don't require an auth keypair, but it's hit or miss.
            this.client = searcher.searcherClient(BLOCK_ENGINE_URL, undefined);
            console.log(chalk.blue(`[MEV BUNDLER]: Jito Client Initialized. Protected Mode Active.`));
        } catch (e) {
            console.log(chalk.yellow(`[MEV BUNDLER]: Failed to init Jito client: ${e.message}`));
            this.client = null;
        }
    }

    async sendBundle(transaction, tipAmount = 1000000) {
        if (!this.client) return null;

        try {
            console.log(chalk.magenta(`[MEV BUNDLER]: 🛡️ Creating Jito Bundle (Tip: ${tipAmount} lamports)...`));

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

            const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');

            // ── Create a separate Tip Transaction ──
            // Modification of VersionedTransaction is complex; bundling a separate tip is cleaner.
            const tipTx = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: this.wallet.publicKey,
                    toPubkey: tipAccount,
                    lamports: tipAmount
                })
            );
            tipTx.recentBlockhash = latestBlockhash.blockhash;
            tipTx.feePayer = this.wallet.publicKey;
            tipTx.sign(this.wallet);

            // Jito SDK expects VersionedTransaction objects in the Bundle constructor usually, 
            // but can handle legacy Transaction if it's serialized or wrapped.
            // Converting tip to Versioned for consistency.
            const vTipTx = new VersionedTransaction(tipTx.compileMessage());
            vTipTx.sign([this.wallet]);

            const bundle = new bundle_sdk.Bundle([transaction, vTipTx], 5);

            const bundleId = await this.client.sendBundle(bundle);
            console.log(chalk.green.bold(`[MEV BUNDLER]: 🚀 BUNDLE SENT! ID: ${bundleId}`));
            return bundleId;
        } catch (e) {
            console.error(chalk.red(`[MEV BUNDLER]: Bundle Execution Failed: ${e.message}`));
            return null;
        }
    }
}

module.exports = MevBundler;
