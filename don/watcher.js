// don/watcher.js - THE WATCHER (WHALE TRACKING v2)
// Monitors high-conviction whale wallets for significant trades with dedup and IPC alerts
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Watcher';
const SOLANA_RPC = process.env.SOLANA_RPC_URL;

if (!SOLANA_RPC) {
    console.log(chalk.red(`[WATCHER #${id}]: ❌ No SOLANA_RPC_URL. Cannot track whales.`));
    process.exit(0);
}

// High-Conviction Whale Wallets (Verified addresses — top Solana traders)
const WHALES = [
    { address: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', name: 'Whale Alpha' },
    { address: 'Cz4ZrPCMzx5Bew1F3TJfqPFR5p53uNn3mLBqav9Ah3Ku', name: 'DeFi Degen' },
    { address: 'JBnJnTP2iGP89r6meMWrM745hLgqKjDC1hYjECFusPB', name: 'Smart Money #1' },
    // Verified high-PnL wallets from Birdeye/Solscan on-chain leaderboards
    { address: 'Hf9NL8WTiCK59DVnD9Kgt4qEofUS8Yz3m8Y4wSoxcLWH', name: 'Degen Apex' },
    { address: 'CknB7mJ7PdHPBkRQFiRjbZ2Py4jKgBaMBi1eGCdGExnp', name: 'Pump Pro #1' },
    { address: 'AzFD4LWx5vDKVaMBNByLuamtNwkwicbqBpTjDBEV8dfE', name: 'Meme King' },
    { address: '7WUegkBHkcTFCnNEBW2PTnUe1qdAbpZqT2Ywn1DMf1ct', name: 'Alpha Caller' },
    { address: 'J2RNWdFBCBYUeAiVEfTMRWEbhHAUUUMLHTF6hpNMXxTb', name: 'SOL Shark' },
    { address: 'CtXoMCNdPS2tZcTFKJBbHB7Nd95TqjQVzjPehiHGrAXe', name: 'Velocity Trader' },
];

// Track last seen signatures per whale (dedup)
const lastSignatures = {};
// Track total movements detected
let movementsDetected = 0;

// Rate limit backoff state
let backoffMs = 0;
const BACKOFF_INITIAL = 30000;   // 30s first backoff
const BACKOFF_MAX = 300000;      // 5min max backoff
const STAGGER_MS = 2000;         // 2s between each whale check

console.log(chalk.cyan.bold(`[WATCHER #${id}]: 👁️ WHALE TRACKING v2 ACTIVE.`));
console.log(chalk.cyan(`[WATCHER #${id}]: Monitoring ${WHALES.length} predator wallets.`));

async function checkWhale(whale) {
    try {
        // Skip obviously invalid addresses
        if (whale.address.includes('...') || whale.address.length < 32) return;

        const response = await axios.post(SOLANA_RPC, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [whale.address, { limit: 3 }]
        }, { timeout: 10000 });

        const sigs = response.data.result;
        if (!sigs || sigs.length === 0) return;

        const latestSig = sigs[0].signature;

        // Check if this is a new transaction we haven't seen
        if (lastSignatures[whale.address] === latestSig) return;

        // First run: just record, don't alert
        if (!lastSignatures[whale.address]) {
            lastSignatures[whale.address] = latestSig;
            return;
        }

        // New transaction detected!
        lastSignatures[whale.address] = latestSig;
        movementsDetected++;

        console.log(chalk.cyan.bold(`[WATCHER #${id}]: 🐋 WHALE MOVEMENT! ${whale.name}`));
        console.log(chalk.cyan(`[WATCHER #${id}]: Sig: ${latestSig.substring(0, 20)}...`));

        // Try to analyze the transaction
        try {
            const tx = await axios.post(SOLANA_RPC, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: [latestSig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
            }, { timeout: 10000 });

            const txData = tx.data.result;
            if (txData && txData.meta) {
                const preBalances = txData.meta.preBalances;
                const postBalances = txData.meta.postBalances;

                if (preBalances && postBalances && preBalances.length > 0) {
                    const solChange = ((postBalances[0] - preBalances[0]) / 1e9).toFixed(4);
                    const direction = parseFloat(solChange) > 0 ? 'RECEIVED' : 'SENT';
                    const absChange = Math.abs(parseFloat(solChange));

                    if (absChange < 0.001) {
                        // Check for token changes before dismissing
                        const hasTokenChange = (txData.meta.postTokenBalances || []).some(post => {
                            const pre = (txData.meta.preTokenBalances || []).find(p => p.accountIndex === post.accountIndex);
                            return !pre || pre.uiTokenAmount.uiAmount !== post.uiTokenAmount.uiAmount;
                        });

                        if (!hasTokenChange) {
                            // console.log(chalk.gray(`[WATCHER #${id}]: ${whale.name} - Negligible movement (Dust). Ignoring.`));
                            return;
                        }
                    }

                    console.log(chalk.cyan(`[WATCHER #${id}]: ${direction} ${absChange} SOL`));

                    if (process.send) {
                        process.send({
                            type: 'INTEL_DATA',
                            data: `WHALE ${whale.name}: ${direction} ${absChange} SOL. Sig: ${latestSig.substring(0, 16)}...`,
                            source: 'WATCHER_SURVEILLANCE'
                        });

                        // Big move alert
                        if (absChange > 10) {
                            process.send({
                                type: 'SIREN_SPEAK',
                                text: `Watcher alert. ${whale.name} just ${direction.toLowerCase()} ${absChange.toFixed(1)} SOL.`
                            });
                        }
                    }
                }

                // Check for swap/trade instructions
                const logs = (txData.meta && txData.meta.logMessages) ? txData.meta.logMessages : [];
                const isSwap = logs.some(l => l.includes('Instruction: Swap') || l.includes('Instruction: Buy') || l.includes('Route'));

                if (isSwap) {
                    console.log(chalk.yellow.bold(`[WATCHER #${id}]: 🔥 SWAP DETECTED from ${whale.name}!`));

                    // Copy Trade Analysis (Cannibalized from open-sol-bot)
                    // We need to find the token bought.
                    // In a Swap, the "postTokenBalances" usually shows an increase in the target token.
                    const postToken = txData.meta.postTokenBalances || [];
                    const preToken = txData.meta.preTokenBalances || [];

                    let boughtToken = null;
                    let boughtAmount = 0;

                    // Identify token account that INCREASED
                    let preTokenMap = null;

                    for (const post of postToken) {
                        if (post.owner === whale.address) {
                            if (!preTokenMap) {
                                preTokenMap = new Map();
                                for (let i = 0; i < preToken.length; i++) {
                                    preTokenMap.set(preToken[i].accountIndex, preToken[i]);
                                }
                            }

                            const pre = preTokenMap.get(post.accountIndex);
                            const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmount || 0) : 0;
                            const postAmount = parseFloat(post.uiTokenAmount.uiAmount || 0);

                            if (postAmount > preAmount) {
                                boughtToken = post.mint;
                                boughtAmount = postAmount - preAmount;
                                break; // Assume first increase is the buy (simple copy)
                            }
                        }
                    }

                    if (boughtToken && boughtToken !== 'So11111111111111111111111111111111111111112') { // Ignore WSOL
                        console.log(chalk.green(`[WATCHER #${id}]: 🎯 COPY TRADE SIGNAL: ${boughtToken}`));

                        if (process.send) {
                            process.send({
                                type: 'COPY_TRADE_SIGNAL',
                                whale: whale.name,
                                mint: boughtToken,
                                detectedAmount: boughtAmount,
                                confidence: 'HIGH'
                            });

                            process.send({
                                type: 'SIREN_SPEAK',
                                text: `Copy trade alert. ${whale.name} is accumulating token ${boughtToken.substring(0, 4)}. Sending signal to Sniper.`
                            });
                        }
                    }
                }
            }
        } catch (txErr) {
            // Transaction details unavailable, just log the movement
        }

    } catch (e) {
        if (e.response?.status === 429 || e.code === 'ERR_BAD_RESPONSE') {
            backoffMs = backoffMs ? Math.min(backoffMs * 2, BACKOFF_MAX) : BACKOFF_INITIAL;
            console.log(chalk.yellow(`[WATCHER #${id}]: ⏳ Rate limited. Backing off ${(backoffMs / 1000).toFixed(0)}s...`));
            await new Promise(r => setTimeout(r, backoffMs));
            return; // skip this whale, resume on next cycle
        }
        // Silent retry for other errors
    }
}

async function trackWhales() {
    // Concurrent checks in batches — improves speed while avoiding RPC rate limits
    const BATCH_SIZE = 3;
    for (let i = 0; i < WHALES.length; i += BATCH_SIZE) {
        const batch = WHALES.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(whale => checkWhale(whale)));

        // Stagger between batches to respect rate limits
        if (i + BATCH_SIZE < WHALES.length) {
            await new Promise(r => setTimeout(r, STAGGER_MS));
        }
    }

    // Successful cycle = reset backoff
    if (backoffMs > 0) {
        backoffMs = 0;
        console.log(chalk.green(`[WATCHER #${id}]: ✅ Rate limit cleared. Resuming normal cadence.`));
    }

    // Periodic status log
    if (movementsDetected > 0 && movementsDetected % 5 === 0) {
        console.log(chalk.gray(`[WATCHER #${id}]: ${movementsDetected} whale movements tracked this session.`));
    }

    // Scan every 60 seconds (was 30 — too aggressive for most RPCs)
    setTimeout(trackWhales, 60000);
}

// IPC Listener
process.on('message', (msg) => {
    if (msg.type === 'ADD_WHALE') {
        if (msg.address && msg.name) {
            WHALES.push({ address: msg.address, name: msg.name });
            console.log(chalk.cyan(`[WATCHER #${id}]: 🐋 Added whale: ${msg.name} (${msg.address.substring(0, 8)}...)`));
        }
    } else if (msg.type === 'WATCHER_STATUS') {
        if (process.send) {
            process.send({
                type: 'INTEL_DATA',
                data: `Watcher: Tracking ${WHALES.length} whales. ${movementsDetected} movements detected.`,
                source: 'WATCHER_STATUS'
            });
        }
    }
});

if (require.main === module) { trackWhales(); } module.exports = { trackWhales, WHALES };
