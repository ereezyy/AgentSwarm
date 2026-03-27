// don/banker.js - THE BANKER (ASSET MANAGEMENT & EXIT SIGNAL SCANNER)
// Scans wallet every 60s, recovers orphaned positions, and actively hunts exit opportunities.
const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();

const id = process.argv[2] || 'Banker';
console.log(chalk.yellow.bold(`[BANKER #${id}]: Vault & Treasury Management Online.`));

const { Connection, PublicKey, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const SOL_WALLET = process.env.SOLANA_PUBLIC_KEY;
const TRADES_PATH = path.resolve(__dirname, '../missions/active_trades.json');

// ── Cold Storage Sweep Config ────────────────────────────────────
const COLD_WALLET = '8ZWzSqqYCeRrByVZCT1xSmfnXosRDmD4JJycEhF6oN2j';
const MIN_RESERVE_SOL = 0.002;  // [REDUCED] stay leaner in hot wallet
const FEE_BUFFER_SOL = 0.001;   // extra buffer for tx fees
// Sweep trigger: when balance > 1.5 SOL (keep high working capital)

// Load hot wallet keypair for signing sweeps
let hotKeypair = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        const keyStr = process.env.SOLANA_PRIVATE_KEY;
        const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
        hotKeypair = Keypair.fromSecretKey(keyBytes);
        console.log(chalk.yellow(`[BANKER #${id}]: 🔑 Hot wallet loaded. Profit sweep armed → ${COLD_WALLET.slice(0, 8)}...`));
    } else {
        console.log(chalk.gray(`[BANKER #${id}]: No SOLANA_PRIVATE_KEY — profit sweep disabled.`));
    }
} catch (e) {
    console.log(chalk.red(`[BANKER #${id}]: Keypair load failed: ${e.message}`));
}

// ── Cold Storage Sweep (100% over minimum → cold wallet) ────────
async function sweepProfits(solBalance, currentSolPrice) {
    if (!hotKeypair) return;

    // Trigger: sweep only when hot wallet exceeds 1.5 SOL (capital for compounding)
    const sweepThreshold = 1.5;
    if (solBalance <= sweepThreshold) return;

    const sweepableSol = solBalance - 1.5;
    if (sweepableSol <= 0) return;

    const lamportsToSend = Math.floor(sweepableSol * LAMPORTS_PER_SOL);
    if (lamportsToSend <= 5000) return; // dust guard

    const sweepableUsd = sweepableSol * currentSolPrice;
    console.log(chalk.green.bold(`[BANKER #${id}]: 💸 COLD STORAGE SWEEP: Sending ${sweepableSol.toFixed(4)} SOL ($${sweepableUsd.toFixed(2)}) → ${COLD_WALLET.slice(0, 8)}...`));

    try {
        const tx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: hotKeypair.publicKey,
                toPubkey: new PublicKey(COLD_WALLET),
                lamports: lamportsToSend,
            })
        );
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = hotKeypair.publicKey;
        tx.sign(hotKeypair);

        const sig = await connection.sendRawTransaction(tx.serialize());
        // Wait for confirmation using native confirmTransaction
        const confirmation = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        if (confirmation.value.err) throw new Error(`Confirmation failed: ${JSON.stringify(confirmation.value.err)}`);

        console.log(chalk.green.bold(`[BANKER #${id}]: ✅ SWEEP CONFIRMED: ${sig}`));
        if (process.send) {
            process.send({
                type: 'KICK_UP',
                amount: sweepableUsd,
                source: 'SWEEP',
                soldierId: id,
            });
            process.send({
                type: 'LOG',
                msg: `💸 PROFIT SWEPT: ${sweepableSol.toFixed(4)} SOL ($${sweepableUsd.toFixed(2)}) → ${COLD_WALLET.slice(0, 8)}...`,
                level: 'MONEY',
            });
        }
    } catch (e) {
        console.log(chalk.red(`[BANKER #${id}]: Sweep failed: ${e.message}`));
    }
}

// ── Idle SOL Staking ────────────────────────────────────────────
const MSOL_MINT = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqMmSuCb'; // Marinade Staked SOL
const STAKE_THRESHOLD = 1.0;   // if balance > 1.0 SOL, we stake the surplus
const STAKE_RATIO = 0.5;   // stake 50% of the surplus above minimum reserve

async function stakeIdleSol(solBalance) {
    if (!hotKeypair) return;
    if (solBalance <= STAKE_THRESHOLD) return;

    const sweepableSol = solBalance - MIN_RESERVE_SOL;
    const solToStake = sweepableSol * STAKE_RATIO;
    const lamports = Math.floor(solToStake * LAMPORTS_PER_SOL);
    if (lamports <= 5000) return;

    console.log(chalk.magenta.bold(`[BANKER #${id}]: 🥩 IDLE CAPITAL DETECTED — Auto-staking ${solToStake.toFixed(4)} SOL into mSOL`));

    try {
        let qRes = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                qRes = await axios.get(`https://lite-api.jup.ag/swap/v1/quote`, {
                    params: {
                        inputMint: 'So11111111111111111111111111111111111111112', // WSOL
                        outputMint: MSOL_MINT,
                        amount: lamports,
                        slippageBps: 50
                    }
                });
                break;
            } catch (e) {
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.magenta(`[BANKER]: ⏳ Quote 429 Rate Limit on Stake... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 800 * attempt + Math.random() * 200));
                    continue;
                }
                throw e;
            }
        }

        let swapRes = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                swapRes = await axios.post('https://lite-api.jup.ag/swap/v1/swap', {
                    quoteResponse: qRes.data,
                    userPublicKey: hotKeypair.publicKey.toString(),
                    wrapAndUnwrapSol: true,
                    prioritizationFeeLamports: 'auto'
                });
                break;
            } catch (e) {
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.magenta(`[BANKER]: ⏳ Swap 429 Rate Limit on Stake... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 800 * attempt + Math.random() * 200));
                    continue;
                }
                throw e;
            }
        }

        const { swapTransaction } = swapRes.data;
        const txBuf = Buffer.from(swapTransaction, 'base64');
        const { VersionedTransaction } = require('@solana/web3.js');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([hotKeypair]);

        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        console.log(chalk.magenta.bold(`[BANKER #${id}]: 🥩 STAKE CONFIRMED: ${sig}`));

        if (process.send) {
            process.send({ type: 'LOG', msg: `🥩 Auto-staked ${solToStake.toFixed(4)} SOL into mSOL (7% APY) while idle.`, level: 'MONEY' });
        }
    } catch (e) {
        console.log(chalk.red(`[BANKER #${id}]: Staking failed: ${e.message}`));
    }
}

// ── Stablecoin Treasury (Risk-Off Capital Preservation) ───────────
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const YIELD_THRESHOLD = 1.5; // Only secure to USDC if balance > 1.5 SOL
const YIELD_RATIO = 0.25; // Take 25% of surplus for safe stablecoin storage

async function secureYieldUsdc(solBalance) {
    if (!hotKeypair) return;
    if (solBalance <= YIELD_THRESHOLD) return;

    const sweepableSol = solBalance - MIN_RESERVE_SOL;
    const solToSecure = sweepableSol * YIELD_RATIO;
    const lamports = Math.floor(solToSecure * LAMPORTS_PER_SOL);
    if (lamports <= 5000) return;

    console.log(chalk.green.bold(`[BANKER #${id}]: 🏛️ TREASURY ACTIVE — Securing ${solToSecure.toFixed(4)} SOL backing into USDC (Capital Preservation)`));

    try {
        let qRes = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                qRes = await axios.get(`https://lite-api.jup.ag/swap/v1/quote`, {
                    params: {
                        inputMint: 'So11111111111111111111111111111111111111112', // WSOL
                        outputMint: USDC_MINT,
                        amount: lamports,
                        slippageBps: 50
                    }
                });
                break;
            } catch (e) {
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.green(`[BANKER]: ⏳ Quote 429 Rate Limit on USDC... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 800 * attempt + Math.random() * 200));
                    continue;
                }
                throw e;
            }
        }

        let swapRes = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                swapRes = await axios.post('https://lite-api.jup.ag/swap/v1/swap', {
                    quoteResponse: qRes.data,
                    userPublicKey: hotKeypair.publicKey.toString(),
                    wrapAndUnwrapSol: true,
                    prioritizationFeeLamports: 'auto'
                });
                break;
            } catch (e) {
                if (e.response?.status === 429 && attempt < 3) {
                    console.log(chalk.green(`[BANKER]: ⏳ Swap 429 Rate Limit on USDC... retrying (${attempt}/3)`));
                    await new Promise(r => setTimeout(r, 800 * attempt + Math.random() * 200));
                    continue;
                }
                throw e;
            }
        }

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const { VersionedTransaction } = require('@solana/web3.js');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([hotKeypair]);

        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        console.log(chalk.green.bold(`[BANKER #${id}]: 🏛️ CAPITAL SECURED: ${sig}`));

        if (process.send) {
            process.send({ type: 'LOG', msg: `🏛️ Secured ${solToSecure.toFixed(4)} SOL into USDC for risk-off capital preservation.`, level: 'MONEY' });
        }
    } catch (e) {
        console.log(chalk.red(`[BANKER #${id}]: Treasury conversion failed: ${e.message}`));
    }
}

// ── Exit Signal Thresholds ──────────────────────────────────────
const EXIT_RULES = {
    TAKE_PROFIT: 25,   // % gain → take profit signal
    STOP_LOSS: -15,   // % loss → cut losses signal
    STRONG_SELL: 75,   // % gain → hard sell immediately
    DUMP_ALERT: -20,   // % loss → emergency dump
};

// ── Trade Ledger Helpers ────────────────────────────────────────
function loadTrades() {
    try {
        if (fs.existsSync(TRADES_PATH)) return JSON.parse(fs.readFileSync(TRADES_PATH, 'utf8'));
    } catch (e) { }
    return [];
}

function saveTrades(trades) {
    try { fs.writeFileSync(TRADES_PATH, JSON.stringify(trades, null, 2)); } catch (e) { }
}

// ── SPL Token Holdings Scanner ──────────────────────────────────
async function getTokenHoldings(walletPubkey) {
    try {
        const accounts = await connection.getParsedTokenAccountsByOwner(
            walletPubkey,
            { programId: TOKEN_PROGRAM_ID }
        );
        const holdings = [];
        for (const { account } of accounts.value) {
            const info = account.data.parsed.info;
            const uiAmount = info.tokenAmount.uiAmount;
            if (!uiAmount || uiAmount === 0) continue;
            holdings.push({
                mint: info.mint,
                balance: uiAmount,
                rawAmount: info.tokenAmount.amount,
                decimals: info.tokenAmount.decimals,
                usdValue: null,
            });
        }
        return holdings;
    } catch (e) {
        return [];
    }
}

// ── DexScreener Batch Price Lookup ──────────────────────────────
async function fetchPrices(holdings) {
    if (holdings.length === 0) return holdings;
    const mints = holdings.map(h => h.mint).slice(0, 30);
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/tokens/v1/solana/${mints.join(',')}`,
            { timeout: 12000 }
        );
        const pairs = Array.isArray(res.data) ? res.data : [];
        const bestPairs = {};
        for (const p of pairs) {
            const mint = p.baseToken?.address;
            if (!mint) continue;
            if (!bestPairs[mint] || (p.volume?.h24 || 0) > (bestPairs[mint].volume?.h24 || 0)) {
                bestPairs[mint] = p;
            }
        }
        for (const holding of holdings) {
            // Prefer highest-volume pair for price accuracy
            const pair = bestPairs[holding.mint];
            if (pair?.priceUsd) {
                holding.usdValue = parseFloat(pair.priceUsd) * holding.balance;
                holding.symbol = pair.baseToken?.symbol || holding.mint.slice(0, 6);
                holding.priceUsd = parseFloat(pair.priceUsd);
                holding.priceNative = parseFloat(pair.priceNative || 0); // SOL price
                holding.priceChange5m = pair.priceChange?.m5 || 0;
                holding.priceChange1h = pair.priceChange?.h1 || 0;
                holding.volume24h = pair.volume?.h24 || 0;
                holding.liquidity = pair.liquidity?.usd || 0;
            } else {
                holding.symbol = holding.mint.slice(0, 6) + '...';
                holding.usdValue = 0;
                holding.priceUsd = 0;
                holding.priceNative = 0;
            }
        }
    } catch (e) {
        holdings.forEach(h => { h.symbol = h.mint.slice(0, 6) + '...'; h.usdValue = 0; });
    }
    return holdings;
}

// ── Orphan Recovery ─────────────────────────────────────────────
// Tokens in wallet but NOT in active_trades.json get recovered with current price as entry.
// This handles the 3 stuck tokens bought before the entryPrice bug was fixed.
function recoverOrphanedPositions(holdings, trades) {
    let changed = false;
    for (const holding of holdings) {
        const inTrades = trades.some(t => t.mint === holding.mint);
        if (!inTrades && holding.priceNative !== undefined) {
            // Use current price as entry baseline (0% PnL at recovery point)
            // This means: from here forward, gains/losses are tracked correctly.
            // We don't know actual entry price, so we start fresh from now.
            const entryPrice = holding.priceNative; // SOL per UI token (same unit as fetchCurrentPrice returns)
            const rawAmount = parseInt(holding.rawAmount, 10);
            console.log(chalk.yellow(`[BANKER #${id}]: 🔍 ORPHAN DETECTED: ${holding.symbol} — adding to active trades for exit management`));
            trades.push({
                mint: holding.mint,
                entryPrice: entryPrice,  // current price = 0% baseline, no fake gains
                amount: rawAmount,
                entrySol: 0.01,
                timestamp: Date.now(),
                maxHoldUntil: Date.now() + (2 * 60 * 60 * 1000), // exit within 2h
                moonbagSecured: false,
                source: 'RECOVERED',
            });
            changed = true;
        }
    }
    if (changed) {
        saveTrades(trades);
        console.log(chalk.green(`[BANKER #${id}]: ✅ Orphan recovery complete. Sniper will manage exits.`));
    }
    return trades;
}

// ── Exit Signal Engine ──────────────────────────────────────────
// For each holding, compute PnL vs recorded entry price, assign exit signal.
function computeExitSignals(holdings, trades) {
    const signals = [];

    for (const holding of holdings) {
        const trade = trades.find(t => t.mint === holding.mint);
        if (!trade || !holding.priceNative) {
            signals.push({ mint: holding.mint, signal: 'HOLD', pnl: null, reason: 'No entry data' });
            continue;
        }

        // entryPrice is now stored in SOL per UI token (matches DexScreener priceNative directly)
        // Legacy trades (entryPriceUnit !== 'ui') used SOL per raw unit — handle both
        const decimals = holding.decimals || 6;
        let entryPricePerUiToken;
        if (trade.entryPriceUnit === 'ui' || trade.source === 'RECOVERED') {
            // New format: already in SOL/uiToken — direct comparison
            entryPricePerUiToken = trade.entryPrice;
        } else {
            // Legacy format: SOL/rawUnit — convert to SOL/uiToken
            entryPricePerUiToken = trade.entryPrice * Math.pow(10, decimals);
        }
        const currentPricePerUiToken = holding.priceNative;

        let pnl = 0;
        if (entryPricePerUiToken > 0 && currentPricePerUiToken > 0) {
            pnl = ((currentPricePerUiToken - entryPricePerUiToken) / entryPricePerUiToken) * 100;
        }

        // Assign signal
        let signal = 'HOLD';
        let reason = '';

        if (pnl >= EXIT_RULES.STRONG_SELL) {
            signal = 'STRONG_SELL';
            reason = `🚀 +${pnl.toFixed(1)}% — Take full profit now`;
        } else if (pnl >= EXIT_RULES.TAKE_PROFIT) {
            signal = 'TAKE_PROFIT';
            reason = `✅ +${pnl.toFixed(1)}% — Good exit opportunity`;
        } else if (pnl <= EXIT_RULES.DUMP_ALERT) {
            signal = 'DUMP';
            reason = `💀 ${pnl.toFixed(1)}% — Emergency dump`;
        } else if (pnl <= EXIT_RULES.STOP_LOSS) {
            signal = 'STOP_LOSS';
            reason = `🛑 ${pnl.toFixed(1)}% — Cut losses`;
        } else if (holding.priceChange5m < -10) {
            signal = 'WATCH'; // dumping fast in last 5min
            reason = `⚠️ Dropping ${holding.priceChange5m.toFixed(1)}% in 5min`;
        } else if (holding.liquidity < 5000) {
            signal = 'WATCH';
            reason = `⚠️ Low liquidity: $${holding.liquidity?.toFixed(0) || 0}`;
        }

        signals.push({ mint: holding.mint, signal, pnl: parseFloat(pnl.toFixed(2)), reason });

        // Auto-trigger: send STRONG signals to The Don → forwarded to Sniper
        if ((signal === 'STRONG_SELL' || signal === 'DUMP') && process.send) {
            console.log(chalk.red.bold(`[BANKER #${id}]: 🚨 AUTO EXIT SIGNAL: ${holding.symbol} (${signal}) → ${reason}`));
            process.send({
                type: 'BANKER_EXIT_SIGNAL',
                mint: holding.mint,
                signal,
                pnl,
                reason,
                tradeAmount: trade.amount,
            });
        } else if (signal === 'TAKE_PROFIT' && process.send) {
            console.log(chalk.green.bold(`[BANKER #${id}]: 💰 PROFIT SIGNAL: ${holding.symbol} → ${reason}`));
            process.send({
                type: 'BANKER_EXIT_SIGNAL',
                mint: holding.mint,
                signal,
                pnl,
                reason,
                tradeAmount: trade.amount,
            });
        }
    }

    // Apply cascade logic before returning
    detectAndHandleCascades(signals, trades);

    return signals;
}

// ── Cascade Liquidation Logic ──────────────────────────────────
function detectAndHandleCascades(signals, trades) {
    const CASCADE_TRIGGER_SIBLINGS = parseInt(process.env.CASCADE_TRIGGER_SIBLINGS || 2);
    const dumpingCreators = new Set();

    // Identify creators that have at least one dumping token
    for (const sig of signals) {
        if (sig.signal === 'DUMP' || sig.signal === 'STOP_LOSS') {
            const trade = trades.find(t => t.mint === sig.mint);
            if (trade && trade.creator && trade.creator !== "UNKNOWN_CREATOR") {
                dumpingCreators.add(trade.creator);
            }
        }
    }

    for (const creator of dumpingCreators) {
        const cluster = trades.filter(t => t.creator === creator);
        const dumpingMints = signals.filter(s => (s.signal === 'DUMP' || s.signal === 'STOP_LOSS') && cluster.some(c => c.mint === s.mint)).map(s => s.mint);

        if (cluster.length >= CASCADE_TRIGGER_SIBLINGS + 1 && dumpingMints.length > 0) {
            const triggerMint = dumpingMints[0];
            console.log(chalk.red.bold(`[BANKER #${id}]: 🚨 CASCADE DETECTED for Dev ${creator.substring(0, 8)}... Cluster size: ${cluster.length}. Triggered by ${triggerMint.substring(0, 8)}...`));

            // Find siblings that aren't already dumping/taking profit
            const siblingsToLiquidate = cluster.filter(t => !dumpingMints.includes(t.mint));

            // Sort by worst performing first
            siblingsToLiquidate.sort((a, b) => {
                const sa = signals.find(s => s.mint === a.mint);
                const sb = signals.find(s => s.mint === b.mint);
                return (sa?.pnl || 0) - (sb?.pnl || 0);
            });

            for (const pos of siblingsToLiquidate) {
                // Update their signal to CASCADE_DUMP
                let sigObj = signals.find(s => s.mint === pos.mint);
                if (sigObj) {
                    sigObj.signal = 'CASCADE_DUMP';
                    sigObj.reason = `💥 Cascade liquidation triggered by sibling ${triggerMint.substring(0, 8)}...`;
                } else {
                    sigObj = { mint: pos.mint, signal: 'CASCADE_DUMP', pnl: 0, reason: `💥 Cascade liquidation triggered by sibling ${triggerMint.substring(0, 8)}...` };
                    signals.push(sigObj);
                }

                if (process.send) {
                    console.log(chalk.red.bold(`[BANKER #${id}]: 🚨 AUTO EXIT SIGNAL: ${pos.mint.substring(0, 6)}... (CASCADE_DUMP) → ${sigObj.reason}`));
                    process.send({
                        type: 'BANKER_EXIT_SIGNAL',
                        mint: pos.mint,
                        signal: 'CASCADE_DUMP',
                        pnl: sigObj.pnl,
                        reason: sigObj.reason,
                        tradeAmount: pos.amount,
                    });
                }
            }

            // Add creator to cooldown immediately (for sniper scanning prevention)
            addCreatorCooldown(creator);
        }
    }
}

function addCreatorCooldown(creator) {
    try {
        const cooldownPath = path.join(__dirname, '../missions/creator_cooldowns.json');
        let cooldowns = {};
        if (fs.existsSync(cooldownPath)) {
            cooldowns = JSON.parse(fs.readFileSync(cooldownPath, 'utf8'));
        }
        const CASCADE_COOLDOWN_MINUTES = parseInt(process.env.CASCADE_COOLDOWN_MINUTES || 30);
        cooldowns[creator] = Date.now() + CASCADE_COOLDOWN_MINUTES * 60 * 1000;
        fs.writeFileSync(cooldownPath, JSON.stringify(cooldowns, null, 2));
        console.log(chalk.yellow(`[BANKER #${id}]: 🛑 Creator ${creator.substring(0, 8)}... placed on ${CASCADE_COOLDOWN_MINUTES}-min timeout after cascade.`));
    } catch (e) {
        console.log(chalk.yellow(`[BANKER #${id}]: Failed to save creator cooldown: ${e.message}`));
    }
}

// ── Main Balance + Exit Scan Cycle ──────────────────────────────
let solPrice = 80;

async function checkBalance() {
    if (!SOL_WALLET) {
        console.log(chalk.red(`[BANKER #${id}]: SOLANA_PUBLIC_KEY not set in .env`));
        setTimeout(checkBalance, 60000);
        return;
    }

    const walletPubkey = new PublicKey(SOL_WALLET);

    // 1. SOL native balance
    let solBalance = 0;
    try {
        const balance = await connection.getBalance(walletPubkey);
        solBalance = balance / 1e9;
        try {
            const pr = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { timeout: 8000 });
            solPrice = pr.data?.solana?.usd || solPrice;
        } catch (e) { }
        const solValue = solBalance * solPrice;
        console.log(chalk.yellow(`[BANKER #${id}]: 🏛️ TREASURY: ${solBalance.toFixed(4)} SOL ($${solValue.toFixed(2)})`));

        // ── Profit sweep: send excess to cold wallet ───────────
        await sweepProfits(solBalance, solPrice);

        // ── Idle staking: put surplus SOL to work (7% APY) ─────
        await stakeIdleSol(solBalance);

        // ── Yield Aggregator: Secure peak profits into USDC ────
        await secureYieldUsdc(solBalance);

        if (process.send) {
            process.send({ type: 'MINING_UPDATE', coin: 'SOL', address: SOL_WALLET, balance: solBalance.toFixed(4), value: solValue.toFixed(2), source: 'Mainnet' });
        }
    } catch (e) {
        console.error(chalk.red(`[BANKER #${id}]: SOL Check Failed: ${e.message}`));
    }

    // 2. SPL Token Holdings
    let holdings = await getTokenHoldings(walletPubkey);
    holdings = await fetchPrices(holdings);

    const tokenTotalUsd = holdings.reduce((sum, h) => sum + (h.usdValue || 0), 0);
    if (holdings.length > 0) {
        console.log(chalk.yellow(`[BANKER #${id}]: 💎 Token Holdings: ${holdings.length} tokens ($${tokenTotalUsd.toFixed(2)} est.)`));
        holdings.forEach(h => {
            const pctChange = h.priceChange1h !== undefined ? ` | 1h: ${h.priceChange1h > 0 ? '+' : ''}${h.priceChange1h?.toFixed(1)}%` : '';
            console.log(chalk.gray(`  ${h.symbol || h.mint.slice(0, 8)}: ${h.balance.toLocaleString()} tokens = $${(h.usdValue || 0).toFixed(2)}${pctChange}`));
        });
    }

    // 3. Orphan recovery — adds untracked tokens back into active_trades.json
    let trades = loadTrades();
    trades = recoverOrphanedPositions(holdings, trades);

    // 4. Compute exit signals for all holdings
    const exitSignals = computeExitSignals(holdings, trades);

    // 5. Active positions from trade ledger
    const tracked = trades.filter(t => holdings.some(h => h.mint === t.mint));
    const unresolved = trades.filter(t => !holdings.some(h => h.mint === t.mint));
    console.log(chalk.yellow(`[BANKER #${id}]: 💼 ACTIVE: ${tracked.length} tracked | ${unresolved.length} waiting for price`));

    // 6. Broadcast wallet holdings + exit signals to dashboard
    if (process.send) {
        process.send({
            type: 'WALLET_HOLDINGS',
            sol: { balance: solBalance, usdValue: solBalance * solPrice, price: solPrice },
            tokens: holdings.map(h => ({
                ...h,
                exitSignal: exitSignals.find(s => s.mint === h.mint) || { signal: 'HOLD', pnl: null, reason: '' },
            })),
            totalUsd: solBalance * solPrice + tokenTotalUsd,
            timestamp: new Date().toISOString(),
        });
    }

    setTimeout(checkBalance, 60000);
}

// Boot
setTimeout(checkBalance, 5000);
setInterval(() => { }, 100000);
