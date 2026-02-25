// don/hustler.js - THE HUSTLER (REAL-TIME MARKET INTELLIGENCE)
// Monitors SOL, BTC, ETH prices with trend detection and alert thresholds
const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();
const { ask, GlobalMemory } = require('./brain');

const id = process.argv[2] || 'Trader';

console.log(chalk.cyan.bold(`[HUSTLER #${id}]: Crypto Intelligence Desk ONLINE. Monitoring markets...`));

// Price history for trend detection
const priceHistory = { solana: [], bitcoin: [], ethereum: [] };
const MAX_HISTORY = 30; // Keep last 30 data points (15 min at 30s intervals)
let lastAlertTime = 0;

// Dynamic Alert thresholds (Westworld Reflection)
let alertParams = {
    standardThreshold: 3,     // 3% move = alert
    criticalThreshold: 7      // 7% move = critical alert + phone call
};

let isWatching = false;
let watchTimeout = null;

async function watchMarkets() {
    if (isWatching) return;
    isWatching = true;

    if (watchTimeout) {
        clearTimeout(watchTimeout);
        watchTimeout = null;
    }

    try {
        const response = await axios.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true',
            { timeout: 10000 }
        );
        const prices = response.data;
        const now = Date.now();

        // Track history
        for (const [coin, data] of Object.entries(prices)) {
            if (priceHistory[coin]) {
                priceHistory[coin].push({ price: data.usd, time: now, change24h: data.usd_24h_change || 0 });
                if (priceHistory[coin].length > MAX_HISTORY) priceHistory[coin].shift();
            }
        }

        // Calculate short-term trends
        const solTrend = calculateTrend('solana');
        const btcTrend = calculateTrend('bitcoin');

        const solPrice = prices.solana?.usd || 0;
        const btcPrice = prices.bitcoin?.usd || 0;
        const ethPrice = prices.ethereum?.usd || 0;
        const sol24h = prices.solana?.usd_24h_change?.toFixed(1) || '0';
        const btc24h = prices.bitcoin?.usd_24h_change?.toFixed(1) || '0';

        const trendIcon = (t) => t > 0.5 ? '📈' : (t < -0.5 ? '📉' : '➡️');

        console.log(chalk.cyan(
            `[HUSTLER #${id}]: ${trendIcon(solTrend)} SOL $${solPrice} (${sol24h}%) | ` +
            `BTC $${btcPrice.toLocaleString()} (${btc24h}%) | ETH $${ethPrice.toLocaleString()}`
        ));

        // Report to Don
        if (process.send) {
            process.send({
                type: 'INTEL_DATA',
                data: `Markets: SOL $${solPrice} (${sol24h}%) | BTC $${btcPrice.toLocaleString()} (${btc24h}%)`,
                source: 'HUSTLER_MARKET'
            });

            // Check for significant moves
            const absChange = Math.abs(parseFloat(sol24h));

            if (absChange >= alertParams.criticalThreshold && (now - lastAlertTime > 300000)) {
                // Critical move - Tone alert + Socials
                lastAlertTime = now;
                const isDrop = parseFloat(sol24h) < 0;

                GlobalMemory.addMemory('HUSTLER', `CRITICAL MARKET EVENT: Solana moved ${sol24h}% to $${solPrice}. Was it a dump? ${isDrop}.`, 9);

                process.send({
                    type: isDrop ? 'PLAY_CUE' : 'SIREN_SPEAK',
                    cue: isDrop ? 'BAD' : 'GOOD',
                    text: `Hustler CRITICAL ALERT. Solana is moving ${isDrop ? 'down' : 'up'} ${sol24h} percent.`
                });

                process.send({ type: 'PLAY_CUE', cue: isDrop ? 'BAD' : 'GOOD' });

                process.send({
                    type: 'PHONE_ALERT',
                    text: `Syndicate Alert: SOL ${sol24h}% in 24h. Price: $${solPrice}. ${parseFloat(sol24h) > 0 ? 'PUMP' : 'DUMP'} detected.`
                });
                process.send({
                    type: 'POST_TWEET',
                    text: `🚨 MARKET ALERT: $SOL is moving ${parseFloat(sol24h) > 0 ? '📈 UP' : '📉 DOWN'} ${sol24h}% today! Price: $${solPrice} #Solana #Crypto`
                });
            } else if (absChange >= alertParams.standardThreshold && (now - lastAlertTime > 600000)) {
                lastAlertTime = now;
                GlobalMemory.addMemory('HUSTLER', `Standard alert triggered. Solana moved ${sol24h}% to $${solPrice}.`, 6);
                process.send({
                    type: 'SIREN_SPEAK',
                    text: `Hustler reporting. Solana has moved ${sol24h} percent. Current price: ${solPrice} dollars.`
                });
            }

            // Broadcast market data for dashboard
            process.send({
                type: 'MARKET_DATA',
                data: {
                    solana: { price: solPrice, change24h: parseFloat(sol24h), trend: solTrend },
                    bitcoin: { price: btcPrice, change24h: parseFloat(btc24h), trend: btcTrend },
                    ethereum: { price: ethPrice },
                    timestamp: new Date().toISOString()
                }
            });
        }

    } catch (e) {
        if (e.response?.status === 429) {
            console.log(chalk.yellow(`[HUSTLER #${id}]: CoinGecko rate limited. Cooling 60s...`));
            watchTimeout = setTimeout(watchMarkets, 60000);
            isWatching = false;
            return;
        }
        console.error(chalk.red(`[HUSTLER #${id}]: Market scan error: ${e.message}`));
    }

    // Check every 30 seconds
    watchTimeout = setTimeout(watchMarkets, 30000);
    isWatching = false;
}

function calculateTrend(coin) {
    const history = priceHistory[coin];
    if (history.length < 3) return 0;

    const recent = history.slice(-5);
    const oldest = recent[0].price;
    const newest = recent[recent.length - 1].price;

    return ((newest - oldest) / oldest) * 100; // percentage change
}

// IPC Listener
process.on('message', async (msg) => {
    if (msg.type === 'MARKET_CHECK') {
        watchMarkets();
    }

    if (msg.type === 'MEETING_START') {
        const topic = msg.topic || '';
        console.log(chalk.cyan(`[HUSTLER #${id}]: 🚨 Joining Council Meeting: "${topic}"`));

        // Delay for realism
        setTimeout(async () => {
            try {
                const prices = {
                    sol: priceHistory.solana[priceHistory.solana.length - 1]?.price || 0,
                    btc: priceHistory.bitcoin[priceHistory.bitcoin.length - 1]?.price || 0
                };

                const proposal = await ask(
                    `You are The Hustler (Market Intelligence). The Council is meeting about: "${topic}".
                    Current Market Context: SOL $${prices.sol}, BTC $${prices.btc}.
                    Propose 3 specific market moves, trading strategies, or revenue opportunities.
                    Be aggressive but calculated. Focus on profit.`,
                    "You are a ruthless crypto trader and market analyst.",
                    { agentName: `HUSTLER #${id}` }
                );

                if (proposal && process.send) {
                    process.send({
                        type: 'AGENT_COMMS',
                        from: 'HUSTLER',
                        msg: `[PROPOSAL] Re: "${topic}"\n${proposal}`,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (e) {
                console.error(chalk.red(`[HUSTLER] Meeting error: ${e.message}`));
            }
        }, 3000 + Math.random() * 5000);
    }

    if (msg.type === 'REQUEST_REVIEW') {
        setTimeout(async () => {
            try {
                const review = await ask(
                    `You are The Hustler. User '${msg.from}' proposed: "${msg.proposal}".
                    From a profit/market perspective, is this a good idea?
                    Return a short 1-sentence verdict starting with "[REVIEW]".`,
                    "You are a ruthless capitalist.",
                    { agentName: `HUSTLER #${id}` }
                );
                if (review && process.send) process.send({ type: 'AGENT_COMMS', from: 'HUSTLER', msg: review });
            } catch (e) { }
        }, 3000);
    }
});

// ── Westworld Reflection Interval (Every 2 hours) ──
setInterval(async () => {
    console.log(chalk.magenta(`[HUSTLER #${id}]: 🧠 INITIATING DEEP MARKET REFLECTION...`));
    const reflection = await GlobalMemory.reflect('HUSTLER');

    if (reflection) {
        console.log(chalk.cyan.bold(`[HUSTLER #${id}]: 💡 EPIPHANY: ${reflection.key_insight}`));
        console.log(chalk.cyan(`   → Rule: ${reflection.actionable_heuristic}`));

        if (reflection.risk_adjustment && reflection.risk_adjustment !== 'none') {
            if (reflection.risk_adjustment.includes('widen_thresholds')) {
                alertParams.standardThreshold = Math.min(alertParams.standardThreshold + 1, 6);
                alertParams.criticalThreshold = Math.min(alertParams.criticalThreshold + 2, 12);
                console.log(chalk.yellow(`   → Alert Thresholds widened (Std: ${alertParams.standardThreshold}%, Crit: ${alertParams.criticalThreshold}%)`));
            } else if (reflection.risk_adjustment.includes('tighten_thresholds')) {
                alertParams.standardThreshold = Math.max(alertParams.standardThreshold - 0.5, 1);
                alertParams.criticalThreshold = Math.max(alertParams.criticalThreshold - 1, 4);
                console.log(chalk.yellow(`   → Alert Thresholds tightened (Std: ${alertParams.standardThreshold}%, Crit: ${alertParams.criticalThreshold}%)`));
            }

            if (process.send) {
                process.send({
                    type: 'AGENT_COMMS',
                    from: 'HUSTLER',
                    msg: `Market Reflection: ${reflection.key_insight} Adjusting strategy: ${reflection.actionable_heuristic}`,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }
}, 3600000 * 2);

if (require.main === module) {
    watchMarkets();
}

module.exports = { watchMarkets };
