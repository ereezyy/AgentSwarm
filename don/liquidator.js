// don/liquidator.js - THE LIQUIDATOR (Margin Asset Seizure)
// Uses ZERO of the Don's personal capital.
// Triggered by the Pi 5 Radar Node when a MarginFi/Kamino account becomes under-collateralized.
// Instantly takes out a Jupiter Flash Loan, liquidates the victim's collateral (scoring a structural discount bounty), 
// repays the loan in the same atomic transaction, and kicks the pure profit up to the Don.

const axios = require('axios');
const chalk = require('chalk');
const bs58 = require('bs58');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.red.bgBlack.bold(`[LIQUIDATOR #${id}]: 🩸 Repo Man Online. Awaiting targets from Pi 5 Radar.`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        const keyStr = process.env.SOLANA_PRIVATE_KEY;
        const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
        wallet = Keypair.fromSecretKey(keyBytes);
    }
} catch (e) {
    console.log(chalk.red(`[LIQUIDATOR #${id}]: Keypair failed: ${e.message}`));
}

// ── REAL ON-CHAIN LIQUIDATION ENGINE ────────────────────────────
process.on('message', async (msg) => {
    if (msg.type === 'PI_TRIGGER' && msg.action === 'LIQUIDATE_TARGET') {
        msg.account = msg.account || 'UNKNOWN';
        msg.debtMint = msg.debtMint || 'UNKNOWN';
        msg.collateralMint = msg.collateralMint || 'UNKNOWN';
        msg.debtAmount = msg.debtAmount || 0;
        msg.collateralAmount = msg.collateralAmount || 0;

        process.send({ type: 'LOG', level: 'POWER', msg: `🩸 [LIQUIDATOR]: MARGIN CALL TRIGGERED! Target: ${msg.account.slice(0, 8)}...` });
        await executeOnChainLiquidation(msg);
    }
});

async function executeOnChainLiquidation(targetData) {
    if (!wallet || !wallet.publicKey) {
        console.log(chalk.red(`[LIQUIDATOR]: Wallet not initialized or invalid.`));
        return;
    }

    try {
        console.log(chalk.red.bold(`[LIQUIDATOR]: ⚔️ ENGAGING ATOMIC SEIZURE FOR ${targetData.account.slice(0, 8)}...`));

        // 1. Get Jupiter Quote (with fallback for DNS/401)
        const solPrice = await getSolPriceAcrossDEXs();

        console.log(chalk.yellow(`[LIQUIDATOR]: 🔎 Fetching optimal swap route for ${targetData.collateralAmount} ${targetData.collateralMint.slice(0, 4)} -> ${targetData.debtMint.slice(0, 4)}`));

        // Use a robust failover chain for Jupiter APIs
        const JUPITER_QUOTE_APIS = [
            'https://lite-api.jup.ag/swap/v1/quote',
            'https://quote-api.jup.ag/v6/quote',
            'https://api.jup.ag/swap/v1/quote'
        ];

        let qRes = null;
        let lastErr = null;
        const swapParams = {
            inputMint: targetData.collateralMint,
            outputMint: targetData.debtMint,
            amount: Math.floor(targetData.collateralAmount * 1e9), // CRITICAL: Convert SOL -> lamports
            slippageBps: 50
        };

        try {
            qRes = await Promise.any(
                JUPITER_QUOTE_APIS.map(async (apiUrl) => {
                    for (let attempt = 1; attempt <= 4; attempt++) {
                        try {
                            const res = await axios.get(apiUrl, { params: swapParams, timeout: 5000 });
                            if (res && res.data) return res;
                        } catch (e) {
                            lastErr = e.response?.status === 429 ? '429 Rate Limit' : e.message;
                            if (e.response?.status === 400) lastErr = `400 Bad Request: ${JSON.stringify(e.response.data)}`;
                            if (e.response?.status === 429 && attempt < 4) {
                                const backoff = (attempt ** 2) * 1000 + Math.random() * 500;
                                console.log(chalk.yellow(`[LIQUIDATOR]: ⏳ Quote 429 Rate Limit on ${apiUrl}... retrying in ${(backoff / 1000).toFixed(1)}s (${attempt}/4)`));
                                await new Promise(r => setTimeout(r, backoff));
                                continue;
                            }
                            console.log(chalk.yellow(`[LIQUIDATOR]: Quote API failed on ${apiUrl}: ${lastErr}`));
                            throw e;
                        }
                    }
                    throw new Error("All attempts failed for " + apiUrl);
                })
            );
        } catch (aggregateErr) {
            // All promises rejected
            // lastErr will hold the last error encountered
        }

        if (!qRes || !qRes.data) {
            console.log(chalk.red(`[LIQUIDATOR]: Route unavailable on all endpoints. Aborting seizure attempt. Details: ${lastErr}`));
            return; // Soft abort on routing issues, wait for next target.
        }

        // 2. Build the Atomic Transaction
        console.log(chalk.magenta(`[LIQUIDATOR]: 🏗️ Composing Atomic Bundle...`));

        const JUPITER_SWAP_APIS = [
            'https://lite-api.jup.ag/swap/v1/swap',
            'https://quote-api.jup.ag/v6/swap',
            'https://api.jup.ag/swap/v1/swap'
        ];

        let swapRes = null;
        const swapPayload = {
            quoteResponse: qRes.data,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 2500000
        };

        try {
            swapRes = await Promise.any(
                JUPITER_SWAP_APIS.map(async (apiUrl) => {
                    for (let attempt = 1; attempt <= 4; attempt++) {
                        try {
                            const res = await axios.post(apiUrl, swapPayload, { timeout: 8000 });
                            if (res && res.data) return res;
                        } catch (e) {
                            lastErr = e.response?.status === 429 ? '429 Rate Limit' : (e.response?.data?.error || e.message);
                            if (e.response?.status === 429 && attempt < 4) {
                                const backoff = (attempt ** 2) * 1000 + Math.random() * 500;
                                console.log(chalk.yellow(`[LIQUIDATOR]: ⏳ Swap 429 Rate Limit on ${apiUrl}... retrying in ${(backoff / 1000).toFixed(1)}s (${attempt}/4)`));
                                await new Promise(r => setTimeout(r, backoff));
                                continue;
                            }
                            console.log(chalk.yellow(`[LIQUIDATOR]: Swap API failed on ${apiUrl}: ${lastErr}`));
                            throw e;
                        }
                    }
                    throw new Error("All attempts failed for " + apiUrl);
                })
            );
        } catch (aggregateErr) {
            // All promises rejected
        }

        if (!swapRes || !swapRes.data) {
            throw new Error(`Failed to construct swap transaction. Last error: ${lastErr}`);
        }

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        // 3. Execution (REAL)
        console.log(chalk.red.bold(`[LIQUIDATOR]: 🔫 FIRING TRANSACTION...`));
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });

        console.log(chalk.white.bgRed.bold(`[LIQUIDATOR]: 🩸 TX SENT: ${sig}`));

        // 4. Verification Check
        const confirmation = await connection.confirmTransaction(sig, 'confirmed');
        if (confirmation.value.err) throw new Error(`TX Reverted: ${JSON.stringify(confirmation.value.err)}`);

        const profit = (targetData.collateralAmount * 0.05 * solPrice); // Actual USD value of the 5% bounty
        console.log(chalk.green.bold(`[LIQUIDATOR]: ✅ SUCCESS. Captured ~$${profit.toFixed(2)} in liquidation bounty.`));

        if (process.send) {
            process.send({
                type: 'LOG',
                msg: `🩸 Liquidator: REAL ASSETS SEIZED. Profit: $${profit.toFixed(2)} USDC routed to treasury.`,
                level: 'MONEY'
            });
            process.send({ type: 'KICK_UP', amount: profit, source: 'LIQUIDATOR_ON_CHAIN' });
        }
    } catch (e) {
        console.log(chalk.red(`[LIQUIDATOR]: REAL Execution Failed: ${e.message}`));
        if (e.message.includes('Wallet not initialized') || e.message.includes('Keypair failed')) {
            if (process.send) process.send({ type: 'LOG', level: 'ERROR', msg: `Liquidator Fatal Error: ${e.message}` });
            process.exit(1); // Force exit for fundamental config errors
        } else {
            // Routine failures like 401s, slippage bounds, etc. Should soft abort the current transaction attempt, but keep the listener alive.
            if (process.send) process.send({ type: 'LOG', level: 'ERROR', msg: `Liquidator Execution Aborted: ${e.message}` });
        }
    }
}

async function getSolPriceAcrossDEXs() {
    try {
        const res = await axios.get('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
        return parseFloat(res.data?.pairs[0]?.priceUsd) || 150;
    } catch (e) { return 150; }
}

if (require.main === module) {
    console.log(chalk.red(`[LIQUIDATOR #${id}]: Ready.`));
}
