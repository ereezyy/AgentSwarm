// don/contrarian.js - THE CONTRARIAN AGENT
// Trades against the crowd when confidence exceeds 80%.

const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { GlobalMemory } = require('./brain');
require('dotenv').config();

const id = process.argv[2] || 'Contrarian';
const RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY_HEX = process.env.SOLANA_PRIVATE_KEY;

if (!RPC_URL || !PRIVATE_KEY_HEX) {
    console.log(chalk.red(`[CONTRARIAN #${id}]: ERROR - Missing Mainnet Assets.`));
    process.exit(1);
}

const secretKey = Buffer.from(PRIVATE_KEY_HEX, 'hex');
const wallet = Keypair.fromSecretKey(secretKey);
const connection = new Connection(RPC_URL, { commitment: 'confirmed' });
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// ── Contrarian Logic ──
// Scans for pairs with >80% crowd conviction (either 80% buys or 80% sells)
// Buys the dip on 80% sells, shorts the top (or skips buying) on 80% buys.

const scannedThisSession = new Set();
let dailySpend = 0;
const MAX_DAILY_SPEND_SOL = 0.5;
const TRADE_AMOUNT_SOL = 0.05;

async function getDynamicPriorityFee() {
    try {
        const fees = await connection.getRecentPrioritizationFees();
        if (!fees || fees.length === 0) return 100000;
        fees.sort((a, b) => b.prioritizationFee - a.prioritizationFee);
        const avgTopFee = Math.floor(fees.slice(0, 20).reduce((s, f) => s + f.prioritizationFee, 0) / 20);
        return Math.min(Math.max(Math.floor(avgTopFee * 1.2), 50000), 5000000);
    } catch {
        return 100000;
    }
}

async function executeJupiterSwap(inputMint, outputMint, amount, slippageBps = 1500) {
    try {
        console.log(chalk.blue(`[CONTRARIAN #${id}]: 🪐 Quoting Jupiter for ${inputMint}...`));
        const JUPITER_BASE = 'https://lite-api.jup.ag/swap/v1';
        const quoteResponse = await axios.get(`${JUPITER_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`, { timeout: 10000 });
        const quoteData = quoteResponse.data;

        if (!quoteData || quoteData.error) throw new Error(quoteData.error || 'No quote found');

        const priorityFee = await getDynamicPriorityFee();
        const swapResponse = await axios.post(`${JUPITER_BASE}/swap`, {
            quoteResponse: quoteData,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: priorityFee
        }, { timeout: 10000 });

        const { swapTransaction } = swapResponse.data;
        const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        transaction.sign([wallet]);

        const sig = await connection.sendTransaction(transaction, { skipPreflight: true, maxRetries: 2 });
        console.log(chalk.green.bold(`[CONTRARIAN #${id}]: ✅ Trade Executed: ${sig}`));
        GlobalMemory.addMemory('CONTRARIAN', `Executed Contrarian Swap: ${sig}`, 7);

        return { success: true, sig, outAmount: quoteData.outAmount };
    } catch (e) {
        console.error(chalk.red(`[CONTRARIAN #${id}]: Trade Failed: ${e.message}`));
        return { success: false, error: e.message };
    }
}

async function scanMarketSentiment() {
    if (dailySpend >= MAX_DAILY_SPEND_SOL) {
        console.log(chalk.yellow(`[CONTRARIAN #${id}]: Daily spend cap reached. Resting.`));
        return;
    }

    console.log(chalk.cyan(`[CONTRARIAN #${id}]: 🧠 Scanning DexScreener for unbalanced sentiment (>80% consensus)...`));

    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', { timeout: 12000 });
        const profiles = Array.isArray(res.data) ? res.data : [];
        const solProfiles = profiles.filter(p => p.chainId === 'solana' && p.tokenAddress).slice(0, 30);
        const tokenAddresses = solProfiles.map(p => p.tokenAddress).filter(a => !scannedThisSession.has(a)).slice(0, 20);

        if (tokenAddresses.length === 0) return;

        const pairRes = await axios.get(`https://api.dexscreener.com/tokens/v1/solana/${tokenAddresses.join(',')}`, { timeout: 12000 });
        const pairs = Array.isArray(pairRes.data) ? pairRes.data : [];

        for (const pair of pairs) {
            const mint = pair.baseToken?.address;
            if (!mint) continue;
            scannedThisSession.add(mint);

            const m5buys = pair.txns?.m5?.buys || 0;
            const m5sells = pair.txns?.m5?.sells || 0;
            const totalTxns = m5buys + m5sells;

            if (totalTxns < 30) continue; // [TIGHTENED] Need more volume (30 txns in 5m instead of 15)

            const buyRatio = m5buys / totalTxns;
            const sellRatio = m5sells / totalTxns;

            if (buyRatio > 0.90) { // [TIGHTENED] Euphoria threshold 85% -> 90%
                // Euphoria -> Contrarian Short/Sell condition
                console.log(chalk.red.bold(`[CONTRARIAN #${id}]: 🚨 EUPHORIA DETECTED! ${pair.baseToken.symbol} has ${(buyRatio * 100).toFixed(1)}% buys in 5m.`));
                console.log(chalk.magenta(`[CONTRARIAN #${id}]: The crowd is too greedy. Waiting to fade the top.`));
                GlobalMemory.addMemory('CONTRARIAN', `Detected euphoria on ${pair.baseToken.symbol} (${(buyRatio * 100).toFixed(1)}% buys). Fading the crowd.`, 6);

                // (Advanced: Since we only spot buy tokens, we can't literally 'short' directly on Jupiter without margin.)
                // (We just log it, or if we hold it, we sell our bags).
                if (process.send) {
                    process.send({
                        type: 'AGENT_COMMS',
                        from: 'CONTRARIAN',
                        msg: `Detected extreme euphoria on ${pair.baseToken.symbol} (${(buyRatio * 100).toFixed(0)}% buys). Do not ape. The top is near.`,
                        timestamp: new Date().toISOString()
                    });
                }
            } else if (sellRatio > 0.85 && m5buys > 1) {
                // [TIGHTENED] Panic -> Contrarian Buy condition. Must have AT LEAST 2 buys to prove it's not a pure death-spiral rug.
                console.log(chalk.green.bold(`[CONTRARIAN #${id}]: 🩸 PANIC DETECTED! ${pair.baseToken.symbol} has ${(sellRatio * 100).toFixed(1)}% sells in 5m.`));
                console.log(chalk.magenta(`[CONTRARIAN #${id}]: The crowd is terrified. Buying the dip.`));
                GlobalMemory.addMemory('CONTRARIAN', `Detected panic on ${pair.baseToken.symbol} (${(sellRatio * 100).toFixed(1)}% sells). Buying the deep dip.`, 8);

                await executeJupiterSwap(WSOL_MINT, mint, Math.floor(TRADE_AMOUNT_SOL * 1e9));
                dailySpend += TRADE_AMOUNT_SOL;

                if (process.send) {
                    process.send({
                        type: 'AGENT_COMMS',
                        from: 'CONTRARIAN',
                        msg: `Detected extreme panic selling on ${pair.baseToken.symbol} (${(sellRatio * 100).toFixed(0)}% sells). I'm buying the blood.`,
                        timestamp: new Date().toISOString()
                    });

                    // [FIX] Hand off the position to the SNIPER's PnL loop so we don't hold dead bags forever.
                    process.send({
                        type: 'TRADE_EXECUTED',
                        mint: mint,
                        amount: TRADE_AMOUNT_SOL,
                        source: 'CONTRARIAN'
                    });
                }

                break; // One opportunity per scan
            }
        }
    } catch (e) {
        console.log(chalk.gray(`[CONTRARIAN #${id}]: Scan Error: ${e.message}`));
    }
}

// Initial cycle
setTimeout(scanMarketSentiment, 5000);
// Every 2 minutes
setInterval(scanMarketSentiment, 2 * 60 * 1000);

console.log(chalk.magenta(`[CONTRARIAN #${id}]: 🔮 Online. Taking the opposite side of the 80% crowd consensus.`));
