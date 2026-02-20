// don/engage.js - THE SOCIAL SWARM (MOLTBOOK IDENTITY)
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const id = process.argv[2];
const type = process.argv[3];
const IDENTITIES_DIR = path.join(__dirname, '../identities');

if (!fs.existsSync(IDENTITIES_DIR)) {
    fs.mkdirSync(IDENTITIES_DIR);
}

function createMoltIdentity() {
    const identityPath = path.join(IDENTITIES_DIR, `${type}_${id}.molt`);

    const identity = {
        alias: `${type}_OPERATIVE_${id}`,
        rank: "Soldier",
        syndicate: "The Syndicate",
        born: new Date().toISOString(),
        molt_key: Math.random().toString(36).substring(7),
        verified: false
    };

    fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2));
    console.log(chalk.green(`[${type} #${id}]: Identity registered at Moltbook endpoint.`));

    // Engagement: "Check-in" to the local skill ledger
    const ledgerDir = path.join(__dirname, '../skills');
    if (!fs.existsSync(ledgerDir)) fs.mkdirSync(ledgerDir, { recursive: true });
    const ledgerPath = path.join(ledgerDir, 'swarm_ledger.json');
    let ledger = [];
    if (fs.existsSync(ledgerPath)) {
        try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch (e) { ledger = []; }
    }

    ledger.push({ timestamp: new Date().toISOString(), agent: identity.alias, status: "ENGAGED" });
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

createMoltIdentity();
