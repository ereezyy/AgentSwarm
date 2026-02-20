// don/mirror_protocol.js - THE MIRROR PROTOCOL (Algorithmic Whale Qualification)
// Stops copying luck; starts copying proven winners.
// Flow: Watcher spots big mover → Mirror audits PnL → "APPROVED_ALPHA" tag → Sniper copies
// Value: Only copy-trade wallets with proven profitable track records.

const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Mirror';
const SOLANA_RPC = process.env.SOLANA_RPC_URL;

// File paths
const WHALE_DB_PATH = path.resolve(__dirname, '../missions/whale_scorecard.json');
const missionsDir = path.join(__dirname, '../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

const MP = (msg) => chalk.hex('#00BFFF').bold(`[MIRROR #${id}]: ${msg}`);
const mp = (msg) => chalk.hex('#00BFFF')(`[MIRROR #${id}]: ${msg}`);

console.log(MP('🪞 Mirror Protocol ONLINE. Whale qualification active.'));

// ============================================================
// WHALE SCORECARD DATABASE
// ============================================================
function loadScorecard() {
    try {
        if (fs.existsSync(WHALE_DB_PATH)) return JSON.parse(fs.readFileSync(WHALE_DB_PATH, 'utf8'));
    } catch { }
    return {
        whales: {},
        config: {
            minWinRate: 0.55,       // 55% win rate minimum
            minTrades: 3,           // At least 3 observed trades
            minPnL: 0.5,           // At least 0.5 SOL total profit
            decayDays: 30,          // Score decays after 30 days of inactivity
            tiers: {
                S: { minWinRate: 0.70, minPnL: 5.0 },
                A: { minWinRate: 0.60, minPnL: 2.0 },
                B: { minWinRate: 0.55, minPnL: 0.5 },
                C: { minWinRate: 0.0, minPnL: 0.0 },   // Unqualified
            }
        }
    };
}

function saveScorecard(data) {
    fs.writeFileSync(WHALE_DB_PATH, JSON.stringify(data, null, 2));
}

// ============================================================
// WHALE PnL ANALYSIS
// ============================================================
async function analyzeWalletPnL(address) {
    const scorecard = loadScorecard();
    let whale = scorecard.whales[address];

    // Initialize if new whale
    if (!whale) {
        whale = {
            address,
            alias: null,
            tier: 'C',
            trades: [],
            stats: { wins: 0, losses: 0, totalPnL: 0, winRate: 0, avgReturn: 0 },
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            approved: false,
        };
    }

    whale.lastSeen = new Date().toISOString();

    // Try to fetch recent transactions for PnL analysis
    if (SOLANA_RPC) {
        try {
            const resp = await axios.post(SOLANA_RPC, {
                jsonrpc: '2.0', id: 1,
                method: 'getSignaturesForAddress',
                params: [address, { limit: 20 }]
            }, { timeout: 15000 });

            const signatures = resp.data?.result || [];

            // Analyze recent trades (simplified: check for token-related transactions)
            for (const sig of signatures.slice(0, 10)) {
                const tradeHash = sig.signature.substring(0, 16);

                // Skip already-processed trades
                if (whale.trades.some(t => t.hash === tradeHash)) continue;

                // Look at transaction details for swap/trade signals
                try {
                    const txResp = await axios.post(SOLANA_RPC, {
                        jsonrpc: '2.0', id: 1,
                        method: 'getTransaction',
                        params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
                    }, { timeout: 10000 });

                    const tx = txResp.data?.result;
                    if (!tx || !tx.meta) continue;

                    // Calculate SOL change (simple PnL proxy)
                    const preBalances = tx.meta.preBalances || [];
                    const postBalances = tx.meta.postBalances || [];
                    const accountKeys = tx.transaction?.message?.accountKeys || [];

                    // Find the whale's account index
                    const whaleIndex = accountKeys.findIndex(k =>
                        (typeof k === 'string' ? k : k.pubkey) === address
                    );

                    if (whaleIndex >= 0 && preBalances[whaleIndex] !== undefined) {
                        const solChange = (postBalances[whaleIndex] - preBalances[whaleIndex]) / 1e9;

                        // Only track significant trades (> 0.01 SOL change)
                        if (Math.abs(solChange) > 0.01) {
                            const trade = {
                                hash: tradeHash,
                                timestamp: new Date((sig.blockTime || 0) * 1000).toISOString(),
                                solChange: parseFloat(solChange.toFixed(4)),
                                profitable: solChange > 0,
                            };

                            whale.trades.push(trade);
                            if (trade.profitable) { whale.stats.wins++; } else { whale.stats.losses++; }
                            whale.stats.totalPnL += trade.solChange;
                        }
                    }
                } catch { /* tx fetch failed, skip */ }

                // Rate limiting
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (e) {
            console.log(chalk.yellow(`[MIRROR]: RPC analysis failed for ${address.substring(0, 8)}: ${e.message}`));
        }
    }

    // Recalculate stats
    const totalTrades = whale.stats.wins + whale.stats.losses;
    whale.stats.winRate = totalTrades > 0 ? whale.stats.wins / totalTrades : 0;
    whale.stats.avgReturn = totalTrades > 0 ? whale.stats.totalPnL / totalTrades : 0;

    // Determine tier
    const { tiers } = scorecard.config;
    if (whale.stats.winRate >= tiers.S.minWinRate && whale.stats.totalPnL >= tiers.S.minPnL) {
        whale.tier = 'S';
    } else if (whale.stats.winRate >= tiers.A.minWinRate && whale.stats.totalPnL >= tiers.A.minPnL) {
        whale.tier = 'A';
    } else if (whale.stats.winRate >= tiers.B.minWinRate && whale.stats.totalPnL >= tiers.B.minPnL) {
        whale.tier = 'B';
    } else {
        whale.tier = 'C';
    }

    // Check qualification
    whale.approved = (
        whale.stats.winRate >= scorecard.config.minWinRate &&
        totalTrades >= scorecard.config.minTrades &&
        whale.stats.totalPnL >= scorecard.config.minPnL
    );

    // Keep only last 50 trades
    if (whale.trades.length > 50) whale.trades = whale.trades.slice(-50);

    scorecard.whales[address] = whale;
    saveScorecard(scorecard);

    return whale;
}

// ============================================================
// QUALIFICATION GATE — Intercept whale signals
// ============================================================
async function qualifyWhaleSignal(msg) {
    const address = msg.whale || msg.address;
    if (!address) return;

    console.log(mp(`🔍 Qualifying whale: ${address.substring(0, 12)}...`));

    const whale = await analyzeWalletPnL(address);
    const totalTrades = whale.stats.wins + whale.stats.losses;

    const tierColors = { S: chalk.hex('#FFD700'), A: chalk.green, B: chalk.yellow, C: chalk.red };
    const colorFn = tierColors[whale.tier] || chalk.white;

    console.log(colorFn(`[MIRROR #${id}]: Whale ${address.substring(0, 8)}... → ${whale.tier}-Tier`));
    console.log(mp(`  Win Rate: ${(whale.stats.winRate * 100).toFixed(0)}% | Trades: ${totalTrades} | PnL: ${whale.stats.totalPnL.toFixed(2)} SOL`));

    if (whale.approved) {
        console.log(chalk.green.bold(`[MIRROR #${id}]: ✅ APPROVED_ALPHA — Forwarding to Zero-Rug gate`));

        if (process.send) {
            process.send({
                type: 'APPROVED_ALPHA',
                mint: msg.mint,
                whale: address,
                whaleTier: whale.tier,
                confidence: Math.min(whale.stats.winRate + 0.1, 1.0),
                source: 'MIRROR_PROTOCOL',
                pnl: whale.stats.totalPnL,
            });
            process.send({
                type: 'INTEL_DATA',
                data: `MIRROR: ${whale.tier}-Tier whale ${address.substring(0, 8)}... APPROVED. Win: ${(whale.stats.winRate * 100).toFixed(0)}%, PnL: ${whale.stats.totalPnL.toFixed(2)} SOL`,
                source: 'MIRROR_PROTOCOL'
            });
        }
    } else {
        console.log(chalk.red(`[MIRROR #${id}]: ❌ REJECTED — Whale doesn't meet qualification`));
        console.log(mp(`  Required: ${(scorecard_config().minWinRate * 100)}% win, ${scorecard_config().minTrades} trades, ${scorecard_config().minPnL} SOL PnL`));

        if (process.send) {
            process.send({
                type: 'INTEL_DATA',
                data: `MIRROR: Whale ${address.substring(0, 8)}... REJECTED (${whale.tier}-Tier). Win: ${(whale.stats.winRate * 100).toFixed(0)}%, PnL: ${whale.stats.totalPnL.toFixed(2)} SOL. Not copying.`,
                source: 'MIRROR_PROTOCOL'
            });
        }
    }
}

function scorecard_config() {
    return loadScorecard().config;
}

// ============================================================
// IPC MESSAGE HANDLER
// ============================================================
process.on('message', (msg) => {
    switch (msg.type) {
        case 'WHALE_MOVEMENT':
        case 'QUALIFY_WHALE':
            qualifyWhaleSignal(msg);
            break;

        case 'SET_WHALE_ALIAS':
            if (msg.address && msg.alias) {
                const sc = loadScorecard();
                if (sc.whales[msg.address]) {
                    sc.whales[msg.address].alias = msg.alias;
                    saveScorecard(sc);
                    console.log(mp(`Whale ${msg.address.substring(0, 8)}... aliased as "${msg.alias}"`));
                }
            }
            break;

        case 'MIRROR_STATUS':
            const scorecard = loadScorecard();
            const whales = Object.values(scorecard.whales);
            const approved = whales.filter(w => w.approved);
            const sTier = whales.filter(w => w.tier === 'S');
            const aTier = whales.filter(w => w.tier === 'A');

            console.log(MP(`📊 Mirror Protocol Status:`));
            console.log(mp(`  Tracked Whales: ${whales.length}`));
            console.log(mp(`  Approved: ${approved.length}`));
            console.log(mp(`  S-Tier: ${sTier.length} | A-Tier: ${aTier.length}`));

            if (approved.length > 0) {
                console.log(mp(`  Top Performers:`));
                approved.sort((a, b) => b.stats.totalPnL - a.stats.totalPnL).slice(0, 5).forEach(w => {
                    const label = w.alias || w.address.substring(0, 12) + '...';
                    console.log(mp(`    ${w.tier}-Tier: ${label} | PnL: ${w.stats.totalPnL.toFixed(2)} SOL | Win: ${(w.stats.winRate * 100).toFixed(0)}%`));
                });
            }
            break;

        case 'LEADERBOARD':
            const sc = loadScorecard();
            const all = Object.values(sc.whales).sort((a, b) => b.stats.totalPnL - a.stats.totalPnL);
            console.log(MP('🏆 WHALE LEADERBOARD:'));
            all.slice(0, 10).forEach((w, i) => {
                const label = w.alias || w.address.substring(0, 12) + '...';
                console.log(mp(`  #${i + 1} [${w.tier}] ${label} — PnL: ${w.stats.totalPnL.toFixed(2)} SOL | Win: ${(w.stats.winRate * 100).toFixed(0)}%`));
            });
            break;
    }
});

// ============================================================
// BOOT
// ============================================================
const sc = loadScorecard();
console.log(MP(`🪞 Tracking ${Object.keys(sc.whales).length} whales. Qualification gate active.`));
setInterval(() => { }, 100000);
