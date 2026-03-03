// don/market_maker.js - THE MARKET MAKER (Soft Grid Trading Bot)
// Captures side-ways volatility (spreads) on blue-chip pairs (e.g., SOL/USDC)
// Maintains a virtual grid of buy/sell triggers. When price hits a trigger,
// it executes a high-speed Jupiter swap, effectively providing liquidity dynamically.

const axios = require('axios');
const chalk = require('chalk');
const bs58 = require('bs58');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.cyan.bold(`[MARKET MAKER #${id}]: 📈 Grid Trading Matrix ONLINE. Capturing spreads.`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        const keyStr = process.env.SOLANA_PRIVATE_KEY;
        const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
        wallet = Keypair.fromSecretKey(keyBytes);
    } else {
        console.log(chalk.gray(`[MAKER #${id}]: No SOLANA_PRIVATE_KEY — running in simulation mode.`));
    }
} catch (e) {
    console.log(chalk.red(`[MAKER #${id}]: Keypair load failed: ${e.message}`));
}

// ── Market Maker Config ─────────────────────────────────────────────
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const GRID_LEVELS = 3;        // 3 buy levels, 3 sell levels
const GRID_SPACING_PCT = 1.5;      // 1.5% spacing between grid lines
const TRADE_AMOUNT_SOL = 0.05;     // Stake per grid level
const SCAN_INTERVAL_MS = 10000;    // Check prices every 10s

let gridInitialized = false;
let centerPrice = 0;
let buyLevels = [];
let sellLevels = [];
let currentCycle = 0;

// ── Grid Logic ──────────────────────────────────────────────────────
async function initGrid() {
    try {
        // DexScreener is 100% public (Zero 401 risk)
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${WSOL_MINT}`);
        if (!res.data || !res.data.pairs || res.data.pairs.length === 0) return;

        const pair = res.data.pairs.find(p => p.quoteToken.address === USDC_MINT) || res.data.pairs[0];
        centerPrice = parseFloat(pair.priceUsd);

        // Calculate limit levels based on center price
        buyLevels = [];
        sellLevels = [];

        for (let i = 1; i <= GRID_LEVELS; i++) {
            const drop = centerPrice * (1 - (GRID_SPACING_PCT * i) / 100);
            const surge = centerPrice * (1 + (GRID_SPACING_PCT * i) / 100);

            buyLevels.push({ price: drop, filled: false, level: i });    // We buy SOL when price drops
            sellLevels.push({ price: surge, filled: false, level: i });  // We sell SOL when price surges
        }

        gridInitialized = true;
        console.log(chalk.cyan(`[MAKER #${id}]: 🕸️ Grid Established. Center: $${centerPrice.toFixed(2)} | Edge: +/- ${GRID_LEVELS * GRID_SPACING_PCT}%`));
    } catch (e) {
        console.log(chalk.red(`[MAKER #${id}]: Failed to init grid: ${e.message}`));
    }
}

async function checkGrid() {
    if (!wallet) return;
    if (!gridInitialized) {
        await initGrid();
        return;
    }

    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${WSOL_MINT}`);
        if (!res.data || !res.data.pairs || res.data.pairs.length === 0) return;

        const pair = res.data.pairs.find(p => p.quoteToken.address === USDC_MINT) || res.data.pairs[0];
        const currentPrice = parseFloat(pair.priceUsd);
        currentCycle++;

        if (currentCycle % 6 === 0) { // Log pulse every minute
            console.log(chalk.gray(`[MAKER #${id}]: Market monitoring... SOL=$${currentPrice.toFixed(2)}`));
        }

        // Check if price crashed into our BUY limits (buy SOL with USDC)
        for (const level of buyLevels) {
            if (!level.filled && currentPrice <= level.price) {
                console.log(chalk.cyan.bold(`[MAKER #${id}]: 📉 Price dropped to $${currentPrice.toFixed(2)}. TRIGGERING BUY LEVEL ${level.level}`));

                // Execute Buy: USDC -> SOL
                const usdcAmount = Math.floor((TRADE_AMOUNT_SOL * level.price) * 1e6); // 6 decimals for USDC
                const success = await executeJupiterSwap(USDC_MINT, WSOL_MINT, usdcAmount);

                if (success) {
                    level.filled = true;
                    // Reactivate the corresponding sell level so we can take profit when it bounces
                    const targetSell = sellLevels.find(s => s.level === level.level);
                    if (targetSell) targetSell.filled = false;

                    if (process.send) process.send({ type: 'LOG', msg: `📈 Market Maker: Bought SOL at $${currentPrice.toFixed(2)} (Grid Level ${level.level})`, level: 'MONEY' });
                }
            }
        }

        // Check if price pumped into our SELL limits (sell SOL for USDC)
        for (const level of sellLevels) {
            if (!level.filled && currentPrice >= level.price) {
                console.log(chalk.cyan.bold(`[MAKER #${id}]: 📈 Price pumped to $${currentPrice.toFixed(2)}. TRIGGERING SELL LEVEL ${level.level}`));

                // Execute Sell: SOL -> USDC
                const solLamports = Math.floor(TRADE_AMOUNT_SOL * 1e9);
                const success = await executeJupiterSwap(WSOL_MINT, USDC_MINT, solLamports);

                if (success) {
                    level.filled = true;
                    // Reactivate corresponding buy level to re-enter if it drops again
                    const targetBuy = buyLevels.find(b => b.level === level.level);
                    if (targetBuy) targetBuy.filled = false;

                    if (process.send) process.send({ type: 'LOG', msg: `📉 Market Maker: Sold SOL at $${currentPrice.toFixed(2)} (Grid Level ${level.level})`, level: 'MONEY' });
                }
            }
        }

    } catch (e) {
        // Silent block for network noise
    }
}

async function executeJupiterSwap(inputMint, outputMint, amountBaseUnits) {
    try {
        const JUPITER_QUOTE_APIS = [
            'https://lite-api.jup.ag/swap/v1/quote'
        ];

        const JUPITER_SWAP_APIS = [
            'https://lite-api.jup.ag/swap/v1/swap'
        ];

        const qParams = { inputMint, outputMint, amount: amountBaseUnits, slippageBps: 100 };
        let qRes = null;
        let lastErr = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                qRes = await axios.get('https://lite-api.jup.ag/swap/v1/quote', { params: qParams, timeout: 5000 });
                if (qRes && qRes.data) break;
            } catch (e) {
                lastErr = e.response?.status === 429 ? '429 Rate Limit' : e.message;
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.gray(`[MAKER]: ⏳ Quote 429 Rate Limit... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 800 * attempt + Math.random() * 200));
                    continue;
                }
                console.log(chalk.gray(`[MAKER]: Quote API failed: ${lastErr}`));
                break;
            }
        }

        if (!qRes || !qRes.data) throw new Error(`Quote failed: ${lastErr}`);

        let swapRes = null;
        const swapPayload = {
            quoteResponse: qRes.data,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 1000000
        };

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                swapRes = await axios.post('https://lite-api.jup.ag/swap/v1/swap', swapPayload, { timeout: 8000 });
                if (swapRes && swapRes.data) break;
            } catch (e) {
                lastErr = e.response?.status === 429 ? '429 Rate Limit' : (e.response?.data?.error || e.message);
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.gray(`[MAKER]: ⏳ Swap 429 Rate Limit... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 800 * attempt + Math.random() * 200));
                    continue;
                }
                console.log(chalk.gray(`[MAKER]: Swap API failed: ${lastErr}`));
                break;
            }
        }

        if (!swapRes || !swapRes.data) throw new Error(`Swap construction failed: ${lastErr}`);

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        console.log(chalk.cyan.bold(`[MAKER #${id}]: 💱 GRID SWAP EXECUTED: ${sig}`));
        return true;
    } catch (e) {
        console.log(chalk.red(`[MAKER #${id}]: Execution failed: ${e.message}`));
        if (process.send) process.send({ type: 'LOG', level: 'ERROR', msg: `Market Maker Execution Failed: ${e.message}` });
        return false;
    }
}

// ── Execution Core ───────────────────────────────────────────────
setInterval(checkGrid, SCAN_INTERVAL_MS);

if (require.main === module) {
    console.log(chalk.cyan(`[MAKER #${id}]: Direct execution. Spin up grid...`));
    initGrid();
}
