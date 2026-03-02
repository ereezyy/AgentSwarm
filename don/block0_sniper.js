// don/block0_sniper.js - THE BLOCK-0 LP SNIPER
// This agent sits completely idle, using zero CPU, waiting for a trigger from the Pi 5 Radar Node.
// When triggered with a signature, it attempts an instantaneous Jupiter priority buy.

const axios = require('axios');
const chalk = require('chalk');
const bs58 = require('bs58');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.red.bold(`[BLOCK-0 SNIPER #${id}]: 🔫 Locked & Loaded. Awaiting Pi 5 Radar Trigger.`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

const FALLBACK_RPC_URL = process.env.SOLANA_FALLBACK_RPC_URL || 'https://api.mainnet-beta.solana.com';
const fallbackConnection = new Connection(FALLBACK_RPC_URL, 'confirmed');

let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
    }
} catch (e) {
    console.log(chalk.red(`[BLOCK-0 SNIPER #${id}]: Keypair failed.`));
}

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const SNIPE_AMOUNT_SOL = 0.1;

// ── IPC Listener from Main Hub ──────────────────────────────────────
process.on('message', async (msg) => {
    if (msg.type === 'PI_TRIGGER' && msg.action === 'BLOCK0_SNIPE') {
        console.log(chalk.red.bold(`\n⚡🎯 [BLOCK-0 SNIPER]: PI 5 RADAR TRIGGER RECEIVED! Execution engaged...`));
        console.log(chalk.red(`Target LP Init Sig: ${msg.signature}`));

        // At this specific millisecond, we know a new LP was created.
        // We need to parse that exact transaction to extract the new token mint address.
        await extractAndSnipe(msg.signature);
    }
});

async function extractAndSnipe(signature) {
    if (!wallet) {
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Cannot snipe, wallet not initialized.`));
        return;
    }

    if (!signature || typeof signature !== 'string' || signature.length < 80) {
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Invalid signature provided, aborting to prevent WrongSize crash.`));
        return;
    }

    try {
        // 1. Fetch the transaction details to find the coin mint.
        // Needs high commitment to ensure we can read it immediately.
        let txInfo = null;
        try {
            txInfo = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        } catch (err) {
            console.log(chalk.yellow(`[BLOCK-0 SNIPER]: Primary RPC getTransaction failed, falling back to secondary...`));
            txInfo = await fallbackConnection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        }

        if (!txInfo) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Failed to fetch tx info fast enough.`));
            return;
        }

        // Raydium initialize2 usually has the token mints in the account keys.
        // We know WSOL is one, the other is the shitcoin.
        const accountKeys = txInfo.transaction.message.staticAccountKeys || txInfo.transaction.message.accountKeys;
        let targetMint = null;

        for (const key of accountKeys) {
            const pubkeyStr = key.toString();
            // Ignore familiar system programs and WSOL
            if (
                pubkeyStr !== WSOL_MINT &&
                pubkeyStr !== '11111111111111111111111111111111' &&
                pubkeyStr !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' &&
                pubkeyStr !== '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' // Raydium AMM
            ) {
                targetMint = pubkeyStr;
            }
        }

        if (!targetMint) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Failed to extract target mint from LP init tx.`));
            return;
        }

        console.log(chalk.red.bold(`[BLOCK-0 SNIPER]: TARGET ACQUIRED → ${targetMint}. FIRING JUPITER...`));

        // 2. Fire Jupiter Swap
        const amountLamports = Math.floor(SNIPE_AMOUNT_SOL * 1e9);
        let qRes;
        try {
            qRes = await axios.get(`https://quote-api.jup.ag/v6/quote`, {
                params: {
                    inputMint: WSOL_MINT,
                    outputMint: targetMint,
                    amount: amountLamports,
                    slippageBps: 5000 // 50% slippage, block-0 is EXTREMELY volatile
                },
                timeout: 3000
            });
        } catch (err) {
            console.log(chalk.yellow(`[BLOCK-0 SNIPER]: Jupiter quote failed, retrying...`));
            qRes = await axios.get(`https://quote-api.jup.ag/v6/quote`, {
                params: {
                    inputMint: WSOL_MINT,
                    outputMint: targetMint,
                    amount: amountLamports,
                    slippageBps: 5000
                },
                timeout: 3000
            });
        }

        if (!qRes || !qRes.data) return;

        let swapRes;
        try {
            swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
                quoteResponse: qRes.data,
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: 3000000 // MASSIVE priority fee to ensure Block-0 inclusion
            }, { timeout: 3000 });
        } catch (err) {
            console.log(chalk.yellow(`[BLOCK-0 SNIPER]: Jupiter swap failed, retrying...`));
            swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
                quoteResponse: qRes.data,
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: 3000000
            }, { timeout: 3000 });
        }

        if (!swapRes || !swapRes.data || !swapRes.data.swapTransaction) return;

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        let sig;
        try {
            sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        } catch (err) {
            console.log(chalk.yellow(`[BLOCK-0 SNIPER]: Primary sendRawTransaction failed, falling back to secondary RPC...`));
            sig = await fallbackConnection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        }

        console.log(chalk.white.bgRed.bold(`[BLOCK-0 SNIPER]: 💥 SNIPE EXECUTED! Sig: ${sig} 💥`));

        if (process.send) {
            process.send({
                type: 'LOG',
                msg: `💥 BLOCK-0 SNIPER: Hit LP creation at ${targetMint} for ${SNIPE_AMOUNT_SOL} SOL.`,
                level: 'CRYPTO'
            });
        }

    } catch (e) {
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Execution failed: ${e.response?.data?.msg || e.message}`));
    }
}
