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
    process.env.SOLANA_RPC_URL_FALLBACK || 'https://mainnet.helius-rpc.com/?api-key=default',
    'https://mainnet.helius-rpc.com/?api-key=default',
    'https://api.mainnet-beta.solana.com'
];
const connections = RPC_URLS.map(url => new Connection(url, { commitment: 'confirmed', disableRetryOnRateLimit: true }));

const JUP_API_URLS = [
    'https://lite-api.jup.ag/swap/v1'
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

async function withRetry(fn, retries = 3, delayMs = 1000) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return await fn();
        } catch (e) {
            attempt++;
            const errMsg = e?.response?.data?.error || e?.response?.data?.msg || e?.message || 'Unknown error';
            console.log(chalk.yellow(`[BLOCK-0 SNIPER]: Action failed (${errMsg}). Retry ${attempt}/${retries} in ${delayMs}ms...`));
            if (attempt >= retries) throw e;
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= 2; // exponential backoff
        }
    }
}

async function extractAndSnipe(signature) {
    if (!wallet || !wallet.publicKey) {
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Aborting — Wallet not loaded.`));
        return;
    }
    if (typeof signature !== 'string') return;

    try {
        // 0. Wallet Guard
        let balance = 0;
        for (const conn of connections) {
            try {
                balance = await withRetry(() => conn.getBalance(wallet.publicKey), 2, 500);
                if (balance > 0) break;
            } catch (err) {
                // Try next RPC
            }
        }

        const requiredBalance = (SNIPE_AMOUNT_SOL + 0.005) * 1e9; // Snipe amount + buffer for fees
        if (balance < requiredBalance) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Insufficient SOL. Balance: ${(balance/1e9).toFixed(4)}, Required: ${(requiredBalance/1e9).toFixed(4)}`));
            return;
        }

        // 1. Signature Sanitization: Detect Hex and convert to Base58
        let b58Sig = signature;
        try {
            if (/^[0-9a-fA-F]+$/.test(signature)) {
                if (signature.length % 2 === 0) {
                    const bytes = Buffer.from(signature, 'hex');
                    b58Sig = bs58.encode(bytes);
                    console.log(chalk.gray(`[BLOCK-0]: Sanitized Hex sig to Base58: ${b58Sig.slice(0, 8)}...`));
                }
            }
        } catch (err) {
            console.log(chalk.gray(`[BLOCK-0]: Hex to Base58 parsing skipped: ${err.message}`));
        }

        if (b58Sig.length < 32) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Invalid signature format/length: ${signature}`));
            return;
        }

        if (bs58.decode(b58Sig).length !== 64) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Invalid base58 signature length. Aborting.`));
            return;
        }

        // 1. Fetch the transaction details to find the coin mint.
        // Needs high commitment to ensure we can read it immediately.
        let txInfo = null;
        for (const conn of connections) {
            try {
                txInfo = await withRetry(() => conn.getTransaction(b58Sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }), 3, 1000);
                if (txInfo) break;
            } catch (err) {
                // Continue to fallback connection
                console.log(chalk.gray(`[BLOCK-0]: Failed to fetch tx on ${conn.rpcEndpoint}. Retrying next.`));
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

        // 2. Fire Jupiter Swap
        const amountLamports = Math.floor(SNIPE_AMOUNT_SOL * 1e9);
        const JUPITER_QUOTE_APIS = [
            'https://lite-api.jup.ag/swap/v1/quote'
        ];
        const JUPITER_SWAP_APIS = [
            'https://lite-api.jup.ag/swap/v1/swap'
        ];

        let qRes = null;
        let lastErr = null;
        const qParams = { inputMint: WSOL_MINT, outputMint: targetMint, amount: amountLamports, slippageBps: 5000 };

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
<<<<<<< HEAD
                qRes = await axios.get('https://lite-api.jup.ag/swap/v1/quote', { params: qParams, timeout: 3000 });
                if (qRes && qRes.data) break;
            } catch (e) {
                lastErr = e.response?.status === 429 ? '429 Rate Limit' : e.message;
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.gray(`[BLOCK-0]: ⏳ Quote 429 Rate Limit... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 600 * attempt + Math.random() * 200));
                    continue;
                }
                console.log(chalk.gray(`[BLOCK-0]: Quote API failed: ${lastErr}`));
                break;
=======
                qRes = await withRetry(() => axios.get(url, { params: qParams, timeout: 3000 }), 3, 500);
                if (qRes && qRes.data) break;
            } catch (e) {
                lastErr = e?.response?.data?.error || e?.message;
                console.log(chalk.gray(`[BLOCK-0]: Quote API ${new URL(url).hostname} failed.`));
>>>>>>> f1433a4550e4457637572da9716d5fce16ada9b3
            }
        }

        if (!qRes || !qRes.data || !qRes.data.outAmount) throw new Error(`Quote failed: ${lastErr}`);

        const swapPayload = {
            quoteResponse: qRes.data,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 3000000
        };

        let swapRes = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
<<<<<<< HEAD
                swapRes = await axios.post('https://lite-api.jup.ag/swap/v1/swap', swapPayload, { timeout: 4000 });
                if (swapRes && swapRes.data) break;
            } catch (e) {
                lastErr = e.response?.status === 429 ? '429 Rate Limit' : (e.response?.data?.error || e.message);
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.gray(`[BLOCK-0]: ⏳ Swap 429 Rate Limit... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 600 * attempt + Math.random() * 200));
                    continue;
                }
                console.log(chalk.gray(`[BLOCK-0]: Swap API failed: ${lastErr}`));
                break;
=======
                swapRes = await withRetry(() => axios.post(url, swapPayload, { timeout: 4000 }), 3, 500);
                if (swapRes && swapRes.data) break;
            } catch (e) {
                lastErr = e?.response?.data?.error || e?.message;
                console.log(chalk.gray(`[BLOCK-0]: Swap API ${new URL(url).hostname} failed.`));
>>>>>>> f1433a4550e4457637572da9716d5fce16ada9b3
            }
        }

        if (!swapRes || !swapRes.data) throw new Error(`Swap construction failed: ${lastErr}`);

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        let sig = null;
        for (const conn of connections) {
            try {
                sig = await withRetry(() => conn.sendRawTransaction(tx.serialize(), { skipPreflight: true }), 3, 500);
                if (sig) break;
            } catch (err) {
                // Try next RPC connection
                console.log(chalk.gray(`[BLOCK-0]: Failed to send tx on ${conn.rpcEndpoint}. Retrying next.`));
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
