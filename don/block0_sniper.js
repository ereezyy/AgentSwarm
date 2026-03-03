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

const RPC_URLS = [
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'https://mainnet.helius-rpc.com/?api-key=default',
    'https://api.mainnet-beta.solana.com'
];
const connections = RPC_URLS.map(url => new Connection(url, { commitment: 'confirmed', disableRetryOnRateLimit: true }));

const JUP_API_URLS = [
    'https://quote-api.jup.ag/v6',
    'https://api.jup.ag/swap/v1' // Alternative Jupiter endpoint
];

let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        const keyStr = process.env.SOLANA_PRIVATE_KEY;
        const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
        wallet = Keypair.fromSecretKey(keyBytes);
        console.log(chalk.red(`[BLOCK-0 SNIPER #${id}]: 🔑 Wallet loaded: ${wallet.publicKey.toString().slice(0, 8)}...`));
    }
} catch (e) {
    console.log(chalk.red(`[BLOCK-0 SNIPER #${id}]: Keypair failed.`));
}

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const SNIPE_AMOUNT_SOL = 0.1;

// Helper to retry strictly on HTTP 429
async function withRetry(operation, maxRetries = 3, baseDelay = 1000) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error) {
            attempt++;
            const is429 = error.response?.status === 429 || error.message?.includes('429');
            if (is429 && attempt < maxRetries) {
                const delayMs = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                console.log(chalk.yellow(`[BLOCK-0]: Rate limit (429) hit. Retrying in ${delayMs}ms... (Attempt ${attempt}/${maxRetries})`));
                await new Promise(res => setTimeout(res, delayMs));
            } else {
                throw error;
            }
        }
    }
}

// ── IPC Listener from Main Hub ──────────────────────────────────────
process.on('message', async (msg) => {
    if (msg?.type === 'PI_TRIGGER' && msg?.action === 'BLOCK0_SNIPE') {
        const sig = msg.signature ? msg.signature.toString() : null;
        if (!sig) return;

        console.log(chalk.red.bold(`\n⚡🎯 [BLOCK-0 SNIPER]: PI 5 RADAR TRIGGER RECEIVED! Execution engaged...`));
        console.log(chalk.red(`Target LP Init Sig: ${sig}`));

        // At this specific millisecond, we know a new LP was created.
        // We need to parse that exact transaction to extract the new token mint address.
        await extractAndSnipe(sig);
    }
});

async function extractAndSnipe(signature) {
    if (!wallet || !wallet.publicKey) {
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Aborting — Wallet not loaded.`));
        return;
    }
    if (typeof signature !== 'string') return;

    try {
        // 1. Signature Sanitization: Detect Hex and convert to Base58
        let b58Sig = signature;
        if (/^[0-9a-fA-F]+$/.test(signature) && signature.length === 128) {
            const bytes = Buffer.from(signature, 'hex');
            b58Sig = bs58.encode(bytes);
            console.log(chalk.gray(`[BLOCK-0]: Sanitized Hex sig to Base58: ${b58Sig.slice(0, 8)}...`));
        }

        try {
            const decoded = bs58.decode(b58Sig);
            if (decoded.length !== 64) {
                console.log(chalk.red(`[BLOCK-0 SNIPER]: Invalid signature length (${decoded.length} bytes): ${signature}`));
                return;
            }
        } catch (e) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Invalid base58 signature: ${signature}`));
            return;
        }

        // 1. Fetch the transaction details to find the coin mint.
        // Needs high commitment to ensure we can read it immediately.
        let txInfo = null;
        for (const conn of connections) {
            try {
                txInfo = await withRetry(() => conn.getTransaction(b58Sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }));
                if (txInfo) break;
            } catch (err) {
                // Continue to fallback connection
            }
        }
        if (!txInfo) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Failed to fetch tx info fast enough on any RPC.`));
            return;
        }

        // Raydium initialize2 usually has the token mints in the account keys.
        // We know WSOL is one, the other is the shitcoin.
        const accountKeys = txInfo?.transaction?.message?.staticAccountKeys || txInfo?.transaction?.message?.accountKeys || [];
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

        // 2. Wallet Balance Guard
        let balanceLamports = 0;
        for (const conn of connections) {
            try {
                balanceLamports = await withRetry(() => conn.getBalance(wallet.publicKey));
                break;
            } catch (err) {
                // Try next connection
            }
        }

        const amountLamports = Math.floor(SNIPE_AMOUNT_SOL * 1e9);
        const jupPriorityFee = 3000000;

        if (balanceLamports < (amountLamports + jupPriorityFee + 5000)) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Insufficient SOL balance (${balanceLamports / 1e9} SOL). Need at least ${(amountLamports + jupPriorityFee + 5000) / 1e9} SOL.`));
            return;
        }

        // 3. Fire Jupiter Swap
        const JUPITER_QUOTE_APIS = [
            'https://lite-api.jup.ag/swap/v1/quote',
            'https://quote-api.jup.ag/v6/quote',
            'https://api.jup.ag/swap/v1/quote'
        ];
        const JUPITER_SWAP_APIS = [
            'https://lite-api.jup.ag/swap/v1/swap',
            'https://quote-api.jup.ag/v6/swap',
            'https://api.jup.ag/swap/v1/swap'
        ];

        let qRes = null;
        let lastErr = null;
        const qParams = { inputMint: WSOL_MINT, outputMint: targetMint, amount: amountLamports, slippageBps: 5000 };

        for (const url of JUPITER_QUOTE_APIS) {
            try {
                qRes = await withRetry(() => axios.get(url, { params: qParams, timeout: 3000 }));
                if (qRes?.data?.outAmount) break;
            } catch (e) {
                lastErr = e?.response?.data?.error || e?.message || 'Unknown error';
                let hostname = url;
                try { hostname = new URL(url).hostname; } catch(err) {}
                console.log(chalk.gray(`[BLOCK-0]: Quote API ${hostname} failed: ${lastErr}`));
            }
        }

        if (!qRes?.data?.outAmount) throw new Error(`Quote failed on all endpoints. Last error: ${lastErr}`);

        const swapPayload = {
            quoteResponse: qRes.data,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: jupPriorityFee
        };

        let swapRes = null;
        for (const url of JUPITER_SWAP_APIS) {
            try {
                swapRes = await withRetry(() => axios.post(url, swapPayload, { timeout: 4000 }));
                if (swapRes?.data?.swapTransaction) break;
            } catch (e) {
                lastErr = e?.response?.data?.error || e?.message || 'Unknown error';
                let hostname = url;
                try { hostname = new URL(url).hostname; } catch(err) {}
                console.log(chalk.gray(`[BLOCK-0]: Swap API ${hostname} failed: ${lastErr}`));
            }
        }

        if (!swapRes?.data?.swapTransaction) throw new Error(`Swap construction failed on all endpoints. Last error: ${lastErr}`);

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        let sig = null;
        for (const conn of connections) {
            try {
                sig = await withRetry(() => conn.sendRawTransaction(tx.serialize(), { skipPreflight: true }));
                if (sig) break;
            } catch (err) {
                // Try next RPC connection
            }
        }

        if (!sig) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Failed to execute snipe transaction on all RPCs.`));
            return;
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
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Execution failed: ${e.response?.data?.msg || e.message}\n${e.stack}`));
        if (process.send) process.send({ type: 'LOG', level: 'ERROR', msg: `Block-0 Execution Failed: ${e.message}` });
        process.exit(1); // Force exit to trigger Jules
    }
}
