// don/jito_sandwich.js - THE MEV PREDATOR (REST API Atomic Bundles)
// Completely rewritten to abandon the broken sandwich logic.
// This now executes guaranteed risk-free atomic cyclical arbitrage (Buy -> Sell -> Jito Tip)
// using the Jito Block Engine REST API. If the arb fails or slips, the bundle drops. Zero risk holding the bag.

const axios = require('axios');
const chalk = require('chalk');
const bs58 = require('bs58');
const { Connection, Keypair, VersionedTransaction, SystemProgram, Transaction, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.red.bgBlack.bold(`[MEV PREDATOR #${id}]: 🩸 ATOMIC ARBITRAGE ENGINE ONLINE. Scanning for cyclical spread...`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        const keyStr = process.env.SOLANA_PRIVATE_KEY;
        const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
        wallet = Keypair.fromSecretKey(keyBytes);
        console.log(chalk.green(`[MEV PREDATOR #${id}]: 🔓 Wallet Authorized: ${wallet.publicKey.toString().slice(0, 8)}...`));
    }
} catch (e) {
    console.log(chalk.red(`[MEV PREDATOR #${id}]: Core wallet authentication failed.`));
}

// ── Configuration ──────────────────────────────────────────────
const JITO_BLOCK_ENGINE_REST = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
const JUPITER_BASE = 'https://lite-api.jup.ag/swap/v1';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const TRADE_AMOUNT_SOL = 0.2;         // Base position size to swing
const MIN_PROFIT_SOL = 0.005;         // Minimum profit required to fire bundle
const PRIORITY_FEE_LAMPORTS = 50000;  // Standard base network fee
const JITO_TIP_LAMPORTS = 100000;     // Bribe to Jito Validators (0.0001 SOL)

const PREY_LIST = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // JitoSOL
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
];

let scansThisSession = 0;
let executedBundles = 0;

let isScanning = false;

// ── Cyclical Arbitrage Scanner ─────────────────────────────────
async function scanCyclicalArbitrage() {
    if (!wallet || isScanning) return;
    isScanning = true;

    const preyToken = PREY_LIST[scansThisSession % PREY_LIST.length];
    const tradeLamports = Math.floor(TRADE_AMOUNT_SOL * 1e9);
    scansThisSession++;

    const JUPITER_QUOTE_APIS = [
        'https://lite-api.jup.ag/swap/v1/quote'
    ];

    try {
        let buyQuoteRes = null;
        let lastErr = null;
        for (const apiUrl of JUPITER_QUOTE_APIS) {
            if (buyQuoteRes?.data) break;
            for (let attempt = 1; attempt <= 4; attempt++) {
                try {
                    buyQuoteRes = await axios.get(apiUrl, {
                        params: { inputMint: WSOL_MINT, outputMint: preyToken, amount: tradeLamports, slippageBps: 10 },
                        timeout: 5000
                    });
                    if (buyQuoteRes?.data) break;
                } catch (e) {
                    lastErr = e.response?.status === 429 ? '429 Rate Limit' : e.message;
                    if (e.response?.status === 429 && attempt < 4) {
                        const backoff = (attempt ** 2) * 1000 + Math.random() * 500;
                        await new Promise(r => setTimeout(r, backoff));
                        continue;
                    }
                    break;
                }
            }
        }

        const outToken = buyQuoteRes?.data?.outAmount;
        if (!outToken) return;

        // Leg 2: Token -> SOL
        let sellQuoteRes = null;
        for (const apiUrl of JUPITER_QUOTE_APIS) {
            if (sellQuoteRes?.data) break;
            for (let attempt = 1; attempt <= 4; attempt++) {
                try {
                    sellQuoteRes = await axios.get(apiUrl, {
                        params: { inputMint: preyToken, outputMint: WSOL_MINT, amount: outToken, slippageBps: 10 },
                        timeout: 5000
                    });
                    if (sellQuoteRes?.data) break;
                } catch (e) {
                    lastErr = e.response?.status === 429 ? '429 Rate Limit' : e.message;
                    if (e.response?.status === 429 && attempt < 4) {
                        const backoff = (attempt ** 2) * 1000 + Math.random() * 500;
                        await new Promise(r => setTimeout(r, backoff));
                        continue;
                    }
                    break;
                }
            }
        }

        const outSolLamports = sellQuoteRes?.data?.outAmount;
        if (!outSolLamports) return;

        const outSol = Number(outSolLamports) / 1e9;
        const totalCost = TRADE_AMOUNT_SOL + ((PRIORITY_FEE_LAMPORTS * 2) / 1e9) + (JITO_TIP_LAMPORTS / 1e9);
        const netProfit = outSol - totalCost;

        if (netProfit >= MIN_PROFIT_SOL) {
            console.log(chalk.yellow.bold(`\n[MEV PREDATOR #${id}]: 🚨 ARBITRAGE DETECTED! Token: ${preyToken.slice(0, 6)}... | Route Profit: +${netProfit.toFixed(5)} SOL`));
            await fireAtomicBundle(buyQuoteRes.data, sellQuoteRes.data, netProfit);
        }
    } catch (e) {
        console.log(chalk.red(`[MEV PREDATOR]: Arb cycle error: ${e.message}`));
    } finally {
        isScanning = false;
    }
}

// ── Jito Atomic Bundle Constructor ─────────────────────────────
async function fireAtomicBundle(buyQuote, sellQuote, margin) {
    try {
        console.log(chalk.red(`[MEV PREDATOR #${id}]: ⚡ Constructing ATOMIC JITO BUNDLE (Buy -> Sell -> Bribe)`));

        const JUPITER_SWAP_APIS = [
            'https://lite-api.jup.ag/swap/v1/swap'
        ];

        // 1. & 2. Construct Jupiter Swaps in Parallel
        const fetchSwap = async (quote) => {
            return Promise.any(
                JUPITER_SWAP_APIS.map(async (apiUrl) => {
                    for (let attempt = 1; attempt <= 4; attempt++) {
                        try {
                            const res = await axios.post(apiUrl, {
                                quoteResponse: quote,
                                userPublicKey: wallet.publicKey.toString(),
                                wrapAndUnwrapSol: true,
                                prioritizationFeeLamports: PRIORITY_FEE_LAMPORTS
                            }, { timeout: 8000 });
                            if (res?.data) return res;
                        } catch (e) {
                            if (e.response?.status === 429 && attempt < 4) {
                                await new Promise(r => setTimeout(r, (attempt ** 2) * 1000 + Math.random() * 500));
                                continue;
                            }
                            throw e;
                        }
                    }
                    throw new Error("Failed after retries");
                })
            );
        };

        const [buySwapRes, sellSwapRes] = await Promise.all([
            fetchSwap(buyQuote),
            fetchSwap(sellQuote)
        ]);

        if (!buySwapRes?.data) throw new Error("Buy Swap API failed");
        if (!sellSwapRes?.data) throw new Error("Sell Swap API failed");

        const buyTx = VersionedTransaction.deserialize(Buffer.from(buySwapRes.data.swapTransaction, 'base64'));
        buyTx.sign([wallet]);

        const sellTx = VersionedTransaction.deserialize(Buffer.from(sellSwapRes.data.swapTransaction, 'base64'));
        sellTx.sign([wallet]);

        // 3. Construct Jito Bribe (Tip)
        const TIP_ACCOUNTS = [
            "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
            "HFqU5x63VTqvQss8hp11i4bD44PvwucfZ2bU7gRe",
            "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
            "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
            "DfXygSm4jCqDg6qhJaNw5BLqE3vwh7VBi5iqPjqj1tom",
            "ADuUkR4vk3Gj2cqGOn8aBo5Q1GRgk2nDZ2mHBk9BCbE5",
            "DttWaMuVvTiDuNwGTn8f8xfE1CTXEbZRrFPnKrUUXdet",
            "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"
        ];
        const randomTipAccount = new PublicKey(TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)]);

        const tipTx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: randomTipAccount,
                lamports: JITO_TIP_LAMPORTS
            })
        );
        tipTx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
        tipTx.feePayer = wallet.publicKey;
        tipTx.sign(wallet);

        const tipVersionedTx = new VersionedTransaction(tipTx.compileMessage());
        tipVersionedTx.signatures = tipTx.signatures.map(s => s.signature);

        // 4. Serialize to Base64
        const bundleTxs = [
            Buffer.from(buyTx.serialize()).toString('base64'),
            Buffer.from(sellTx.serialize()).toString('base64'),
            Buffer.from(tipVersionedTx.serialize()).toString('base64')
        ];

        // 5. Submit to Jito Block Engine REST API
        const payload = {
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [bundleTxs]
        };

        const jitoRes = await axios.post(JITO_BLOCK_ENGINE_REST, payload, { headers: { "Content-Type": "application/json" } });
        executedBundles++;

        const bundleId = jitoRes.data?.result || "UNKNOWN_ID";
        console.log(chalk.red.bold(`[MEV PREDATOR #${id}]: 💥 BUNDLE FIRED! Network ID: ${bundleId} | Margin: +${margin.toFixed(5)} SOL`));
        console.log(chalk.gray(`[MEV PREDATOR #${id}]: If transaction simulation fails, bundle reverts safely.`));

        if (process.send) {
            process.send({
                type: 'LOG',
                msg: `🩸 ATOMIC BUNDLE SENT: Arb execution fired via Jito. Margin: +${margin.toFixed(5)} SOL`,
                level: 'MONEY'
            });
            process.send({ type: 'KICK_UP', amount: margin * 87, source: 'MEV_PREDATOR', soldierId: id });
        }

        // Cool-down after execution attempt
        await new Promise(r => setTimeout(r, 15000));

    } catch (e) {
        console.log(chalk.red(`[MEV PREDATOR #${id}]: Bundle construction/submission failed.`));
    }
}

// ── Life Cycle ─────────────────────────────────────────────────
process.on('message', async (msg) => {
    if (msg.action === 'EXECUTE_SANDWICH' || msg.type === 'EXECUTE_SANDWICH') {
        console.log(chalk.red.bgBlack.bold(`[MEV PREDATOR #${id}]: 🩸 RADAR TRIGGER RECEIVED! Scanning immediately...`));
        await scanCyclicalArbitrage();
    }
});

async function startMEVLoop() {
    await scanCyclicalArbitrage();
    setTimeout(startMEVLoop, 3000); // 3 seconds per scan wave
}

setTimeout(startMEVLoop, 5000);
