// don/pumpsniper.js — PUMP.FUN LAUNCH SNIPER
// Connects to pump.fun websocket, watches for new token launches,
// buys in during the first 60 seconds if momentum criteria are met.
// Works alongside the main sniper — uses same active_trades.json ledger.

const WebSocket = require('ws');
const axios = require('axios');
const chalk = require('chalk');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.magenta.bold(`[PUMPSNIPER #${id}]: 🎯 Pump.fun Launch Sniper ONLINE`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const TRADES_FILE = path.resolve(__dirname, '../missions/active_trades.json');

// ── Config ───────────────────────────────────────────────────────
const BUY_AMOUNT_SOL = 0.016;     // SOL per new launch trade
const MIN_RESERVE_SOL = 0.15;     // Don't buy below this balance
const MAX_POSITIONS = 8;        // Shared limit with main sniper
const WATCH_WINDOW_MS = 60000;    // Watch each new token for 60 seconds
const MIN_BUYS_TO_ACT = 5;        // Need at least 5 buys in first 60s
const MIN_VOL_TO_ACT = 100;      // Need $100+ in volume in first 60s
const cooldowns = new Set();

// ── Jupiter Swap (shared with sniper logic) ───────────────────────
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

let wallet;
try {
    wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
} catch (e) {
    console.log(chalk.red(`[PUMPSNIPER #${id}]: ❌ No valid SOLANA_PRIVATE_KEY — exiting.`));
    process.exit(0);
}

function loadTrades() {
    try { return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8')); } catch { return []; }
}
function saveTrades(t) { fs.writeFileSync(TRADES_FILE, JSON.stringify(t, null, 2)); }

async function executeJupiterSwap(inputMint, outputMint, lamports) {
    try {
        const qRes = await axios.get(`https://quote-api.jup.ag/v6/quote`, {
            params: { inputMint, outputMint, amount: lamports, slippageBps: 1500 },
            timeout: 12000,
        });
        const quote = qRes.data;
        if (!quote?.outAmount) return null;

        const swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quote,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: 'auto',
        }, { timeout: 15000 });

        const { swapTransaction } = swapRes.data;
        const txBuf = Buffer.from(swapTransaction, 'base64');
        const { VersionedTransaction } = require('@solana/web3.js');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        console.log(chalk.magenta(`[PUMPSNIPER #${id}]: 🪐 Jupiter Swap Sent: ${sig}`));
        return { success: true, outAmount: quote.outAmount, sig };
    } catch (e) {
        console.log(chalk.red(`[PUMPSNIPER #${id}]: Jupiter error: ${e.message}`));
        return null;
    }
}

// ── Watch and score a newly-launched token ────────────────────────
async function watchAndMaybeBuy(tokenMint, name, creator) {
    if (cooldowns.has(tokenMint)) return;

    const openPositions = loadTrades().length;
    if (openPositions >= MAX_POSITIONS) {
        console.log(chalk.gray(`[PUMPSNIPER #${id}]: Position limit (${openPositions}/${MAX_POSITIONS}). Skipping ${name}`));
        return;
    }

    const walletBalance = await connection.getBalance(wallet.publicKey).catch(() => 0);
    if (walletBalance < MIN_RESERVE_SOL * 1e9) {
        console.log(chalk.yellow(`[PUMPSNIPER #${id}]: Low balance. Skipping ${name}`));
        return;
    }

    console.log(chalk.magenta(`[PUMPSNIPER #${id}]: 👀 WATCHING new launch: ${name} (${tokenMint.slice(0, 8)}...) — 60s window`));

    // Wait 30s then check momentum
    await new Promise(r => setTimeout(r, 30000));

    let buys30s = 0, volume30s = 0;
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/tokens/v1/solana/${tokenMint}`,
            { timeout: 10000 }
        );
        const pairs = Array.isArray(res.data) ? res.data : [];
        const pair = pairs.sort((a, b) => (b.volume?.m5 || 0) - (a.volume?.m5 || 0))[0];
        if (pair) {
            buys30s = pair.txns?.m5?.buys || 0;
            volume30s = pair.volume?.m5 || 0;
        }
    } catch (e) {
        console.log(chalk.gray(`[PUMPSNIPER #${id}]: Price check failed for ${name}: ${e.message}`));
        return;
    }

    const scoredOk = buys30s >= MIN_BUYS_TO_ACT && volume30s >= MIN_VOL_TO_ACT;

    if (!scoredOk) {
        console.log(chalk.gray(`[PUMPSNIPER #${id}]: ❌ ${name} failed momentum: buys=${buys30s} vol=$${volume30s.toFixed(0)}`));
        return;
    }

    console.log(chalk.magenta.bold(`[PUMPSNIPER #${id}]: 🚀 LAUNCH BUY: ${name} | buys=${buys30s} vol=$${volume30s.toFixed(0)} → ENTERING`));

    // Re-check position limit before buying
    if (loadTrades().length >= MAX_POSITIONS) return;
    if (cooldowns.has(tokenMint)) return;
    cooldowns.add(tokenMint);
    setTimeout(() => cooldowns.delete(tokenMint), 5 * 60 * 1000);

    const lamports = Math.floor(BUY_AMOUNT_SOL * 1e9);
    const result = await executeJupiterSwap(WSOL_MINT, tokenMint, lamports);

    if (result?.success) {
        const outAmt = Number(result.outAmount);
        const uiAmt = outAmt / 1e6;
        const entry = uiAmt > 0 ? BUY_AMOUNT_SOL / uiAmt : 0;
        const trades = loadTrades();
        trades.push({
            mint: tokenMint,
            entryPrice: entry,
            entryPriceUnit: 'ui',
            amount: outAmt,
            uiAmount: uiAmt,
            entrySol: BUY_AMOUNT_SOL,
            timestamp: Date.now(),
            maxHoldUntil: Date.now() + (2 * 60 * 60 * 1000), // 2h max for launch snipes
            moonbagSecured: false,
            source: 'PUMPSNIPER',
            tokenName: name,
        });
        saveTrades(trades);

        if (process.send) {
            process.send({ type: 'TRADE_EXECUTED', mint: tokenMint, amount: BUY_AMOUNT_SOL, source: 'PUMPSNIPER' });
            process.send({ type: 'LOG', level: 'MONEY', msg: `⚠️⚠️⚠️ NEW POSITION ⚠️⚠️⚠️ ${name} (${tokenMint.slice(0, 8)}...) | Buys:${buys30s} Vol:$${volume30s.toFixed(0)}` });
        }
    }
}

// ── Connect to pump.fun websocket ────────────────────────────────
function connectPumpFun() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        console.log(chalk.magenta(`[PUMPSNIPER #${id}]: ✅ Connected to pump.fun websocket`));
        ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
    });

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw.toString());
            if (data.mint && data.name) {
                // New token launched on pump.fun
                const { mint, name, symbol, traderPublicKey } = data;
                console.log(chalk.magenta(`[PUMPSNIPER #${id}]: 🆕 NEW LAUNCH: ${name} ($${symbol}) — ${mint.slice(0, 8)}...`));
                watchAndMaybeBuy(mint, name || symbol, traderPublicKey).catch(() => { });
            }
        } catch (e) { /* ignore malformed messages */ }
    });

    ws.on('error', (e) => console.log(chalk.gray(`[PUMPSNIPER #${id}]: WS error: ${e.message}`)));

    ws.on('close', () => {
        console.log(chalk.yellow(`[PUMPSNIPER #${id}]: 🔁 pump.fun WS disconnected. Reconnecting in 5s...`));
        setTimeout(connectPumpFun, 5000);
    });
}

// ── IPC ──────────────────────────────────────────────────────────
process.on('message', (msg) => {
    if (msg.type === 'PUMPSNIPER_STATUS' && process.send) {
        process.send({ type: 'LOG', level: 'INFO', msg: `PUMPSNIPER: Watching pump.fun live. Cooldowns: ${cooldowns.size}` });
    }
});

connectPumpFun();
