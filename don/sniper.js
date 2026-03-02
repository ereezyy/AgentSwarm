// don/sniper.js - THE MAINNET SNIPER V4 (PUMP.FUN + JUPITER/RAYDIUM AGGREGATION)
// Capabilities:
// 1. Shadow Protocol: Tracks whales and copies trades.
// 2. MEV Bundler: Sends transactions via Jito to avoid sandwiches.
// 3. Pump.fun Native: Direct bonding curve interaction.
// 4. Jupiter Aggregator: Swaps on Raydium/Orca/Meteora for migrated tokens.

const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, ComputeBudgetProgram, sendAndConfirmTransaction, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const chalk = require('chalk');
const MevBundler = require('./mev_bundler');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bs58 = require('bs58');
const { GlobalMemory } = require('./brain');
require('dotenv').config();

// Suppress non-fatal bigint warning
const originalWarn = console.warn;
console.warn = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('bigint: Failed to load bindings')) return;
    originalWarn(...args);
};

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

const secretKey = Buffer.from(PRIVATE_KEY_HEX, 'hex');
const wallet = Keypair.fromSecretKey(secretKey);

// ── Dynamic Risk Engine (Aggressive MEV Tuned) ──
let riskParams = {
    slippage: 0.25,      // 25% slippage to punch through minor sandwiches
    stopLoss: -8,        // [TIGHTENED] Cut losses quickly if rugged (-15% -> -8%)
    moonbagTarget: 50,   // Take initial profit at 50%
    maxProfitDump: 120   // Dump everything at 120% — take the bag and run
};

// ── Spend Controls (Safety Gate) ─────────────────────────────
// Prevents runaway buying when whale signals fire in rapid succession
const recentBuys = new Map(); // mint -> timestamp of last buy
const TOKEN_COOLDOWN_MS = 30 * 60 * 1000;  // 30 min per token (prevents same-token spam)
const MAX_DAILY_SPEND_SOL = 0.5;              // Cap daily buying at 0.5 SOL — preserve capital
const MIN_BALANCE_GUARD = 0.005;             // [REDUCED] Keep at least 0.005 SOL for gas + emergency exits
const SPEND_FILE = path.join(__dirname, '../missions/spend_tracker.json');

let dailySpend = 0;
let dailySpendReset = Date.now();

// How many open positions we allow simultaneously
const MAX_OPEN_POSITIONS = 5;

function loadSpend() {
    try {
        if (fs.existsSync(SPEND_FILE)) {
            const data = JSON.parse(fs.readFileSync(SPEND_FILE, 'utf8'));
            if (Date.now() - data.resetTime < 86400000) {
                dailySpend = data.spend;
                dailySpendReset = data.resetTime;
            }
        }
    } catch { }
}

function saveSpend() {
    fs.writeFileSync(SPEND_FILE, JSON.stringify({ spend: dailySpend, resetTime: dailySpendReset }, null, 2));
}

function canBuy(mintStr) {
    // Reset daily counter if new day
    if (Date.now() - dailySpendReset > 86400000) {
        dailySpend = 0;
        dailySpendReset = Date.now();
        saveSpend();
    }

    // Position limit — hard stop
    const trades = loadTrades();
    if (trades.length >= MAX_OPEN_POSITIONS) {
        console.log(chalk.yellow(`[SNIPER #${id}]: 🛑 At position limit (${trades.length}/${MAX_OPEN_POSITIONS}). No more buys.`));
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
    // Check daily spend cap
    if (dailySpend >= MAX_DAILY_SPEND_SOL) {
        console.log(chalk.yellow(`[SNIPER #${id}]: 🛑 Daily spend cap reached (${dailySpend.toFixed(4)} SOL). Pausing buys.`));
        return false;
    }
    return true;
}

// ── Connection Setup (HTTP-only, no WebSocket spam) ──
const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

async function withRetry(fn, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
}

// Initialize MEV Protection (Graceful)
let bundler = null;
try {
    bundler = new MevBundler(wallet, connection);
} catch (e) {
    console.log(chalk.yellow(`[SNIPER #${id}]: MEV Bundler failed to load. Running unprotected.`));
}

// ============================================================
// DYNAMIC PRIORITY FEES
// ============================================================
async function getDynamicPriorityFee() {
    try {
        const fees = await withRetry(() => connection.getRecentPrioritizationFees());
        if (!fees || fees.length === 0) return 100000; // Fallback 0.0001 SOL

        // Sort descending and take the top 20 to get a competitive gauge
        fees.sort((a, b) => b.prioritizationFee - a.prioritizationFee);
        const topFees = fees.slice(0, 20);
        const avgTopFee = Math.floor(topFees.reduce((sum, f) => sum + f.prioritizationFee, 0) / topFees.length);

        // Add a 20% premium to the average top fee to ensure inclusion
        const targetFee = Math.floor(avgTopFee * 1.2);

        // Floor at 50k, Ceiling at 5M (0.005 SOL) to protect capital
        return Math.min(Math.max(targetFee, 50000), 5000000);
    } catch (e) {
        return 100000; // Fallback on error
    }
}

// ============================================================
// JUPITER AGGREGATOR (RAYDIUM/ORCA FALLBACK)
// ============================================================
async function executeJupiterSwap(inputMint, outputMint, amount, slippageBps = 1000) {
    try {
        console.log(chalk.blue(`[SNIPER #${id}]: 🪐 Requesting Jupiter Quote...`));
        // 1. Get Quote — trying lite-api first, fallback to v6
        let quoteData = null;
        let swapApiUrl = 'https://lite-api.jup.ag/swap/v1';

        try {
            const JUPITER_BASE = 'https://lite-api.jup.ag/swap/v1';
            const quoteUrl = `${JUPITER_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
            const quoteResponse = await axios.get(quoteUrl, { timeout: 10000 });
            quoteData = quoteResponse.data;
        } catch (e) {
            console.log(chalk.yellow(`[SNIPER #${id}]: lite-api failed, falling back to quote-api.jup.ag/v6...`));
            swapApiUrl = 'https://quote-api.jup.ag/v6';
            const JUPITER_BASE_FALLBACK = 'https://quote-api.jup.ag/v6';
            const quoteUrlFallback = `${JUPITER_BASE_FALLBACK}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
            const quoteResponseFallback = await axios.get(quoteUrlFallback, { timeout: 10000 });
            quoteData = quoteResponseFallback.data;
        }

        if (!quoteData || quoteData.error) throw new Error(quoteData.error || 'No quote found');

        console.log(chalk.blue(`[SNIPER #${id}]: 🪐 Jupiter Quote: ${quoteData.outAmount} out via ${quoteData.routePlan.map(r => r.swapInfo.label).join('->')}`));

        // 2. Get Serialized Transaction with Dynamic Fee
        const priorityFee = await getDynamicPriorityFee();
        const priorityFeeSol = (priorityFee / 1e9).toFixed(6);
        console.log(chalk.hex('#FF6600')(`[SNIPER #${id}]: 🏎️ Priority Fee Set: ${priorityFeeSol} SOL`));

        let swapTransaction;
        try {
            const swapResponse = await axios.post(`${swapApiUrl}/swap`, {
                quoteResponse: quoteData,
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: priorityFee
            }, { timeout: 10000 });
            swapTransaction = swapResponse.data.swapTransaction;
        } catch (e) {
            if (swapApiUrl === 'https://lite-api.jup.ag/swap/v1') {
                console.log(chalk.yellow(`[SNIPER #${id}]: lite-api swap failed, falling back to quote-api.jup.ag/v6 swap...`));
                const swapResponseFallback = await axios.post(`https://quote-api.jup.ag/v6/swap`, {
                    quoteResponse: quoteData,
                    userPublicKey: wallet.publicKey.toString(),
                    wrapAndUnwrapSol: true,
                    prioritizationFeeLamports: priorityFee
                }, { timeout: 10000 });
                swapTransaction = swapResponseFallback.data.swapTransaction;
            } else {
                throw e;
            }
        }

        // 3. Deserialize and Sign
        const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        transaction.sign([wallet]);

        // 4. Send (Prefer Bundler if available, else RPC)
        const latestBh = await withRetry(() => connection.getLatestBlockhash('confirmed'));
        const sig = await withRetry(() => connection.sendTransaction(transaction, { skipPreflight: true, maxRetries: 2 }));

        console.log(chalk.green.bold(`[SNIPER #${id}]: 🪐 Jupiter Swap Sent: ${sig}`));

        // Confirm via HTTP polling (no WebSocket signatureSubscribe needed)
        let confirmed = false;
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await withRetry(() => connection.getSignatureStatuses([sig]));
            const cs = status?.value?.[0]?.confirmationStatus;
            if (cs === 'confirmed' || cs === 'finalized') {
                confirmed = true;
                if (status.value[0].err) throw new Error(`TX Failed: ${JSON.stringify(status.value[0].err)}`);
                break;
            }
        }
        if (!confirmed) throw new Error('Confirmation timeout (30s)');

        return { success: true, sig, outAmount: quoteData.outAmount };

    } catch (e) {
        let errorMsg = e.message;
        if (e.code === 'ENOTFOUND') errorMsg = `DNS failure: ${e.hostname || 'Jupiter API'} unreachable`;
        else if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') errorMsg = `Network timeout reaching Jupiter API`;
        console.error(chalk.red(`[SNIPER #${id}]: Jupiter Swap Failed: ${errorMsg}`));
        return { success: false, error: errorMsg };
    }
}

async function fetchCurrentPrice(mint, amount) {
    // 1. Try Jupiter lite-api, fallback to v6
    try {
        let res;
        try {
            const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${mint}&outputMint=${WSOL_MINT.toString()}&amount=${amount}&slippageBps=100`;
            res = await axios.get(quoteUrl, { timeout: 8000 });
        } catch (liteErr) {
            const fallbackUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${mint}&outputMint=${WSOL_MINT.toString()}&amount=${amount}&slippageBps=100`;
            res = await axios.get(fallbackUrl, { timeout: 8000 });
        }

        if (res && res.data && res.data.outAmount) {
            const solValue = Number(res.data.outAmount) / 1e9;
            const currentPrice = solValue / Number(amount);
            return { solValue, currentPrice, source: 'JUPITER' };
        }
    } catch (e) {
        // Jupiter completely failed, try DexScreener
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
        console.error(chalk.red(`[SNIPER]: Price fetch failed for ${mint}: ${e.message}`));
    }

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
        const account = await withRetry(() => connection.getAccountInfo(bondingCurvePDA));
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
async function buyToken(mint, bondingCurve, associatedBondingCurve) {
    try {
        const balance = await withRetry(() => connection.getBalance(wallet.publicKey));
        const SOL_AMOUNT = 0.03;
        const mintStr = mint.toString();

        // ── Safety Gate 1: Per-token cooldown + daily cap ──
        if (!canBuy(mintStr)) return;

        const requiredBalance = (SOL_AMOUNT + MIN_BALANCE_GUARD) * 1e9;
        if (balance < requiredBalance) {
            const pubkey = wallet.publicKey.toString();
            console.log(chalk.yellow(`[SNIPER #${id}]: Insufficient funds (Need >${SOL_AMOUNT + MIN_BALANCE_GUARD} SOL). Balance: ${(balance / 1e9).toFixed(4)} SOL`));
            console.log(chalk.cyan(`[SNIPER #${id}]: ➡️ FUND WALLET: ${pubkey}`));
            if (process.send) {
                process.send({
                    type: 'AGENT_COMMS',
                    from: 'SNIPER',
                    msg: `Stalled due to low balance. Requires ${SOL_AMOUNT + MIN_BALANCE_GUARD} SOL at ${pubkey.substring(0, 8)}...`,
                    timestamp: new Date().toISOString()
                });
            }
            return;
        }

        // Register this token as being bought (cooldown)
        recentBuys.set(mintStr, Date.now());
        dailySpend += SOL_AMOUNT;
        saveSpend();
        console.log(chalk.green(`[SNIPER #${id}]: 🎯 CALCULATING ENTRY for ${mintStr}... [Daily: ${dailySpend.toFixed(4)}/${MAX_DAILY_SPEND_SOL} SOL]`));

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
                    entryPrice: realEntryPrice,  // SOL per UI token — matches DexScreener priceNative
                    entryPriceUnit: 'ui',         // flag: already per UI token, banker should NOT multiply by 10^decimals
                    amount: outAmt,
                    uiAmount: uiAmount,
                    entrySol: SOL_AMOUNT,
                    timestamp: Date.now(),
                    maxHoldUntil: Date.now() + (25 * 60 * 1000), // [TIGHTENED] 25min max hold
                    moonbagSecured: false,
                    source: 'JUPITER'
                });
                saveTrades(trades);
                console.log(chalk.green(`[SNIPER #${id}]: 📌 Position recorded | Entry: ${realEntryPrice.toFixed(10)} SOL/uiToken | Amount: ${uiAmount.toLocaleString()} tokens`));
                GlobalMemory.addMemory('SNIPER', `Entered ${mintStr} via Jupiter. ${SOL_AMOUNT} SOL @ ${realEntryPrice.toExponential(3)} SOL/uiToken.`, 7);
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
                                entryPrice: realEntryPrice,
                                entryPriceUnit: 'ui',
                                amount: quote.tokenAmount.toString(),
                                uiAmount: uiAmount,
                                entrySol: SOL_AMOUNT,
                                timestamp: Date.now(),
                                maxHoldUntil: Date.now() + (25 * 60 * 1000),
                                moonbagSecured: false,
                                source: 'PUMP_FUN_PYTHON'
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
    console.log(chalk.magenta(`[SNIPER #${id}]: 📉 INITIATING SELL: ${amount} of ${mint} [${reason}]`));

    try {
        const mintPub = new PublicKey(mint);
        const bondingCurve = getBondingCurvePDA(mintPub);
        const curve = await getBondingCurveAccount(bondingCurve);

        // ── JUPITER ROUTE (Post-Migration) ──
        if (!curve || curve.complete) {
            console.log(chalk.blue(`[SNIPER #${id}]: Curve complete. Selling via JUPITER...`));
            const result = await executeJupiterSwap(mint.toString(), WSOL_MINT.toString(), amount);
            if (result.success) {
                GlobalMemory.addMemory('SNIPER', `Sold ${mint.toString()} via Jupiter upon curve completion. Reason: ${reason}.`, 6);
                if (process.send) process.send({ type: 'KICK_UP', amount: Number(result.outAmount) / 1e9, source: 'TRADE_EXIT_JUPITER' });
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
                            GlobalMemory.addMemory('SNIPER', `Successfully sold ${mint.toString()} via Pump.fun Python Muscle. Reason: ${reason}. Slippage was ${riskParams.slippage}.`, Math.abs(parseInt(reason)) > 1 ? 8 : 6);
                            process.send({ type: 'KICK_UP', amount: Number(quote.solAmount) / 1e9, source: 'TRADE_EXIT_PYTHON' });
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
                const sigs = await withRetry(() => connection.getSignaturesForAddress(new PublicKey(walletAddr), { limit: 1 }));
                if (sigs.length === 0) continue;

                const latestSig = sigs[0].signature;
                if (lastSeenSigs[walletAddr] === latestSig) continue;

                if (!lastSeenSigs[walletAddr]) {
                    lastSeenSigs[walletAddr] = latestSig;
                    continue;
                }

                lastSeenSigs[walletAddr] = latestSig;
                console.log(chalk.yellow(`[SNIPER #${id}]: 🔔 ACTIVITY ON TARGET: ${walletAddr.substring(0, 8)}...`));

                const tx = await withRetry(() => connection.getParsedTransaction(latestSig, { maxSupportedTransactionVersion: 0 }));
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
            let pnl = 0;

            const mintPub = new PublicKey(trade.mint);
            const bondingCurve = getBondingCurvePDA(mintPub);
            const curve = await getBondingCurveAccount(bondingCurve);

            if (curve && !curve.complete) {
                const quote = calculateSellQuote(curve, BigInt(trade.amount));
                currentSolValue = Number(quote.solAmount) / 1e9;

                // standardizing to UI units: SOL per UI token (6 decimals for pump.fun)
                const decimals = 6;
                const uiAmount = Number(trade.amount) / Math.pow(10, decimals);
                const currentPrice = uiAmount > 0 ? currentSolValue / uiAmount : 0;

                // Use stored entryPrice (always SOL/uiToken in new format)
                const entryPrice = trade.entryPrice || currentPrice;
                pnl = ((currentPrice - entryPrice) / entryPrice) * 100;
            } else {
                const priceData = await fetchCurrentPrice(trade.mint, trade.amount);
                if (priceData) {
                    currentSolValue = priceData.solValue;
                    const currentPrice = priceData.currentPrice; // fetchCurrentPrice returns price per UI token
                    const entryPrice = trade.entryPrice || currentPrice;
                    pnl = ((currentPrice - entryPrice) / entryPrice) * 100;
                } else {
                    console.log(chalk.yellow(`  ⚠️ ${trade.mint.substring(0, 6)}: Price unavailable, skipping PnL check.`));
                    continue;
                }
            }

            console.log(chalk.blue(`  💎 ${trade.mint.substring(0, 6)}: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}% | Val: ${currentSolValue.toFixed(4)} SOL`));

            if (!trade.moonbagSecured && pnl >= 100) {
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
            else if (trade.moonbagSecured && pnl < 50) {
                console.log(chalk.red.bold(`[SNIPER #${id}]: 📉 TRAILING STOP (Moonbag): ${trade.mint} (+${pnl.toFixed(2)}%)`));
                GlobalMemory.addMemory('SNIPER', `Token ${trade.mint} dipped below trailing stop after moonbag. Liquidating.`, 7);
                await sellToken(trade.mint, trade.amount, 'TRAILING_STOP');
                trades.splice(i, 1);
                saveTrades(trades);
            }
            else if (!trade.moonbagSecured && trade.highestPnl > 25 && pnl < 10) {
                // [NEW] Pre-Moonbag Trailing Stop
                console.log(chalk.red.bold(`[SNIPER #${id}]: 📉 PRE-MOONBAG TRAIL: ${trade.mint} (+${pnl.toFixed(2)}%)`));
                GlobalMemory.addMemory('SNIPER', `Token ${trade.mint} hit +25% but dumped to +10% before moonbag. Liquidating to save profits.`, 7);
                await sellToken(trade.mint, trade.amount, 'PRE_MOONBAG_TRAIL');
                trades.splice(i, 1);
                saveTrades(trades);
            }
            else if (!trade.moonbagSecured && pnl <= riskParams.stopLoss) {
                console.log(chalk.red.bold(`[SNIPER #${id}]: 🛑 STOP LOSS: ${trade.mint} (${pnl.toFixed(2)}%)`));
                GlobalMemory.addMemory('SNIPER', `Token ${trade.mint} hit STOP LOSS (${pnl.toFixed(2)}%). This was a bad entry or a rug.`, 10);
                await sellToken(trade.mint, trade.amount, 'STOP_LOSS');
                trades.splice(i, 1);
                saveTrades(trades);
            }
        }
    } catch (e) {
        console.log(chalk.yellow(`[SNIPER #${id}]: Price check error: ${e.message}`));
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
    if (trades.length >= MAX_OPEN_POSITIONS) {
        console.log(chalk.gray(`[SNIPER #${id}]: 📊 At position limit (${trades.length}/${MAX_OPEN_POSITIONS}). Skipping scan.`));
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

loadSpend();
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
    }
});
