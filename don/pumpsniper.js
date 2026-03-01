// don/pumpsniper.js — PUMP.FUN LAUNCH SNIPER V2 (VISCERAL MODE)
// Real-time momentum tracking via trade subscriptions.
// Buys within seconds of launch if buy pressure is confirmed.
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
console.log(chalk.magenta.bold(`[PUMPSNIPER #${id}]: 🎯 Pump.fun Launch Sniper V2 — VISCERAL MODE`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const TRADES_FILE = path.resolve(__dirname, '../missions/active_trades.json');

// ── CAPITAL PRESERVATION CONFIG (~1 SOL wallet) ─────────────────
const BUY_AMOUNT_SOL = 0.03;       // 0.03 SOL per snipe — small bets
const MIN_RESERVE_SOL = 0.005;      // [REDUCED] Always keep 0.005 SOL for gas + exits
const MAX_POSITIONS = 4;           // 4 max pump positions (0.12 SOL max exposure)
const DECISION_WINDOW_MS = 10000;  // 10 seconds to prove itself
const MIN_BUYS_TO_ACT = 5;         // 5 buys in 10s = stronger momentum required
const MIN_SOL_VOLUME = 1.0;        // at least 1 SOL traded (real interest, not dust)
const COOLDOWN_MS = 5 * 60 * 1000; // 5min cooldown per token after action
const cooldowns = new Set();

// ── Live momentum tracker (real-time buy counting per token) ─────
// tokenMint -> { buys: N, solVolume: N, creatorBought: bool, firstSeen: timestamp }
const liveTokens = new Map();

// ── Jupiter Swap ────────────────────────────────────────────────
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        const keyStr = process.env.SOLANA_PRIVATE_KEY;
        const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
        wallet = Keypair.fromSecretKey(keyBytes);
        console.log(chalk.magenta(`[PUMPSNIPER #${id}]: 🔑 Wallet loaded: ${wallet.publicKey.toString().slice(0, 8)}...`));
    } else {
        throw new Error('Missing SOLANA_PRIVATE_KEY');
    }
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
            params: { inputMint, outputMint, amount: lamports, slippageBps: 2000 },
            timeout: 10000,
        });
        const quote = qRes.data;
        if (!quote?.outAmount) return null;

        const swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quote,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: 'auto',
        }, { timeout: 12000 });

        const { swapTransaction } = swapRes.data;
        const txBuf = Buffer.from(swapTransaction, 'base64');
        const { VersionedTransaction } = require('@solana/web3.js');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        console.log(chalk.magenta.bold(`[PUMPSNIPER #${id}]: ⚡ SWAP FIRED: ${sig}`));
        return { success: true, outAmount: quote.outAmount, sig };
    } catch (e) {
        console.log(chalk.red(`[PUMPSNIPER #${id}]: Jupiter error: ${e.message}`));
        return null;
    }
}

// ── Execute buy on a token that passed momentum check ────────────
async function executeBuy(tokenMint, name, momentum) {
    if (cooldowns.has(tokenMint)) return;

    const openPositions = loadTrades().length;
    if (openPositions >= MAX_POSITIONS) {
        console.log(chalk.gray(`[PUMPSNIPER #${id}]: Full roster (${openPositions}/${MAX_POSITIONS}). Skipping ${name}`));
        return;
    }

    const walletBalance = await connection.getBalance(wallet.publicKey).catch(() => 0);
    if (walletBalance < 0.005 * 1e9) {
        console.log(chalk.yellow(`[PUMPSNIPER #${id}]: ⚠️ Low balance (Need >0.005 SOL). Holding fire.`));
        return;
    }

    // Final position check (race guard)
    if (loadTrades().length >= MAX_POSITIONS) return;
    if (cooldowns.has(tokenMint)) return;
    cooldowns.add(tokenMint);
    setTimeout(() => cooldowns.delete(tokenMint), COOLDOWN_MS);

    const { buys, solVolume, creatorBought } = momentum;
    const creatorTag = creatorBought ? ' 🔥DEV-BOUGHT' : '';

    console.log(chalk.magenta.bold(
        `[PUMPSNIPER #${id}]: 🚀🚀🚀 SNIPING: ${name} (${tokenMint.slice(0, 8)}...) ` +
        `| ${buys} buys | ${solVolume.toFixed(2)} SOL vol | ${((Date.now() - momentum.firstSeen) / 1000).toFixed(1)}s old${creatorTag}`
    ));

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
            maxHoldUntil: Date.now() + (90 * 60 * 1000), // 90min max hold (fast flips)
            moonbagSecured: false,
            source: 'PUMPSNIPER',
            tokenName: name,
            momentum: { buys, solVolume: parseFloat(solVolume.toFixed(3)), creatorBought },
        });
        saveTrades(trades);

        if (process.send) {
            process.send({ type: 'TRADE_EXECUTED', mint: tokenMint, amount: BUY_AMOUNT_SOL, source: 'PUMPSNIPER' });
            process.send({
                type: 'LOG', level: 'MONEY',
                msg: `🎯 PUMP SNIPE 🎯 ${name} (${tokenMint.slice(0, 8)}...) | ${buys} buys in ${((Date.now() - momentum.firstSeen) / 1000).toFixed(0)}s | ${solVolume.toFixed(2)} SOL vol${creatorTag} | Entry: ${BUY_AMOUNT_SOL} SOL`
            });
        }
    }
}

// ── Process a live trade event (real-time momentum scoring) ──────
function onTradeEvent(data) {
    const mint = data.mint;
    if (!mint || cooldowns.has(mint)) return;

    const isBuy = data.txType === 'buy';
    if (!isBuy) return; // only care about buys for momentum

    const solAmount = (data.solAmount || 0) / 1e9; // lamports to SOL

    if (!liveTokens.has(mint)) {
        // First trade we've seen — not watching this token yet
        return;
    }

    const tracker = liveTokens.get(mint);
    tracker.buys++;
    tracker.solVolume += solAmount;

    // Creator conviction detection
    if (data.traderPublicKey === tracker.creator) {
        tracker.creatorBought = true;
        console.log(chalk.red.bold(`[PUMPSNIPER #${id}]: 🔥 CREATOR BUY DETECTED on ${tracker.name}! Conviction signal.`));
    }

    // Check if we should pull the trigger
    const elapsed = Date.now() - tracker.firstSeen;
    if (elapsed < DECISION_WINDOW_MS && tracker.buys >= MIN_BUYS_TO_ACT && tracker.solVolume >= MIN_SOL_VOLUME) {
        // Momentum confirmed — BUY NOW. Don't wait for the window to close.
        liveTokens.delete(mint);
        executeBuy(mint, tracker.name, tracker).catch(() => { });
    }
}

// ── Process a new token launch event ────────────────────────────
function onNewToken(data) {
    const { mint, name, symbol, traderPublicKey } = data;
    if (!mint || cooldowns.has(mint)) return;
    if (liveTokens.has(mint)) return; // already watching

    console.log(chalk.magenta(`[PUMPSNIPER #${id}]: 🆕 NEW LAUNCH: ${name || symbol} ($${symbol}) — ${mint.slice(0, 8)}... — TRACKING`));

    // Start momentum tracking
    liveTokens.set(mint, {
        name: name || symbol,
        symbol,
        creator: traderPublicKey,
        buys: 0,
        solVolume: 0,
        creatorBought: false,
        firstSeen: Date.now(),
    });

    // Subscribe to trades for this token
    if (currentWs && currentWs.readyState === WebSocket.OPEN) {
        currentWs.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [mint] }));
    }

    // Deadline: if momentum isn't confirmed by the decision window, drop it
    setTimeout(() => {
        if (!liveTokens.has(mint)) return; // already bought or expired
        const tracker = liveTokens.get(mint);
        liveTokens.delete(mint);

        if (tracker.buys >= MIN_BUYS_TO_ACT && tracker.solVolume >= MIN_SOL_VOLUME) {
            // Squeaked in just at the deadline — still buy
            executeBuy(mint, tracker.name, tracker).catch(() => { });
        } else {
            console.log(chalk.gray(
                `[PUMPSNIPER #${id}]: ❌ ${tracker.name} — ${tracker.buys} buys, ${tracker.solVolume.toFixed(2)} SOL vol in ${(DECISION_WINDOW_MS / 1000)}s. Dead on arrival.`
            ));
            // Unsubscribe from trades to keep WS clean
            if (currentWs && currentWs.readyState === WebSocket.OPEN) {
                currentWs.send(JSON.stringify({ method: 'unsubscribeTokenTrade', keys: [mint] }));
            }
        }
    }, DECISION_WINDOW_MS + 500); // small buffer for late trades
}

// ── WebSocket connection ─────────────────────────────────────────
let currentWs = null;

function connectPumpFun() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    currentWs = ws;

    ws.on('open', () => {
        console.log(chalk.magenta.bold(`[PUMPSNIPER #${id}]: ✅ Connected — subscribed to new tokens + live trades`));
        // Subscribe to ALL new token launches
        ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
    });

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw.toString());

            if (data.txType === 'create' && data.mint && data.name) {
                // New token created
                onNewToken(data);
            } else if (data.txType === 'buy' && data.mint) {
                // Trade event on a token we're watching
                onTradeEvent(data);
            }
        } catch (e) { /* malformed message */ }
    });

    ws.on('error', (e) => console.log(chalk.gray(`[PUMPSNIPER #${id}]: WS error: ${e.message}`)));

    ws.on('close', () => {
        currentWs = null;
        console.log(chalk.yellow(`[PUMPSNIPER #${id}]: 🔁 WS dropped. Reconnecting in 2s...`));
        setTimeout(connectPumpFun, 2000); // fast reconnect
    });
}

// ── Stale tracker cleanup (runs every 60s) ───────────────────────
setInterval(() => {
    const now = Date.now();
    const cutoff = DECISION_WINDOW_MS + 10000;
    for (const [mint, tracker] of liveTokens.entries()) {
        if (now - tracker.firstSeen > cutoff) {
            liveTokens.delete(mint);
        }
    }
}, 60000);

// ── IPC ──────────────────────────────────────────────────────────
process.on('message', (msg) => {
    if (msg.type === 'PUMPSNIPER_STATUS' && process.send) {
        const watching = liveTokens.size;
        const positions = loadTrades().filter(t => t.source === 'PUMPSNIPER').length;
        process.send({
            type: 'LOG', level: 'INFO',
            msg: `PUMPSNIPER V2: Watching ${watching} live launches | ${positions} active positions | ${cooldowns.size} cooldowns | Mode: VISCERAL`
        });
    }
});

// Stats heartbeat — log activity every 5 minutes
setInterval(() => {
    const positions = loadTrades().filter(t => t.source === 'PUMPSNIPER').length;
    console.log(chalk.magenta(
        `[PUMPSNIPER #${id}]: 📊 HEARTBEAT | Tracking: ${liveTokens.size} | Positions: ${positions}/${MAX_POSITIONS} | Cooldowns: ${cooldowns.size} | Buy: ${BUY_AMOUNT_SOL} SOL`
    ));
}, 300000);

connectPumpFun();
