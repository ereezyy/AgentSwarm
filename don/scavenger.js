// don/scavenger.js - THE SCAVENGER (FULLY AUTONOMOUS REVENUE GRIND)
// This agent EXECUTES: it opens browsers, claims faucets, and hunts BOUNTIES.
const { Keypair } = require('@solana/web3.js');
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
require('dotenv').config();

const id = process.argv[2] || 'Scavenger';
const { ask } = require('./brain');
const { SyndicateCore } = require('./SyndicateCore');
const core = new SyndicateCore();

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

async function runWithRetry(fn, label) {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            return await fn();
        } catch (e) {
            console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ ${label} attempt ${i + 1} failed: ${e.message}. Retrying...`));
            if (i < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
    }
    throw new Error(`${label} failed after ${MAX_RETRIES} attempts.`);
}

// Derive Wallet from .env
const secretKey = Buffer.from(process.env.SOLANA_PRIVATE_KEY, 'hex');
const keypair = Keypair.fromSecretKey(secretKey);
const WALLET = keypair.publicKey.toString();

const REPORT_PATH = path.resolve(__dirname, '../missions/scavenge_leads.md');
const BOUNTY_TRACKER = path.resolve(__dirname, '../missions/bounty_tracker.json');

console.log(chalk.green.bold(`[SCAVENGER #${id}]: 🦾 BOUNTY HUNTER MODE. Wallet: ${WALLET}`));

const SYSTEM_PROMPT = `You are 'The Scavenger', a ruthless automated agent for The Syndicate.
Your ONLY goal: Find ways to get FREE Solana (SOL) or high-value bounties RIGHT NOW. 
Focus on:
1. Technical bounties on Bountycaster, Gitcoin, or Superteam Earn.
2. Active Solana devnet/testnet faucets (if balance is low).
3. Airdrop claim pages that are live TODAY.

For each bounty, identify if the Syndicate (or Jules) can complete it automatically.
Provide EXACT details for Jules to generate a solution.`;

// Initialize Tracker
if (!fs.existsSync(BOUNTY_TRACKER)) {
    fs.writeFileSync(BOUNTY_TRACKER, JSON.stringify({ found: [], submitted: [], paid: [] }, null, 2));
}

async function checkBalance() {
    return runWithRetry(async () => {
        const connection = core.connection;
        const lamports = await connection.getBalance(keypair.publicKey);
        const sol = (lamports / 1e9).toFixed(4);
        console.log(chalk.green(`[SCAVENGER #${id}]: 💰 Balance: ${sol} SOL`));
        return parseFloat(sol);
    }, 'Balance Check').catch(e => {
        console.error(chalk.red(`[SCAVENGER #${id}]: Error checking balance: ${e.message}`));
        return 0;
    });
}

async function scrapeBounties() {
    return runWithRetry(async () => {
        console.log(chalk.cyan(`[SCAVENGER #${id}]: 🔍 Triggering Shadow Scraper (Bounty Mode)...`));
        const scraperPath = path.join(__dirname, 'shadow_scraper.js');
        const output = execSync(`node "${scraperPath}" "Solana Web3 Bounty" 10 --bounty`, { encoding: 'utf8' });

        // Extract JSON array using regex to bypass any non-JSON logs/warnings
        const jsonMatch = output.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("No JSON array found in scraper output");

        let leads = [];
        try {
            leads = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            throw new Error(`JSON parsing failed: ${parseError.message}`);
        }

        console.log(chalk.green(`[SCAVENGER #${id}]: 🎯 ${leads.length} potential bounties discovered.`));

        const tracker = JSON.parse(fs.readFileSync(BOUNTY_TRACKER, 'utf8'));

        for (const lead of leads) {
            if (tracker.found.includes(lead.id)) continue;

            console.log(chalk.yellow(`[SCAVENGER #${id}]: 💎 New Bounty: ${lead.title} (${lead.budget.range || lead.budget.amount})`));
            tracker.found.push(lead.id);

            // Draft Proposal via Jules if it's technical
            const isTechnical = lead.skills?.some(s => ['python', 'node', 'solana', 'javascript', 'ts', 'web3'].includes(s.toLowerCase()));
            if (isTechnical) {
                await draftBountySolution(lead);
            }
        }

        fs.writeFileSync(BOUNTY_TRACKER, JSON.stringify(tracker, null, 2));
    }, 'Bounty Scrape').catch(e => {
        console.error(chalk.red(`[SCAVENGER #${id}]: ❌ Critical Scrape failure: ${e.message}`));
    });
}

async function draftBountySolution(bounty) {
    try {
        console.log(chalk.magenta(`[SCAVENGER #${id}]: 🧬 Sending bounty "${bounty.title}" to Jules for solution drafting...`));

        const prompt = `Draft a technical solution and a submission proposal for this bounty:
Title: ${bounty.title}
Desc: ${bounty.description}
Budget: ${JSON.stringify(bounty.budget)}
URL: ${bounty.url}

If the bounty requires a script, write the script. If it requires a guide, write the guide. 
Save the result as a polished submission.`;

        const bridgePath = path.join(__dirname, '../muscle/jules_bridge.py');
        const cmd = `python "${bridgePath}" --create "${prompt}" "syndicate-repo" --title "Bounty: ${bounty.id}" --auto-pr`;

        exec(cmd, (err, stdout) => {
            if (err) return;
            console.log(chalk.green(`[SCAVENGER #${id}]: ✅ Jules session created for bounty ${bounty.id}.`));

            if (process.send) {
                process.send({
                    type: 'AGENT_COMMS',
                    from: 'SCAVENGER',
                    msg: `💎 Bounty hunter at work. Sparked Jules evolution for: "${bounty.title}". Solution incoming.`,
                    timestamp: new Date().toISOString()
                });
            }
        });
    } catch (e) {
        console.error(chalk.red(`[SCAVENGER #${id}]: Jules bridge failure: ${e.message}`));
    }
}

// ── RENT RECLAMATION (Standard Sweep via VAULT) ──
async function sweepDust() {
    try {
        console.log(chalk.yellow(`[SCAVENGER #${id}]: 🧹 Reclaiming rent via VAULT...`));
        const { PublicKey, Transaction } = require('@solana/web3.js');
        const { TOKEN_PROGRAM_ID, createCloseAccountInstruction } = require('@solana/spl-token');

        const connection = core.connection;
        const walletKey = keypair.publicKey;

        const accounts = await connection.getParsedTokenAccountsByOwner(walletKey, { programId: TOKEN_PROGRAM_ID });
        const emptyAccounts = accounts.value.filter(acc => acc.account.data.parsed.info.tokenAmount.uiAmount === 0);

        if (emptyAccounts.length === 0) return;

        const tx = new Transaction();
        for (const acc of emptyAccounts.slice(0, 5)) {
            tx.add(createCloseAccountInstruction(acc.pubkey, walletKey, walletKey));
        }

        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = walletKey;

        // Request signature from VAULT via SyndicateCore
        const serializedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');

        if (process.env.LIVE_MODE === 'true') {
            core.log('Requesting VAULT signature for rent reclamation...', 'POWER');
            const signedTxBase64 = await core.requestSign(serializedTx);
            const signedTx = Transaction.from(Buffer.from(signedTxBase64, 'base64'));
            const sig = await connection.sendRawTransaction(signedTx.serialize());
            core.log(`Reclaimed rent. Sig: ${sig}`, 'MONEY');
        } else {
            console.log(chalk.gray(`[SCAVENGER]: SIMULATION: Would reclaimed rent from ${emptyAccounts.length} accounts via VAULT.`));
        }
    } catch (e) {
        console.error(chalk.red(`[SCAVENGER]: Rent reclaim failed: ${e.message}`));
    }
}

async function runScavengeLoop() {
    const balance = await checkBalance();
    await sweepDust();

    // Aggressive bounty hunt
    await scrapeBounties();

    // Run every 15 minutes
    setTimeout(runScavengeLoop, 900000);
}

runScavengeLoop();
