// don/sniper.js - THE MAINNET SNIPER V4 (PUMP.FUN + JUPITER/RAYDIUM AGGREGATION)
// Capabilities:
// 1. Shadow Protocol: Tracks whales and copies trades.
// 2. MEV Bundler: Sends transactions via Jito to avoid sandwiches.
// 3. Pump.fun Native: Direct bonding curve interaction.
// 4. Jupiter Aggregator: Swaps on Raydium/Orca/Meteora for migrated tokens.

const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, ComputeBudgetProgram, sendAndConfirmTransaction, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { GlobalMemory } = require('./brain');
const MevBundler = require('./mev_bundler');
const axios = require('axios');
const bs58 = require('bs58');
require('dotenv').config();

const id = process.argv[2] || 'Sniper';
const RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY_HEX = process.env.SOLANA_PRIVATE_KEY;
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Pump.fun Constants
const GLOBAL = new PublicKey('4wTV9uUv8asv38pW9CDN97v7A7qgnuEqj7A8UqQv6J4u');
const FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPaxN9zKn1Bv9kH8RNoVyc6zL4sAovG5N');
const EVENT_AUTHORITY = new PublicKey('Ce6LsUC7BBSZzS6885QsS6r3T68WfW9Jm8WfA9Jm8WfA');
const BONDING_CURVE_SEED = "bonding-curve";

if (!RPC_URL || !PRIVATE_KEY_HEX) {
    console.log(chalk.red(`[SNIPER #${id}]: ERROR - Missing Mainnet Assets.`));
    process.exit(1);
}

let wallet = null;
try {
    const keyStr = PRIVATE_KEY_HEX.trim();
    // Support both Hex (length > 88) and Base58
    const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
    wallet = Keypair.fromSecretKey(keyBytes);
    console.log(chalk.green(`[SNIPER #${id}]: 🔑 Wallet loaded successfully. Address: ${wallet.publicKey.toBase58()}`));
} catch (e) {
    console.log(chalk.red(`[SNIPER #${id}]: ❌ CRITICAL - Keypair failed to load: ${e.message}`));
    // Do not exit, let it run in simulation/monitoring mode if possible, 
    // but guards will prevent transactions.
}

// ── Dynamic Risk Engine (Tuned for Profitability) ──
let riskParams = {
    slippage: 0.05,      // [TIGHTENED] Max 10% slippage. Reject bad entries. Walk away if it's too volatile.
    stopLoss: -15,       // [WIDENED] Let the trade breathe. meme coins have 15% wicks. Cut at -25%.
    moonbagTarget: 25,   // Take initial profit at 35%
    maxProfitDump: 75   // Dump everything at 100% — lock in 2x gains
};

// ── Spend Controls (Safety Gate) ─────────────────────────────
// Prevents runaway buying when whale signals fire in rapid succession
const recentBuys = new Map(); // mint -> timestamp of last buy
const pendingPredictions = new Map();

// ── Neural Configuration ──
let neuralConfig = {
    rug_threshold: 0.60,
    kelly_fraction: 0.10,
    min_bet: 0.01,
    max_bet: 0.1
};

function loadNeuralConfig() {
    try {
        const configPath = path.join(__dirname, 'neural_config.json');
        if (fs.existsSync(configPath)) {
            const fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (fullConfig.sniper) {
                neuralConfig = { ...neuralConfig, ...fullConfig.sniper };
            }
        }
    } catch (e) {
        console.log(chalk.gray(`[SNIPER #${id}]: Using default neural config.`));
    }
}
loadNeuralConfig();
setInterval(loadNeuralConfig, 30000); // Reload every 30s // reqId -> callback
const TOKEN_COOLDOWN_MS = 10 * 60 * 1000;  // 10 min per token (quicker re-entry)
const MIN_BALANCE_GUARD = 0.002;             // [REDUCED] Keep at least 0.002 SOL for gas + emergency exits

async function getPumpMetadata(mintStr) {
    try {
        const res = await axios.get(`https://frontend-api.pump.fun/coins/${mintStr}`, { timeout: 5000 });
        if (res.data) return {
            creator: res.data.creator || "UNKNOWN_CREATOR",
            name: res.data.name || "",
            description: res.data.description || ""
        };
    } catch (e) { }
    return { creator: "UNKNOWN_CREATOR", name: "", description: "" };
}

// ── SEMANTIC SIMILARITY HELPERS ──
function getTrigrams(str) {
    const s = '  ' + (str || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '  ';
    const trigrams = new Set();
    for (let i = 0; i < s.length - 2; i++) {
        trigrams.add(s.substring(i, i + 3));
    }
    return Array.from(trigrams);
}

function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const t1 = getTrigrams(str1);
    const t2 = getTrigrams(str2);
    if (t1.length === 0 || t2.length === 0) return 0;
    const intersection = t1.filter(x => t2.includes(x)).length;
    const union = new Set([...t1, ...t2]).size;
    return (intersection / union);
}

function canBuy(mintStr) {

    // Position limit — hard stop
    const trades = loadTrades();
    const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || 6);
    if (trades.length >= MAX_CONCURRENT) {
        console.log(chalk.yellow(`[SNIPER #${id}]: 🛑 At position limit (${trades.length}/${MAX_CONCURRENT}). No more buys.`));
        return false;
    }

    // Dedup — never buy a token we already hold
    if (mintStr !== '__scan_gate__' && trades.some(t => t.mint === mintStr)) {
        console.log(chalk.yellow(`[SNIPER #${id}]: ⏹️ Already holding ${mintStr.substring(0, 8)}... Skipping duplicate.`));
        return false;
    }

    // Per-token cooldown (30 min — prevents rapid re-entry after sells)
    const lastBuy = recentBuys.get(mintStr);
    if (lastBuy && Date.now() - lastBuy < TOKEN_COOLDOWN_MS) {
        console.log(chalk.yellow(`[SNIPER #${id}]: ⏳ Token ${mintStr.substring(0, 8)}... on cooldown. Skipping.`));
        return false;
    }

    return true;
}

// ── Connection Setup (HTTP-only, no WebSocket spam) ──
const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

// Initialize MEV Protection (Graceful)
let bundler = null;
try {
    if (wallet && wallet.publicKey) {
        bundler = new MevBundler(wallet, connection);
    } else {
        console.log(chalk.red(`[SNIPER #${id}]: Wallet invalid. MEV Bundling DISABLED.`));
    }
} catch (e) {
    console.log(chalk.yellow(`[SNIPER #${id}]: MEV Bundler failed to load: ${e.message}`));
}

// ============================================================
// DYNAMIC PRIORITY FEES
// ============================================================
async function getDynamicPriorityFee() {
    try {
        const fees = await connection.getRecentPrioritizationFees();
        if (!fees || fees.length === 0) return 100000;

        fees.sort((a, b) => b.prioritizationFee - a.prioritizationFee);
        const topFees = fees.slice(0, 20);
        const avgTopFee = Math.floor(topFees.reduce((sum, f) => sum + f.prioritizationFee, 0) / topFees.length);

        // ── Dynamic Multiplier from Jito Bundle History ──
        let multiplier = 1.2;
        try {
            const histFile = path.join(__dirname, '../missions/bundle_history.json');
            if (fs.existsSync(histFile)) {
                let history = JSON.parse(fs.readFileSync(histFile, 'utf8'));
                // Take last 50 bundles
                history = history.slice(-50);
                if (history.length > 5) {
                    const successes = history.filter(h => h.success).length;
                    const rollingSuccessRate = successes / history.length;

                    if (rollingSuccessRate < 0.70) multiplier = 1.3;
                    else if (rollingSuccessRate > 0.90) multiplier = 1.05;
                }
            }
        } catch (e) {
            // fallback to 1.2
        }

        const targetFee = Math.floor(avgTopFee * multiplier);
        return Math.min(Math.max(targetFee, 50000), 5000000);
    } catch (e) {
        return 100000;
    }
}

// ============================================================
// JUPITER AGGREGATOR (RAYDIUM/ORCA FALLBACK)
// ============================================================
async function executeJupiterSwap(inputMint, outputMint, amount, slippageBps = 1000) {
    if (!wallet || !wallet.publicKey) {
        throw new Error("Wallet not initialized. Cannot swap.");
    }
    let quoteData = null;
    let swapTransaction = null;
    try {
        const amountLamports = parseInt(amount);
        const priorityFee = await getDynamicPriorityFee();
        if (inputMint === WSOL_MINT.toString()) {
            const balance = await connection.getBalance(wallet.publicKey);
            if (balance < amountLamports + priorityFee) {
                throw new Error(`Insufficient SOL balance. Have ${(balance / 1e9).toFixed(6)}, need ${((amountLamports + priorityFee) / 1e9).toFixed(6)}`);
            }
        }

        console.log(chalk.blue(`[SNIPER #${id}]: 🪐 Requesting Jupiter Quote...`));
        // 1. Get Quote with multi-TLD failover
        const JUPITER_QUOTE_APIS = [
            'https://lite-api.jup.ag/swap/v1/quote'
        ];

        let qRes = null;
        let lastErr = null;
        const qParams = { inputMint: inputMint, outputMint: outputMint, amount: amountLamports, slippageBps: slippageBps };

        for (const apiUrl of JUPITER_QUOTE_APIS) {
            if (qRes && qRes.data) break;

            for (let attempt = 1; attempt <= 4; attempt++) {
                try {
                    qRes = await axios.get(apiUrl, { params: qParams, timeout: 5000 });
                    if (qRes && qRes.data) break;
                } catch (e) {
                    lastErr = e.response?.status === 429 ? '429 Rate Limit' : e.message;
                    if (e.response?.status === 429 && attempt < 4) {
                        const backoff = (attempt ** 2) * 1000 + Math.random() * 500; // Exponential backoff: 1s, 4s, 9s
                        console.log(chalk.yellow(`[SNIPER]: ⏳ Quote 429 Rate Limit on ${apiUrl}... retrying in ${(backoff / 1000).toFixed(1)}s (${attempt}/4)`));
                        await new Promise(r => setTimeout(r, backoff));
                        continue;
                    }
                    console.log(chalk.yellow(`[SNIPER]: Quote API failed on ${apiUrl}: ${lastErr}`));
                    break; // Move to next API URL
                }
            }
        }

        if (!qRes || !qRes.data || !qRes.data.outAmount) throw new Error(`Quote failed on all endpoints: ${lastErr}`);

        quoteData = qRes.data;

        console.log(chalk.blue(`[SNIPER #${id}]: 🪐 Jupiter Quote: ${quoteData.outAmount} out via ${quoteData.routePlan.map(r => r.swapInfo.label).join('->')}`));

        // 2. Get Serialized Transaction with Dynamic Fee
        const priorityFeeSol = (priorityFee / 1e9).toFixed(6);
        console.log(chalk.hex('#FF6600')(`[SNIPER #${id}]: 🏎️ Priority Fee Set: ${priorityFeeSol} SOL`));

        // Get Swap Transaction with failover
        const JUPITER_SWAP_APIS = [
            'https://lite-api.jup.ag/swap/v1/swap'
        ];

        let swapRes = null;
        const swapPayload = {
            quoteResponse: quoteData,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: priorityFee
        };

        for (const apiUrl of JUPITER_SWAP_APIS) {
            if (swapRes && swapRes.data) break;

            for (let attempt = 1; attempt <= 4; attempt++) {
                try {
                    swapRes = await axios.post(apiUrl, swapPayload, { timeout: 8000 });
                    if (swapRes && swapRes.data) break;
                } catch (e) {
                    lastErr = e.response?.status === 429 ? '429 Rate Limit' : (e.response?.data?.error || e.message);
                    if (e.response?.status === 429 && attempt < 4) {
                        const backoff = (attempt ** 2) * 1000 + Math.random() * 500;
                        console.log(chalk.yellow(`[SNIPER]: ⏳ Swap 429 Rate Limit on ${apiUrl}... retrying in ${(backoff / 1000).toFixed(1)}s (${attempt}/4)`));
                        await new Promise(r => setTimeout(r, backoff));
                        continue;
                    }
                    console.log(chalk.yellow(`[SNIPER]: Swap API failed on ${apiUrl}: ${lastErr}`));
                    break;
                }
            }
        }

        if (!swapRes || !swapRes.data) throw new Error(`Swap construction failed: ${lastErr}`);
        swapTransaction = swapRes.data.swapTransaction;

        // 3. Deserialize and Sign
        const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        transaction.sign([wallet]);

        // 4. Send (Prefer Bundler if available, else RPC)
        let sig = null;
        let isMevProtected = false;

        if (bundler) {
            console.log(chalk.magenta.bold(`[SNIPER #${id}]: 🛡️ ROUTING VIA JITO MEV BUNDLER...`));
            const bundleId = await bundler.sendBundle(transaction, priorityFee);
            if (bundleId) {
                console.log(chalk.green.bold(`[SNIPER #${id}]: 🪐 Jito Bundle Sent! ID: ${bundleId}`));
                // Jito automatically signs the tx. We wait to see if it lands on-chain.
                isMevProtected = true;

                // Extract signature from the transaction for tracking
                sig = bs58.encode(transaction.signatures[0]);
                if (process.send) process.send({ type: 'TELEMETRY_UPDATE', metric: 'jito_bundles_sent', inc: 1, val: priorityFee });

                // Poll actual status instead of blindly trusting
                console.log(chalk.gray(`[SNIPER #${id}]: ⏳ Polling Jito Bundle Status...`));
                const bundleStatus = await bundler.pollBundleStatus(bundleId);
                if (bundleStatus.success) {
                    console.log(chalk.green.bold(`[SNIPER #${id}]: ✅ BUNDLE LANDED (Slot: ${bundleStatus.landedSlot})`));
                    if (process.send) process.send({ type: 'BUNDLE_LANDED', success: true, tip: priorityFee, reason: null });
                } else if (bundleStatus.reason === 'failed' || bundleStatus.reason === 'timeout') {
                    console.log(chalk.red(`[SNIPER #${id}]: ❌ BUNDLE ${bundleStatus.reason.toUpperCase()}`));
                    if (process.send) process.send({ type: 'BUNDLE_LANDED', success: false, tip: priorityFee, reason: bundleStatus.reason });
                    // If it failed in bundle, it might not land, but we still check the mempool just in case Jito delayed status
                }
            } else {
                console.log(chalk.yellow(`[SNIPER #${id}]: ⚠️ Jito Bundle failed to construct. Falling back to public mempool...`));
            }
        }

        // Fallback to standard RPC if Jito isn't active or failed
        if (!isMevProtected) {
            const latestBh = await connection.getLatestBlockhash('confirmed');
            sig = await connection.sendTransaction(transaction, { skipPreflight: true, maxRetries: 2 });
            console.log(chalk.green.bold(`[SNIPER #${id}]: 🪐 Jupiter Swap Sent (Public Mempool): ${sig}`));
        }

        // Confirm via HTTP polling (no WebSocket signatureSubscribe needed)
        let confirmed = false;
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await connection.getSignatureStatuses([sig]);
            const cs = status?.value?.[0]?.confirmationStatus;
            if (cs === 'confirmed' || cs === 'finalized') {
                confirmed = true;
                if (status.value[0].err) throw new Error(`TX Failed: ${JSON.stringify(status.value[0].err)}`);
                break;
            }
        }
        if (!confirmed) throw new Error('Confirmation timeout (30s)');

        return { success: true, sig, outAmount: quoteData.outAmount, mevProtected: isMevProtected };

    } catch (e) {
        let errorMsg = e.response?.data?.error || e.response?.data?.msg || e.message;
        if (e.code === 'ENOTFOUND') errorMsg = `DNS failure: ${e.hostname || 'Jupiter API'} unreachable`;
        else if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') errorMsg = `Network timeout reaching Jupiter API`;
        console.error(chalk.red(`[SNIPER #${id}]: Jupiter Swap Failed: ${errorMsg}`));
        if (process.send) process.send({ type: 'LOG', level: 'ERROR', msg: `Sniper Jupiter Failed: ${errorMsg}` });
        return { success: false, error: errorMsg };
    }
}

async function fetchCurrentPrice(mint, amount, curve = null) {
    // 1. Try Jupiter lite-api (LIVE — v6 is dead)
    try {
        const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${mint}&outputMint=${WSOL_MINT.toString()}&amount=${amount}&slippageBps=100`;
        const res = await axios.get(quoteUrl, { timeout: 8000 });
        if (res.data && res.data.outAmount) {
            const solValue = Number(res.data.outAmount) / 1e9;
            const decimals = 6; // Standard pump.fun decimal count
            const uiAmount = Number(amount) / Math.pow(10, decimals);
            const currentPrice = uiAmount > 0 ? (solValue / uiAmount) : 0;
            return { solValue, currentPrice, source: 'JUPITER' };
        }
    } catch (e) {
        // Jupiter failed, try DexScreener
    }

    // 2. Try DexScreener (Reliable fallback)
    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 8000 });
        if (res.data && res.data.pairs && res.data.pairs.length > 0) {
            const pair = res.data.pairs.find(p => p.quoteToken.address === WSOL_MINT.toString()) || res.data.pairs[0];
            const priceInSol = parseFloat(pair.priceNative); // Price in SOL per UI token

            // Fix: Standardize to UI units (6 decimals for Pump.fun)
            const decimals = 6;
            const uiAmount = Number(amount) / Math.pow(10, decimals);
            const solValue = priceInSol * uiAmount;

            return { solValue, currentPrice: priceInSol, source: 'DEXSCREENER' };
        }
    } catch (e) {
        // DexScreener failed (not indexed yet)
    }

    // 3. Try On-Chain Bonding Curve Calculation (Ultimate Fallback for brand new tokens)
    if (curve && !curve.complete) {
        try {
            // Pump.fun curve math: virtualSolReserves / virtualTokenReserves
            const virtualSol = Number(curve.virtualSolReserves) / 1e9;
            const virtualTokens = Number(curve.virtualTokenReserves) / 1e6; // 6 decimals

            if (virtualTokens > 0) {
                const priceInSol = virtualSol / virtualTokens;
                const uiAmount = Number(amount) / 1e6;
                const solValue = priceInSol * uiAmount;

                return { solValue, currentPrice: priceInSol, source: 'BONDING_CURVE' };
            }
        } catch (e) {
            console.error(chalk.red(`[SNIPER]: Curve price calc failed for ${mint}: ${e.message}`));
        }
    }

    console.error(chalk.red(`[SNIPER]: All price fetches failed for ${mint}`));
    return null;
}

// ============================================================
// PUMP.FUN NATIVE LOGIC
// ============================================================

function getBondingCurvePDA(mint) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
        PUMP_FUN_PROGRAM_ID
    )[0];
}

async function getBondingCurveAccount(bondingCurvePDA) {
    try {
        const account = await connection.getAccountInfo(bondingCurvePDA);
        if (!account || !account.data) return null; // Curve might be closed/migrated

        const buffer = account.data;
        if (buffer.length < 41) return null;

        const discriminator = buffer.readBigUInt64LE(0);
        const virtualTokenReserves = buffer.readBigUInt64LE(8);
        const virtualSolReserves = buffer.readBigUInt64LE(16);
        const realTokenReserves = buffer.readBigUInt64LE(24);
        const realSolReserves = buffer.readBigUInt64LE(32);
        const tokenTotalSupply = buffer.readBigUInt64LE(40);
        const complete = buffer[48] !== 0;

        return {
            discriminator,
            virtualTokenReserves,
            virtualSolReserves,
            realTokenReserves,
            realSolReserves,
            tokenTotalSupply,
            complete
        };
    } catch (e) {
        return null;
    }
}

function calculateBuyQuote(curve, solAmount) {
    const solAmountLamports = BigInt(Math.floor(solAmount * 1e9));
    const vSol = curve.virtualSolReserves;
    const vToken = curve.virtualTokenReserves;
    const k = vSol * vToken;
    const newVSol = vSol + solAmountLamports;
    const newVToken = k / newVSol;
    const tokenAmount = vToken - newVToken;
    return { tokenAmount, solAmount: solAmountLamports };
}

function calculateSellQuote(curve, tokenAmount) {
    const vSol = curve.virtualSolReserves;
    const vToken = curve.virtualTokenReserves;
    const k = vSol * vToken;
    const newVToken = vToken + BigInt(tokenAmount);
    const newVSol = k / newVToken;
    const solOut = vSol - newVSol;
    const minSolOut = solOut * 90n / 100n; // 10% slippage
    return { solAmount: solOut, minSolAmount: minSolOut };
}

// ============================================================
// CORE BUY LOGIC (HYBRID PUMP.FUN + JUPITER)
// ============================================================

function calculateKellyBet(balanceSol, rugProb) {
    if (balanceSol < 0.05) return 0;    // Parameters for Solana Shitcoins
    const p = 1.0 - rugProb; // ML win probability
    const b = 2.0;           // Expected profit ratio
    const q = 1.0 - p;

    // Kelly Formula: f = (b*p - q) / b
    let f = (b * p - q) / b;

    // If Kelly says don't bet (negative edge), respect it — return 0
    if (f <= 0) return 0;

    // Apply Fractional Kelly to handle volatility/errors
    const fraction = neuralConfig.kelly_fraction;
    let kellyBet = balanceSol * f * fraction;

    // Safety Rails — but never RAISE a bet above what Kelly recommends
    const ceiling = neuralConfig.max_bet;
    const floor = neuralConfig.min_bet;
    const exposureLimit = balanceSol * 0.05; // 5% max exposure

    let finalBet = Math.min(kellyBet, ceiling, exposureLimit);

    // Only apply the minimum if Kelly was positive — don't force a bet
    if (finalBet < floor) finalBet = floor;
    // But NEVER exceed the exposure limit
    finalBet = Math.min(finalBet, exposureLimit);

    return parseFloat(finalBet.toFixed(3));
}

async function buyToken(mint, bondingCurve, associatedBondingCurve) {
    if (!wallet || !wallet.publicKey) {
        console.log(chalk.red(`[SNIPER #${id}]: Aborting buy — Wallet not loaded.`));
        return;
    }
    try {
        const balance = await connection.getBalance(wallet.publicKey);
        const mintStr = mint.toString();

        // ── Safety Gate 1: Per-token cooldown + daily cap ──
        if (!canBuy(mintStr)) return;

        // ── DEEPSENTINEL NEURAL CHECK ──
        const rugProb = await new Promise((resolve) => {
            const reqId = require('crypto').randomUUID();
            const timeout = setTimeout(() => {
                pendingPredictions.delete(reqId);
                resolve(0.85); // timeout = assume HIGH risk, do NOT buy blindly
            }, 5000);

            pendingPredictions.set(reqId, (res) => {
                clearTimeout(timeout);
                resolve(res.rug_probability || 0.5);
            });

            // Extract context for Raydium (mock for now, will automate in V5)
            const features = [60, 45, 75, 50, 50, 16];
            if (process.send) {
                process.send({ type: 'ML_REQUEST', model: 'raydium', features, req_id: reqId });
                console.log(chalk.cyan(`[SNIPER #${id}]: 🧠 Consulting DeepSentinel Neural Engine...`));
            } else {
                resolve(0.5);
            }
        });

        if (rugProb > neuralConfig.rug_threshold) {
            console.log(chalk.red.bold(`[SNIPER #${id}]: 💀 NEURAL BLOCK: Rug Risk ${(rugProb * 100).toFixed(1)}% | Threshold: ${neuralConfig.rug_threshold} | ABORTING.`));
            GlobalMemory.addMemory('SNIPER', `[PREDICTION_BLOCKED] Aborted trade on ${mintStr} due to high rug risk: ${(rugProb * 100).toFixed(1)}%. Threshold: ${neuralConfig.rug_threshold}`, 5);
            return;
        }

        // ── MINIMUM WIN PROBABILITY GATE ──
        const winProb = 1.0 - rugProb;
        if (winProb < 0.50) {
            console.log(chalk.yellow(`[SNIPER #${id}]: ⚠️ LOW CONFIDENCE: Win probability ${(winProb * 100).toFixed(1)}% < 50% minimum. Skipping ${mintStr.substring(0, 8)}...`));
            return;
        }

        const SOL_AMOUNT = calculateKellyBet(balance / 1e9, rugProb);

        if (SOL_AMOUNT === 0) {
            console.log(chalk.red.bold(`[SNIPER #${id}]: 💀 EXTREME CAPITAL GUARD: Kelly sizing zero. WALLET BALANCE LOW (${(balance / 1e9).toFixed(4)} SOL). HALTING.`));
            return;
        }

        if (balance < MIN_BALANCE_GUARD * 1e9) {
            const pubkey = wallet.publicKey ? wallet.publicKey.toString() : 'UNKNOWN';
            console.log(chalk.yellow(`[SNIPER #${id}]: Insufficient funds (Need >0.005 SOL). Balance: ${(balance / 1e9).toFixed(4)} SOL`));
            console.log(chalk.cyan(`[SNIPER #${id}]: ➡️ FUND WALLET: ${pubkey}`));
            return;
        }

        // ── EXPOSURE & CORRELATION RISK BRAKES ──
        const walletBalanceSol = balance / 1e9;
        const MAX_PORTFOLIO_EXPOSURE_PCT = parseFloat(process.env.MAX_PORTFOLIO_EXPOSURE_PCT || 20);
        const MAX_PER_CREATOR = parseInt(process.env.MAX_PER_CREATOR || 3);

        const trades = loadTrades();
        const currentExposureSol = trades.reduce((sum, t) => sum + (parseFloat(t.entrySol) || 0), 0);
        const proposedExposurePct = ((currentExposureSol + SOL_AMOUNT) / walletBalanceSol) * 100;

        if (proposedExposurePct > MAX_PORTFOLIO_EXPOSURE_PCT) {
            console.log(chalk.yellow.bold(`[SNIPER #${id}]: 🛑 EXPOSURE CAP REACHED: Proposed ${proposedExposurePct.toFixed(1)}% > ${MAX_PORTFOLIO_EXPOSURE_PCT}%. Aborting snipe on ${mintStr}.`));
            GlobalMemory.addMemory('SNIPER', `Aborted buy for ${mintStr}. Exposure ${proposedExposurePct.toFixed(1)}% > ${MAX_PORTFOLIO_EXPOSURE_PCT}%.`, 6);
            return;
        }

        const metadata = await getPumpMetadata(mintStr);
        const creatorAddr = metadata.creator;

        if (creatorAddr !== "UNKNOWN_CREATOR") {
            // Check for post-cascade cooldown
            try {
                const cooldownPath = path.join(__dirname, '../missions/creator_cooldowns.json');
                if (fs.existsSync(cooldownPath)) {
                    const cooldowns = JSON.parse(fs.readFileSync(cooldownPath, 'utf8'));
                    if (cooldowns[creatorAddr] && cooldowns[creatorAddr] > Date.now()) {
                        const remainingMin = Math.ceil((cooldowns[creatorAddr] - Date.now()) / 60000);
                        console.log(chalk.yellow.bold(`[SNIPER #${id}]: 🛑 CASCADE PROTECT: Dev ${creatorAddr.substring(0, 8)}... is on cooldown for ${remainingMin}m. Skipping ${mintStr}.`));
                        return;
                    }
                }
            } catch (e) { }

            const currentForCreator = trades.filter(t => t.creator === creatorAddr).length;
            if (currentForCreator >= MAX_PER_CREATOR) {
                console.log(chalk.yellow.bold(`[SNIPER #${id}]: 🛑 CREATOR CLUSTER CAP REACHED: Dev ${creatorAddr.substring(0, 8)}... already has ${currentForCreator}/${MAX_PER_CREATOR} active rugs/moonshots. Aborting.`));
                GlobalMemory.addMemory('SNIPER', `Rejected ${mintStr} due to creator cap. Dev already has ${currentForCreator} open positions.`, 6);
                return;
            }
        }

        // ── THEME SIMILARITY GATE (Semantic Hash) ──
        const CORRELATION_THEME_THRESHOLD = 0.7;
        const MAX_SIMILAR_THEMES = 4;
        let similarThemesCount = 0;

        if (metadata.name || metadata.description) {
            const currentDesc = (metadata.name + " " + metadata.description).trim();
            for (const t of trades) {
                const heldDesc = (t.name || "") + " " + (t.description || "");
                if (heldDesc.trim()) {
                    const sim = calculateSimilarity(currentDesc, heldDesc);
                    if (sim >= CORRELATION_THEME_THRESHOLD) {
                        similarThemesCount++;
                    }
                }
            }
            if (similarThemesCount >= MAX_SIMILAR_THEMES) {
                console.log(chalk.yellow.bold(`[SNIPER #${id}]: 🛑 THEME SATURATION: Narrative heavily overlaps with ${similarThemesCount} active trades. Aborting to prevent thematic rug wave.`));
                GlobalMemory.addMemory('SNIPER', `Rejected ${mintStr} due to thematic similarity threshold. Narrative already saturated.`, 6);
                return;
            }
        }

        // Register this token as being bought (cooldown)
        recentBuys.set(mintStr, Date.now());
        console.log(chalk.green(`[SNIPER #${id}]: 🎯 KELLY ENTRY for ${mintStr}... | Bet: ${SOL_AMOUNT} SOL [Prob: ${((1 - rugProb) * 100).toFixed(1)}%]`));

        // 1. Check Curve Status
        const curve = await getBondingCurveAccount(bondingCurve);

        // ── JUPITER ROUTE (Post-Migration) ──
        if (!curve || curve.complete) {
            console.log(chalk.blue(`[SNIPER #${id}]: Bonding curve complete/gone. Routing via JUPITER...`));
            const result = await executeJupiterSwap(WSOL_MINT.toString(), mint.toString(), Math.floor(SOL_AMOUNT * 1e9));

            if (result.success) {
                // Store entryPrice in SOL per UI token — same unit as DexScreener priceNative
                // This ensures banker.js PnL math works without any conversion
                const outAmt = Number(result.outAmount);
                const decimals = 6; // standard Solana token decimals
                const uiAmount = outAmt / Math.pow(10, decimals);
                const realEntryPrice = uiAmount > 0 ? SOL_AMOUNT / uiAmount : 0;

                const trades = loadTrades();
                trades.push({
                    mint: mintStr,
                    creator: creatorAddr,
                    name: metadata.name,
                    description: metadata.description,
                    entryPrice: realEntryPrice,  // SOL per UI token — matches DexScreener priceNative
                    entryPriceUnit: 'ui',         // flag: already per UI token, banker should NOT multiply by 10^decimals
                    amount: result.outAmount,
                    uiAmount: uiAmount,
                    entrySol: SOL_AMOUNT,
                    timestamp: Date.now(),
                    maxHoldUntil: Date.now() + (15 * 60 * 1000), // [TIGHTENED] 15min max hold
                    moonbagSecured: false,
                    source: 'JUPITER',
                    prediction: { rug_probability: rugProb, threshold: neuralConfig.rug_threshold }
                });
                saveTrades(trades);
                console.log(chalk.green(`[SNIPER #${id}]: 📌 Position recorded | Entry: ${realEntryPrice.toFixed(10)} SOL/uiToken | Amount: ${uiAmount.toLocaleString()} tokens`));
                GlobalMemory.addMemory('SNIPER', `[TRADE_ENTRY] Entered ${mintStr} via Jupiter. ${SOL_AMOUNT} SOL @ ${realEntryPrice.toExponential(3)}. Risk: ${(rugProb * 100).toFixed(1)}%. Threshold: ${neuralConfig.rug_threshold}`, 7);
                if (process.send) process.send({ type: 'TRADE_EXECUTED', mint: mintStr, amount: SOL_AMOUNT, source: 'JUPITER' });
            }
            return;
        }

        // ── PUMP.FUN ROUTE (Phase 1: Python Muscle) ──
        console.log(chalk.green(`[SNIPER #${id}]: 📊 Curve Active. Requesting Python Execution...`));

        const quote = calculateBuyQuote(curve, SOL_AMOUNT);
        const requestId = Date.now();
        const priorityFee = await getDynamicPriorityFee();
        if (process.send) {
            process.send({
                type: 'EXECUTE_TRADE',
                requestId,
                params: {
                    command: 'buy',
                    mint: mint.toString(),
                    amount: SOL_AMOUNT,
                    slippage: riskParams.slippage,
                    priorityFee
                }
            });

            // Wait for result via IPC
            return new Promise((resolve) => {
                const handler = (m) => {
                    if (m.type === 'TRADE_RESULT' && m.requestId === requestId) {
                        process.off('message', handler);
                        if (m.success) {
                            console.log(chalk.green.bold(`[SNIPER #${id}]: 🔫 PYTHON SNIPE SUCCESS! TX: ${m.tx.substring(0, 16)}...`));
                            const trades = loadTrades();
                            const decimals = 6;
                            const uiAmount = Number(quote.tokenAmount) / Math.pow(10, decimals);
                            const realEntryPrice = uiAmount > 0 ? SOL_AMOUNT / uiAmount : 0;

                            trades.push({
                                mint: mint.toString(),
                                creator: creatorAddr,
                                name: metadata.name,
                                description: metadata.description,
                                entryPrice: realEntryPrice,
                                entryPriceUnit: 'ui',
                                amount: quote.tokenAmount.toString(),
                                uiAmount: uiAmount,
                                entrySol: SOL_AMOUNT,
                                timestamp: Date.now(),
                                maxHoldUntil: Date.now() + (15 * 60 * 1000),
                                moonbagSecured: false,
                                source: 'PUMP_FUN_PYTHON',
                                prediction: { rug_probability: rugProb, threshold: neuralConfig.rug_threshold }
                            });
                            saveTrades(trades);
                            GlobalMemory.addMemory('SNIPER', `Successfully sniped ${mint.toString()} via Pump.fun Python Muscle. Amount: ${SOL_AMOUNT} SOL. Slippage was ${riskParams.slippage}.`, 8);
                            process.send({ type: 'TRADE_EXECUTED', mint: mint.toString(), amount: SOL_AMOUNT, source: 'PUMP_FUN_PYTHON' });
                            resolve({ success: true });
                        } else {
                            console.error(chalk.red(`[SNIPER #${id}]: Python Snipe Failed: ${m.error}`));
                            GlobalMemory.addMemory('SNIPER', `Failed to snipe ${mint.toString()}. Error: ${m.error}. Slippage might have been too tight (${riskParams.slippage}).`, 9);
                            resolve({ success: false, error: m.error });
                        }
                    }
                };
                process.on('message', handler);
                // Timeout after 30s
                setTimeout(() => {
                    process.off('message', handler);
                    resolve({ success: false, error: 'Python Execution Timeout' });
                }, 30000);
            });
        }

    } catch (e) {
        console.error(chalk.red(`[SNIPER #${id}]: Buy Failed: ${e.message}`));
    }
}

async function sellToken(mint, amount, reason) {
    if (!wallet || !wallet.publicKey) {
        console.log(chalk.red(`[SNIPER #${id}]: Aborting sell — Wallet not loaded.`));
        return;
    }
    console.log(chalk.magenta(`[SNIPER #${id}]: 📉 INITIATING SELL: ${amount} of ${mint} [${reason}]`));

    try {
        const mintPub = new PublicKey(mint);
        const bondingCurve = getBondingCurvePDA(mintPub);
        const curve = await getBondingCurveAccount(bondingCurve);

        // ── CALCULATE COST BASIS (For Accurate War Chest PnL) ──
        const activeTrades = loadTrades();
        const storedTrade = activeTrades.find(t => t.mint === mint);
        let costBasisSol = 0;
        if (storedTrade && storedTrade.entryPrice) {
            // UI Amount * entryPrice (SOL per UI Token)
            const uiAmount = Number(amount) / 1e6;
            costBasisSol = uiAmount * storedTrade.entryPrice;
        }

        // ── JUPITER ROUTE (Post-Migration) ──
        if (!curve || curve.complete) {
            console.log(chalk.blue(`[SNIPER #${id}]: Curve complete. Selling via JUPITER...`));
            const result = await executeJupiterSwap(mint.toString(), WSOL_MINT.toString(), amount);
            if (result.success) {
                const outAmountSol = Number(result.outAmount) / 1e9;
                const netProfit = outAmountSol - costBasisSol;
                const pnlPct = costBasisSol > 0 ? (netProfit / costBasisSol) * 100 : 0;

                GlobalMemory.addMemory('SNIPER', `[TRADE_EXIT] Sold ${mint.toString()} via Jupiter. PnL: ${netProfit.toFixed(4)} SOL (${pnlPct.toFixed(1)}%). Reason: ${reason}.`, netProfit > 0 ? 7 : 9);
                if (process.send) process.send({ type: 'KICK_UP', amount: netProfit, source: 'TRADE_EXIT_JUPITER' });

                if (storedTrade && storedTrade.prediction && process.send) {
                    process.send({ type: 'TRAINING_LABEL', label: { mint: mint.toString(), rugProb: storedTrade.prediction.rug_probability, timestamp: storedTrade.timestamp, pnlPct, success: netProfit > 0 ? 1 : 0 } });
                }
            }
            return;
        }

        // ── PUMP.FUN ROUTE (Phase 1: Python Muscle) ──
        console.log(chalk.magenta(`[SNIPER #${id}]: 📊 Curve Active. Requesting Python Sell Execution...`));

        const quote = calculateSellQuote(curve, BigInt(amount));
        const requestId = Date.now();
        const priorityFee = await getDynamicPriorityFee();
        if (process.send) {
            process.send({
                type: 'EXECUTE_TRADE',
                requestId,
                params: {
                    command: 'sell',
                    mint: mint.toString(),
                    amount: amount,
                    slippage: riskParams.slippage,
                    priorityFee
                }
            });

            return new Promise((resolve) => {
                const handler = (m) => {
                    if (m.type === 'TRADE_RESULT' && m.requestId === requestId) {
                        process.off('message', handler);
                        if (m.success) {
                            console.log(chalk.green.bold(`[SNIPER #${id}]: 💸 PYTHON SELL SUCCESS! TX: ${m.tx.substring(0, 16)}...`));

                            const outAmountSol = Number(quote.solAmount) / 1e9;
                            const netProfit = outAmountSol - costBasisSol;
                            const pnlPct = costBasisSol > 0 ? (netProfit / costBasisSol) * 100 : 0;

                            GlobalMemory.addMemory('SNIPER', `[TRADE_EXIT] Sold ${mint.toString()} via Pump.fun Python. PnL: ${netProfit.toFixed(4)} SOL (${pnlPct.toFixed(1)}%). Reason: ${reason}.`, netProfit > 0 ? 8 : 10);
                            process.send({ type: 'KICK_UP', amount: netProfit, source: 'TRADE_EXIT_PYTHON' });

                            if (storedTrade && storedTrade.prediction && process.send) {
                                process.send({ type: 'TRAINING_LABEL', label: { mint: mint.toString(), rugProb: storedTrade.prediction.rug_probability, timestamp: storedTrade.timestamp, pnlPct, success: netProfit > 0 ? 1 : 0 } });
                            }

                            resolve({ success: true });
                        } else {
                            console.error(chalk.red(`[SNIPER #${id}]: Python Sell Failed: ${m.error}`));
                            GlobalMemory.addMemory('SNIPER', `Failed to sell ${mint.toString()}. Error: ${m.error}. Slippage might have been too tight (${riskParams.slippage}).`, 9);
                            resolve({ success: false, error: m.error });
                        }
                    }
                };
                process.on('message', handler);
                setTimeout(() => {
                    process.off('message', handler);
                    resolve({ success: false, error: 'Python Execution Timeout' });
                }, 30000);
            });
        }
    } catch (e) {
        console.error(chalk.red(`[SNIPER #${id}]: Sell Failed: ${e.message}`));
    }
}

// ============================================================
// SHADOW PROTOCOL: Copy-Trading (HTTP Polling — WS-Free)
// ============================================================
const TARGET_WALLETS = [
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    'Cz4ZrPCMzx5Bew1F3TJfqPFR5p53uNn3mLBqav9Ah3Ku',
    'JBnJnTP2iGP89r6meMWrM745hLgqKjDC1hYjECFusPB',
];

const lastSeenSigs = {};

function commsPost(msg) {
    if (process.send) process.send({ type: 'AGENT_COMMS', from: `SNIPER #${id}`, msg, timestamp: new Date().toISOString() });
}

async function startSurveillance() {
    console.log(chalk.cyan(`[SNIPER #${id}]: 👁️ COPY-TRADE SURVEILLANCE ACTIVE (HTTP Polling)`));
    commsPost('Copy-trade surveillance online. Tracking ' + TARGET_WALLETS.length + ' whale wallets.');

    setInterval(async () => {
        for (const walletAddr of TARGET_WALLETS) {
            try {
                const sigs = await connection.getSignaturesForAddress(new PublicKey(walletAddr), { limit: 1 });
                if (sigs.length === 0) continue;

                const latestSig = sigs[0].signature;
                if (lastSeenSigs[walletAddr] === latestSig) continue;

                if (!lastSeenSigs[walletAddr]) {
                    lastSeenSigs[walletAddr] = latestSig;
                    continue;
                }

                lastSeenSigs[walletAddr] = latestSig;
                console.log(chalk.yellow(`[SNIPER #${id}]: 🔔 ACTIVITY ON TARGET: ${walletAddr.substring(0, 8)}...`));

                const tx = await connection.getParsedTransaction(latestSig, { maxSupportedTransactionVersion: 0 });
                if (!tx || !tx.meta) continue;

                const logs = tx.meta.logMessages || [];
                const isPumpBuy = logs.some(l => l.includes("Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P") && l.includes("Instruction: Buy"));
                const isSwap = logs.some(l => l.includes("Instruction: Swap") || l.includes("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"));

                if (isPumpBuy || isSwap) {
                    const postToken = tx.meta.postTokenBalances || [];
                    const preToken = tx.meta.preTokenBalances || [];

                    const bought = postToken.find(post => {
                        const pre = preToken.find(p => p.accountIndex === post.accountIndex);
                        const preAmt = pre ? parseFloat(pre.uiTokenAmount.uiAmount || 0) : 0;
                        return post.owner === walletAddr && parseFloat(post.uiTokenAmount.uiAmount) > preAmt;
                    });

                    // Filter out stablecoins, wrapped SOL, and known major tokens to avoid bad copy-trades
                    const BLOCKED_MINTS = new Set([
                        'So11111111111111111111111111111111111111112', // WSOL
                        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
                        'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
                        'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',  // bSOL
                        'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', // JitoSOL
                    ]);
                    if (bought && !BLOCKED_MINTS.has(bought.mint)) {
                        console.log(chalk.red.bold(`[SNIPER #${id}]: 🚨 COPY-TRADE ALERT! Target bought ${bought.mint}`));
                        commsPost(`🚨 COPY-TRADE: Whale bought ${bought.mint.substring(0, 12)}...`);

                        const mintPub = new PublicKey(bought.mint);
                        const bondingCurve = getBondingCurvePDA(mintPub);
                        const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);

                        await buyToken(mintPub, bondingCurve, associatedBondingCurve);
                    }
                }
            } catch (e) {
                if (e.message && e.message.includes('429')) {
                    console.log(chalk.yellow(`[SNIPER #${id}]: Rate limited. Backing off...`));
                    await new Promise(r => setTimeout(r, 30000));
                }
            }
        }
    }, 15000);
}

// ============================================================
// TRADE MANAGEMENT
// ============================================================
const TRADES_FILE = path.join(__dirname, '../missions/active_trades.json');

function loadTrades() {
    try {
        if (fs.existsSync(TRADES_FILE)) return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
    } catch { }
    return [];
}

function saveTrades(trades) {
    fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
}

// Guard: prevent concurrent checkPositions calls firing duplicate sells
let checkPositionsRunning = false;

// ── Position Manager ──
async function checkPositions() {
    if (checkPositionsRunning) return; // another check is in flight
    checkPositionsRunning = true;
    const trades = loadTrades();
    if (trades.length === 0) { checkPositionsRunning = false; return; }

    console.log(chalk.blue(`[SNIPER #${id}]: ⚔️ Checking ${trades.length} active positions...`));


    try {
        for (let i = trades.length - 1; i >= 0; i--) {
            const trade = trades[i];
            let pnl = null; // Declare pnl here so the catch block ALWAYS has access to it

            // ── FORCE EXIT FIRST: check max hold time BEFORE price (so expired positions always close) ──
            if (trade.maxHoldUntil && Date.now() > trade.maxHoldUntil) {
                console.log(chalk.magenta.bold(`[SNIPER #${id}]: ⏰ FORCE EXIT: ${trade.mint} held too long. Liquidating at market.`));
                GlobalMemory.addMemory('SNIPER', `Force-exited ${trade.mint} after max hold time expired.`, 8);
                await sellToken(trade.mint, trade.amount, 'TIME_EXIT');
                trades.splice(i, 1);
                saveTrades(trades);
                continue;
            }

            // ── Price check for PnL-based exits ──
            let currentSolValue = 0;

            const mintPub = new PublicKey(trade.mint);
            const bondingCurve = getBondingCurvePDA(mintPub);
            const curve = await getBondingCurveAccount(bondingCurve);

            if (curve && !curve.complete) {
                const quote = calculateSellQuote(curve, BigInt(trade.amount));
                currentSolValue = Number(quote.solAmount) / 1e9;

                // standardizing to UI units: SOL per UI token (6 decimals for pump.fun)
                const decimals = 6;
                const uiAmount = Number(trade.amount) / Math.pow(10, decimals);
                const currentPrice = uiAmount > 0 ? (currentSolValue / uiAmount) : 0;

                // Use stored entryPrice (always SOL/uiToken in new format)
                const entryPrice = trade.entryPrice || currentPrice;
                if (entryPrice > 0) {
                    pnl = ((currentPrice - entryPrice) / entryPrice) * 100;
                }
            } else {
                const priceData = await fetchCurrentPrice(trade.mint, trade.amount, curve);
                if (priceData) {
                    currentSolValue = priceData.solValue;
                    const currentPrice = priceData.currentPrice; // fetchCurrentPrice returns price per UI token
                    const entryPrice = trade.entryPrice || currentPrice;
                    pnl = ((currentPrice - entryPrice) / entryPrice) * 100;
                } else {
                    console.log(chalk.yellow(`  ⚠️ ${trade.mint.substring(0, 6)}: Price unavailable, skipping PnL check.`));
                    continue; // SKIP rest of the loop since PnL isn't populated
                }
            }

            if (pnl === null) continue;

            console.log(chalk.blue(`  💎 ${trade.mint.substring(0, 6)}: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}% | Val: ${currentSolValue.toFixed(4)} SOL`));

            if (!trade.highestPnl || pnl > trade.highestPnl) {
                trade.highestPnl = pnl;
            }

            // ── STAGNATION CUT ("Mean" Execution) ──
            const minutesHeld = (Date.now() - trade.timestamp) / 60000;
            if (minutesHeld > 5 && pnl < 2 && trade.highestPnl < 10) {
                console.log(chalk.red.bold(`[SNIPER #${id}]: 💀 STAGNATION CUT: ${trade.mint} (+${pnl.toFixed(2)}%)`));
                GlobalMemory.addMemory('SNIPER', `Token ${trade.mint} showed dead momentum. Stagnation cut executed after ${minutesHeld.toFixed(1)}m.`, 8);
                await sellToken(trade.mint, trade.amount, 'STAGNATION_CUT');
                trades.splice(i, 1);
                saveTrades(trades);
                continue;
            }

            // ── DYNAMIC TRAILING STOP ("Sexy Profit" Lock-in) ──
            let trailingStopPnl = riskParams.stopLoss; // Base stop-loss (-25% normally)

            // As peak climbs, the stop-loss climbs aggressively right behind it
            if (trade.highestPnl > 100) {
                trailingStopPnl = trade.highestPnl - 30; // Lock in at least +70%
            } else if (trade.highestPnl > 50) {
                trailingStopPnl = trade.highestPnl - 20; // Lock in at least +30%
            } else if (trade.highestPnl > 20) {
                trailingStopPnl = trade.highestPnl - 10; // Lock in at least +10%
            } else if (trade.highestPnl > 10) {
                trailingStopPnl = trade.highestPnl - 5;  // Lock in at least +5%
            }

            // ── EXIT EVALUATIONS ──
            if (!trade.moonbagSecured && pnl >= riskParams.moonbagTarget) {
                console.log(chalk.green.bold(`[SNIPER #${id}]: 🚀 MOONBAG SECURED: ${trade.mint} (+${pnl.toFixed(2)}%)`));
                const halfAmount = BigInt(trade.amount) / 2n;
                GlobalMemory.addMemory('SNIPER', `Token ${trade.mint} hit +${pnl.toFixed(2)}% PnL. Securing moonbag.`, 8);
                await sellToken(trade.mint, halfAmount.toString(), 'MOONBAG');

                trade.amount = (BigInt(trade.amount) - halfAmount).toString();
                trade.moonbagSecured = true;
                saveTrades(trades);
            }
            else if (pnl >= riskParams.maxProfitDump) {
                console.log(chalk.green.bold(`[SNIPER #${id}]: 💰 MAX PROFIT: ${trade.mint} (+${pnl.toFixed(2)}%) - DUMPING.`));
                GlobalMemory.addMemory('SNIPER', `Token ${trade.mint} hit max profit target (+${pnl.toFixed(2)}%). Dumping all bags.`, 9);
                await sellToken(trade.mint, trade.amount, 'MAX_PROFIT');
                trades.splice(i, 1);
                saveTrades(trades);
            }
            else if (pnl <= trailingStopPnl && trade.highestPnl > 10) {
                // Tripped the dynamic profit lock
                console.log(chalk.magenta.bold(`[SNIPER #${id}]: 📉 DYNAMIC TRAILING STOP: ${trade.mint} (+${pnl.toFixed(2)}% trailing peak +${trade.highestPnl.toFixed(2)}%)`));
                GlobalMemory.addMemory('SNIPER', `Token ${trade.mint} hit dynamic trailing stop. Liquidating to lock profits.`, 8);
                await sellToken(trade.mint, trade.amount, 'DYNAMIC_TRAIL');
                trades.splice(i, 1);
                saveTrades(trades);
            }
            else if (pnl <= riskParams.stopLoss) {
                // Hard base stop-loss
                console.log(chalk.red.bold(`[SNIPER #${id}]: 🛑 STOP LOSS: ${trade.mint} (${pnl.toFixed(2)}%)`));
                GlobalMemory.addMemory('SNIPER', `Token ${trade.mint} hit hard STOP LOSS (${pnl.toFixed(2)}%). Base entry failed.`, 10);
                await sellToken(trade.mint, trade.amount, 'STOP_LOSS');
                trades.splice(i, 1);
                saveTrades(trades);
            }
        }
    } catch (e) {
        console.log(chalk.yellow(`[SNIPER #${id}]: Position cycle error: ${e.message}`));
    } finally {
        checkPositionsRunning = false;
    }
}

setInterval(() => {
    const activeTargets = TARGET_WALLETS.length;
    const lastSigCount = Object.keys(lastSeenSigs).length;

    console.log(chalk.cyan(`[SNIPER #${id}]: 🕑 STATUS REPORT: Tracking ${activeTargets} whales. ${lastSigCount} active recently.`));
    if (process.send) {
        process.send({
            type: 'AGENT_COMMS',
            from: 'SNIPER',
            msg: `Surveillance active. Watching ${activeTargets} targets. Wallet balance safe. Params: Slippage ${riskParams.slippage * 100}%, Stop ${riskParams.stopLoss}%`,
            timestamp: new Date().toISOString()
        });
    }
}, 3600000);

// ── Westworld Reflection Interval (Every 4 hours) ──
setInterval(async () => {
    console.log(chalk.magenta(`[SNIPER #${id}]: 🧠 INITIATING DEEP REFLECTION...`));
    const reflection = await GlobalMemory.reflect('SNIPER');

    if (reflection) {
        console.log(chalk.cyan.bold(`[SNIPER #${id}]: 💡 EPIPHANY: ${reflection.key_insight}`));
        console.log(chalk.cyan(`   → Rule: ${reflection.actionable_heuristic}`));

        if (reflection.risk_adjustment && reflection.risk_adjustment !== 'none') {
            if (reflection.risk_adjustment.includes('increase_slippage')) {
                riskParams.slippage = Math.min(riskParams.slippage + 0.05, 0.40); // Cap at 40%
                console.log(chalk.yellow(`   → Slippage increased to ${riskParams.slippage}`));
            } else if (reflection.risk_adjustment.includes('decrease_slippage')) {
                riskParams.slippage = Math.max(riskParams.slippage - 0.02, 0.05); // Floor at 5%
                console.log(chalk.yellow(`   → Slippage tightened to ${riskParams.slippage}`));
            } else if (reflection.risk_adjustment.includes('tighten_stop_loss')) {
                riskParams.stopLoss = Math.max(riskParams.stopLoss + 5, -5); // e.g. -15 -> -10
                console.log(chalk.yellow(`   → Stop loss tightened to ${riskParams.stopLoss}%`));
            }

            if (process.send) {
                process.send({
                    type: 'AGENT_COMMS',
                    from: 'SNIPER',
                    msg: `I have reflected on past trades. ${reflection.key_insight} Adjusting strategy: ${reflection.actionable_heuristic}`,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
}, 3600000 * 4);

// ============================================================
// AUTONOMOUS OPPORTUNITY SCANNER
// Runs every 2 minutes, scores candidates, buys on high-confidence signals
// Sell is handled by checkPositions() which polls every 30s
// ============================================================

// Tokens scanned this session — avoid re-scanning the same tokens
const scannedThisSession = new Set();

/**
 * Score a DexScreener token pair on buy quality.
 * Returns { score, reasons[] } — max score is 10.
 */
function scoreToken(pair) {
    let score = 0;
    const reasons = [];

    const priceChange5m = pair.priceChange?.m5 || 0;
    const priceChange1h = pair.priceChange?.h1 || 0;
    const volumeM5 = pair.volume?.m5 || 0;
    const volumeH1 = pair.volume?.h1 || 0;
    const liquidityUsd = pair.liquidity?.usd || 0;
    const txnsBuys5m = pair.txns?.m5?.buys || 0;
    const txnsSells5m = pair.txns?.m5?.sells || 0;
    const fdvUsd = pair.fdv || 0;

    // 1. Volume spike: significant 5m activity (at least $500 in last 5min)
    if (volumeM5 > 500) {
        score += 2;
        reasons.push(`Vol5m $${volumeM5.toFixed(0)}`);
    }

    // 2. Liquidity window: $8k-$2M — enough to enter/exit, not a rug trap
    if (liquidityUsd >= 8000 && liquidityUsd <= 2_000_000) {
        score += 2;
        reasons.push(`Liq $${(liquidityUsd / 1000).toFixed(0)}k`);
    }

    // 3. Positive 5-minute momentum — price moving up
    if (priceChange5m > 1 && priceChange5m < 50) {
        score += 2;
        reasons.push(`5m up ${priceChange5m.toFixed(1)}%`);
    }

    // 4. Buy pressure: more buyers than sellers in last 5 min
    if (txnsBuys5m > txnsSells5m && txnsBuys5m >= 3) {
        score += 2;
        reasons.push(`Buys>${txnsBuys5m} Sells>${txnsSells5m}`);
    }

    // 5. Not already overbought: 1h gain under 200% (still has room)
    if (priceChange1h < 200 && priceChange1h > -20) {
        score += 1;
        reasons.push(`1h ${priceChange1h.toFixed(0)}%`);
    }

    // Penalty: too small fdv (likely scam) or too big (no moonshot)
    if (fdvUsd < 5000 || fdvUsd > 50_000_000) score -= 1;

    return { score: Math.max(0, score), reasons };
}

/**
 * Main autonomous scanner — runs on interval.
 * Fetches latest Solana pairs from DexScreener, scores them, buys top candidates.
 */
async function runAutonomousScan() {
    const trades = loadTrades();
    const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || 6);
    if (trades.length >= MAX_CONCURRENT) {
        console.log(chalk.gray(`[SNIPER #${id}]: 📊 At position limit (${trades.length}/${MAX_CONCURRENT}). Skipping scan.`));
        return;
    }

    if (!canBuy('__scan_gate__')) return; // daily cap check (reuse canBuy without cooldown)

    console.log(chalk.cyan(`[SNIPER #${id}]: 🔭 AUTONOMOUS SCAN: Looking for high-score opportunities...`));

    let candidates = [];
    try {
        // Pull latest new pairs on Solana (sorted by creation time)
        const res = await axios.get(
            'https://api.dexscreener.com/token-profiles/latest/v1',
            { timeout: 12000 }
        );
        const profiles = Array.isArray(res.data) ? res.data : [];

        // Filter for Solana tokens only, not already scanned
        const solProfiles = profiles.filter(p =>
            p.chainId === 'solana' &&
            !scannedThisSession.has(p.tokenAddress) &&
            p.tokenAddress
        ).slice(0, 20); // Process top 20 new ones

        for (const profile of solProfiles) {
            scannedThisSession.add(profile.tokenAddress);
        }

        if (solProfiles.length === 0) {
            // Fallback: check trending pairs
            const trendRes = await axios.get(
                'https://api.dexscreener.com/token-boosts/latest/v1',
                { timeout: 12000 }
            );
            const boosted = Array.isArray(trendRes.data) ? trendRes.data : [];
            const solBoosted = boosted.filter(p => p.chainId === 'solana').slice(0, 15);
            solProfiles.push(...solBoosted);
        }

        // Get pair data for each token address
        const tokenAddresses = solProfiles.map(p => p.tokenAddress).filter(Boolean).slice(0, 15);
        if (tokenAddresses.length === 0) return;

        const pairRes = await axios.get(
            `https://api.dexscreener.com/tokens/v1/solana/${tokenAddresses.join(',')}`,
            { timeout: 12000 }
        );
        const pairs = Array.isArray(pairRes.data) ? pairRes.data : [];

        // Score each unique token (pick best pair per token)
        const tokenMap = new Map();
        for (const pair of pairs) {
            const mint = pair.baseToken?.address;
            if (!mint) continue;
            const existing = tokenMap.get(mint);
            const vol = pair.volume?.m5 || 0;
            if (!existing || vol > (existing.volume?.m5 || 0)) tokenMap.set(mint, pair);
        }

        for (const [mint, pair] of tokenMap) {
            const { score, reasons } = scoreToken(pair);
            if (score >= 8) {
                candidates.push({ mint, pair, score, reasons });
            }
        }

        candidates.sort((a, b) => b.score - a.score);

    } catch (e) {
        console.log(chalk.gray(`[SNIPER #${id}]: Scanner fetch error: ${e.message}`));
        return;
    }

    if (candidates.length === 0) {
        console.log(chalk.gray(`[SNIPER #${id}]: 🔭 No qualifying candidates this scan.`));
        return;
    }

    // Execute buy on highest-scoring candidate we haven't bought recently
    const openMints = new Set(loadTrades().map(t => t.mint));
    const BLOCKED_MINTS = new Set([
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    ]);

    for (const { mint, pair, score, reasons } of candidates) {
        if (openMints.has(mint)) continue;
        if (BLOCKED_MINTS.has(mint)) continue;
        if (!canBuy(mint)) continue;

        console.log(chalk.green.bold(`[SNIPER #${id}]: 🎯 AUTONOMOUS TARGET: ${pair.baseToken?.symbol || mint.slice(0, 8)} | Score: ${score}/10 | ${reasons.join(' | ')}`));
        commsPost(`🤖 AUTO-TARGET: ${pair.baseToken?.symbol || mint.slice(0, 8)} scored ${score}/10. Buying.`);

        const mintPub = new PublicKey(mint);
        const bondingCurve = getBondingCurvePDA(mintPub);
        const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);
        await buyToken(mintPub, bondingCurve, associatedBondingCurve);

        break; // One buy per scan cycle
    }
}

// Kick off the autonomous scanner — runs every 2 minutes
setInterval(runAutonomousScan, 2 * 60 * 1000);
// First scan after 30 seconds to let wallet init settle
setTimeout(runAutonomousScan, 30000);

startSurveillance();
setInterval(checkPositions, 30000);

process.on('message', async (msg) => {
    switch (msg.type) {
        case 'COPY_TRADE_SIGNAL':
            console.log(chalk.magenta(`[SNIPER #${id}]: ⚡ SIGNAL RECEIVED from ${msg.source}: ${msg.mint}`));
            const mintPub = new PublicKey(msg.mint);
            const bondingCurve = getBondingCurvePDA(mintPub);
            const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);
            await buyToken(mintPub, bondingCurve, associatedBondingCurve);
            break;

        case 'TRADE_EXECUTED':
            if (msg.source === 'CONTRARIAN') {
                console.log(chalk.magenta(`[SNIPER #${id}]: 📥 Received ${msg.mint} from CONTRARIAN. Assuming PnL management.`));
                const trades = loadTrades();
                // If it's already tracked, skip
                if (trades.some(t => t.mint === msg.mint)) break;

                trades.push({
                    mint: msg.mint,
                    entryPrice: null, // Force fetch Current Price on next tick
                    amount: Math.floor(msg.amount * 1e9).toString(), // rough placeholder, price fetch will correct
                    timestamp: Date.now(),
                    maxHoldUntil: Date.now() + (25 * 60 * 1000), // 25min max hold
                    moonbagSecured: false,
                    source: msg.source
                });
                saveTrades(trades);
            }
            break;

        case 'EMERGENCY_SELL':
            const trades = loadTrades();
            const trade = trades.find(t => t.mint === msg.mint);
            if (trade) {
                await sellToken(msg.mint, trade.amount, 'EMERGENCY_SELL');
                trades.splice(trades.indexOf(trade), 1);
                saveTrades(trades);
            }
            break;

        case 'USER_CHAT':
            if (msg.text && msg.text.startsWith('/snipe')) {
                const parts = msg.text.split(' ');
                if (parts.length > 1) {
                    const mint = parts[1];
                    console.log(chalk.magenta(`[SNIPER #${id}]: ⚡ MANUAL SNIPE: ${mint}`));
                    const mintPub = new PublicKey(mint);
                    const bondingCurve = getBondingCurvePDA(mintPub);
                    const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);
                    await buyToken(mintPub, bondingCurve, associatedBondingCurve);
                }
            }
            break;

        case 'ML_RESPONSE':
            const callback = pendingPredictions.get(msg.data.req_id);
            if (callback) {
                callback(msg.data);
                pendingPredictions.delete(msg.data.req_id);
            }
            break;
    }
});
