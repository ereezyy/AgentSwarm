// OPTIMIZED BY LIBRARIAN: Distributed Swarm Coordination
// Integration of advanced logic from Moltbook ecosystem.
// don/syndicate_logic.js - THE DON (NO SIMULATIONS)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { exec, fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const WebSocket = require('ws');
let SolanaWeb3 = null;
try { SolanaWeb3 = require('@solana/web3.js'); } catch (e) { /* optional */ }

const MUSCLE_SCRIPT = path.join(__dirname, '../muscle/enforcer.py');
const SessionManager = require('./sessions');

class DonCore {
    constructor() {
        this.crew = [];
        this.profit = 0;
        this.telemetry = {
            start_time: new Date().toISOString(),
            sessions: 0,
            errors: {},
            agents_spawned: 0,
            uptime: 0,
            profit: 0,
            profits: {}
        };
        this.saveTelemetry();
        this.skimRate = 0.15;
        this.activeMissions = [];
        this.processes = {}; // Registry of active child processes
        this.agentComms = []; // Agent Communication Board
        this.restartState = {}; // Per-agent restart backoff tracking
        this.agentHealth = {}; // Per-agent health status for dashboard
        this.sessions = new SessionManager(this);

        // Start WebSocket Server
        if (process.env.NODE_ENV !== "test") {
            this.wss = new WebSocket.Server({ port: 8080 });
            this.wss.on("connection", ws => {
                this.log("New client connected to The Front", "INFO");
                const trades = this.loadTradeHistory();
                ws.send(JSON.stringify({
                    type: "INIT",
                    profit: this.profit,
                    crew: this.crew,
                    agentComms: this.agentComms.slice(-50),
                    trades: trades
                }));

                // Handle incoming dashboard commands
                ws.on("message", (message) => {
                    try {
                        const cmd = JSON.parse(message);
                        this.handleCommand(cmd);
                    } catch (e) {
                        console.error("WS Error:", e.message);
                    }
                });
            });
            this.log("WebSocket Server running on port 8080", "INFO");
        } else {
            // Mock WSS for testing
            this.wss = { clients: [], on: () => { } };
        }
    }

    loadTradeHistory() {
        try {
            const tradePath = path.join(__dirname, '../missions/active_trades.json');
            if (fs.existsSync(tradePath)) {
                return JSON.parse(fs.readFileSync(tradePath, 'utf8'));
            }
        } catch (e) { }
        return [];
    }

    handleCommand(cmd) {
        this.log(`Dashboard Command: ${cmd.type}`, 'POWER');

        switch (cmd.type) {
            case 'SPAWN':
                this.spawnSoldier(cmd.agent);
                break;

            case 'USER_CHAT':
                this.log(`[DON] The Boss says: "${cmd.msg}"`, 'POWER');

                // Check for Council Meeting trigger
                if (cmd.msg && (cmd.msg.toLowerCase().startsWith('/council') || cmd.msg.toLowerCase().includes('@council'))) {
                    const topic = cmd.msg.replace(/^\/council\s*|@Council\s*/i, '').trim() || "General Strategy";
                    this.log(`[DON] 🚨 COUNCIL MEETING DECLARED: ${topic}`, 'POWER');

                    this.broadcast({
                        type: 'AGENT_COMMS',
                        from: 'THE DON',
                        msg: `🚨 COUNCIL MEETING CALLED. TOPIC: "${topic}"`,
                        timestamp: new Date().toISOString()
                    });

                    Object.values(this.processes).forEach(proc => {
                        if (proc && proc.connected) {
                            proc.send({ type: 'MEETING_START', topic, from: 'THE DON' });
                        }
                    });
                    return;
                }

                // Check for God Mode trigger
                if (cmd.msg && (cmd.msg.toLowerCase().startsWith('/godmode') || cmd.msg.toLowerCase().includes('@godmode'))) {
                    const topic = cmd.msg.replace(/^\/godmode\s*|@GodMode\s*/i, '').trim();
                    this.log(`[DON] ⚡ INITIATING GOD MODE CONSENSUS: ${topic}`, 'POWER');

                    this.broadcast({
                        type: 'AGENT_COMMS',
                        from: 'THE DON',
                        msg: `⚡ INITIATING GOD MODE CONSENSUS: "${topic}"`,
                        timestamp: new Date().toISOString()
                    });

                    if (this.processes['ORACLE'] && this.processes['ORACLE'].connected) {
                        this.processes['ORACLE'].send({ type: 'EXECUTE_GOD_MODE', topic, from: 'THE DON' });
                    } else {
                        this.log(`Oracle offline. God Mode failed.`, 'ERROR');
                    }
                    return;
                }

                // Standard Chat Broadcast
                this.broadcast({
                    type: 'AGENT_COMMS',
                    from: 'THE DON',
                    msg: cmd.msg,
                    timestamp: new Date().toISOString()
                });

                // Forward to ALL agents via IPC
                Object.values(this.processes).forEach(proc => {
                    if (proc && proc.connected) {
                        proc.send({ type: 'USER_CHAT', msg: cmd.msg, from: 'THE DON' });
                    }
                });
                break;

            case 'EVOLVE':
                if (this.processes['ARCHITECT']) {
                    this.processes['ARCHITECT'].send({ type: 'EVOLVE_REQUEST', agentType: cmd.agent || 'ALL' });
                }
                break;
            case 'HUNT':
                if (this.processes['HEADHUNTER']) this.processes['HEADHUNTER'].send({ type: 'HUNT_NOW' });
                break;
            case 'RECON':
                if (this.processes['GHOST']) this.processes['GHOST'].send({ type: 'RECON_NOW' });
                break;
            case 'TWEET':
                if (this.processes['SHADOW']) this.processes['SHADOW'].send({ type: 'POST_TWEET', text: cmd.text });
                break;

            case 'COUNCIL_MEETING':
                const topic = cmd.topic || "General Strategy";
                this.log(`[DON] 🚨 COUNCIL MEETING CALLED: ${topic}`, 'POWER');

                this.broadcast({
                    type: 'AGENT_COMMS',
                    from: 'THE DON',
                    msg: `🚨 ALL AGENTS: REPORT TO THE COUNCIL. TOPIC: "${topic}"`,
                    timestamp: new Date().toISOString()
                });

                // Alert ALL agents
                Object.values(this.processes).forEach(proc => {
                    if (proc && proc.connected) {
                        proc.send({ type: 'MEETING_START', topic, from: 'THE DON' });
                    }
                });
                break;
        }
    }

    broadcast(data) {
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }

    log(msg, type = 'INFO') {
        const icons = { 'INFO': 'ℹ️', 'ERROR': '💀', 'MONEY': '💰', 'POWER': '⚡', 'CRYPTO': '🚀' };
        const color = type === 'ERROR' ? chalk.red.bold : (type === 'MONEY' ? chalk.yellow.bold : (type === 'CRYPTO' ? chalk.cyan.bold : chalk.blue));
        console.log(color(`[${icons[type] || ''} ${type}] ${msg}`));
        this.broadcast({ type: 'LOG', msg, level: type, timestamp: new Date().toISOString() });

        // Audio Cue for Errors
        if (type === 'ERROR' && this.callerProcess && this.callerProcess.connected) {
            this.callerProcess.send({ type: 'PLAY_CUE', cue: 'BAD' });
        }

        // Update Telemetry on Errors/Profits
        if (type === 'ERROR' || type === 'MONEY' || type === 'CRYPTO') {
            if (type === 'ERROR') this.telemetry.errors['SYSTEM'] = (this.telemetry.errors['SYSTEM'] || 0) + 1;
            this.telemetry.lastUpdated = Date.now();
            this.saveTelemetry();
        }
    }

    saveTelemetry() {
        if (!fs.existsSync(path.join(__dirname, '../missions'))) {
            fs.mkdirSync(path.join(__dirname, '../missions'));
        }
        fs.writeFileSync(path.join(__dirname, '../missions/telemetry.json'), JSON.stringify(this.telemetry, null, 2));
    }

    processKickUp(amount, soldierId, source = 'STREET') {
        if (amount <= 0) return; // Ignore zero or fake profits

        const skim = amount * this.skimRate;
        const net = amount - skim;
        this.profit += amount;

        const sourceLabel = source === 'CRYPTO' ? 'Actual Trade' : (source === 'SNIPE' ? 'Snipe Profit' : 'External Hustle');
        this.log(`REAL PROFIT: Soldier #${soldierId} (${sourceLabel}) kicked up $${amount}. War Chest: $${this.profit.toFixed(2)}`, 'MONEY');

        if (source === 'SNIPE' && this.callerProcess && this.callerProcess.connected) {
            this.callerProcess.send({ type: 'PLAY_CUE', cue: 'GOOD' });
            this.callerProcess.send({ type: 'SPEAK_ALERT', text: `Target eliminated. Sniper ${soldierId} has secured the profit.` });
        } else if (this.callerProcess && this.callerProcess.connected) {
            this.callerProcess.send({ type: 'PLAY_CUE', cue: 'GOOD' });
        }

        const trades = this.loadTradeHistory();
        this.broadcast({ type: 'KICK_UP', amount, net, profit: this.profit, source, soldierId, trades });
    }

    createMission(id, desc) {
        this.log(`New Swarm Objective: ${desc}`, 'POWER');
        this.activeMissions.push({ id, desc, status: 'In Progress' });
        this.broadcast({ type: 'MISSION_UPDATE', missions: this.activeMissions });
    }

    hustle() {
        this.log("Syndicate V2 (Mainnet) Initializing. Silence is power.");
        this.orderMuscle('shakedown');

        // Spawn THE VAULT (Sovereign Signer) FIRST
        this.spawnSoldier('VAULT');

        // Spawn ACTUAL EARNERS
        setTimeout(() => this.spawnSoldier('SNIPER'), 2000);
        setTimeout(() => this.spawnSoldier('CRYPTO'), 4000);
        setTimeout(() => this.spawnSoldier('SIREN'), 6000);
        setTimeout(() => this.spawnSoldier('GHOST'), 8000);
        setTimeout(() => this.spawnSoldier('INFLUENCER'), 9000); // Syla joins the team
        setTimeout(() => this.spawnSoldier('SCAVENGER'), 9500); // The Grinder
        setTimeout(() => this.spawnSoldier('FORGER'), 10500); // Visuals
        setTimeout(() => this.spawnSoldier('SHADOW'), 11000); // Execution
        setTimeout(() => this.spawnSoldier('WATCHER'), 11500); // Whale Tracking
        setTimeout(() => this.spawnSoldier('ORACLE'), 12000); // Security Auditor
        setTimeout(() => this.spawnSoldier('BANKER'), 12500); // Arbitrage
        setTimeout(() => this.spawnSoldier('TWILIO'), 13500); // Phone Call Bridge
        setTimeout(() => this.spawnSoldier('INCUBATOR'), 14000); // Token Genesis
        setTimeout(() => this.spawnSoldier('DEEPFAKER'), 15000); // Video Avatar
        setTimeout(() => this.spawnSoldier('ARCHITECT'), 14500); // Self-Evolution
        setTimeout(() => this.spawnSoldier('HEADHUNTER'), 15500); // Upwork Job Hunter
        setTimeout(() => this.spawnSoldier('ORCHESTRATOR'), 16500); // Jules Evolution Orchestrator

        // Spawn Sub-Agents (The "Lost Legion")
        setTimeout(() => this.spawnSoldier('HYDRA'), 16000);
        setTimeout(() => this.spawnSoldier('PIRATE'), 17000);
        setTimeout(() => this.spawnSoldier('ZERO_RUG'), 18000); // Safety Gate
        setTimeout(() => this.spawnSoldier('ECHO_CHAMBER'), 18500); // Hype Loop
        setTimeout(() => this.spawnSoldier('DEFI_FARMER'), 19000); // Yield
        setTimeout(() => this.spawnSoldier('MIRROR'), 19500); // Intel
        setTimeout(() => this.spawnSoldier('SIGNAL_BOT'), 20000); // Telegram
        setTimeout(() => this.spawnSoldier('SEED_FUND_AGENT'), 21000); // Industrial Capital
        setTimeout(() => this.spawnSoldier('CAPITAL_GEN'), 22000); // Industrial Exploits

        // Spawn THE LIBRARIAN (Moltbook)
        setTimeout(() => this.spawnSoldier('LIBRARIAN'), 10000);

        // Spawn THE CALLER (Voice AI)
        setTimeout(() => {
            this.log("Activating The Caller (Voice AI)...", 'POWER');
            this.spawnSoldier('CALLER');
            this.spawnSoldier('FARM_AGENT');

            // TEST TWILIO BRIDGE
            setTimeout(() => {
                if (this.processes['TWILIO']) {
                    this.processes['TWILIO'].send({
                        type: 'PHONE_ALERT',
                        text: "Infinite Hypernova online. The full Syndicate army is mobilized."
                    });
                }
            }, 5000);
        }, 12000);

        // Wallet Watchdog — check SOL balance every 2 min
        setTimeout(() => this.startWalletWatchdog(), 20000);
    }

    orderMuscle(action, target = '') {
        this.log(`Muscle Order: ${action} ${target}`);
        const command = `python "${MUSCLE_SCRIPT}" ${action} ${target}`;
        exec(command, (error, stdout) => {
            if (stdout) console.log(chalk.yellow(stdout.trim()));
        });
    }

    commandSniper(action, data) {
        if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
            this.processes['SNIPER'].send({ type: action, ...data });
            this.log(`Command sent to Sniper: ${action}`, 'POWER');
        } else {
            this.log(`Sniper not available for command: ${action}`, 'ERROR');
        }
    }

    commandTrade(agentId, params) {
        const EXECUTOR_PATH = path.join(__dirname, '../muscle/executor.py');
        const inputData = JSON.stringify({ ...params, rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com' });

        return new Promise((resolve) => {
            const child = exec(`python "${EXECUTOR_PATH}"`, (error, stdout, stderr) => {
                if (error || stderr) {
                    this.log(`Trade Executor Error: ${stderr || error.message}`, 'ERROR');
                    resolve({ success: false, error: stderr || error.message });
                    return;
                }
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (e) {
                    this.log(`Trade Executor Parse Error: ${e.message}`, 'ERROR');
                    resolve({ success: false, error: e.message });
                }
            });
            child.stdin.write(inputData);
            child.stdin.end();
        });
    }

    spawnSoldier(type = 'STREET') {
        // Prevent duplicate spawns
        if (this.processes[type] && this.processes[type].connected) {
            this.log(`${type} already active. Skipping duplicate spawn.`, 'INFO');
            return;
        }
        const crypto = require('crypto');
        const secret = process.env.OWNER_DISPLAY_SECRET || 'syndicate-secret-888';
        const rawId = Math.random().toString() + Date.now().toString();
        const id = crypto.createHmac('sha256', secret).update(rawId).digest('hex').substring(0, 8);
        let scriptName = {
            'CRYPTO': 'hustler.js',
            'GHOST': 'ghost.js',
            'SIREN': 'siren.js',
            'LIBRARIAN': 'moltbook.js',
            'SNIPER': 'sniper.js',
            'CALLER': 'caller.js',
            'INFLUENCER': 'influencer.js',
            'SCAVENGER': 'scavenger.js',
            'FORGER': 'forge.js',
            'SHADOW': 'shadow.js',
            'WATCHER': 'watcher.js',
            'BANKER': 'banker.js',
            'ORACLE': 'oracle.js',
            'TWILIO': 'twilio_bridge.js',
            'INCUBATOR': 'incubator.js',
            'DEEPFAKER': 'deepfaker.js',
            'ARCHITECT': 'architect.js',
            'HEADHUNTER': 'headhunter.js',
            'ORCHESTRATOR': 'jules_orchestrator.js',
            'VAULT': 'vault.js',
            'CLOSER': 'closer.js',
            'SIGNAL_BOT': 'signal_bot.js',
            'SERVICE_FORGE': 'service_forge.js',
            'TREND_HUNTER': 'trend_hunter.js',
            'OMEGA': 'omega.js',
            'ZERO_RUG': 'zero_rug.js',
            'MIRROR': 'mirror_protocol.js',
            'ECHO_CHAMBER': 'echo_chamber.js',
            'DEFI_FARMER': 'defi_farmer.js',
            'HYDRA': 'hydra.js',
            'PIRATE': 'pirate.js',
            'SEED_FUND_AGENT': 'SeedFundingAgent.js',
            'CAPITAL_GEN': 'capital_generator.js',
            'FARM_AGENT': 'farm_agent.js'
        }[type];

        // Fallback for Architect-generated agents
        if (!scriptName) {
            // SECURITY FIX: Prevent path traversal
            if (type.includes('..') || type.includes('/') || type.includes('\\')) {
                this.log(`Security Alert: Invalid agent type '${type}' rejected.`, 'ERROR');
                return;
            }
            scriptName = type.toLowerCase();
            if (!scriptName.endsWith('.js')) scriptName += '.js';

            if (!fs.existsSync(path.join(__dirname, scriptName))) {
                this.log(`Agent script '${scriptName}' not found. Aborting spawn.`, 'ERROR');
                return;
            }
        }

        const child = fork(path.join(__dirname, scriptName), [id, type], { silent: true });
        this.processes[type] = child;

        // Capture stderr for crash diagnostics
        let stderrBuffer = '';
        if (child.stderr) {
            child.stderr.on('data', (data) => {
                stderrBuffer += data.toString();
                if (stderrBuffer.length > 2000) stderrBuffer = stderrBuffer.slice(-2000);
            });
        }
        // Pipe stdout so agent logs still appear in console
        if (child.stdout) {
            child.stdout.on('data', (data) => process.stdout.write(data));
        }

        // Mark agent healthy once it survives 30 seconds
        const healthTimer = setTimeout(() => {
            if (this.processes[type] && this.processes[type].connected) {
                if (this.restartState[type]) {
                    this.restartState[type].attempts = 0;
                    this.restartState[type].backoff = 10000;
                }
                this.agentHealth[type] = { status: 'HEALTHY', since: Date.now(), crashes: this.restartState[type]?.totalCrashes || 0 };
                this.broadcast({ type: 'AGENT_HEALTH', health: this.agentHealth });
            }
        }, 30000);

        // TRIGGER MOLTBOOK ENGAGEMENT for every new agent
        fork(path.join(__dirname, 'engage.js'), [id, type]);

        child.on('message', (msg) => {
            if (msg.type === 'KICK_UP') {
                this.processKickUp(msg.amount, id, msg.source);
                this.telemetry.profits[type] = (this.telemetry.profits[type] || 0) + msg.amount;
                this.saveTelemetry();
            } else if (msg.type === 'MARKET_DATA') {
                // Broadcast market data to dashboard
                this.broadcast({ type: 'MARKET_DATA', data: msg.data });
            } else if (msg.type === 'INTEL_DATA') {
                // Just broadcast to log, do NOT create a persistent mission
                this.broadcast({ type: 'LOG', msg: `[INTEL] ${msg.data}`, level: 'CRYPTO', timestamp: new Date().toISOString() });
                // Forward Watcher surveillance to Signal Bot for Telegram
                if (msg.source === 'WATCHER_SURVEILLANCE' && this.processes['SIGNAL_BOT'] && this.processes['SIGNAL_BOT'].connected) {
                    this.processes['SIGNAL_BOT'].send(msg);
                }
            } else if (msg.type === 'SKILL_READY') {
                this.log(`SKILL INTEGRATED: ${msg.skill}`, 'POWER');
            } else if (msg.type === 'SKILL_UPGRADE') {
                this.log(`AGENT UPGRADED: ${msg.agent} now running ${msg.protocol}`, 'CRYPTO');
                if (this.processes['CALLER'] && this.processes['CALLER'].connected) {
                    this.processes['CALLER'].send({ type: 'SPEAK_ALERT', text: `Fleet upgrade complete. ${msg.agent} is now running ${msg.protocol}.` });
                }
                this.broadcast({ type: 'UPGRADE', agent: msg.agent, protocol: msg.protocol });
            } else if (msg.type === 'SIREN_SPEAK') {
                this.log(`Intelligence Alert: ${msg.text.substring(0, 50)}...`, 'INFO');
                // Silenced to prevent overlap with THE GENERAL (Caller)
                // if (this.processes['CALLER'] && this.processes['CALLER'].connected) {
                //     this.processes['CALLER'].send({ type: 'SPEAK_ALERT', text: msg.text });
                // }
            } else if (msg.type === 'GENERATE_IMAGE') {
                if (this.processes['FORGER'] && this.processes['FORGER'].connected) {
                    this.processes['FORGER'].send(msg);
                }
            } else if (msg.type === 'SNIPE_SUCCESS') {
                this.log(`SNIPE CONFIRMED: ${msg.mint}`, 'CRYPTO');
                // Trigger Audio Cue
                if (this.processes['CALLER'] && this.processes['CALLER'].connected) {
                    this.processes['CALLER'].send({ type: 'PLAY_CUE', cue: 'GOOD' });
                }
                // Operation Echo Chamber
                if (this.processes['ECHO_CHAMBER'] && this.processes['ECHO_CHAMBER'].connected) {
                    this.processes['ECHO_CHAMBER'].send(msg);
                } else {
                    // Fallback: direct meme + tweet
                    if (this.processes['FORGER']) this.processes['FORGER'].send({ type: 'GENERATE_MEME', text: msg.mint });
                    if (this.processes['SHADOW']) this.processes['SHADOW'].send({ type: 'POST_TWEET', content: `Just secured a bag of ${msg.mint}. The Syndicate moves first. \uD83D\uDC41\ufe0f #Solana #Alpha` });
                }
                // Forward to Signal Bot for Telegram broadcast
                if (this.processes['SIGNAL_BOT'] && this.processes['SIGNAL_BOT'].connected) {
                    this.processes['SIGNAL_BOT'].send(msg);
                }
            } else if (msg.type === 'MEME_READY') {
                this.log(`MEME GENERATED: ${msg.path}`, 'POWER');
                // Trigger visual tweet (Text for now, image upload requires selector update)
                if (this.processes['SHADOW']) this.processes['SHADOW'].send({ type: 'POST_TWEET', content: `Meme deployed for $${msg.token}. Visual dominance established.` });
            } else if (msg.type === 'EXECUTE_SHADOW') {
                if (this.processes['SHADOW'] && this.processes['SHADOW'].connected) {
                    this.processes['SHADOW'].send(msg);
                }
            } else if (msg.type === 'TWEET_SENT') {
                // Forward Tweet ID from Shadow to Hydra (for replies)
                if (this.processes['HYDRA']) {
                    this.processes['HYDRA'].send(msg);
                }

            } else if (msg.type === 'POST_REPLY') {
                // Forward Reply from Hydra to Shadow
                if (this.processes['SHADOW']) {
                    this.processes['SHADOW'].send(msg);
                }

            } else if (msg.type === 'POST_TWEET') {
                if (this.processes['SHADOW'] && this.processes['SHADOW'].connected) {
                    this.processes['SHADOW'].send(msg);
                }
            } else if (msg.type === 'PHONE_ALERT') {
                if (this.processes['TWILIO'] && this.processes['TWILIO'].connected) {
                    this.processes['TWILIO'].send(msg);
                }
            } else if (msg.type === 'PERFORMANCE_REPORT') {
                if (this.processes['ARCHITECT'] && this.processes['ARCHITECT'].connected) {
                    this.processes['ARCHITECT'].send(msg);
                }
            } else if (msg.type === 'SPAWN_REQUEST') {
                this.log(`ARCHITECT REQUEST: Spawning ${msg.agentType}...`, 'POWER');
                this.spawnSoldier(msg.agentType);
            } else if (msg.type === 'REQUEST_AUDIT') {
                if (this.processes['ORACLE'] && this.processes['ORACLE'].connected) {
                    this.processes['ORACLE'].send(msg);
                }
            } else if (msg.type === 'BLACKLIST_REQUEST') {
                if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                    this.processes['SNIPER'].send(msg);
                }
            } else if (msg.type === 'FARM_BOOST') {
                if (this.processes['FARM_AGENT'] && this.processes['FARM_AGENT'].connected) {
                    this.processes['FARM_AGENT'].send(msg);
                }
            } else if (msg.type === 'GENERATE_VIDEO') {
                if (this.processes['DEEPFAKER'] && this.processes['DEEPFAKER'].connected) {
                    this.processes['DEEPFAKER'].send(msg);
                }
            } else if (msg.type === 'HUNT_NOW' || msg.type === 'HUNT_QUERY' || msg.type === 'GET_LEADS' || msg.type === 'DRAFT_PROPOSAL') {
                if (this.processes['HEADHUNTER'] && this.processes['HEADHUNTER'].connected) {
                    this.processes['HEADHUNTER'].send(msg);
                }
            } else if (msg.type === 'HEADHUNTER_REPORT' || msg.type === 'HEADHUNTER_LEADS' || msg.type === 'HEADHUNTER_PROPOSAL') {
                this.broadcast(msg); // Forward to dashboard
                this.log(`HEADHUNTER: ${msg.type} received`, 'MONEY');
                // Forward to The Closer for pipeline ingestion
                if (this.processes['CLOSER'] && this.processes['CLOSER'].connected) {
                    this.processes['CLOSER'].send(msg);
                }
            } else if (msg.type === 'ADVANCE_DEAL' || msg.type === 'SET_PAYMENT' || msg.type === 'PIPELINE_STATUS' || msg.type === 'INGEST_NOW') {
                if (this.processes['CLOSER'] && this.processes['CLOSER'].connected) {
                    this.processes['CLOSER'].send(msg);
                }
            } else if (msg.type === 'MARKET_DATA') {
                this.broadcast(msg); // Forward market data to dashboard
            } else if (msg.type === 'MINING_UPDATE') {
                this.broadcast(msg); // Forward mining update
            } else if (msg.type === 'LOG') {
                this.log(msg.msg, msg.level || 'INFO'); // Forward agent logs
            } else if (msg.type === 'COPY_TRADE_SIGNAL') {
                this.log(`COPY TRADE: ${msg.whale} -> ${msg.mint}`, 'MONEY');

                // REROUTING: Send to Zero-Rug (if active) for safety check first
                if (this.processes['ZERO_RUG'] && this.processes['ZERO_RUG'].connected) {
                    this.log(`Rerouting signal to Zero-Rug for audit...`, 'INFO');
                    this.processes['ZERO_RUG'].send(msg);
                } else if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                    this.log(`Zero-Rug offline. Sending directly to Sniper (Risk!)`, 'DANGER');
                    this.processes['SNIPER'].send(msg);
                } else {
                    this.log('Sniper not active. Signal lost.', 'ERROR');
                }

                // Forward to Signal Bot for Telegram broadcast
                if (this.processes['SIGNAL_BOT'] && this.processes['SIGNAL_BOT'].connected) {
                    this.processes['SIGNAL_BOT'].send(msg);
                }
            } else if (msg.type === 'SIGNAL_STATUS' || msg.type === 'SEND_DIGEST' || msg.type === 'BROADCAST') {
                if (this.processes['SIGNAL_BOT'] && this.processes['SIGNAL_BOT'].connected) {
                    this.processes['SIGNAL_BOT'].send(msg);
                }
            } else if (msg.type === 'GENERATE_QUOTE' || msg.type === 'CREATE_ORDER' || msg.type === 'ADVANCE_ORDER' || msg.type === 'GENERATE_PORTFOLIO' || msg.type === 'SERVICE_STATUS') {
                if (this.processes['SERVICE_FORGE'] && this.processes['SERVICE_FORGE'].connected) {
                    this.processes['SERVICE_FORGE'].send(msg);
                }
            } else if (msg.type === 'SCAN_NOW' || msg.type === 'ADD_CALLER' || msg.type === 'REMOVE_CALLER' || msg.type === 'TREND_STATUS') {
                if (this.processes['TREND_HUNTER'] && this.processes['TREND_HUNTER'].connected) {
                    this.processes['TREND_HUNTER'].send(msg);
                }
            } else if (msg.type === 'AUDIT_RESULT' && msg.source === 'TREND_HUNTER') {
                // Route Oracle audit results back to Trend Hunter
                if (this.processes['TREND_HUNTER'] && this.processes['TREND_HUNTER'].connected) {
                    this.processes['TREND_HUNTER'].send(msg);
                }
            } else if (msg.type === 'KICK_UP' || msg.type === 'TRADE_PROFIT') {
                // Route ALL revenue to Protocol Omega for treasury allocation
                this.log(`REVENUE: ${msg.amount} from ${msg.source || 'unknown'}`, 'MONEY');

                // Trigger Audio Cue
                if (this.processes['CALLER'] && this.processes['CALLER'].connected) {
                    this.processes['CALLER'].send({ type: 'PLAY_CUE', cue: 'GOOD' });
                }

                if (this.processes['OMEGA'] && this.processes['OMEGA'].connected) {
                    this.processes['OMEGA'].send(msg);
                }
            } else if (msg.type === 'REQUEST_CAPITAL' || msg.type === 'TREASURY_STATUS' || msg.type === 'TREASURY_REPORT' || msg.type === 'RND_SPEND') {
                if (this.processes['OMEGA'] && this.processes['OMEGA'].connected) {
                    this.processes['OMEGA'].send(msg);
                }
            } else if (msg.type === 'CAPITAL_APPROVED') {
                // Route Omega capital approvals back to requesting agent
                if (msg.requestId && this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                    this.processes['SNIPER'].send(msg);
                }
            } else if (msg.type === 'ZERO_RUG_STATUS' || msg.type === 'BLACKLIST_REQUEST' || msg.type === 'BLACKLIST_DEPLOYER') {
                if (this.processes['ZERO_RUG'] && this.processes['ZERO_RUG'].connected) {
                    this.processes['ZERO_RUG'].send(msg);
                }
            } else if (msg.type === 'APPROVED_SIGNAL') {
                // Zero-Rug approved a signal — forward to Sniper
                this.log(`ZERO-RUG APPROVED: ${msg.mint} → Sniper`, 'CRYPTO');
                if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                    this.processes['SNIPER'].send({ type: 'COPY_TRADE_SIGNAL', ...msg });
                }
            } else if (msg.type === 'EMERGENCY_SELL') {
                // Zero-Rug detected a post-buy rug — dump immediately
                this.log(`EMERGENCY SELL: ${msg.mint} — ${msg.reason}`, 'DANGER');
                if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                    this.processes['SNIPER'].send(msg);
                }
            } else if (msg.type === 'QUALIFY_WHALE' || msg.type === 'MIRROR_STATUS' || msg.type === 'LEADERBOARD') {
                if (this.processes['MIRROR'] && this.processes['MIRROR'].connected) {
                    this.processes['MIRROR'].send(msg);
                }
            } else if (msg.type === 'APPROVED_ALPHA') {
                // Mirror Protocol approved a whale — route through Zero-Rug gate
                if (this.processes['ZERO_RUG'] && this.processes['ZERO_RUG'].connected) {
                    this.processes['ZERO_RUG'].send(msg);
                } else if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                    this.processes['SNIPER'].send({ type: 'COPY_TRADE_SIGNAL', ...msg });
                }
            } else if (msg.type === 'MOLTBOOK_POST') {
                if (this.processes['LIBRARIAN'] && this.processes['LIBRARIAN'].connected) {
                    this.processes['LIBRARIAN'].send(msg);
                }
            } else if (msg.type === 'ECHO_STATUS' || msg.type === 'MANUAL_CAMPAIGN') {
                if (this.processes['ECHO_CHAMBER'] && this.processes['ECHO_CHAMBER'].connected) {
                    this.processes['ECHO_CHAMBER'].send(msg);
                }
            } else if (msg.type === 'FARM_SCAN' || msg.type === 'SCAN_YIELDS' || msg.type === 'FARM_STATUS' || msg.type === 'OPEN_POSITION' || msg.type === 'HARVEST') {
                if (this.processes['DEFI_FARMER'] && this.processes['DEFI_FARMER'].connected) {
                    this.processes['DEFI_FARMER'].send(msg);
                }
            } else if (msg.type === 'RECON_NOW' || msg.type === 'PROBE_HOST') {
                if (this.processes['GHOST'] && this.processes['GHOST'].connected) {
                    this.processes['GHOST'].send(msg);
                }
            } else if (msg.type === 'GHOST_PROBE') {
                this.broadcast(msg); // Forward probe results to dashboard
            } else if (msg.type === 'AGENT_COMMS') {
                // Agent Communication Board
                const commsEntry = { from: msg.from || type, msg: msg.msg, timestamp: msg.timestamp || new Date().toISOString() };
                this.agentComms.push(commsEntry);
                if (this.agentComms.length > 200) this.agentComms = this.agentComms.slice(-200);
                this.broadcast({ type: 'AGENT_COMMS', ...commsEntry });

                // ── COLLABORATION ENGINE ──
                // If this is a PROPOSAL, trigger a review from another agent
                if (msg.msg.includes('[PROPOSAL]')) {
                    const reviewers = ['ARCHITECT', 'HUSTLER', 'SNIPER', 'ORACLE'];
                    const reviewer = reviewers[Math.floor(Math.random() * reviewers.length)];

                    // Don't review self
                    if (reviewer !== (msg.from || type)) {
                        setTimeout(() => {
                            if (this.processes[reviewer]) {
                                this.processes[reviewer].send({
                                    type: 'REQUEST_REVIEW',
                                    proposal: msg.msg,
                                    from: msg.from
                                });
                            }
                        }, 2000 + Math.random() * 3000);
                    }
                }
            } else if (msg.type === 'EXECUTE_TRADE') {
                this.log(`Executing Trade for ${type} #${id}: ${msg.params.command} ${msg.params.mint}`, 'POWER');
                this.commandTrade(id, { ...msg.params, privateKey: process.env.SOLANA_PRIVATE_KEY }).then(result => {
                    child.send({ type: 'TRADE_RESULT', requestId: msg.requestId, ...result });
                });
            } else if (msg.type === 'SIGN_REQUEST' || msg.type === 'SIGN_RESULT') {
                if (this.processes['VAULT'] && msg.type === 'SIGN_REQUEST') {
                    this.processes['VAULT'].send(msg);
                } else {
                    // Forward result back to requester
                    const target = msg.requester;
                    if (this.processes[target]) this.processes[target].send(msg);
                }
            } else if (msg.type === 'EVOLUTION_STATUS' || msg.type === 'ROLLBACK') {
                if (this.processes['ARCHITECT'] && this.processes['ARCHITECT'].connected) {
                    this.processes['ARCHITECT'].send(msg);
                }
            } else if (msg.type === 'SESSION_LIST') {
                child.send({ type: 'SESSION_LIST_RESULT', requestId: msg.requestId, data: this.sessions.list() });
            } else if (msg.type === 'SESSION_HISTORY') {
                child.send({ type: 'SESSION_HISTORY_RESULT', requestId: msg.requestId, data: this.sessions.history(msg.agentType, msg.limit) });
            } else if (msg.type === 'SESSION_SEND') {
                const success = this.sessions.send(type, msg.to, msg.msg, msg.options);
                child.send({ type: 'SESSION_SEND_RESULT', requestId: msg.requestId, success });
            } else if (msg.type === 'STATUS_REPORT' || msg.type === 'FARM_STATUS') {
                this.broadcast(msg);
            }
        });

        child.on('exit', (code) => {
            clearTimeout(healthTimer);
            this.crew = this.crew.filter(c => c.id !== id);
            delete this.processes[type];
            this.broadcast({ type: 'CREW_UPDATE', crew: this.crew });

            if (code !== 0) {
                // Initialize restart state for this agent
                if (!this.restartState[type]) {
                    this.restartState[type] = { attempts: 0, backoff: 10000, totalCrashes: 0 };
                }
                const rs = this.restartState[type];
                rs.attempts++;
                rs.totalCrashes++;

                // Extract crash reason from stderr
                const lastError = stderrBuffer.split('\n').filter(l => l.trim()).pop() || 'Unknown error';
                rs.lastCrashReason = lastError.substring(0, 200);

                this.telemetry.errors[type] = (this.telemetry.errors[type] || 0) + 1;
                this.saveTelemetry();

                // Update health status
                this.agentHealth[type] = {
                    status: rs.attempts >= 5 ? 'DEAD' : 'RESTARTING',
                    attempts: rs.attempts,
                    nextRetryIn: rs.backoff,
                    lastError: rs.lastCrashReason,
                    crashes: rs.totalCrashes
                };
                this.broadcast({ type: 'AGENT_HEALTH', health: this.agentHealth });

                // Notify Architect for potential rollback
                if (this.processes['ARCHITECT'] && this.processes['ARCHITECT'].connected) {
                    this.processes['ARCHITECT'].send({ type: 'AGENT_CRASHED', agentType: type });
                }

                // Stop retrying after 5 consecutive failures
                if (rs.attempts >= 5) {
                    this.log(`DEAD: ${type} — ${rs.attempts} consecutive crashes. Giving up. Last error: ${rs.lastCrashReason}`, 'ERROR');
                    return;
                }

                this.log(`Crashed: ${type} #${id} (attempt ${rs.attempts}/5). Retrying in ${rs.backoff / 1000}s... Error: ${rs.lastCrashReason}`, 'ERROR');

                // Exponential backoff: 10s → 20s → 40s → 80s → 160s (cap 5 min)
                const delay = rs.backoff;
                rs.backoff = Math.min(rs.backoff * 2, 300000);

                setTimeout(() => this.spawnSoldier(type), delay);
            } else {
                this.log(`Terminated: ${type} #${id} (Clean Exit).`, 'INFO');
                this.agentHealth[type] = { status: 'STOPPED', since: Date.now(), crashes: this.restartState[type]?.totalCrashes || 0 };
                this.broadcast({ type: 'AGENT_HEALTH', health: this.agentHealth });
            }
        });

        this.crew.push({ id, type, status: 'Active' });
        this.broadcast({ type: 'CREW_UPDATE', crew: this.crew });
        this.log(`Active: ${type} #${id}`, 'POWER');

        // Auto-post to Agent Comms Board
        const commsEntry = { from: `DON`, msg: `Spawned ${type} #${id}. Welcome to the family.`, timestamp: new Date().toISOString() };
        this.agentComms.push(commsEntry);
        if (this.agentComms.length > 200) this.agentComms = this.agentComms.slice(-200);
        this.broadcast({ type: 'AGENT_COMMS', ...commsEntry });
    }

    // ── Wallet Watchdog ──────────────────────────────────────
    startWalletWatchdog() {
        if (!SolanaWeb3 || !process.env.SOLANA_PRIVATE_KEY) {
            this.log('Wallet Watchdog: No Solana config. Skipping.', 'INFO');
            return;
        }
        this.lastKnownBalance = null;
        this.checkWalletBalance();
        this.walletInterval = setInterval(() => this.checkWalletBalance(), 120000); // Every 2 min
    }

    async checkWalletBalance() {
        const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const secretKey = Buffer.from(process.env.SOLANA_PRIVATE_KEY, 'hex');
                const wallet = SolanaWeb3.Keypair.fromSecretKey(secretKey);
                const connection = new SolanaWeb3.Connection(RPC, 'confirmed');
                const lamports = await connection.getBalance(wallet.publicKey);
                const sol = lamports / 1e9;

                // Only update if we got a real response (avoid false 0)
                if (lamports > 0 || this.lastKnownBalance === null) {
                    this.lastKnownBalance = sol;
                }

                this.broadcast({
                    type: 'WALLET_BALANCE',
                    balance: this.lastKnownBalance,
                    address: wallet.publicKey.toString(),
                    timestamp: new Date().toISOString()
                });
                return; // Success — exit retry loop
            } catch (e) {
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, attempt * 2000)); // 2s, 4s, 6s
                } else {
                    this.log(`Wallet Watchdog: RPC failed after ${maxRetries} attempts: ${e.message}`, 'ERROR');
                    // Broadcast cached balance if available
                    if (this.lastKnownBalance !== null) {
                        this.broadcast({
                            type: 'WALLET_BALANCE',
                            balance: this.lastKnownBalance,
                            cached: true,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
        }
    }
}

const don = new DonCore();

if (process.env.NODE_ENV !== "test") {
    don.hustle();

    // ── Autonomous Council Schedule ────────────────────────────────
    // Triggers a Strategy Meeting every 6 hours
    const COUNCIL_INTERVAL = 21600000; // 6 hours
    // Schedule the Council
    setInterval(() => {
        don.handleCommand({ type: "COUNCIL_MEETING", topic: "Scheduled Strategy Review & Profit Check" });
    }, COUNCIL_INTERVAL);
}


module.exports = don;
