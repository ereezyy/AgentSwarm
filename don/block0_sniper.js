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
const connections = RPC_URLS.map(url => new Connection(url, 'confirmed'));

const JUP_API_URLS = [
    'https://quote-api.jup.ag/v6',
    'https://api.jup.ag/swap/v1' // Alternative Jupiter endpoint
];

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
    msg = msg || {};
    msg.type = msg.type || '';
    msg.action = msg.action || '';
    msg.signature = msg.signature || '';

    if (msg.type === 'PI_TRIGGER' && msg.action === 'BLOCK0_SNIPE') {
        console.log(chalk.red.bold(`\n⚡🎯 [BLOCK-0 SNIPER]: PI 5 RADAR TRIGGER RECEIVED! Execution engaged...`));
        console.log(chalk.red(`Target LP Init Sig: ${msg.signature}`));

        // At this specific millisecond, we know a new LP was created.
        // We need to parse that exact transaction to extract the new token mint address.
        await extractAndSnipe(msg.signature);
    }
});

async function extractAndSnipe(signature) {
    if (!wallet || !wallet.publicKey) return;
    if (typeof signature !== 'string') return;

    try {
        const decodedSig = bs58.decode(signature);
        if (decodedSig.length !== 64) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Invalid signature length.`));
            return;
        }
    } catch (e) {
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Invalid base58 signature.`));
        return;
    }

    try {
        let balance = null;
        for (const conn of connections) {
            try {
                balance = await conn.getBalance(wallet.publicKey);
                if (balance !== null) break;
            } catch (e) {
                // Try next RPC
            }
        }

        if (balance === null) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Failed to fetch wallet balance on any RPC.`));
            return;
        }

        const requiredBalance = (SNIPE_AMOUNT_SOL + 0.005) * 1e9;
        if (balance < requiredBalance) {
            console.log(chalk.red(`[BLOCK-0 SNIPER]: Insufficient SOL balance. Have ${balance / 1e9}, need > ${(requiredBalance / 1e9).toFixed(3)}.`));
            return;
        }

        // 1. Fetch the transaction details to find the coin mint.
        // Needs high commitment to ensure we can read it immediately.
        let txInfo = null;
        for (const conn of connections) {
            try {
                txInfo = await conn.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
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
        const accountKeys = txInfo.transaction?.message?.staticAccountKeys || txInfo.transaction?.message?.accountKeys || [];
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

        let qRes = null;
        for (const apiUrl of JUP_API_URLS) {
            try {
                qRes = await axios.get(`${apiUrl}/quote`, {
                    params: {
                        inputMint: WSOL_MINT,
                        outputMint: targetMint,
                        amount: amountLamports,
                        slippageBps: 5000 // 50% slippage, block-0 is EXTREMELY volatile
                    },
                    timeout: 3000
                });
                if (qRes && qRes.data) break;
            } catch (err) {
                // Try next API endpoint
            }
        }

        if (!qRes || !qRes.data) return;

        let swapRes = null;
        for (const apiUrl of JUP_API_URLS) {
            try {
                swapRes = await axios.post(`${apiUrl}/swap`, {
                    quoteResponse: qRes.data,
                    userPublicKey: wallet.publicKey.toString(),
                    wrapAndUnwrapSol: true,
                    prioritizationFeeLamports: 3000000 // MASSIVE priority fee to ensure Block-0 inclusion
                });
                if (swapRes && swapRes.data && swapRes.data.swapTransaction) break;
            } catch (err) {
                // Try next API endpoint
            }
        }

        if (!swapRes || !swapRes.data) return;

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        let sig = null;
        for (const conn of connections) {
            try {
                sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
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
        console.log(chalk.red(`[BLOCK-0 SNIPER]: Execution failed: ${e.response?.data?.error || e.response?.data?.msg || e.message}\n${e.stack}`));
    }
}
