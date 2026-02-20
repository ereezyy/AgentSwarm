// don/hustler.js - THE HUSTLER (REAL-TIME MARKET INTELLIGENCE)
// Monitors SOL, BTC, ETH prices with trend detection and alert thresholds
const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();
const { ask } = require('./brain');

const id = process.argv[2] || 'Trader';

console.log(chalk.cyan.bold(`[HUSTLER #${id}]: Crypto Intelligence Desk ONLINE. Monitoring markets...`));

// Price history for trend detection
const priceHistory = { solana: [], bitcoin: [], ethereum: [] };
const MAX_HISTORY = 30; // Keep last 30 data points (15 min at 30s intervals)
let lastAlertTime = 0;

// Alert thresholds (percentage change)
const ALERT_THRESHOLD = 3;     // 3% move = alert
const CRITICAL_THRESHOLD = 7;  // 7% move = critical alert + phone call

async function watchMarkets() {
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

            if (absChange >= CRITICAL_THRESHOLD && (now - lastAlertTime > 300000)) {
                // Critical move - phone alert
                lastAlertTime = now;
                process.send({
                    type: 'SIREN_SPEAK',
                    text: `Hustler CRITICAL ALERT. Solana is moving ${parseFloat(sol24h) > 0 ? 'up' : 'down'} ${sol24h} percent in 24 hours. Current price: ${solPrice} dollars. This is a ${parseFloat(sol24h) > 0 ? 'pump' : 'dump'} event.`
                });
                process.send({
                    type: 'PHONE_ALERT',
                    text: `Syndicate Alert: SOL ${sol24h}% in 24h. Price: $${solPrice}. ${parseFloat(sol24h) > 0 ? 'PUMP' : 'DUMP'} detected.`
                });
                process.send({
                    type: 'POST_TWEET',
                    text: `🚨 MARKET ALERT: $SOL is moving ${parseFloat(sol24h) > 0 ? '📈 UP' : '📉 DOWN'} ${sol24h}% today! Price: $${solPrice} #Solana #Crypto`
                });
            } else if (absChange >= ALERT_THRESHOLD && (now - lastAlertTime > 600000)) {
                lastAlertTime = now;
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
            setTimeout(watchMarkets, 60000);
            return;
        }
        console.error(chalk.red(`[HUSTLER #${id}]: Market scan error: ${e.message}`));
    }

    // Check every 30 seconds
    setTimeout(watchMarkets, 30000);
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

watchMarkets();
