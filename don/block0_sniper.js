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
const FALLBACK_RPC_URL = process.env.SOLANA_FALLBACK_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const fallbackConnection = new Connection(FALLBACK_RPC_URL, 'confirmed');

// Helper to wrap RPC calls with failover
async function withFailover(primaryCall, fallbackCall, name) {
    try {
        return await primaryCall();
    } catch (e) {
        console.log(chalk.yellow(`[BLOCK-0 SNIPER]: RPC ${name} primary failed, trying fallback...`));
        try {
            return await fallbackCall();
        } catch (fallbackErr) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: RPC ${name} fallback also failed.`));
            throw fallbackErr;
        }
    }
}

// Helper to wrap API requests with failover (like Jupiter)
async function fetchWithFailover(primaryUrl, fallbackUrl, method, dataOrParams, timeout = 3000) {
    try {
        const config = { method, url: primaryUrl, timeout };
        if (method === 'get') config.params = dataOrParams;
        else config.data = dataOrParams;
        return await axios(config);
    } catch (e) {
        console.log(chalk.yellow(`[BLOCK-0 SNIPER]: API primary failed (${primaryUrl}), trying fallback (${fallbackUrl})...`));
        try {
            const config = { method, url: fallbackUrl, timeout };
            if (method === 'get') config.params = dataOrParams;
            else config.data = dataOrParams;
            return await axios(config);
        } catch (fallbackErr) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: API fallback also failed.`));
            throw fallbackErr;
        }
    }
}

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
    if (!wallet || !wallet.publicKey) {
        console.log(chalk.red(`[BLOCK-0 SNIPER]: No wallet configured or invalid keypair. Aborting.`));
        return;
    }
    if (!signature) {
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Invalid signature provided. Aborting.`));
        return;
    }

    try {
        // 1. Fetch the transaction details to find the coin mint.
        // Needs high commitment to ensure we can read it immediately.
        const txInfo = await withFailover(
            () => connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }),
            () => fallbackConnection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }),
            'getTransaction'
        );

        if (!txInfo) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Failed to fetch tx info fast enough.`));
            return;
        }

        // Raydium initialize2 usually has the token mints in the account keys.
        // We know WSOL is one, the other is the shitcoin.
        const accountKeys = txInfo.transaction.message.staticAccountKeys || txInfo.transaction.message.accountKeys || [];
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
        const qRes = await fetchWithFailover(
            'https://quote-api.jup.ag/v6/quote',
            'https://quote-api.jup.ag/v6/quote', // In a real scenario, use an alternate endpoint
            'get',
            {
                inputMint: WSOL_MINT,
                outputMint: targetMint,
                amount: amountLamports,
                slippageBps: 5000 // 50% slippage, block-0 is EXTREMELY volatile
            },
            3000
        );

        if (!qRes || !qRes.data) return;

        const swapRes = await fetchWithFailover(
            'https://quote-api.jup.ag/v6/swap',
            'https://quote-api.jup.ag/v6/swap', // Alternate swap endpoint
            'post',
            {
                quoteResponse: qRes.data,
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: 3000000 // MASSIVE priority fee to ensure Block-0 inclusion
            },
            3000
        );

        if (!swapRes || !swapRes.data || !swapRes.data.swapTransaction) return;

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        const sig = await withFailover(
            () => connection.sendRawTransaction(tx.serialize(), { skipPreflight: true }),
            () => fallbackConnection.sendRawTransaction(tx.serialize(), { skipPreflight: true }),
            'sendRawTransaction'
        );
        console.log(chalk.white.bgRed.bold(`[BLOCK-0 SNIPER]: 💥 SNIPE EXECUTED! Sig: ${sig} 💥`));

        if (process.send) {
            process.send({
                type: 'LOG',
                msg: `💥 BLOCK-0 SNIPER: Hit LP creation at ${targetMint} for ${SNIPE_AMOUNT_SOL} SOL.`,
                level: 'CRYPTO'
            });
        }

    } catch (e) {
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Execution failed: ${e.response?.data?.msg || e.message || e}`));
        if (e.stack) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Stack Trace: ${e.stack}`));
        }
    }
}
