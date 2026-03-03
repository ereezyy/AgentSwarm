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
const { SyndicateCore } = require('./syndicate_core');
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
let keypair;
let WALLET = 'SIMULATION_MODE';

try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        let secretKey;
        try {
            secretKey = Buffer.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY));
        } catch (e) {
            secretKey = Buffer.from(process.env.SOLANA_PRIVATE_KEY, 'hex');
        }
        keypair = Keypair.fromSecretKey(secretKey);
        WALLET = keypair.publicKey.toString();
    } else {
         console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ SOLANA_PRIVATE_KEY not found. Running in SIMULATION MODE.`));
    }
} catch (e) {
    console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ Failed to parse SOLANA_PRIVATE_KEY: ${e.message}. Running in SIMULATION MODE.`));
}

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

async function checkBalance() {
    if (!keypair) {
        console.log(chalk.gray(`[SCAVENGER #${id}]: SIMULATION: Would check balance.`));
        return 0;
    }
    return runWithRetry(async () => {
        let connection = core.connection;
        let lamports;
        try {
            lamports = await connection.getBalance(keypair.publicKey);
        } catch (e) {
            console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ Primary RPC failed for getBalance: ${e.message}. Falling back...`));
            if (process.env.SOLANA_RPC_URL_FALLBACK) {
                const { Connection } = require('@solana/web3.js');
                connection = new Connection(process.env.SOLANA_RPC_URL_FALLBACK, 'confirmed');
                lamports = await connection.getBalance(keypair.publicKey);
            } else {
                throw e;
            }
        }

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
            if (tracker.found.includes(lead.id)) continue;

            console.log(chalk.yellow(`[SCAVENGER #${id}]: 💎 New Bounty: ${lead.title} (${lead.budget.range || lead.budget.amount})`));
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
    if (!keypair) {
         console.log(chalk.gray(`[SCAVENGER #${id}]: SIMULATION: Would sweep dust.`));
         return;
    }
    try {
        console.log(chalk.yellow(`[SCAVENGER #${id}]: 🧹 Reclaiming rent via VAULT...`));
        const { PublicKey, Transaction } = require('@solana/web3.js');
        const { TOKEN_PROGRAM_ID, createCloseAccountInstruction } = require('@solana/spl-token');

        let connection = core.connection;
        const walletKey = keypair.publicKey;

        let accounts;
        try {
            accounts = await connection.getParsedTokenAccountsByOwner(walletKey, { programId: TOKEN_PROGRAM_ID });
        } catch (e) {
             console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ Primary RPC failed for getParsedTokenAccountsByOwner: ${e.message}. Falling back...`));
             if (process.env.SOLANA_RPC_URL_FALLBACK) {
                 const { Connection } = require('@solana/web3.js');
                 connection = new Connection(process.env.SOLANA_RPC_URL_FALLBACK, 'confirmed');
                 accounts = await connection.getParsedTokenAccountsByOwner(walletKey, { programId: TOKEN_PROGRAM_ID });
             } else {
                 throw e;
             }
        }

        const emptyAccounts = accounts.value.filter(acc => acc.account.data.parsed.info.tokenAmount.uiAmount === 0);

        if (emptyAccounts.length === 0) return;

        const tx = new Transaction();
        for (const acc of emptyAccounts.slice(0, 5)) {
            tx.add(createCloseAccountInstruction(acc.pubkey, walletKey, walletKey));
        }

        let blockhash;
        try {
            const blockhashRes = await connection.getLatestBlockhash();
            blockhash = blockhashRes.blockhash;
        } catch(e) {
            console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ Primary RPC failed for getLatestBlockhash: ${e.message}. Falling back...`));
            if (process.env.SOLANA_RPC_URL_FALLBACK) {
                const { Connection } = require('@solana/web3.js');
                connection = new Connection(process.env.SOLANA_RPC_URL_FALLBACK, 'confirmed');
                const blockhashRes = await connection.getLatestBlockhash();
                blockhash = blockhashRes.blockhash;
            } else {
                throw e;
            }
        }
        tx.recentBlockhash = blockhash;
        tx.feePayer = walletKey;

        // Request signature from VAULT via SyndicateCore
        const serializedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');

        if (process.env.LIVE_MODE === 'true') {
            core.log('Requesting VAULT signature for rent reclamation...', 'POWER');
            const signedTxBase64 = await core.requestSign(serializedTx);
            const signedTx = Transaction.from(Buffer.from(signedTxBase64, 'base64'));
            let sig;
            try {
                sig = await connection.sendRawTransaction(signedTx.serialize());
            } catch(e) {
                console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ Primary RPC failed for sendRawTransaction: ${e.message}. Falling back...`));
                if (process.env.SOLANA_RPC_URL_FALLBACK) {
                    const { Connection } = require('@solana/web3.js');
                    connection = new Connection(process.env.SOLANA_RPC_URL_FALLBACK, 'confirmed');
                    sig = await connection.sendRawTransaction(signedTx.serialize());
                } else {
                    throw e;
                }
            }
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
