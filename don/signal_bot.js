// don/signal_bot.js - COPY-TRADE SIGNAL BOT
// Receives whale signals from The Watcher and broadcasts to Telegram.
// Revenue model: Paid Telegram channel ($20-50/month per subscriber).
// Also logs all signals to missions/signal_log.json for analytics.

const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'SignalBot';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;  // e.g. @SyndicateAlpha or -100123456789

// Wallet Guard Requirement
const { SyndicateCore } = require('./syndicate_core');
const syndicateAPI = new SyndicateCore();

// File paths
const SIGNAL_LOG = path.resolve(__dirname, '../missions/signal_log.json');
const SIGNAL_REPORT = path.resolve(__dirname, '../missions/signal_report.md');
const missionsDir = path.resolve(__dirname, '../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir, { recursive: true });

const SB = (msg) => chalk.hex('#FFD700').bold(`[SIGNAL BOT #${id}]: ${msg}`);
const sb = (msg) => chalk.hex('#FFD700')(`[SIGNAL BOT #${id}]: ${msg}`);

console.log(SB('📡 Copy-Trade Signal Bot ONLINE.'));
console.log(sb(`Telegram: ${TELEGRAM_BOT_TOKEN ? 'CONNECTED' : '⚠️ NO TOKEN — logging locally only'}`));
console.log(sb(`Channel: ${TELEGRAM_CHANNEL_ID || '⚠️ NOT SET'}`));

// ============================================================
// SIGNAL QUEUE & STATE
// ============================================================
const signalQueue = [];
let stats = {
    totalSignals: 0,
    telegramSent: 0,
    telegramFailed: 0,
    whaleMovements: 0,
    copyTradeSignals: 0,
    marketAlerts: 0,
    sessionStart: new Date().toISOString(),
};

function loadSignalLog() {
    try {
        if (fs.existsSync(SIGNAL_LOG)) {
            return JSON.parse(fs.readFileSync(SIGNAL_LOG, 'utf8'));
        }
    } catch { /* fresh start */ }
    return { signals: [], stats: { totalSignals: 0, totalTelegramSent: 0 } };
}

function saveSignalLog(log) {
    fs.writeFileSync(SIGNAL_LOG, JSON.stringify(log, null, 2));
}

// ============================================================
// TELEGRAM INTEGRATION
// ============================================================
async function sendTelegramWithRetry(url, data, config, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await axios.post(url, data, config);
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(chalk.yellow(`[SIGNAL BOT]: Telegram send failed, retrying (${i + 1}/${retries})...`));
            await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, i))); // Exponential backoff
        }
    }
}

async function sendTelegram(message, parseMode = 'HTML') {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
        console.log(sb(`📋 [LOCAL] ${message.replace(/<[^>]*>/g, '')}`));
        return false;
    }

    const primaryUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const fallbackUrl = process.env.TELEGRAM_API_FALLBACK_URL ? `${process.env.TELEGRAM_API_FALLBACK_URL}/bot${TELEGRAM_BOT_TOKEN}/sendMessage` : null;

    const payload = {
        chat_id: TELEGRAM_CHANNEL_ID,
        text: message,
        parse_mode: parseMode,
        disable_web_page_preview: true,
    };
    const config = { timeout: 10000 };

    try {
        await sendTelegramWithRetry(primaryUrl, payload, config);
        stats.telegramSent++;
        console.log(sb('✅ Signal sent to Telegram'));
        return true;
    } catch (e) {
        console.log(chalk.yellow(`[SIGNAL BOT]: Primary Telegram send failed: ${e?.response?.data?.description || e?.message}. Attempting fallback...`));
        if (fallbackUrl) {
            try {
                await sendTelegramWithRetry(fallbackUrl, payload, config);
                stats.telegramSent++;
                console.log(sb('✅ Signal sent to Telegram (via fallback)'));
                return true;
            } catch (fallbackError) {
                stats.telegramFailed++;
                console.log(chalk.red(`[SIGNAL BOT]: Telegram fallback send failed: ${fallbackError?.response?.data?.description || fallbackError?.message}`));
                return false;
            }
        } else {
            stats.telegramFailed++;
            console.log(chalk.red(`[SIGNAL BOT]: No fallback URL configured. Telegram send completely failed.`));
            return false;
        }
    }
}

// ============================================================
// SIGNAL FORMATTERS
// ============================================================
function formatCopyTradeSignal(data) {
    const emoji = data.confidence === 'HIGH' ? '🔥' : '⚡';
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    return `${emoji} <b>COPY-TRADE SIGNAL</b> ${emoji}

🐋 <b>Whale:</b> ${data.whale || 'Unknown'}
🪙 <b>Token:</b> <code>${data.mint}</code>
📊 <b>Amount:</b> ${data.detectedAmount ? data.detectedAmount.toFixed(4) : 'Analyzing...'}
🎯 <b>Confidence:</b> ${data.confidence || 'MEDIUM'}
⏰ <b>Time:</b> ${time}

${data.mint ? `🔗 <a href="https://solscan.io/token/${data.mint}">View on Solscan</a> | <a href="https://birdeye.so/token/${data.mint}">Birdeye</a>` : ''}

<i>⚠️ NFA/DYOR — Signals from whale tracking only</i>
━━━━━━━━━━━━━━━━━━━━
<b>📡 The Syndicate Signal Service</b>`;
}

function formatWhaleMovement(data) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    return `🐋 <b>WHALE MOVEMENT</b>

${data.data || data.message || 'Movement detected'}

⏰ ${time}
━━━━━━━━━━━━━━━━━━━━
<b>📡 The Syndicate Signal Service</b>`;
}

function formatMarketAlert(data) {
    return `📊 <b>MARKET ALERT</b>

${data.data || data.message || 'Alert triggered'}

━━━━━━━━━━━━━━━━━━━━
<b>📡 The Syndicate Signal Service</b>`;
}

function formatDailyDigest() {
    const log = loadSignalLog();
    const today = new Date().toISOString().split('T')[0];
    const todaySignals = log.signals.filter(s => s.timestamp.startsWith(today));

    const copyTrades = todaySignals.filter(s => s.type === 'COPY_TRADE');
    const movements = todaySignals.filter(s => s.type === 'WHALE_MOVEMENT');

    return `📊 <b>DAILY SIGNAL DIGEST</b>

📅 <b>Date:</b> ${today}
📡 <b>Signals Today:</b> ${todaySignals.length}
🔥 <b>Copy-Trade Alerts:</b> ${copyTrades.length}
🐋 <b>Whale Movements:</b> ${movements.length}

${copyTrades.length > 0 ? `\n<b>Today's Tokens:</b>\n${copyTrades.map(s => `  • <code>${s.data?.mint?.substring(0, 8)}...</code> (${s.data?.whale})`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━
<b>📡 The Syndicate Signal Service</b>
<i>Subscribe for real-time whale tracking alerts</i>`;
}

// ============================================================
// SIGNAL PROCESSING
// ============================================================
async function processSignal(signal) {
    stats.totalSignals++;
    const log = loadSignalLog();

    // Build signal entry
    const entry = {
        id: `sig-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: signal.type,
        timestamp: new Date().toISOString(),
        data: signal.data || signal,
        telegramSent: false,
    };

    let message = '';

    switch (signal.type) {
        case 'COPY_TRADE_SIGNAL':
            stats.copyTradeSignals++;
            message = formatCopyTradeSignal(signal);
            break;

        case 'WHALE_MOVEMENT':
        case 'WATCHER_SURVEILLANCE':
            stats.whaleMovements++;
            message = formatWhaleMovement(signal);
            break;

        case 'MARKET_ALERT':
            stats.marketAlerts++;
            message = formatMarketAlert(signal);
            break;

        case 'SNIPE_SUCCESS':
            message = `🎯 <b>SNIPE CONFIRMED</b>\n\nToken: <code>${signal.mint}</code>\n\n<a href="https://solscan.io/token/${signal.mint}">View on Solscan</a>\n━━━━━━━━━━━━━━━━━━━━\n<b>📡 The Syndicate Signal Service</b>`;
            break;

        default:
            // Generic signal
            message = formatMarketAlert(signal);
    }

    // Send to Telegram
    if (message) {
        entry.telegramSent = await sendTelegram(message);
    }

    // Log signal
    log.signals.push(entry);
    // Keep only last 500 signals
    if (log.signals.length > 500) log.signals = log.signals.slice(-500);
    log.stats.totalSignals++;
    if (entry.telegramSent) log.stats.totalTelegramSent++;
    saveSignalLog(log);
}

// ============================================================
// IPC MESSAGE HANDLER (from The Don)
// ============================================================
process.on('message', async (msg) => {
    const msgType = msg?.type || 'UNKNOWN';
    const msgWhale = msg?.whale ? String(msg.whale) : 'UNKNOWN_WHALE';
    const msgMint = msg?.mint ? String(msg.mint) : 'UNKNOWN_MINT';
    const msgData = msg?.data ? String(msg.data) : 'No data provided';
    const msgSource = msg?.source ? String(msg.source) : 'UNKNOWN_SOURCE';
    const msgText = msg?.text ? String(msg.text) : '';

    switch (msgType) {
        case 'COPY_TRADE_SIGNAL':
            console.log(SB(`🔥 COPY-TRADE SIGNAL: ${msgWhale} → ${msgMint}`));
            await processSignal(msg);
            break;

        case 'INTEL_DATA':
            // Only forward whale surveillance to Telegram
            if (msgSource === 'WATCHER_SURVEILLANCE') {
                console.log(sb(`🐋 Whale movement: ${msgData}`));
                await processSignal({ type: 'WHALE_MOVEMENT', data: msgData, message: msgData });
            }
            break;

        case 'SNIPE_SUCCESS':
            console.log(SB(`🎯 Snipe success: ${msgMint}`));
            await processSignal(msg);
            break;

        case 'MARKET_DATA':
            // Only forward significant market data (optional - can be noisy)
            break;

        case 'SIGNAL_STATUS':
            console.log(SB('📊 Signal Bot Status:'));
            console.log(sb(`  Total: ${stats.totalSignals} | TG Sent: ${stats.telegramSent} | Failed: ${stats.telegramFailed}`));
            console.log(sb(`  Copy-Trades: ${stats.copyTradeSignals} | Whale Moves: ${stats.whaleMovements}`));

            if (process.send) {
                process.send({
                    type: 'INTEL_DATA',
                    data: `SIGNAL BOT: ${stats.totalSignals} signals processed | ${stats.telegramSent} sent to Telegram | ${stats.copyTradeSignals} copy-trade alerts`,
                    source: 'SIGNAL_BOT'
                });
            }
            break;

        case 'SEND_DIGEST':
            const digest = formatDailyDigest();
            await sendTelegram(digest);
            console.log(sb('📊 Daily digest sent.'));
            break;

        case 'BROADCAST':
            // Manual broadcast from CLI
            if (msgText) {
                const formatted = `📢 <b>SYNDICATE BROADCAST</b>\n\n${msgText}\n\n━━━━━━━━━━━━━━━━━━━━\n<b>📡 The Syndicate Signal Service</b>`;
                await sendTelegram(formatted);
            }
            break;
    }
});

// ============================================================
// DAILY DIGEST SCHEDULER
// ============================================================
function scheduleDailyDigest() {
    // Send digest at 9 PM daily
    const now = new Date();
    const next9pm = new Date(now);
    next9pm.setHours(21, 0, 0, 0);
    if (now > next9pm) next9pm.setDate(next9pm.getDate() + 1);

    const msUntil = next9pm - now;
    console.log(sb(`📅 Daily digest scheduled in ${(msUntil / 3600000).toFixed(1)} hours`));

    setTimeout(async () => {
        const digest = formatDailyDigest();
        await sendTelegram(digest);
        console.log(sb('📊 Auto-digest sent.'));
        // Reschedule for next day
        scheduleDailyDigest();
    }, msUntil);
}

// ============================================================
// REPORT WRITER
// ============================================================
function writeReport() {
    const log = loadSignalLog();
    const ts = new Date().toLocaleString();

    let report = `\n══════════════════════════════════════════════════════════════════════\n`;
    report += `📡 SIGNAL BOT REPORT — ${ts}\n`;
    report += `══════════════════════════════════════════════════════════════════════\n\n`;
    report += `Session Start: ${stats.sessionStart}\n`;
    report += `Total Signals: ${stats.totalSignals}\n`;
    report += `Telegram Sent: ${stats.telegramSent} | Failed: ${stats.telegramFailed}\n`;
    report += `Copy-Trade Signals: ${stats.copyTradeSignals}\n`;
    report += `Whale Movements: ${stats.whaleMovements}\n`;
    report += `All-Time Signals: ${log.stats.totalSignals}\n`;
    report += `All-Time TG Sent: ${log.stats.totalTelegramSent}\n\n`;

    // Recent signals
    const recent = log.signals.slice(-10);
    if (recent.length > 0) {
        report += `📋 RECENT SIGNALS:\n`;
        report += `──────────────────────────────────────────────────\n`;
        for (const sig of recent) {
            const time = new Date(sig.timestamp).toLocaleTimeString();
            const tg = sig.telegramSent ? '✅' : '📋';
            report += `  ${tg} [${time}] ${sig.type}: ${JSON.stringify(sig.data).substring(0, 80)}...\n`;
        }
    }

    report += `\n══════════════════════════════════════════════════════════════════════\n`;
    fs.writeFileSync(SIGNAL_REPORT, report);
    console.log(sb(`📄 Report saved to ${SIGNAL_REPORT}`));
}

// Status report every 15 min
setInterval(writeReport, 900000);

// Boot
async function startBot() {
    try {
        console.log(SB('🛡️ Running Wallet Guard verification...'));
        const balance = await syndicateAPI.checkWalletBalance();
        if (balance === null || balance < 0.005) {
            console.log(chalk.red('[SIGNAL BOT] ⚠️ WARNING: Wallet balance insufficient (< 0.005 SOL) or unavailable. Signal Bot may fail on associated on-chain transactions.'));
        } else {
            console.log(SB(`🛡️ Wallet Guard passed (Balance: ${balance} SOL)`));
        }
    } catch (e) {
        console.log(chalk.red(`[SIGNAL BOT] ⚠️ WARNING: Wallet Guard check failed: ${e?.message || e}`));
    }

    console.log(SB('📡 Signal Bot ready. Waiting for whale signals...'));
    scheduleDailyDigest();
    setInterval(() => { }, 100000); // Keep alive
}

startBot();
