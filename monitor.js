const WebSocket = require('ws');
const chalk = require('chalk');
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
    console.log(chalk.bold.white('\n=== LIVE SWARM MONITOR ===\n'));
});

ws.on('message', (raw) => {
    try {
        const msg = JSON.parse(raw.toString());
        const t = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';

        if (msg.type === 'LOG') {
            const fmt = {
                ERROR: chalk.red.bold,
                MONEY: chalk.yellow.bold,
                CRYPTO: chalk.cyan.bold,
                POWER: chalk.magenta.bold,
                INFO: chalk.gray,
            }[msg.level] || chalk.white;
            const icon = { ERROR: '💀', MONEY: '💰', CRYPTO: '🚀', POWER: '⚡', INFO: 'ℹ️' }[msg.level] || '';
            console.log(fmt(`[${t}] ${icon} ${msg.msg}`));
        } else if (msg.type === 'AGENT_COMMS') {
            console.log(chalk.cyan(`[${t}] 💬 ${msg.from}: ${msg.msg}`));
        } else if (msg.type === 'TRADE_EXECUTED' || msg.type === 'SNIPE_SUCCESS') {
            console.log(chalk.green.bold(`[${t}] 🎯 TRADE: ${msg.mint?.slice(0, 12)}... [${msg.source}]`));
        }
        // KICK_UP and MARKET_DATA already show via LOG — skip to avoid duplicates
    } catch (e) { }
});

ws.on('error', (e) => console.log(chalk.red('WS error: ' + e.message)));
ws.on('close', () => console.log(chalk.yellow('Monitor disconnected.')));
