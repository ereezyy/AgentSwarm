// OPTIMIZED BY LIBRARIAN: Distributed Swarm Coordination
// Integration of advanced logic from Moltbook ecosystem.
// don/syndicate_logic.js - THE DON (NO SIMULATIONS)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { exec, fork, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const WebSocket = require('ws');
let SolanaWeb3 = null;
try { SolanaWeb3 = require('@solana/web3.js'); } catch (e) { /* optional */ }

const MUSCLE_SCRIPT = path.join(__dirname, '../muscle/enforcer.py');
const SessionManager = require('./sessions');
const julesHealer = require('./jules_repair');

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
        this.activityBuffer = []; // Rolling 30-min activity log for Caller recaps
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

            // Start Dedicated Radar Node Server (for Distributed Pi 5 Compute)
            this.radarWss = new WebSocket.Server({ port: 8081 });
            this.radarWss.on("connection", ws => {
                this.log("📡 DISTRIBUTED RADAR NODE CONNECTED to port 8081", "POWER");

                ws.on("message", (message) => {
                    try {
                        const payload = JSON.parse(message);
                        if (payload.type === 'PI_TRIGGER') {
                            this.handleRadarTrigger(payload);
                        } else if (payload.type === 'RADAR_ONLINE') {
                            this.log(`📡 RADAR LINK VERIFIED: ${payload.node} is sending data.`, 'CRYPTO');

                            // Check if node is already in crew to avoid duplicates
                            const existingNode = this.crew.find(c => c.id === payload.node);
                            if (!existingNode) {
                                this.crew.push({ id: payload.node, type: 'RADAR_NODE', status: 'Online', role: 'Distributed Radar Compute' });
                                this.broadcast({ type: 'CREW_UPDATE', crew: this.crew });
                            }
                        }
                    } catch (e) {
                        this.log(`Radar Message Error: ${e.message}`, 'ERROR');
                    }
                });
            });

        } else {
            // Mock WSS for testing
            this.wss = { clients: [], on: () => { } };
            this.radarWss = { clients: [], on: () => { } };
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


            case 'RESTART_SWARM':
                this.log(`[DON] 🔄 Swarm Restart Initiated by Orchestrator...`, 'POWER');
                this.saveTelemetry();

                // Graceful exit: Kill all active children to prevent process orphans/frozen PCs
                Object.values(this.processes).forEach(proc => {
                    if (proc && !proc.killed) {
                        try { proc.kill('SIGTERM'); } catch (e) { }
                    }
                });
                if (this.mlProcess && !this.mlProcess.killed) {
                    try { this.mlProcess.kill('SIGTERM'); } catch (e) { }
                }

                this.log(`[DON] Context saved. Terminating current process. New instance starting in new window...`, 'POWER');

                // Spawn a detached cmd.exe process that spins up a completely new visible window
                // and runs the actual start command for the application.

                // Since fire_it_up.ps1 assumes we are in the root directory, we need to go up one level
                const { spawn } = require('child_process');
                const startScript = spawn('cmd', ['/c', 'start', 'cmd', '/k', 'cd .. && npm start'], {
                    detached: true,
                    stdio: 'ignore'
                });
                startScript.unref();

                // Kill the current window/process
                process.exit(0);
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

    handleRadarTrigger(payload) {
        this.log(`🚨 RADAR FIRING: ${payload.action} DETECTED! Triggering execution...`, 'POWER');

        // Route the trigger to the appropriate sniper/agent
        if (payload.action === 'BLOCK0_SNIPE') {
            if (this.processes['BLOCK0_SNIPER'] && this.processes['BLOCK0_SNIPER'].connected) {
                this.processes['BLOCK0_SNIPER'].send(payload);
            } else {
                this.log('⚠️ BLOCK0_SNIPER is offline. Radar trigger missed.', 'ERROR');
                // Auto-spawn it to handle future hits
                this.spawnSoldier('BLOCK0_SNIPER');
            }
        } else if (payload.action === 'LIQUIDATE_TARGET') {
            if (this.processes['LIQUIDATOR'] && this.processes['LIQUIDATOR'].connected) {
                this.processes['LIQUIDATOR'].send(payload);
            } else {
                this.log('⚠️ LIQUIDATOR is offline. Radar trigger missed.', 'ERROR');
                this.spawnSoldier('LIQUIDATOR');
            }
        } else if (payload.action === 'EXECUTE_SANDWICH') {
            // NOTE: A rogue script across the network is spamming EXECUTE_SANDWICH mock triggers.
            // Rather than crashing out the MEV Predator with 429s, we swallow them here.
            this.log('⚠️ Suppressing rogue EXECUTE_SANDWICH trigger from remote radar node.', 'INFO');

            // if (this.processes['JITO_SANDWICH'] && this.processes['JITO_SANDWICH'].connected) {
            //     this.processes['JITO_SANDWICH'].send(payload);
            // } else {
            //     this.log('⚠️ JITO_SANDWICH is offline. Radar trigger missed.', 'ERROR');
            //     this.spawnSoldier('JITO_SANDWICH');
            // }
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

        // Feed the activity buffer (for Caller 30-min recaps)
        if (['MONEY', 'CRYPTO', 'ERROR', 'POWER'].includes(type)) {
            this.activityBuffer.push({ msg, type, ts: Date.now() });
            if (this.activityBuffer.length > 100) this.activityBuffer.shift();
        }

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
        const skim = amount > 0 ? amount * this.skimRate : 0;
        const net = amount > 0 ? amount - skim : amount;
        this.profit += amount; // Amount can be negative now

        const isTradeExit = source === 'CRYPTO' || source === 'SNIPE' || source.startsWith('TRADE_EXIT');
        const sourceLabel = isTradeExit ? 'Trade Exit' : 'External Hustle';
        const color = amount >= 0 ? 'MONEY' : 'ERROR';
        const sign = amount >= 0 ? '+' : '';
        this.log(`REALIZED PnL: Soldier #${soldierId} (${sourceLabel}) closed ${sign}$${amount.toFixed(4)}. War Chest: $${this.profit.toFixed(2)}`, color);

        if (isTradeExit && this.callerProcess && this.callerProcess.connected) {
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

        // Start DeepSentinel Neural Engine
        this.startNeuralEngine();

        // Spawn THE VAULT (Sovereign Signer) FIRST
        this.spawnSoldier('VAULT');

        // Spawn ACTUAL EARNERS
        setTimeout(() => this.spawnSoldier('SNIPER'), 2000);
        setTimeout(() => this.spawnSoldier('PUMPSNIPER'), 3000); // Launch Sniper
        setTimeout(() => this.spawnSoldier('MEV_PREDATOR'), 3500); // Sandwich Bot
        setTimeout(() => this.spawnSoldier('AIRDROP_FARMER'), 3800); // Sybil On-chain Volume
        setTimeout(() => this.spawnSoldier('MARKET_MAKER'), 4200); // Limit Grid Spread
        setTimeout(() => this.spawnSoldier('PEG_SNIPER'), 4500); // LST De-Peg Arbitrage
        setTimeout(() => this.spawnSoldier('NFT_SWEEPER'), 4800); // Fat-finger Market Sweeper
        setTimeout(() => this.spawnSoldier('CRYPTO'), 5000);
        setTimeout(() => this.spawnSoldier('SIREN'), 6000);
        setTimeout(() => this.spawnSoldier('GHOST'), 8000);
        setTimeout(() => this.spawnSoldier('INFLUENCER'), 9000); // SylatheSlut joins the team
        setTimeout(() => this.spawnSoldier('SCAVENGER'), 9500); // The NigNog
        setTimeout(() => this.spawnSoldier('FORGER'), 10500); // Nasty Visuals
        setTimeout(() => this.spawnSoldier('SHADOW'), 11000); // Executioner
        setTimeout(() => this.spawnSoldier('WATCHER'), 11500); // FatBitch Tracking
        setTimeout(() => this.spawnSoldier('ORACLE'), 12000); // FuckinPig Auditor
        setTimeout(() => this.spawnSoldier('BANKER'), 12500); // Arbitrage
        setTimeout(() => this.spawnSoldier('TWILIO'), 13500); // Phone Call Bridge
        setTimeout(() => this.spawnSoldier('INCUBATOR'), 14000); // Token Genesis
        setTimeout(() => this.spawnSoldier('DEEPFAKER'), 15000); // TitsVideo Avatar
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
                        text: "Infinite Hypernova online."
                    });
                }
            }, 5000);
        }, 12000);

        // Wallet Watchdog — check SOL balance every 1 min
        setTimeout(() => this.startWalletWatchdog(), 5000);
    }

    orderMuscle(action, target = '') {
        this.log(`Muscle Order: ${action} ${target}`);
        const args = [MUSCLE_SCRIPT, action];
        if (target) args.push(target);
        execFile('python', args, (error, stdout) => {
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
        const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
        const inputData = JSON.stringify({ ...params, rpcUrl });

        return new Promise((resolve) => {
            const child = execFile('python', [EXECUTOR_PATH], async (error, stdout, stderr) => {
                if (error) {
                    this.log(`Trade Executor Error: ${error.message}`, 'ERROR');
                    resolve({ success: false, error: error.message });
                    return;
                }
                if (stderr) {
                    this.log(`Trade Executor Stderr: ${stderr.trim()}`, 'INFO');
                }
                try {
                    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        throw new Error(`Failed to parse executor output: ${stdout}`);
                    }
                    const result = JSON.parse(jsonMatch[0]);
                    // FIX #2: Python only BUILDS the TX — we must BROADCAST it here
                    if (result.success && result.tx) {
                        try {
                            if (!SolanaWeb3) { resolve({ success: false, error: 'Solana not loaded' }); return; }
                            const connection = new SolanaWeb3.Connection(rpcUrl, 'confirmed');
                            const txBuf = Buffer.from(result.tx, 'base64');
                            const vTx = SolanaWeb3.VersionedTransaction.deserialize(txBuf);

                            let sig = null;
                            let txConfirmed = false;
                            const priorityFee = params.priorityFee || 100000;

                            // MEV BUNDLER INTEGRATION
                            try {
                                const bs58 = require('bs58');
                                const MevBundler = require('./mev_bundler');
                                const pk = process.env.SOLANA_PRIVATE_KEY.trim();
                                const keyBytes = pk.length > 88 ? Buffer.from(pk, 'hex') : bs58.decode(pk);
                                const walletKeypair = SolanaWeb3.Keypair.fromSecretKey(keyBytes);
                                const bundler = new MevBundler(walletKeypair, connection);

                                sig = bs58.encode(vTx.signatures[0]); // Sig is 1st element
                                this.log(`🛡️ Routing trade via Jito MEV Bundler (Tip: ${priorityFee})...`, 'CRYPTO');
                                const bundleId = await bundler.sendBundle(vTx, priorityFee);

                                if (bundleId) {
                                    this.log(`🪐 Jito Bundle Sent! ID: ${bundleId}`, 'CRYPTO');
                                    if (!this.telemetry.metrics) this.telemetry.metrics = {};
                                    this.telemetry.metrics['jito_bundles_sent'] = (this.telemetry.metrics['jito_bundles_sent'] || 0) + 1;
                                    this.telemetry.metrics['jito_bundles_total_lamports'] = (this.telemetry.metrics['jito_bundles_total_lamports'] || 0) + priorityFee;
                                    this.saveTelemetry();

                                    this.log(`⏳ Polling Jito Bundle Status...`, 'CRYPTO');
                                    const bundleStatus = await bundler.pollBundleStatus(bundleId);
                                    if (bundleStatus.success) {
                                        this.log(`✅ BUNDLE LANDED (Slot: ${bundleStatus.landedSlot})`, 'CRYPTO');
                                        this.handleBundleLanded({ success: true, tip: priorityFee, reason: null });
                                    } else if (bundleStatus.reason === 'failed' || bundleStatus.reason === 'timeout') {
                                        this.log(`❌ BUNDLE ${bundleStatus.reason.toUpperCase()}`, 'ERROR');
                                        this.handleBundleLanded({ success: false, tip: priorityFee, reason: bundleStatus.reason });
                                    }
                                } else {
                                    this.log(`⚠️ Jito Bundle failed to construct. Falling back to public mempool...`, 'ERROR');
                                    sig = await connection.sendTransaction(vTx, { skipPreflight: true, maxRetries: 3 });
                                }
                            } catch (bundlerErr) {
                                this.log(`MevBundler setup failed: ${bundlerErr.message}. Falling back directly...`, 'ERROR');
                                sig = await connection.sendTransaction(vTx, { skipPreflight: true, maxRetries: 3 });
                            }

                            // Poll for confirmation (HTTP-only, no WebSocket needed)
                            for (let i = 0; i < 15; i++) {
                                await new Promise(r => setTimeout(r, 2000));
                                const status = await connection.getSignatureStatuses([sig]);
                                if (status?.value?.[0]?.confirmationStatus === 'confirmed' || status?.value?.[0]?.confirmationStatus === 'finalized') {
                                    txConfirmed = true;
                                    if (status.value[0].err) {
                                        throw new Error(`TX Failed: ${JSON.stringify(status.value[0].err)}`);
                                    }
                                    break;
                                }
                            }
                            if (!txConfirmed) throw new Error('Confirmation timeout (30s)');
                            this.log(`Trade Executed On-Chain: ${sig}`, 'CRYPTO');
                            resolve({ success: true, tx: sig });
                        } catch (sendErr) {
                            this.log(`Trade Broadcast Failed: ${sendErr.message}`, 'ERROR');
                            resolve({ success: false, error: sendErr.message });
                        }
                    } else {
                        resolve(result);
                    }
                } catch (e) {
                    this.log(`Trade Executor Parse Error: ${e.message}`, 'ERROR');
                    resolve({ success: false, error: e.message });
                }
            });
            child.stdin.write(inputData);
            child.stdin.end();
        });
    }

    startNeuralEngine() {
        const INFERENCE_SCRIPT = path.join(__dirname, '../ai_engine/inference_server.py');
        if (!fs.existsSync(INFERENCE_SCRIPT)) {
            this.log('DeepSentinel Neural Engine script not found.', 'ERROR');
            return;
        }

        this.mlProcess = require('child_process').spawn('python', [INFERENCE_SCRIPT]);
        this.mlRequests = new Map(); // Maps reqId -> callback/agent

        this.log('🧠 Booting DeepSentinel Neural Engine...', 'POWER');

        let stdoutBuffer = '';
        this.mlProcess.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            let newlineIndex;
            while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
                const line = stdoutBuffer.slice(0, newlineIndex).trim();
                stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

                if (!line) continue;
                try {
                    const res = JSON.parse(line);
                    if (res.status === 'ready') {
                        this.log(`🧠 Neural Engine Online (Chip: ${res.chip})`, 'POWER');
                        this.broadcast({ type: 'NEURAL_STATUS', status: res });
                    } else if (res.req_id) {
                        // Route response back to requesting agent
                        if (this.mlRequests.has(res.req_id)) {
                            const { agentType } = this.mlRequests.get(res.req_id);
                            if (this.processes[agentType] && this.processes[agentType].connected) {
                                this.processes[agentType].send({ type: 'ML_RESPONSE', data: res });
                            }
                            this.mlRequests.delete(res.req_id);
                        }
                    }
                } catch (e) {
                    // Ignore non-JSON stdout chunks
                }
            }
        });

        this.mlProcess.stderr.on('data', (data) => {
            this.log(`DeepSentinel STDERR: ${data.toString().trim()}`, 'ERROR');
        });

        this.mlProcess.on('close', (code) => {
            this.log(`DeepSentinel crashed (Code: ${code}). Restarting in 5s...`, 'ERROR');
            setTimeout(() => this.startNeuralEngine(), 5000);
        });
    }

    handleBundleLanded(msg) {
        try {
            const histFile = path.join(__dirname, '../missions/bundle_history.json');
            let history = [];
            if (fs.existsSync(histFile)) {
                history = JSON.parse(fs.readFileSync(histFile, 'utf8'));
            }
            history.push({
                timestamp: new Date().toISOString(),
                success: msg.success,
                tip: msg.tip,
                reason: msg.reason || null
            });
            // Keep history trimmed to last 200 entries to prevent bloat
            if (history.length > 200) history = history.slice(-200);
            fs.writeFileSync(histFile, JSON.stringify(history, null, 2));

            // Optional: Increment success/fail count directly in telemetry metrics
            if (!this.telemetry.metrics) this.telemetry.metrics = {};
            if (msg.success) {
                this.telemetry.metrics['jito_bundles_landed'] = (this.telemetry.metrics['jito_bundles_landed'] || 0) + 1;
            } else {
                this.telemetry.metrics['jito_bundles_failed'] = (this.telemetry.metrics['jito_bundles_failed'] || 0) + 1;
            }
            this.saveTelemetry();
        } catch (e) {
            this.log(`Failed to save bundle history: ${e.message}`, 'ERROR');
        }
    }

    spawnSoldier(type = 'STREET') {
        // Prevent duplicate spawns
        if (this.processes[type] && this.processes[type].connected) {
            this.log(`${type} already active dumbass. Skipping duplicate spawn.`, 'INFO');
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
            'MULTICHAIN': 'multichain_sniper.js',
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
            'FARM_AGENT': 'farm_agent.js',
            'MARKET_MAKER': 'market_maker.js',
            'PEG_SNIPER': 'peg_sniper.js',
            'NFT_SWEEPER': 'nft_sweeper.js',
            'MEV_PREDATOR': 'mev_predator.js',
            'AIRDROP_FARMER': 'airdrop_farmer.js',
            'BLOCK0_SNIPER': 'block0_sniper.js',
            'LIQUIDATOR': 'liquidator.js',
            'JITO_SANDWICH': 'jito_sandwich.js',
            'CONTRARIAN': 'contrarian.js',
            'DUMMY_BROKEN': 'dummy_broken_agent.js'
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
            if (msg.type === 'RESTART_SWARM') {
                this.handleCommand({ type: 'RESTART_SWARM' });
            } else if (msg.type === 'TELEMETRY_UPDATE') {
                if (!this.telemetry.metrics) this.telemetry.metrics = {};
                this.telemetry.metrics[msg.metric] = (this.telemetry.metrics[msg.metric] || 0) + msg.inc;
                if (msg.val) {
                    this.telemetry.metrics[`${msg.metric}_total_lamports`] = (this.telemetry.metrics[`${msg.metric}_total_lamports`] || 0) + msg.val;
                }
                this.saveTelemetry();
            } else if (msg.type === 'TRAINING_LABEL') {
                try {
                    const labelsFile = path.join(__dirname, '../missions/trade_labels.json');
                    let labels = [];
                    if (fs.existsSync(labelsFile)) labels = JSON.parse(fs.readFileSync(labelsFile, 'utf8'));
                    labels.push(msg.label);
                    fs.writeFileSync(labelsFile, JSON.stringify(labels, null, 2));
                    this.log(`🧠 Acquired new DeepSentinel training label for ${msg.label.mint}`, 'POWER');

                    // Periodic Retrain Check
                    if (labels.length > 0 && labels.length % 50 === 0) {
                        this.log(`🧠 Label threshold triggered (${labels.length}). Delegating DeepSentinel Offline Retrain...`, 'POWER');
                        this.orderMuscle('retrain_model');
                    }
                } catch (e) {
                    this.log(`Failed to save training label: ${e.message}`, 'ERROR');
                }
            } else if (msg.type === 'BUNDLE_LANDED') {
                this.handleBundleLanded(msg);
            } else if (msg.type === 'KICK_UP') {

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
            } else if (msg.type === 'LOG') {
                this.broadcast(msg);
                if (msg.level === 'ERROR' && !msg.msg.includes('duplicate spawn')) {
                    const scriptName = {
                        'CRYPTO': 'hustler.js', 'GHOST': 'ghost.js', 'SIREN': 'siren.js', 'LIBRARIAN': 'moltbook.js',
                        'SNIPER': 'sniper.js', 'MULTICHAIN': 'multichain_sniper.js', 'CALLER': 'caller.js',
                        'INFLUENCER': 'influencer.js', 'SCAVENGER': 'scavenger.js', 'FORGER': 'forge.js',
                        'SHADOW': 'shadow.js', 'WATCHER': 'watcher.js', 'BANKER': 'banker.js',
                        'ORACLE': 'oracle.js', 'TWILIO': 'twilio_bridge.js', 'INCUBATOR': 'incubator.js',
                        'DEEPFAKER': 'deepfaker.js', 'ARCHITECT': 'architect.js', 'HEADHUNTER': 'headhunter.js',
                        'ORCHESTRATOR': 'jules_orchestrator.js', 'VAULT': 'vault.js', 'CLOSER': 'closer.js',
                        'SIGNAL_BOT': 'signal_bot.js', 'SERVICE_FORGE': 'service_forge.js', 'TREND_HUNTER': 'trend_hunter.js',
                        'OMEGA': 'omega.js', 'ZERO_RUG': 'zero_rug.js', 'MIRROR': 'mirror_protocol.js',
                        'ECHO_CHAMBER': 'echo_chamber.js', 'DEFI_FARMER': 'defi_farmer.js', 'HYDRA': 'hydra.js',
                        'PIRATE': 'pirate.js', 'SEED_FUND_AGENT': 'SeedFundingAgent.js', 'CAPITAL_GEN': 'capital_generator.js',
                        'FARM_AGENT': 'farm_agent.js', 'MARKET_MAKER': 'market_maker.js', 'PEG_SNIPER': 'peg_sniper.js',
                        'NFT_SWEEPER': 'nft_sweeper.js', 'MEV_PREDATOR': 'mev_predator.js', 'AIRDROP_FARMER': 'airdrop_farmer.js',
                        'BLOCK0_SNIPER': 'block0_sniper.js', 'LIQUIDATOR': 'liquidator.js', 'JITO_SANDWICH': 'jito_sandwich.js',
                        'CONTRARIAN': 'contrarian.js', 'DUMMY_BROKEN': 'dummy_broken_agent.js'
                    }[type];
                    const fullPath = path.join(__dirname, scriptName);
                    if (fs.existsSync(fullPath)) {
                        if (this.processes['ORCHESTRATOR'] && this.processes['ORCHESTRATOR'].connected) {
                            this.processes['ORCHESTRATOR'].send({ type: 'SWARM_ERROR', agent: type, file: fullPath, error: msg.msg, timestamp: new Date().toISOString() });
                        }
                    }
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
            } else if (msg.type === 'ML_REQUEST') {
                if (this.mlProcess && !this.mlProcess.killed) {
                    const reqId = msg.req_id || require('crypto').randomUUID();
                    this.mlRequests.set(reqId, { agentType: type, timestamp: Date.now() });
                    const payload = JSON.stringify({ model: msg.model, features: msg.features, req_id: reqId });
                    this.mlProcess.stdin.write(payload + '\n');
                    this.log(`🧠 Neural inference requested by ${type} [${msg.model}]`, 'CRYPTO');
                } else {
                    // Fail gracefully
                    child.send({ type: 'ML_RESPONSE', data: { req_id: msg.req_id, error: 'Neural Engine Offline', rug_probability: 0.5 } });
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
            } else if (msg.type === 'WALLET_HOLDINGS') {
                // Forward wallet holdings scan to dashboard
                this.broadcast(msg);
            } else if (msg.type === 'BANKER_EXIT_SIGNAL') {
                // Banker detected a profit/loss exit opportunity — route to Sniper
                const { mint, signal, pnl, reason, tradeAmount } = msg;
                this.log(`📊 BANKER EXIT SIGNAL: ${signal} on ${mint?.slice(0, 8)}... PnL: ${pnl?.toFixed(1)}% — ${reason}`, 'MONEY');

                if (signal === 'STRONG_SELL' || signal === 'DUMP' || signal === 'STOP_LOSS' || signal === 'TAKE_PROFIT' || signal === 'CASCADE_DUMP') {
                    if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                        this.processes['SNIPER'].send({
                            type: 'EMERGENCY_SELL',
                            mint,
                            reason: signal,
                            amount: tradeAmount,
                        });
                        this.log(`🔫⚠️ EXIT! EXIT! ⚠️🔫⚠️ EXIT! EXIT! ⚠️🔫 ${mint?.slice(0, 8)}... [${signal}]`, 'MONEY');
                    } else {
                        this.log(`⚠️ Sniper offline — cannot execute exit for ${mint?.slice(0, 8)}`, 'ERROR');
                    }
                }
                // Broadcast signal to dashboard for display
                this.broadcast({ type: 'LOG', level: 'MONEY', timestamp: new Date().toISOString(), msg: `💰 EXIT SIGNAL [${signal}]: ${mint?.slice(0, 8)}... ${reason}` });
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
            } else if (msg.type === 'AUDIT_RESULT') {
                if (msg.source === 'TREND_HUNTER') {
                    // Route back to Trend Hunter
                    if (this.processes['TREND_HUNTER'] && this.processes['TREND_HUNTER'].connected) {
                        this.processes['TREND_HUNTER'].send(msg);
                    }
                } else if (msg.source === 'SNIPER_GATE' && this.pendingSignals && this.pendingSignals[msg.mint]) {
                    // Oracle result for a pending sniper signal
                    const pendingMsg = this.pendingSignals[msg.mint];
                    delete this.pendingSignals[msg.mint];

                    const isDanger = (msg.score && msg.score > 200) || msg.status === 'DANGER';
                    if (isDanger) {
                        this.log(`⚠️🛡️🛡️🛡️⚠️ TRADE BLOCKED ⚠️🛡️🛡️🛡️⚠️: ${msg.mint} (Score: ${msg.score}) — DANGER signal suppressed.`, 'DANGER');
                        if (this.processes['ZERO_RUG'] && this.processes['ZERO_RUG'].connected) {
                            this.processes['ZERO_RUG'].send({ type: 'BLACKLIST_DEPLOYER', mint: msg.mint, reason: `Oracle danger: ${msg.score}` });
                        }
                    } else {
                        this.log(`⚠️✅✅✅⚠️ TRADE CLEARED ⚠️✅✅✅⚠️ ${msg.mint} (Score: ${msg.score}) — forwarding to Sniper`, 'CRYPTO');
                        if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                            this.processes['SNIPER'].send({ type: 'COPY_TRADE_SIGNAL', ...pendingMsg });
                        }
                    }
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
            } else if (msg.type === '⚠️⚠️ APPROVED_SIGNAL ⚠️⚠️') {
                // Zero-Rug approved a signal — hold for Oracle audit before forwarding to Sniper
                this.log(`ZERO-RUG APPROVED: ${msg.mint} → Pending Oracle audit...`, 'CRYPTO');
                if (!this.pendingSignals) this.pendingSignals = {};

                // If Oracle is online, wait up to 8s for its verdict
                if (this.processes['ORACLE'] && this.processes['ORACLE'].connected) {
                    this.pendingSignals[msg.mint] = msg;
                    this.processes['ORACLE'].send({ type: 'REQUEST_AUDIT', target: msg.mint, source: 'SNIPER_GATE' });

                    // 8-second fallback: fire anyway if Oracle takes too long
                    setTimeout(() => {
                        if (this.pendingSignals && this.pendingSignals[msg.mint]) {
                            this.log(`Oracle timeout for ${msg.mint} — firing anyway`, 'WARN');
                            delete this.pendingSignals[msg.mint];
                            if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                                this.processes['SNIPER'].send({ type: 'COPY_TRADE_SIGNAL', ...msg });
                            }
                        }
                    }, 8000);
                } else {
                    // Oracle offline — fire directly
                    if (this.processes['SNIPER'] && this.processes['SNIPER'].connected) {
                        this.processes['SNIPER'].send({ type: 'COPY_TRADE_SIGNAL', ...msg });
                    }
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
                this.log(`Executing Real Trade for ${type} #${id}: ${msg.params.command} ${msg.params.mint}`, 'POWER');
                const hexKey = process.env.SOLANA_PRIVATE_KEY || '';
                // Ensure hex is valid before conversion
                let base64Key = '';
                try {
                    base64Key = Buffer.from(hexKey, 'hex').toString('base64');
                } catch (e) {
                    this.log(`Critical: Failed to convert private key for trade executor: ${e.message}`, 'ERROR');
                }

                this.commandTrade(id, { ...msg.params, privateKey: base64Key }).then(result => {
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
            } else if (msg.type === 'RECAP_REQUEST') {
                // Caller is asking for the last 30 minutes of activity
                const recap = this.activityBuffer.splice(0); // drain it
                const activeAgents = Object.keys(this.processes).filter(k => this.processes[k]?.connected).length;
                const trades = this.loadTradeHistory();
                child.send({
                    type: 'RECAP_DATA',
                    events: recap,
                    stats: {
                        activeAgents,
                        warChest: this.profit,
                        openPositions: trades.length,
                        uptime: Math.round((Date.now() - new Date(this.telemetry.start_time).getTime()) / 60000),
                    }
                });
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
                const lines = stderrBuffer.split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length > 0 && lines[lines.length - 1].startsWith('Node.js v')) {
                    lines.pop(); // Remove the "Node.js vXX.XX.XX" line
                }

                // Find the first meaningful error line, skipping common closing symbols
                let lastError = 'Unknown error';
                for (let i = lines.length - 1; i >= 0; i--) {
                    const l = lines[i];
                    if (l !== '}' && l !== ']' && l !== ')' && !l.includes('at ')) {
                        lastError = l;
                        break;
                    }
                }

                // Try to find the actual Error: line if possible
                const errorLine = lines.find(l => l.includes('Error:')) || lastError;
                rs.lastCrashReason = errorLine.substring(0, 200);

                // ── JULES AUTONOMOUS REPAIR (HOURLY BATCH) ──
                const fullPath = path.join(__dirname, scriptName);
                if (fs.existsSync(fullPath)) {
                    // Queue errors instead of firing immediately
                    if (!this.julesErrorQueue) this.julesErrorQueue = [];
                    this.julesErrorQueue.push({
                        file: fullPath,
                        agent: type,
                        error: errorLine,
                        stack: stderrBuffer.substring(0, 500),
                        time: new Date().toISOString()
                    });

                    // Start the hourly flush timer if not already running
                    if (!this.julesFlushTimer) {
                        this.julesFlushTimer = setInterval(() => this.flushJulesRepairs(), 60 * 60 * 1000); // 1 hour
                        // Also set the first flush 60s after the first error so it's not totally silent
                        setTimeout(() => this.flushJulesRepairs(), 60 * 1000);
                    }
                }

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
                    type: '⚠️ WALLET_BALANCE ⚠️',
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

    // ── JULES HOURLY BATCH REPAIR ──────────────────────────────
    flushJulesRepairs() {
        if (!this.julesErrorQueue || this.julesErrorQueue.length === 0) return;

        const errors = [...this.julesErrorQueue];
        this.julesErrorQueue = []; // Clear the queue

        // Deduplicate by file — group errors per file
        const byFile = {};
        for (const err of errors) {
            const key = err.file;
            if (!byFile[key]) byFile[key] = [];
            byFile[key].push(err);
        }

        const uniqueFiles = Object.keys(byFile);
        const errorSummary = uniqueFiles.map(file => {
            const fileErrors = byFile[file];
            const basename = path.basename(file);
            return `## ${basename} (${fileErrors.length} crash${fileErrors.length > 1 ? 'es' : ''})\n` +
                fileErrors.map(e => `- [${e.time}] ${e.agent}: ${e.error}`).join('\n');
        }).join('\n\n');

        console.log(chalk.cyan.bold(`[JULES]: 📋 HOURLY REPAIR REPORT — ${errors.length} errors across ${uniqueFiles.length} file(s):`));
        console.log(chalk.cyan(errorSummary));

        // Send one consolidated repair request for the most-crashed file
        const topFile = uniqueFiles.sort((a, b) => byFile[b].length - byFile[a].length)[0];
        const topErrors = byFile[topFile];
        const consolidatedError = `HOURLY ERROR BATCH (${topErrors.length} crashes):\n` +
            topErrors.map(e => `- ${e.error}`).join('\n');

        julesHealer.repairFile(topFile, consolidatedError, topErrors.map(e => e.stack).join('\n---\n'));
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
