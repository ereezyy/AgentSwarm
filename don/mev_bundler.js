const axios = require('axios');
const { PublicKey, VersionedTransaction, Transaction, SystemProgram } = require('@solana/web3.js');
const chalk = require('chalk');
require('dotenv').config();

// Jito Block Engine URLs (mainnet REST endpoints)
const JITO_BASE_URL = 'https://mainnet.block-engine.jito.wtf/api/v1';

class MevBundler {
    constructor(walletKeypair, connection) {
        this.wallet = walletKeypair;
        this.connection = connection;
        console.log(chalk.blue(`[MEV BUNDLER]: Jito REST Client Initialized. Protected Mode Active.`));
    }

    /**
     * Send a bundle of transactions via Jito's JSON-RPC API
     * @param {VersionedTransaction|Transaction} transaction - Main transaction to send
     * @param {number} tipAmount - Lamports to tip Jito (min 1000)
     */
    async sendBundle(transaction, tipAmount = 50000) {
        if (!this.wallet || !this.wallet.publicKey) {
            console.log(chalk.yellow(`[MEV BUNDLER]: ⚠️ Wallet not available. Skipping bundle.`));
            return null;
        }

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

            const { blockhash } = await this.connection.getLatestBlockhash('confirmed');

            // ── Create Tip Transaction ──
            const tipTx = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: this.wallet.publicKey,
                    toPubkey: tipAccount,
                    lamports: Math.max(tipAmount, 1000)
                })
            );
            tipTx.recentBlockhash = blockhash;
            tipTx.feePayer = this.wallet.publicKey;
            tipTx.sign(this.wallet);

            const vTipTx = new VersionedTransaction(tipTx.compileMessage());
            vTipTx.sign([this.wallet]);

            // Ensure the main transaction is also signed and serialized
            // Base64 is the recommended encoding for Jito's REST API
            const serializedMainTx = Buffer.from(transaction.serialize()).toString('base64');
            const serializedTipTx = Buffer.from(vTipTx.serialize()).toString('base64');

            // ── Submit via JSON-RPC ──
            const response = await axios.post(`${JITO_BASE_URL}/bundles`, {
                jsonrpc: "2.0",
                id: 1,
                method: "sendBundle",
                params: [
                    [serializedMainTx, serializedTipTx],
                    { encoding: "base64" }
                ]
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            });

            if (response.data && response.data.result) {
                const bundleId = response.data.result;
                console.log(chalk.green.bold(`[MEV BUNDLER]: 🚀 BUNDLE SENT! ID: ${bundleId}`));
                return bundleId;
            } else {
                const error = response.data.error ? response.data.error.message : "Malformed Response";
                console.error(chalk.red(`[MEV BUNDLER]: ❌ Bundle failed: ${error}`));
                return null;
            }
        } catch (e) {
            console.error(chalk.red(`[MEV BUNDLER]: ❌ REST Request failed: ${e.message}`));
            return null;
        }
    }

    /**
     * Send a single transaction via Jito's Low Latency Send API
     * Provides revert protection by sending as a single-transaction bundle.
     */
    async sendTransaction(transaction, bundleOnly = true) {
        try {
            const serializedTx = Buffer.from(transaction.serialize()).toString('base64');
            const response = await axios.post(`${JITO_BASE_URL}/transactions?bundleOnly=${bundleOnly}`, {
                jsonrpc: "2.0",
                id: 1,
                method: "sendTransaction",
                params: [
                    serializedTx,
                    { encoding: "base64" }
                ]
            });

            if (response.data && response.data.result) {
                console.log(chalk.green(`[MEV BUNDLER]: 🚀 Low Latency Send Complete: ${response.data.result}`));
                return response.data.result;
            }
            return null;
        } catch (e) {
            console.error(chalk.red(`[MEV BUNDLER]: ❌ Send failed: ${e.message}`));
            return null;
        }
    }

    /**
     * Poll Jito Bundle Status to determine if the tip and trade fully landed.
     * @param {string} bundleId 
     * @param {number} maxAttempts 
     * @param {number} intervalMs 
     * @returns {Promise<{success: boolean, landedSlot: number|null, reason: string|null, err: any}>}
     */
    async pollBundleStatus(bundleId, maxAttempts = 30, intervalMs = 2000) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await axios.post(`${JITO_BASE_URL}/bundles`, {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getBundleStatuses",
                    params: [[bundleId]]
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                });

                if (response.data && response.data.result && response.data.result.value && response.data.result.value.length > 0) {
                    const status = response.data.result.value[0];
                    if (status) {
                        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized' || status.slot) {
                            return { success: true, landedSlot: status.slot, reason: null, err: null };
                        } else if (status.err || status.status === 'Failed') {
                            return { success: false, landedSlot: null, reason: 'failed', err: status.err };
                        }
                    }
                }
            } catch (e) {
                // Ignore transient polling errors
            }
            await new Promise(r => setTimeout(r, intervalMs));
        }
        return { success: false, landedSlot: null, reason: 'timeout', err: null };
    }
}

module.exports = MevBundler;
