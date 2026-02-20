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
            if (don.processes['SIGNAL_BOT'] && don.processes['SIGNAL_BOT'].connected) {
                don.processes['SIGNAL_BOT'].send({ type: 'SIGNAL_STATUS' });
                console.log(chalk.hex('#FFD700')('  📡 Requesting Signal Bot status...'));
            } else {
                console.log(chalk.red('  ❌ Signal Bot not online. Use: spawn SIGNAL_BOT'));
            }
            break;

        case 'digest':
            if (don.processes['SIGNAL_BOT'] && don.processes['SIGNAL_BOT'].connected) {
                don.processes['SIGNAL_BOT'].send({ type: 'SEND_DIGEST' });
                console.log(chalk.hex('#FFD700')('  📊 Sending daily signal digest...'));
            } else {
                console.log(chalk.red('  ❌ Signal Bot not online. Use: spawn SIGNAL_BOT'));
            }
            break;

        case 'broadcast':
            if (arg && don.processes['SIGNAL_BOT'] && don.processes['SIGNAL_BOT'].connected) {
                don.processes['SIGNAL_BOT'].send({ type: 'BROADCAST', text: arg });
                console.log(chalk.hex('#FFD700')(`  📢 Broadcasting to Telegram: "${arg}"`));
            } else if (!arg) {
                console.log(chalk.yellow('  Usage: broadcast <message>'));
            } else {
                console.log(chalk.red('  ❌ Signal Bot not online. Use: spawn SIGNAL_BOT'));
            }
            break;

        case 'quote':
            if (arg && don.processes['SERVICE_FORGE'] && don.processes['SERVICE_FORGE'].connected) {
                don.processes['SERVICE_FORGE'].send({ type: 'GENERATE_QUOTE', request: arg });
                console.log(chalk.hex('#FF69B4')(`  \uD83D\uDCCB Generating quote for: "${arg}"`));
            } else if (!arg) {
                console.log(chalk.yellow('  Usage: quote <client request description>'));
            } else {
                console.log(chalk.red('  \u274c Service Forge not online. Use: spawn SERVICE_FORGE'));
            }
            break;

        case 'portfolio':
            if (don.processes['SERVICE_FORGE'] && don.processes['SERVICE_FORGE'].connected) {
                don.processes['SERVICE_FORGE'].send({ type: 'GENERATE_PORTFOLIO' });
                console.log(chalk.hex('#FF69B4')('  \uD83D\uDCC2 Generating services portfolio...'));
            } else {
                console.log(chalk.red('  \u274c Service Forge not online. Use: spawn SERVICE_FORGE'));
            }
            break;

        case 'services':
            if (don.processes['SERVICE_FORGE'] && don.processes['SERVICE_FORGE'].connected) {
                don.processes['SERVICE_FORGE'].send({ type: 'SERVICE_STATUS' });
                console.log(chalk.hex('#FF69B4')('  \uD83C\uDFED Requesting Service Forge status...'));
            } else {
                console.log(chalk.red('  \u274c Service Forge not online. Use: spawn SERVICE_FORGE'));
            }
            break;

        case 'scan':
            if (don.processes['TREND_HUNTER'] && don.processes['TREND_HUNTER'].connected) {
                don.processes['TREND_HUNTER'].send({ type: 'SCAN_NOW' });
                console.log(chalk.hex('#00FF88')('  \uD83C\uDFAF Trend Hunter scan triggered...'));
            } else {
                console.log(chalk.red('  \u274c Trend Hunter not online. Use: spawn TREND_HUNTER'));
            }
            break;

        case 'callers':
        case 'trends':
            if (don.processes['TREND_HUNTER'] && don.processes['TREND_HUNTER'].connected) {
                don.processes['TREND_HUNTER'].send({ type: 'TREND_STATUS' });
                console.log(chalk.hex('#00FF88')('  \uD83D\uDCCA Requesting Trend Hunter status...'));
            } else {
                console.log(chalk.red('  \u274c Trend Hunter not online. Use: spawn TREND_HUNTER'));
            }
            break;

        case 'addcaller':
            if (arg && don.processes['TREND_HUNTER'] && don.processes['TREND_HUNTER'].connected) {
                const handle = arg.replace('@', '');
                don.processes['TREND_HUNTER'].send({ type: 'ADD_CALLER', handle, tier: 'B' });
                console.log(chalk.hex('#00FF88')(`  \u2795 Adding @${handle} to caller watchlist...`));
            } else if (!arg) {
                console.log(chalk.yellow('  Usage: addcaller @handle'));
            } else {
                console.log(chalk.red('  \u274c Trend Hunter not online. Use: spawn TREND_HUNTER'));
            }
            break;

        case 'treasury':
            if (don.processes['OMEGA'] && don.processes['OMEGA'].connected) {
                don.processes['OMEGA'].send({ type: 'TREASURY_STATUS' });
                console.log(chalk.hex('#FFD700')('  \u26A1 Requesting treasury status...'));
            } else {
                console.log(chalk.red('  \u274c Protocol Omega not online. Use: spawn OMEGA'));
            }
            break;

        case 'treport':
            if (don.processes['OMEGA'] && don.processes['OMEGA'].connected) {
                don.processes['OMEGA'].send({ type: 'TREASURY_REPORT' });
                console.log(chalk.hex('#FFD700')('  \uD83D\uDCCA Generating treasury report...'));
            } else {
                console.log(chalk.red('  \u274c Protocol Omega not online. Use: spawn OMEGA'));
            }
            break;

        case 'shield':
        case 'zerorug':
            if (don.processes['ZERO_RUG'] && don.processes['ZERO_RUG'].connected) {
                don.processes['ZERO_RUG'].send({ type: 'ZERO_RUG_STATUS' });
                console.log(chalk.red('  \uD83D\uDEE1\uFE0F Requesting Zero-Rug defense status...'));
            } else {
                console.log(chalk.red('  \u274c Zero-Rug not online. Use: spawn ZERO_RUG'));
            }
            break;

        case 'mirror':
            if (don.processes['MIRROR'] && don.processes['MIRROR'].connected) {
                don.processes['MIRROR'].send({ type: 'MIRROR_STATUS' });
                console.log(chalk.hex('#00BFFF')('  \uD83E\uDE9E Requesting Mirror Protocol status...'));
            } else {
                console.log(chalk.red('  \u274c Mirror Protocol not online. Use: spawn MIRROR'));
            }
            break;

        case 'leaderboard':
            if (don.processes['MIRROR'] && don.processes['MIRROR'].connected) {
                don.processes['MIRROR'].send({ type: 'LEADERBOARD' });
                console.log(chalk.hex('#00BFFF')('  \uD83C\uDFC6 Requesting whale leaderboard...'));
            } else {
                console.log(chalk.red('  \u274c Mirror Protocol not online. Use: spawn MIRROR'));
            }
            break;

        case 'echo':
            if (don.processes['ECHO_CHAMBER'] && don.processes['ECHO_CHAMBER'].connected) {
                don.processes['ECHO_CHAMBER'].send({ type: 'ECHO_STATUS' });
                console.log(chalk.hex('#FF69B4')('  \uD83D\uDCE2 Requesting Echo Chamber status...'));
            } else {
                console.log(chalk.red('  \u274c Echo Chamber not online. Use: spawn ECHO_CHAMBER'));
            }
            break;

        case 'farm':
            if (don.processes['DEFI_FARMER'] && don.processes['DEFI_FARMER'].connected) {
                don.processes['DEFI_FARMER'].send({ type: 'FARM_STATUS' });
                console.log(chalk.hex('#32CD32')('  \uD83C\uDF3E Requesting DeFi Farmer status...'));
            } else {
                console.log(chalk.red('  \u274c DeFi Farmer not online. Use: spawn DEFI_FARMER'));
            }
            break;

        case 'yields':
            if (don.processes['DEFI_FARMER'] && don.processes['DEFI_FARMER'].connected) {
                don.processes['DEFI_FARMER'].send({ type: 'FARM_SCAN' });
                console.log(chalk.hex('#32CD32')('  \uD83D\uDD0D Scanning DeFi yields...'));
            } else {
                console.log(chalk.red('  \u274c DeFi Farmer not online. Use: spawn DEFI_FARMER'));
            }
            break;

        case 'evolve':
            if (don.processes['ARCHITECT'] && don.processes['ARCHITECT'].connected) {
                const evolveMsg = { type: 'EVOLVE_NOW' };
                if (arg) evolveMsg.target = arg.endsWith('.js') ? arg : `${arg.toLowerCase()}.js`;
                don.processes['ARCHITECT'].send(evolveMsg);
                console.log(chalk.magenta(`  🧬 Architect evolution triggered${arg ? ' targeting ' + arg : ''}...`));
            } else {
                console.log(chalk.red('  ❌ Architect not online.'));
            }
            break;

        case 'evolve-status':
            if (don.processes['ARCHITECT'] && don.processes['ARCHITECT'].connected) {
                don.processes['ARCHITECT'].send({ type: 'EVOLUTION_STATUS' });
                console.log(chalk.magenta('  📊 Requested evolution metrics from Architect...'));
            } else {
                console.log(chalk.red('  ❌ Architect not online.'));
            }
            break;

        case 'rollback':
            if (!arg) {
                console.log(chalk.yellow('  Usage: rollback <AGENT_TYPE>  (e.g. rollback HUSTLER)'));
            } else if (don.processes['ARCHITECT'] && don.processes['ARCHITECT'].connected) {
                don.processes['ARCHITECT'].send({ type: 'ROLLBACK', agentType: arg.toUpperCase() });
                console.log(chalk.yellow(`  🔄 Rollback requested for ${arg.toUpperCase()}...`));
            } else {
                console.log(chalk.red('  ❌ Architect not online.'));
            }
            break;

        case 'recon':
            if (don.processes['GHOST'] && don.processes['GHOST'].connected) {
                don.processes['GHOST'].send({ type: 'RECON_NOW' });
                console.log(chalk.gray('  👻 Ghost recon triggered...'));
            } else {
                console.log(chalk.red('  ❌ Ghost not online.'));
            }
            break;

        case 'probe':
            if (arg && don.processes['GHOST'] && don.processes['GHOST'].connected) {
                don.processes['GHOST'].send({ type: 'PROBE_HOST', host: arg });
                console.log(chalk.gray(`  👻 Probing ${arg}...`));
            } else if (!arg) {
                console.log(chalk.yellow('  Usage: probe <ip_address>'));
            } else {
                console.log(chalk.red('  ❌ Ghost not online.'));
            }
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
