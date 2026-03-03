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
const MevBundler = require('./mev_bundler');
const { GlobalMemory } = require('./brain');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.magenta.bold(`[PUMPSNIPER #${id}]: 🎯 Pump.fun Launch Sniper V2 — VISCERAL MODE`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const TRADES_FILE = path.resolve(__dirname, '../missions/active_trades.json');
let wallet = null;

// ── CAPITAL PRESERVATION CONFIG (~1 SOL wallet) ─────────────────
// BET SIZE IS NOW DYNAMICALLY CALCULATED PER TRADE TO DEFEND CAPITAL
const MIN_RESERVE_SOL = 0.005;      // [REDUCED] Always keep 0.005 SOL for gas + exits
const MAX_POSITIONS = 4;           // 4 max pump positions (0.12 SOL max exposure)
const DECISION_WINDOW_MS = 12000;  // 12 seconds to prove real crowd momentum
const MIN_BUYS_TO_ACT = 15;        // Need 15 buys to trigger. Reject isolated spoofing.
const MIN_SOL_VOLUME = 4.0;        // Need 4.0 SOL of volume to trigger. Reject pennies.
const COOLDOWN_MS = 5 * 60 * 1000; // 5min cooldown per token after action
const cooldowns = new Set();

// tokenMint -> { buys: N, solVolume: N, creatorBought: bool, firstSeen: timestamp, lastData: {} }
const liveTokens = new Map();

// ML Pending Requests
const pendingPredictions = new Map();

// ── Neural Configuration ──
let neuralConfig = {
    rug_threshold: 0.70,
    kelly_fraction: 0.20,
    min_bet: 0.005,
    max_bet: 0.05
};

function loadNeuralConfig() {
    try {
        const configPath = path.join(__dirname, 'neural_config.json');
        if (fs.existsSync(configPath)) {
            const fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (fullConfig.pumpsniper) {
                neuralConfig = { ...neuralConfig, ...fullConfig.pumpsniper };
            }
        }
    } catch (e) {
        console.log(chalk.gray(`[PUMPSNIPER #${id}]: Using default neural config.`));
    }
}
loadNeuralConfig();
setInterval(loadNeuralConfig, 30000); // Reload every 30s for adaptivity

// ── Jupiter Swap ────────────────────────────────────────────────
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        const keyStr = process.env.SOLANA_PRIVATE_KEY.trim();
        const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
        wallet = Keypair.fromSecretKey(keyBytes);
        console.log(chalk.magenta(`[PUMPSNIPER #${id}]: 🔑 Wallet loaded: ${wallet.publicKey.toString().slice(0, 8)}...`));
    } else {
        throw new Error('Missing SOLANA_PRIVATE_KEY');
    }
} catch (e) {
    console.log(chalk.red(`[PUMPSNIPER #${id}]: ❌ No valid SOLANA_PRIVATE_KEY — running in monitoring mode only.`));
}

function loadTrades() {
    try { return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8')); } catch { return []; }
}
function saveTrades(t) { fs.writeFileSync(TRADES_FILE, JSON.stringify(t, null, 2)); }

// Initialize MEV Protection (Graceful)
let bundler = null;
try {
    bundler = new MevBundler(wallet, connection);
} catch (e) {
    console.log(chalk.yellow(`[PUMPSNIPER #${id}]: MEV Bundler failed to load. Running unprotected.`));
}

async function getDynamicPriorityFee() {
    try {
        const fees = await connection.getRecentPrioritizationFees();
        if (!fees || fees.length === 0) return 100000;
        fees.sort((a, b) => b.prioritizationFee - a.prioritizationFee);
        const topFees = fees.slice(0, 20);
        const avgTopFee = Math.floor(topFees.reduce((sum, f) => sum + f.prioritizationFee, 0) / topFees.length);
        const targetFee = Math.floor(avgTopFee * 1.2);
        return Math.min(Math.max(targetFee, 50000), 5000000); // Max 0.005 SOL
    } catch (e) {
        return 100000;
    }
}

async function executeJupiterSwap(inputMint, outputMint, lamports) {
    if (!wallet || !wallet.publicKey) return null;
    try {
        const JUPITER_QUOTE_APIS = [
            'https://lite-api.jup.ag/swap/v1/quote'
        ];

        const JUPITER_SWAP_APIS = [
            'https://lite-api.jup.ag/swap/v1/swap'
        ];

        const qParams = { inputMint, outputMint, amount: lamports, slippageBps: 500 };
        let qRes = null;
        let lastErr = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                qRes = await axios.get('https://lite-api.jup.ag/swap/v1/quote', { params: qParams, timeout: 5000 });
                if (qRes && qRes.data) break;
            } catch (e) {
                lastErr = e.response?.status === 429 ? '429 Rate Limit' : e.message;
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.gray(`[PUMPSNIPER]: ⏳ Quote 429 Rate Limit... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 800 * attempt + Math.random() * 200));
                    continue;
                }
                console.log(chalk.gray(`[PUMPSNIPER]: Quote API failed: ${lastErr}`));
                break;
            }
        }

        if (!qRes || !qRes.data || !qRes.data.outAmount) throw new Error(`Quote failed: ${lastErr}`);

        const priorityFee = await getDynamicPriorityFee();
        const swapPayload = {
            quoteResponse: qRes.data,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: priorityFee,
        };

        let swapRes = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                swapRes = await axios.post('https://lite-api.jup.ag/swap/v1/swap', swapPayload, { timeout: 8000 });
                if (swapRes && swapRes.data) break;
            } catch (e) {
                lastErr = e.response?.status === 429 ? '429 Rate Limit' : (e.response?.data?.error || e.message);
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.gray(`[PUMPSNIPER]: ⏳ Swap 429 Rate Limit... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 800 * attempt + Math.random() * 200));
                    continue;
                }
                console.log(chalk.gray(`[PUMPSNIPER]: Swap API failed: ${lastErr}`));
                break;
            }
        }

        if (!swapRes || !swapRes.data) throw new Error(`Swap failed: ${lastErr}`);

        const { swapTransaction } = swapRes.data;
        const txBuf = Buffer.from(swapTransaction, 'base64');
        const { VersionedTransaction } = require('@solana/web3.js');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        let sig = null;
        let isMevProtected = false;

        if (bundler && bundler.client) {
            console.log(chalk.magenta.bold(`[PUMPSNIPER #${id}]: 🛡️ ROUTING VIA JITO MEV BUNDLER...`));
            const bundleId = await bundler.sendBundle(tx, priorityFee);
            if (bundleId) {
                console.log(chalk.green.bold(`[PUMPSNIPER #${id}]: 🪐 Jito Bundle Sent! ID: ${bundleId}`));
                isMevProtected = true;
                sig = bs58.encode(tx.signatures[0]);
            }
        }

        if (!isMevProtected) {
            sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
            console.log(chalk.magenta.bold(`[PUMPSNIPER #${id}]: ⚡ SWAP FIRED (Public Mempool): ${sig}`));
        }

        return { success: true, outAmount: quote.outAmount, sig, mevProtected: isMevProtected };
    } catch (e) {
        console.log(chalk.red(`[PUMPSNIPER #${id}]: Jupiter error: ${e.message}`));
        if (process.send) process.send({ type: 'LOG', level: 'ERROR', msg: `PumpSniper Execution Failed: ${e.message}` });
        process.exit(1); // Trigger Jules
    }
}

// ── Kelly Criterion Sizing ──────────────────────────────────────
function calculateKellyBet(balanceSol, rugProb) {
    if (balanceSol < 0.05) return 0;

    // Parameters for Solana Shitcoins
    const p = 1.0 - rugProb; // ML win probability
    const b = 2.0;           // Expected profit ratio (Avg 2x flip)
    const q = 1.0 - p;

    // Kelly Formula: f = (b*p - q) / b
    let f = (b * p - q) / b;

    // Apply Fractional Kelly to handle volatility/errors
    const fraction = neuralConfig.kelly_fraction;
    let kellyBet = balanceSol * f * fraction;

    // Safety Rails
    const ceiling = neuralConfig.max_bet;
    const floor = neuralConfig.min_bet;
    const exposureLimit = balanceSol * 0.05; // 5% max exposure

    let finalBet = Math.min(kellyBet, ceiling, exposureLimit);
    finalBet = Math.max(finalBet, floor);

    return parseFloat(finalBet.toFixed(3));
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

    // ── DEEPSENTINEL NEURAL CHECK ──
    const elapsed = Date.now() - momentum.firstSeen;
    const buyPressure = (momentum.buys / Math.max(elapsed, 1)) * 1000 * 10;
    const volatility = (momentum.solVolume / Math.max(momentum.buys, 1)) * 5;
    const score = momentum.creatorBought ? 85 : 45;

    // Extract bonding stats from the last trade data received
    const lastData = momentum.lastData || {};
    const bonding = lastData.vSolInBondingCurve ? (lastData.vSolInBondingCurve / 85e9) * 100 : 10;
    const top10 = 50; // fallback without holder API
    const mcapLog = lastData.marketCapSol ? Math.log1p(lastData.marketCapSol * 240) : Math.log1p(momentum.solVolume * 1500);

    const features = [
        Math.min(buyPressure, 100),
        Math.min(volatility, 100),
        score,
        Math.min(bonding, 100),
        top10,
        mcapLog
    ];

    console.log(chalk.cyan(`[PUMPSNIPER #${id}]: 🧠 Consulting DeepSentinel Neural Engine...`));

    const rugProb = await new Promise((resolve) => {
        const reqId = require('crypto').randomUUID();
        const timeout = setTimeout(() => {
            pendingPredictions.delete(reqId);
            resolve(0.5); // proceed on timeout fallback
        }, 5000);

        pendingPredictions.set(reqId, (res) => {
            clearTimeout(timeout);
            resolve(res.rug_probability || 0.5);
        });

        if (process.send) {
            process.send({ type: 'ML_REQUEST', model: 'pumpfun', features, req_id: reqId });
        } else {
            resolve(0.5);
        }
    });

    if (rugProb > neuralConfig.rug_threshold) {
        console.log(chalk.red.bold(`[PUMPSNIPER #${id}]: 💀 NEURAL ALERT: Rug Probability ${(rugProb * 100).toFixed(2)}% | ABORTING TRADE.`));
        if (process.send) process.send({ type: 'LOG', level: 'ERROR', msg: `🧠 DeepSentinel blocked trade on ${name} (${(rugProb * 100).toFixed(1)}% rug risk)` });
        GlobalMemory.addMemory('PUMPSNIPER', `[PREDICTION_BLOCKED] Aborted trade on ${name} (${tokenMint.slice(0, 8)}...) due to high rug risk: ${(rugProb * 100).toFixed(1)}%. Threshold: ${neuralConfig.rug_threshold}`, 5);
        return;
    } else {
        console.log(chalk.green(`[PUMPSNIPER #${id}]: ✅ Neural Passed: ${(rugProb * 100).toFixed(1)}% risk score. Threshold: ${neuralConfig.rug_threshold}`));
    }

    // ── DYNAMIC KELLY-SCALING BET ──
    const balanceSol = walletBalance / 1e9;
    const dynamicBetSol = calculateKellyBet(balanceSol, rugProb);

    if (dynamicBetSol <= 0) {
        console.log(chalk.red.bold(`[PUMPSNIPER #${id}]: 💀 CAPITAL GUARD: Kelly sizing suggests zero bet. HALTING.`));
        return;
    }

    console.log(chalk.magenta.bold(
        `[PUMPSNIPER #${id}]: 🚀🚀🚀 SNIPING: ${name} (${tokenMint.slice(0, 8)}...) ` +
        `| KELLY BET: ${dynamicBetSol} SOL [Conf: ${((1 - rugProb) * 100).toFixed(1)}%] | ${momentum.buys} buys | ${momentum.solVolume.toFixed(2)} SOL vol`
    ));

    const lamports = Math.floor(dynamicBetSol * 1e9);
    const result = await executeJupiterSwap(WSOL_MINT, tokenMint, lamports);

    if (result?.success) {
        const outAmt = Number(result.outAmount);
        const uiAmt = outAmt / 1e6;
        const entry = uiAmt > 0 ? dynamicBetSol / uiAmt : 0;
        const trades = loadTrades();
        trades.push({
            mint: tokenMint,
            entryPrice: entry,
            entryPriceUnit: 'ui',
            amount: outAmt,
            uiAmount: uiAmt,
            entrySol: dynamicBetSol,
            timestamp: Date.now(),
            maxHoldUntil: Date.now() + (90 * 60 * 1000), // 90min max hold (fast flips)
            moonbagSecured: false,
            source: 'PUMPSNIPER',
            tokenName: name,
            momentum: { buys: momentum.buys, solVolume: parseFloat(momentum.solVolume.toFixed(3)), creatorBought: momentum.creatorBought },
            prediction: { rug_probability: rugProb, threshold: neuralConfig.rug_threshold }
        });
        saveTrades(trades);

        GlobalMemory.addMemory('PUMPSNIPER', `[TRADE_ENTRY] Sniped ${name} (${tokenMint.slice(0, 8)}...) Entry: ${dynamicBetSol} SOL. Risk: ${(rugProb * 100).toFixed(1)}%. Threshold: ${neuralConfig.rug_threshold}`, 7);

        if (process.send) {
            process.send({ type: 'TRADE_EXECUTED', mint: tokenMint, amount: dynamicBetSol, source: 'PUMPSNIPER' });
            process.send({
                type: 'LOG', level: 'MONEY',
                msg: `🎯 PUMP SNIPE 🎯 ${name} (${tokenMint.slice(0, 8)}...) | ${momentum.buys} buys in ${((Date.now() - momentum.firstSeen) / 1000).toFixed(0)}s | ${momentum.solVolume.toFixed(2)} SOL vol | Entry: ${dynamicBetSol} SOL`
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
    tracker.lastData = data; // Save latest bonding curve state for ML features

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

    // console.log(chalk.magenta(`[PUMPSNIPER #${id}]: 🆕 NEW LAUNCH: ${name || symbol} ($${symbol}) — ${mint.slice(0, 8)}... — TRACKING`));

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
            // console.log(chalk.gray(
            //     `[PUMPSNIPER #${id}]: ❌ ${tracker.name} — ${tracker.buys} buys, ${tracker.solVolume.toFixed(2)} SOL vol in ${(DECISION_WINDOW_MS / 1000)}s. Dead on arrival.`
            // ));
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
    } else if (msg.type === 'ML_RESPONSE') {
        const callback = pendingPredictions.get(msg.data.req_id);
        if (callback) {
            callback(msg.data);
            pendingPredictions.delete(msg.data.req_id);
        }
    }
});

// Stats heartbeat — log activity every 5 minutes
setInterval(() => {
    const positions = loadTrades().filter(t => t.source === 'PUMPSNIPER').length;
    console.log(chalk.magenta(
        `[PUMPSNIPER #${id}]: 📊 HEARTBEAT | Tracking: ${liveTokens.size} | Positions: ${positions}/${MAX_POSITIONS} | Cooldowns: ${cooldowns.size} | Buy: Dynamic`
    ));
}, 300000);

connectPumpFun();

// ── Adaptive Reflection: Westworld-style self-optimization ─────
// Every hour, the agent reviews its own memories and tunes its neural levels.
setInterval(async () => {
    console.log(chalk.magenta(`[PUMPSNIPER #${id}]: 🧠 INITIATING DEEP REFLECTION...`));
    const reflection = await GlobalMemory.reflect('PUMPSNIPER');
    if (reflection) {
        console.log(chalk.cyan.bold(`[PUMPSNIPER #${id}]: 💡 EPIPHANY: ${reflection.key_insight}`));
        console.log(chalk.cyan(`   → Rule: ${reflection.actionable_heuristic}`));
    }
}, 1 * 60 * 60 * 1000); // 1 hour reflection loop
