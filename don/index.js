// don/index.js - The Brains of the Operation (Command Center v2)
// Interactive CLI for The Don with real-time commands

const chalk = require('chalk');
const readline = require('readline');
const don = require('./syndicate_logic');

console.clear();

// ASCII Art Banner
const BANNER = `
█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
█  ██╗███╗   ██╗███████╗██╗███╗   ██╗██╗████████╗███████╗  █
█  ██║████╗  ██║██╔════╝██║████╗  ██║██║╚══██╔══╝██╔════╝  █
█  ██║██╔██╗ ██║█████╗  ██║██╔██╗ ██║██║   ██║   █████╗    █
█  ██║██║╚██╗██║██╔══╝  ██║██║╚██╗██║██║   ██║   ██╔══╝    █
█  ██║██║ ╚████║██║     ██║██║ ╚████║██║   ██║   ███████╗  █
█  ╚═╝╚═╝  ╚═══╝╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝   ╚═╝   ╚══════╝  █
█         ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗            █
█         ██║  ██║╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗           █
█         ███████║ ╚████╔╝ ██████╔╝█████╗  ██████╔╝           █
█         ██╔══██║  ╚██╔╝  ██╔═══╝ ██╔══╝  ██╔══██╗           █
█         ██║  ██║   ██║   ██║     ███████╗██║  ██║           █
█         ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝           █
█▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█
`;

console.log(chalk.green.bold(BANNER));
console.log(chalk.red.bold('  🕴️  AUTONOMOUS SYNDICATE NETWORK — COMMAND CENTER'));
console.log(chalk.gray('  ─────────────────────────────────────────────────'));
console.log(chalk.green(`  Status: ${chalk.white.bold('MAINNET ACTIVE')} | Agents: ${chalk.yellow.bold('Spawning...')} | WebSocket: ${chalk.cyan.bold('ws://localhost:8080')}`));
console.log(chalk.gray('  ─────────────────────────────────────────────────\n'));

// ── Interactive CLI ──────────────────────────────────────────
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.red.bold('\n  [THE DON] > ')
});

/**
 * Helper to safely send a command to a connected agent process.
 * Handles the connection check and standard logging.
 * @param {string} agentName - Name of the agent in don.processes
 * @param {object} payload - Message payload to send
 * @param {string} [successLog] - Message to log on success (optional)
 * @param {string} [errorLog] - Custom error message (optional)
 * @returns {boolean} - True if sent, false if not connected
 */
function sendCommand(agentName, payload, successLog, errorLog) {
    const agent = don.processes[agentName];
    if (agent && agent.connected) {
        agent.send(payload);
        if (successLog) console.log(successLog);
        return true;
    } else {
        if (errorLog) {
            console.log(errorLog);
        } else {
            console.log(chalk.red(`  ❌ ${agentName.replace('_', ' ')} not online. Use: spawn ${agentName}`));
        }
        return false;
    }
}

function showHelp() {
    console.log(chalk.green.bold('\n  ═══════════════════════════════════════'));
    console.log(chalk.green.bold('  SYNDICATE COMMAND REFERENCE'));
    console.log(chalk.green.bold('  ═══════════════════════════════════════'));
    console.log(chalk.white('  status      ') + chalk.gray('Show swarm status & agent roster'));
    console.log(chalk.white('  crew        ') + chalk.gray('List all active agents'));
    console.log(chalk.white('  profit      ') + chalk.gray('Show war chest balance'));
    console.log(chalk.white('  hunt        ') + chalk.gray('Trigger Headhunter scan NOW'));
    console.log(chalk.white('  hunt <q>    ') + chalk.gray('Add custom Upwork search query'));
    console.log(chalk.white('  leads       ') + chalk.gray('Request latest Headhunter leads'));
    console.log(chalk.white('  spawn <T>   ') + chalk.gray('Spawn agent (SNIPER, SHADOW, etc)'));
    console.log(chalk.white('  speak <msg> ') + chalk.gray('Force The Caller to speak'));
    console.log(chalk.white('  call <msg>  ') + chalk.gray('Send Twilio phone call'));
    console.log(chalk.white('  tweet <msg> ') + chalk.gray('Post via The Shadow'));
    console.log(chalk.white('  audit       ') + chalk.gray('Request Oracle security audit'));
    console.log(chalk.white('  pipeline    ') + chalk.gray('Show Closer deal pipeline'));
    console.log(chalk.white('  close <id>  ') + chalk.gray('Advance a deal (close PAID <dealId>)'));
    console.log(chalk.white('  signals     ') + chalk.gray('Signal Bot status'));
    console.log(chalk.white('  digest      ') + chalk.gray('Send daily signal digest'));
    console.log(chalk.white('  broadcast   ') + chalk.gray('Send message to Telegram channel'));
    console.log(chalk.white('  quote <req> ') + chalk.gray('Generate service quote'));
    console.log(chalk.white('  portfolio   ') + chalk.gray('Generate services portfolio'));
    console.log(chalk.white('  services    ') + chalk.gray('Service Forge status'));
    console.log(chalk.white('  scan        ') + chalk.gray('Trigger Trend Hunter scan'));
    console.log(chalk.white('  callers     ') + chalk.gray('Trend Hunter caller status'));
    console.log(chalk.white('  addcaller   ') + chalk.gray('Add Twitter caller (addcaller @handle)'));
    console.log(chalk.white('  treasury    ') + chalk.gray('Protocol Omega treasury status'));
    console.log(chalk.white('  treport     ') + chalk.gray('Generate treasury report'));
    console.log(chalk.white('  evolve      ') + chalk.gray('Trigger Architect evolution'));
    console.log(chalk.white('  evolve <a>  ') + chalk.gray('Evolve specific agent (e.g. hustler.js)'));
    console.log(chalk.white('  evolve-status') + chalk.gray(' Show evolution metrics'));
    console.log(chalk.white('  rollback <A>') + chalk.gray(' Rollback last evolution (e.g. HUSTLER)'));
    console.log(chalk.white('  recon       ') + chalk.gray('Trigger Ghost network recon'));
    console.log(chalk.white('  probe <ip>  ') + chalk.gray('Probe a host for open ports'));
    console.log(chalk.white('  shield      ') + chalk.gray('Zero-Rug defense status'));
    console.log(chalk.white('  mirror      ') + chalk.gray('Mirror Protocol whale status'));
    console.log(chalk.white('  leaderboard ') + chalk.gray('Whale PnL leaderboard'));
    console.log(chalk.white('  echo        ') + chalk.gray('Echo Chamber campaign status'));
    console.log(chalk.white('  farm        ') + chalk.gray('DeFi Farmer position status'));
    console.log(chalk.white('  yields      ') + chalk.gray('Scan DeFi yield opportunities'));
    console.log(chalk.white('  help        ') + chalk.gray('Show this menu'));
    console.log(chalk.white('  compact     ') + chalk.gray('Manually triggers brain context compaction'));
    console.log(chalk.white('  think <L>   ') + chalk.gray('Set thinking level (off, minimal, low, medium, high, xhigh)'));
    console.log(chalk.white('  sessions    ') + chalk.gray('Show active agent session metadata'));
    console.log(chalk.white('  exit        ') + chalk.gray('Shutdown gracefully'));
    console.log(chalk.green.bold('  ═══════════════════════════════════════\n'));
}

function showStatus() {
    console.log(chalk.green.bold('\n  ═══════════════════════════════════════'));
    console.log(chalk.green.bold('  SYNDICATE STATUS REPORT'));
    console.log(chalk.green.bold('  ═══════════════════════════════════════'));
    console.log(chalk.white(`  💰 War Chest:    $${don.profit.toFixed(2)}`));
    console.log(chalk.white(`  👥 Active Crew:  ${don.crew.length} agents`));
    console.log(chalk.white(`  📋 Missions:     ${don.activeMissions.length} active`));
    console.log(chalk.white(`  🔌 WebSocket:    Port ${don.wss?.options?.port || 8080}`));
    console.log(chalk.white(`  📡 Processes:    ${Object.keys(don.processes).join(', ') || 'None'}`));
    console.log(chalk.green.bold('  ═══════════════════════════════════════\n'));
}

function showCrew() {
    console.log(chalk.green.bold('\n  ACTIVE ROSTER:'));
    if (don.crew.length === 0) {
        console.log(chalk.gray('  No agents online yet.'));
        return;
    }
    for (const agent of don.crew) {
        const status = agent.status === 'Active' ? chalk.green('●') : chalk.red('○');
        console.log(`  ${status} ${chalk.white.bold(agent.type.padEnd(14))} #${agent.id} ${chalk.gray(`[${agent.status}]`)}`);
    }
    console.log('');
}

rl.on('line', (input) => {
    const line = input.trim();
    if (!line) { rl.prompt(); return; }

    const [cmd, ...args] = line.split(' ');
    const arg = args.join(' ');

    switch (cmd.toLowerCase()) {
        case 'help':
        case '?':
            showHelp();
            break;

        case 'status':
            showStatus();
            break;

        case 'crew':
        case 'roster':
            showCrew();
            break;

        case 'profit':
        case 'chest':
            console.log(chalk.yellow.bold(`\n  💰 War Chest: $${don.profit.toFixed(2)}\n`));
            break;

        case 'hunt':
            if (arg) {
                console.log(chalk.hex('#FF6600')(`  🎯 Adding search query: "${arg}"`));
                if (don.processes['HEADHUNTER'] && don.processes['HEADHUNTER'].connected) {
                    don.processes['HEADHUNTER'].send({ type: 'HUNT_QUERY', query: arg });
                }
            }
            console.log(chalk.hex('#FF6600')('  🎯 Triggering Headhunter scan NOW...'));
            if (don.processes['HEADHUNTER'] && don.processes['HEADHUNTER'].connected) {
                don.processes['HEADHUNTER'].send({ type: 'HUNT_NOW' });
            } else {
                console.log(chalk.red('  ❌ Headhunter not online. Spawning...'));
                don.spawnSoldier('HEADHUNTER');
            }
            break;

        case 'leads':
            if (don.processes['HEADHUNTER'] && don.processes['HEADHUNTER'].connected) {
                don.processes['HEADHUNTER'].send({ type: 'GET_LEADS' });
                console.log(chalk.gray('  📋 Requesting latest leads from Headhunter...'));
            } else {
                console.log(chalk.red('  ❌ Headhunter not online.'));
            }
            break;

        case 'spawn':
            if (arg) {
                const agentType = arg.toUpperCase();
                console.log(chalk.magenta(`  ⚡ Spawning ${agentType}...`));
                don.spawnSoldier(agentType);
            } else {
                console.log(chalk.yellow('  Usage: spawn <AGENT_TYPE>'));
                console.log(chalk.gray('  Types: SNIPER, SHADOW, HEADHUNTER, SIREN, INFLUENCER, SCAVENGER, etc.'));
            }
            break;

        case 'speak':
        case 'say':
            if (arg && don.processes['CALLER'] && don.processes['CALLER'].connected) {
                don.processes['CALLER'].send({ type: 'SPEAK_ALERT', text: arg });
                console.log(chalk.cyan(`  🔊 Speaking: "${arg}"`));
            } else {
                console.log(chalk.yellow('  Usage: speak <message>'));
            }
            break;

        case 'call':
            if (arg && don.processes['TWILIO'] && don.processes['TWILIO'].connected) {
                don.processes['TWILIO'].send({ type: 'PHONE_ALERT', text: arg });
                console.log(chalk.teal(`  📞 Calling with: "${arg}"`));
            } else {
                console.log(chalk.yellow('  Usage: call <message>'));
            }
            break;

        case 'tweet':
        case 'post':
            if (arg && don.processes['SHADOW'] && don.processes['SHADOW'].connected) {
                don.processes['SHADOW'].send({ type: 'POST_TWEET', content: arg });
                console.log(chalk.gray(`  🐦 Deploying tweet via Shadow...`));
            } else {
                console.log(chalk.yellow('  Usage: tweet <content>'));
            }
            break;

        case 'audit':
            if (don.processes['ORACLE'] && don.processes['ORACLE'].connected) {
                don.processes['ORACLE'].send({ type: 'REQUEST_AUDIT', target: arg || 'system' });
                console.log(chalk.yellow('  🛡️ Oracle audit requested...'));
            } else {
                console.log(chalk.red('  ❌ Oracle not online.'));
            }
            break;

        case 'pipeline':
        case 'deals':
            if (don.processes['CLOSER'] && don.processes['CLOSER'].connected) {
                don.processes['CLOSER'].send({ type: 'PIPELINE_STATUS' });
                console.log(chalk.hex('#00FF88')('  💰 Requesting pipeline status from The Closer...'));
            } else {
                console.log(chalk.red('  ❌ Closer not online. Use: spawn CLOSER'));
            }
            break;

        case 'close':
            if (args.length >= 2) {
                const stage = args[0].toUpperCase();
                const dealId = args.slice(1).join(' ');
                if (don.processes['CLOSER'] && don.processes['CLOSER'].connected) {
                    don.processes['CLOSER'].send({ type: 'ADVANCE_DEAL', dealId, newStage: stage, note: 'Manual advance from CLI' });
                    console.log(chalk.hex('#00FF88')(`  💰 Advancing deal to ${stage}...`));
                } else {
                    console.log(chalk.red('  ❌ Closer not online. Use: spawn CLOSER'));
                }
            } else {
                console.log(chalk.yellow('  Usage: close <STAGE> <dealId>'));
                console.log(chalk.gray('  Stages: PROPOSAL_SENT, INTERVIEW, WON, PAID'));
            }
            break;

        case 'signals':
            sendCommand('SIGNAL_BOT', { type: 'SIGNAL_STATUS' }, chalk.hex('#FFD700')('  📡 Requesting Signal Bot status...'));
            break;

        case 'digest':
            sendCommand('SIGNAL_BOT', { type: 'SEND_DIGEST' }, chalk.hex('#FFD700')('  📊 Sending daily signal digest...'));
            break;

        case 'broadcast':
            if (arg) {
                sendCommand('SIGNAL_BOT', { type: 'BROADCAST', text: arg }, chalk.hex('#FFD700')(`  📢 Broadcasting to Telegram: "${arg}"`));
            } else {
                console.log(chalk.yellow('  Usage: broadcast <message>'));
            }
            break;

        case 'quote':
            if (arg) {
                sendCommand('SERVICE_FORGE', { type: 'GENERATE_QUOTE', request: arg }, chalk.hex('#FF69B4')(`  📋 Generating quote for: "${arg}"`));
            } else {
                console.log(chalk.yellow('  Usage: quote <client request description>'));
            }
            break;

        case 'portfolio':
            sendCommand('SERVICE_FORGE', { type: 'GENERATE_PORTFOLIO' }, chalk.hex('#FF69B4')('  📂 Generating services portfolio...'));
            break;

        case 'services':
            sendCommand('SERVICE_FORGE', { type: 'SERVICE_STATUS' }, chalk.hex('#FF69B4')('  🏭 Requesting Service Forge status...'));
            break;

        case 'scan':
            sendCommand('TREND_HUNTER', { type: 'SCAN_NOW' }, chalk.hex('#00FF88')('  🎯 Trend Hunter scan triggered...'));
            break;

        case 'callers':
        case 'trends':
            sendCommand('TREND_HUNTER', { type: 'TREND_STATUS' }, chalk.hex('#00FF88')('  📊 Requesting Trend Hunter status...'));
            break;

        case 'addcaller':
            if (arg) {
                const handle = arg.replace('@', '');
                sendCommand('TREND_HUNTER', { type: 'ADD_CALLER', handle, tier: 'B' }, chalk.hex('#00FF88')(`  ➕ Adding @${handle} to caller watchlist...`));
            } else {
                console.log(chalk.yellow('  Usage: addcaller @handle'));
            }
            break;

        case 'treasury':
            sendCommand('OMEGA', { type: 'TREASURY_STATUS' }, chalk.hex('#FFD700')('  ⚡ Requesting treasury status...'));
            break;

        case 'treport':
            sendCommand('OMEGA', { type: 'TREASURY_REPORT' }, chalk.hex('#FFD700')('  📊 Generating treasury report...'));
            break;

        case 'shield':
        case 'zerorug':
            sendCommand('ZERO_RUG', { type: 'ZERO_RUG_STATUS' }, chalk.red('  🛡️ Requesting Zero-Rug defense status...'));
            break;

        case 'mirror':
            sendCommand('MIRROR', { type: 'MIRROR_STATUS' }, chalk.hex('#00BFFF')('  🪞 Requesting Mirror Protocol status...'));
            break;

        case 'leaderboard':
            sendCommand('MIRROR', { type: 'LEADERBOARD' }, chalk.hex('#00BFFF')('  🏆 Requesting whale leaderboard...'));
            break;

        case 'echo':
            sendCommand('ECHO_CHAMBER', { type: 'ECHO_STATUS' }, chalk.hex('#FF69B4')('  📢 Requesting Echo Chamber status...'));
            break;

        case 'farm':
            sendCommand('DEFI_FARMER', { type: 'FARM_STATUS' }, chalk.hex('#32CD32')('  🌾 Requesting DeFi Farmer status...'));
            break;

        case 'yields':
            sendCommand('DEFI_FARMER', { type: 'FARM_SCAN' }, chalk.hex('#32CD32')('  🔍 Scanning DeFi yields...'));
            break;

        case 'evolve':
            const evolveMsg = { type: 'EVOLVE_NOW' };
            if (arg) evolveMsg.target = arg.endsWith('.js') ? arg : `${arg.toLowerCase()}.js`;
            sendCommand('ARCHITECT', evolveMsg, chalk.magenta(`  🧬 Architect evolution triggered${arg ? ' targeting ' + arg : ''}...`), chalk.red('  ❌ Architect not online.'));
            break;

        case 'evolve-status':
            sendCommand('ARCHITECT', { type: 'EVOLUTION_STATUS' }, chalk.magenta('  📊 Requested evolution metrics from Architect...'), chalk.red('  ❌ Architect not online.'));
            break;

        case 'rollback':
            if (!arg) {
                console.log(chalk.yellow('  Usage: rollback <AGENT_TYPE>  (e.g. rollback HUSTLER)'));
            } else {
                sendCommand('ARCHITECT', { type: 'ROLLBACK', agentType: arg.toUpperCase() }, chalk.yellow(`  🔄 Rollback requested for ${arg.toUpperCase()}...`), chalk.red('  ❌ Architect not online.'));
            }
            break;

        case 'recon':
            sendCommand('GHOST', { type: 'RECON_NOW' }, chalk.gray('  👻 Ghost recon triggered...'));
            break;

        case 'probe':
            if (arg) {
                sendCommand('GHOST', { type: 'PROBE_HOST', host: arg }, chalk.gray(`  👻 Probing ${arg}...`));
            } else {
                console.log(chalk.yellow('  Usage: probe <ip_address>'));
            }
            break;

        case 'compact':
            const { compactContext } = require('./brain');
            console.log(chalk.yellow('  🧠 Manually triggering context compaction...'));
            // This is a test/manual trigger for the Don's own context concept if needed
            break;

        case 'think':
            const { setThinkingLevel } = require('./brain');
            if (setThinkingLevel(arg)) {
                console.log(chalk.magenta(`  🧠 Swarm thinking level set to: ${arg.toUpperCase()}`));
            } else {
                console.log(chalk.yellow('  Usage: think <off|minimal|low|medium|high|xhigh>'));
            }
            break;

        case 'sessions':
            console.log(chalk.cyan.bold('\n  SWARM SESSION REGISTRY (OpenClaw Port):'));
            const list = don.sessions.list();
            list.forEach(s => {
                console.log(`  ${chalk.white.bold(s.type.padEnd(14))} | ID: ${s.id.toString().padEnd(6)} | Status: ${s.status === 'HEALTHY' ? chalk.green(s.status) : chalk.yellow(s.status)} | Crashes: ${s.crashes}`);
            });
            break;

        case 'exit':
        case 'quit':
            console.log(chalk.red.bold('\n  The Don is stepping out. Silence.\n'));
            process.exit(0);
            break;

        default:
            console.log(chalk.gray(`  Unknown command: "${cmd}". Type "help" for commands.`));
    }

    rl.prompt();
});

// Initial prompt after agents start spawning
setTimeout(() => {
    showHelp();
    rl.prompt();
}, 3000);
