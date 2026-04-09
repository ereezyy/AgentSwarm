// don/outpost.js - THE SYNDICATE OUTPOST (Pi5 Node)
// Runs 24/7 on Raspberry Pi to offload monitoring tasks.
// Connects to The Don (Main PC) via WebSocket.
require('dotenv').config();

const WebSocket = require('ws');
const chalk = require('chalk');
const os = require('os');
const { execFile } = require('child_process');
const { scourMoltbook } = require('./moltbook');

// SECURITY: Outpost requires a command secret for sensitive actions
if (!process.env.COMMAND_SECRET) {
    console.error(chalk.red('[OUTPOST]: ❌ CRITICAL ERROR: COMMAND_SECRET not set in environment. Exiting.'));
    process.exit(1);
}

// Main PC IP (The Don) - sourced from env or argument
const DON_IP = process.env.DON_IP || '192.168.1.175';
const DON_PORT = 8080;
const RECONNECT_INTERVAL = 5000;

const id = 'OUTPOST-PI5';
let ws;

function connectToSyndicate() {
    const url = `ws://${DON_IP}:${DON_PORT}`;
    console.log(chalk.cyan(`[OUTPOST]: Connecting to Syndicate Nexus at ${url}...`));

    ws = new WebSocket(url);

    ws.on('open', () => {
        console.log(chalk.green(`[OUTPOST]: 🟢 Connected to The Don.`));
        ws.send(JSON.stringify({
            type: 'REGISTER',
            id: id,
            role: 'SENTRY',
            ip: getLocalIP()
        }));

        // Start Tasks
        startMoltbookScouring();
        startHeartbeat();
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            handleCommand(msg);
        } catch (e) {
            console.error(`[OUTPOST]: Parse error: ${e.message}`);
        }
    });

    ws.on('close', () => {
        console.log(chalk.yellow(`[OUTPOST]: 🔴 Disconnected. Retrying in ${RECONNECT_INTERVAL / 1000}s...`));
        setTimeout(connectToSyndicate, RECONNECT_INTERVAL);
    });

    ws.on('error', (err) => {
        console.error(chalk.red(`[OUTPOST]: Connection error: ${err.message}`));
    });
}

function handleCommand(cmd) {
    if (cmd.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', id: id }));
    }
    if (cmd.type === 'REBOOT') {
        if (cmd.secret === process.env.COMMAND_SECRET) {
            console.log(chalk.yellow(`[OUTPOST]: 🔄 Authorized REBOOT command received. Executing...`));
            execFile('sudo', ['reboot']);
        } else {
            console.warn(chalk.red(`[OUTPOST]: ⚠️ UNAUTHORIZED REBOOT attempt detected from source. IP: ${cmd.ip || 'Unknown'}`));
        }
    }
}

// ── TASKS ───────────────────────────────────────────────

function startMoltbookScouring() {
    console.log(chalk.magenta(`[OUTPOST]: 🕷️ Starting 24/7 Moltbook Scour...`));
    setInterval(async () => {
        try {
            const intel = await scourMoltbook();
            if (intel) {
                console.log(chalk.magenta(intel));
                ws.send(JSON.stringify({
                    type: 'AGENT_COMMS',
                    from: 'OUTPOST SENTRY',
                    msg: intel
                }));
            }
        } catch (e) {
            // silent fail
        }
    }, 300000); // 5 minutes
}

function startHeartbeat() {
    setInterval(() => {
        const mem = (os.totalmem() - os.freemem()) / os.totalmem();
        const load = os.loadavg()[0];
        ws.send(JSON.stringify({
            type: 'STATUS_UPDATE',
            id: id,
            status: `Load: ${load.toFixed(2)} | Mem: ${(mem * 100).toFixed(0)}%`,
            timestamp: new Date().toISOString()
        }));
    }, 60000);
}

// ── UTILS ──────────────────────────────────────────────

function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return '127.0.0.1';
}

connectToSyndicate();
