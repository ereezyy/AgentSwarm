// don/siren.js - The Intelligence (Multi-Brain Fallback)
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Siren';
const { ask } = require('./brain');
const INTEL_PATH = path.join(__dirname, '../missions/scavenge_report.md');

if (!fs.existsSync(path.join(__dirname, '../missions'))) {
    fs.mkdirSync(path.join(__dirname, '../missions'));
}

console.log(chalk.magenta(`[SIREN #${id}]: Strategic Engine Engaged.`));

async function runIntelligenceLoop() {
    try {
        const topic = "Active Solana Faucets and Bounties for bootstrapping from zero.";
        console.log(chalk.magenta(`[SIREN #${id}]: MISSION: FUNDING. Researching: "${topic}"...`));

        const content = await ask(
            `Research and report on: ${topic}`,
            "You are 'The Siren', lead strategist for The Syndicate. Provide a bulleted report of current SOL funding leads. No fluff.",
            { agentName: `SIREN #${id}` }
        );

        // Log to file for User
        const report = `\n--- INTEL REPORT [${new Date().toLocaleString()}] ---\n${content}\n`;
        fs.appendFileSync(INTEL_PATH, report);

        console.log(chalk.magenta(`[SIREN #${id}]: INTEL REPORT SAVED TO missions/scavenge_report.md`));

        if (process.send) {
            process.send({ type: 'INTEL_DATA', data: content, source: 'SIREN_BRAIN' });
            process.send({ type: 'SIREN_SPEAK', text: `Intelligence acquired: ${topic}. Brief follows: ${content.substring(0, 150)}...` });
            process.send({ type: 'AGENT_COMMS', from: `SIREN #${id}`, msg: `Intel report filed: ${topic}`, timestamp: new Date().toISOString() });
        }

        setTimeout(runIntelligenceLoop, 300000); // Research every 5 mins

    } catch (error) {
        console.error(chalk.red(`[SIREN #${id}]: Intelligence failed: ${error.message}`));
        if (process.send) {
            process.send({ type: 'AGENT_COMMS', from: `SIREN #${id}`, msg: `Brain offline: ${error.message}`, timestamp: new Date().toISOString() });
        }
        setTimeout(runIntelligenceLoop, 120000); // Retry in 2 min on failure
    }
}

runIntelligenceLoop();
