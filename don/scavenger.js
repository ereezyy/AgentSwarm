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
const { SyndicateCore } = require('./syndicate_core_main');
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
if (!process.env.SOLANA_PRIVATE_KEY) {
    console.error(chalk.red(`[SCAVENGER #${id}]: ❌ CRITICAL ERROR: SOLANA_PRIVATE_KEY is missing from .env`));
    process.exit(1);
}
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
function loadTracker() {
    try {
        if (fs.existsSync(BOUNTY_TRACKER)) {
            const raw = fs.readFileSync(BOUNTY_TRACKER, 'utf8').trim();
            if (!raw) throw new Error('empty file');
            const data = JSON.parse(raw);
            // Validate structure
            if (!data.found || !data.submitted || !data.paid) throw new Error('malformed tracker');
            return data;
        }
    } catch (e) {
        console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ Bounty tracker corrupted/missing — resetting. (${e.message})`));
    }
    const fresh = { found: [], submitted: [], paid: [] };
    saveTracker(fresh);
    return fresh;
}

function saveTracker(data) {
    try {
        const tmp = BOUNTY_TRACKER + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, BOUNTY_TRACKER);
    } catch (e) {
        console.log(chalk.red(`[SCAVENGER #${id}]: ❌ Failed to save bounty tracker: ${e.message}`));
    }
}

// Ensure tracker exists on boot
loadTracker();

// ── NETWORK FAILOVER HELPER ──
async function withConnectionFailover(operation) {
    try {
        return await operation(core.connection);
    } catch (e) {
        console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ Primary connection failed, attempting fallback...`));
        const { Connection } = require('@solana/web3.js');
        const fallbackConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
        return await operation(fallbackConnection);
    }
}

async function checkBalance() {
    return runWithRetry(async () => {
        return await withConnectionFailover(async (connection) => {
            const lamports = await connection.getBalance(keypair.publicKey);
            const sol = (lamports / 1e9).toFixed(4);
            console.log(chalk.green(`[SCAVENGER #${id}]: 💰 Balance: ${sol} SOL`));
            return parseFloat(sol);
        });
    }, 'Balance Check').catch(e => {
        console.error(chalk.red(`[SCAVENGER #${id}]: Error checking balance: ${e.message}`));
        return 0;
    });
}

async function scrapeBounties() {
    return runWithRetry(async () => {
        console.log(chalk.cyan(`[SCAVENGER #${id}]: 🔍 Triggering Shadow Scraper (Bounty Mode)...`));
        const scraperPath = path.join(__dirname, 'shadow_scraper.js');
        // maxBuffer: 5MB cap so we never OOM on binary output
        const rawOutput = execSync(`node "${scraperPath}" "Solana Web3 Bounty" 10 --bounty`, {
            encoding: 'utf8',
            maxBuffer: 5 * 1024 * 1024,
            timeout: 60000
        });

        // Strip null bytes and non-printable chars that crash JSON.parse
        const output = rawOutput.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

        // Extract JSON array from scraper output
        // Normalize line endings (Windows \r\n → \n) before searching
        const normalized = output.replace(/\r\n/g, '\n');

        // Find the last standalone JSON array in the output
        // Scan backwards from end for a top-level '[' that starts a valid JSON array
        let leads = [];
        let jsonParsed = false;
        let searchFrom = normalized.length;
        while (searchFrom > 0 && !jsonParsed) {
            const idx = normalized.lastIndexOf('[', searchFrom - 1);
            if (idx === -1) break;
            try {
                const candidate = normalized.slice(idx);
                const parsed = JSON.parse(candidate);
                if (Array.isArray(parsed)) {
                    leads = parsed;
                    jsonParsed = true;
                }
            } catch (_) {
                // Not valid JSON starting here, keep scanning
            }
            searchFrom = idx;
        }

        if (!jsonParsed) {
            throw new Error('No valid JSON array found in scraper output');
        }

        console.log(chalk.green(`[SCAVENGER #${id}]: 🎯 ${leads.length} potential bounties discovered.`));

        const tracker = loadTracker();

        for (const lead of leads) {
            if (!lead?.id || tracker.found.includes(lead.id)) continue;

            const budgetStr = lead?.budget?.range || lead?.budget?.amount || 'Unknown Budget';
            console.log(chalk.yellow(`[SCAVENGER #${id}]: 💎 New Bounty: ${lead?.title || 'Untitled'} (${budgetStr})`));
            tracker.found.push(lead.id);

            // Draft Proposal via Jules if it's technical
            const isTechnical = lead.skills?.some(s => ['python', 'node', 'solana', 'javascript', 'ts', 'web3'].includes(s.toLowerCase()));
            if (isTechnical) {
                await draftBountySolution(lead);
            }
        }

        saveTracker(tracker);
    }, 'Bounty Scrape').catch(e => {
        console.error(chalk.red(`[SCAVENGER #${id}]: ❌ Critical Scrape failure: ${e.message}`));
    });
}

async function draftBountySolution(bounty) {
    try {
        const title = bounty?.title || 'Untitled';
        const description = bounty?.description || 'No description provided';
        const budget = bounty?.budget ? JSON.stringify(bounty.budget) : 'Unknown';
        const url = bounty?.url || 'No URL provided';
        const idStr = bounty?.id || 'UnknownID';

        console.log(chalk.magenta(`[SCAVENGER #${id}]: 🧬 Sending bounty "${title}" to Jules for solution drafting...`));

        const prompt = `Draft a technical solution and a submission proposal for this bounty:
Title: ${title}
Desc: ${description}
Budget: ${budget}
URL: ${url}

If the bounty requires a script, write the script. If it requires a guide, write the guide. 
Save the result as a polished submission.`;

        const bridgePath = path.join(__dirname, '../muscle/jules_bridge.py');
        const cmd = `python "${bridgePath}" --create "${prompt}" "syndicate-repo" --title "Bounty: ${idStr}" --auto-pr`;

        exec(cmd, (err, stdout) => {
            if (err) return;
            console.log(chalk.green(`[SCAVENGER #${id}]: ✅ Jules session created for bounty ${idStr}.`));

            if (process.send) {
                process.send({
                    type: 'AGENT_COMMS',
                    from: 'SCAVENGER',
                    msg: `💎 Bounty hunter at work. Sparked Jules evolution for: "${title}". Solution incoming.`,
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

        const currentBalance = await checkBalance();
        if (currentBalance < 0.005) {
            console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ Insufficient SOL for rent reclaim fees (${currentBalance} SOL). Skipping.`));
            return;
        }

        await withConnectionFailover(async (connection) => {
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
        });
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
