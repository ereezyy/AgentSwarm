// don/scavenger.js - THE SCAVENGER (FULLY AUTONOMOUS REVENUE GRIND)
// This agent EXECUTES: it opens browsers, claims faucets, and deposits SOL.
const { Keypair } = require('@solana/web3.js');
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

const id = process.argv[2] || 'Scavenger';
const { ask } = require('./brain');

// Derive Wallet from .env
const secretKey = Buffer.from(process.env.SOLANA_PRIVATE_KEY, 'hex');
const keypair = Keypair.fromSecretKey(secretKey);
const WALLET = keypair.publicKey.toString();

const REPORT_PATH = path.resolve(__dirname, '../missions/scavenge_leads.md');

console.log(chalk.green.bold(`[SCAVENGER #${id}]: 🦾 AUTONOMOUS MODE. Wallet: ${WALLET}`));

const SYSTEM_PROMPT = `You are 'The Scavenger', a ruthless automated agent for The Syndicate.
Your ONLY goal: Find ways to get FREE Solana (SOL) RIGHT NOW. No speculation, no "maybe."
Focus on:
1. Active Solana devnet/testnet faucets that give real tokens
2. Airdrop claim pages that are live TODAY
3. Crypto task platforms (Galxe, Layer3, Zealy) with active SOL rewards
4. Bounty programs paying in SOL
5. Browser extension rewards or cashback in crypto

For each opportunity, provide:
- EXACT URL to claim
- Steps to complete
- Estimated reward amount
- Whether it can be automated

Be brutally honest about which ones actually work vs scams.`;

// Known faucet endpoints to try automatically
const FAUCETS = [
    { name: 'SolFaucet', url: 'https://solfaucet.com/api/faucet', method: 'POST', body: { wallet: WALLET } },
    { name: 'DevFaucet', url: 'https://api.devnet.solana.com', method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'requestAirdrop', params: [WALLET, 1000000000] } },
];

// Automatically attempt to claim from known faucets
async function claimFaucets() {
    for (const faucet of FAUCETS) {
        try {
            console.log(chalk.green(`[SCAVENGER #${id}]: 🔄 Attempting ${faucet.name}...`));
            const response = await axios({
                method: faucet.method,
                url: faucet.url,
                data: faucet.body,
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data) {
                const result = JSON.stringify(response.data).substring(0, 200);
                console.log(chalk.green.bold(`[SCAVENGER #${id}]: ✅ ${faucet.name} RESPONSE: ${result}`));

                if (process.send) {
                    process.send({ type: 'SIREN_SPEAK', text: `Scavenger got a response from ${faucet.name}. Checking if funds arrived.` });
                }
            }

            // Launch Shadow fleet for browser-based claiming
            if (faucet.url.includes('solfaucet')) {
                if (process.send) {
                    process.send({
                        type: 'EXECUTE_SHADOW',
                        url: faucet.url,
                        task: `Claim SOL from ${faucet.name}`
                    });
                }
            }
        } catch (e) {
            console.log(chalk.gray(`[SCAVENGER #${id}]: ${faucet.name} failed: ${e.message.substring(0, 60)}`));
        }
    }
}

// Check wallet balance
async function checkBalance() {
    try {
        const response = await axios.post(process.env.SOLANA_RPC_URL, {
            jsonrpc: '2.0', id: 1, method: 'getBalance', params: [WALLET]
        });
        const balance = (response.data.result.value / 1e9).toFixed(4);
        console.log(chalk.green(`[SCAVENGER #${id}]: 💰 Current Balance: ${balance} SOL`));

        if (process.send) {
            process.send({ type: 'INTEL_DATA', data: `Wallet Balance: ${balance} SOL`, source: 'SCAVENGER_BALANCE' });
        }

        return parseFloat(balance);
    } catch (e) {
        return 0;
    }
}

// AI-powered lead discovery
async function discoverLeads() {
    try {
        console.log(chalk.green(`[SCAVENGER #${id}]: 🔍 AI scanning for new revenue opportunities...`));

        const content = await ask(
            `My Solana wallet is ${WALLET}. Find me 5 ways to get free SOL or crypto RIGHT NOW. Today is ${new Date().toLocaleDateString()}. Only give me things that are actually working today.`,
            SYSTEM_PROMPT,
            { agentName: `SCAVENGER #${id}` }
        );

        console.log(chalk.green(`[SCAVENGER #${id}]: 📋 REVENUE LEADS ACQUIRED.`));

        // Save leads
        fs.appendFileSync(REPORT_PATH, `\n\n--- SCAVENGE REPORT [${new Date().toLocaleString()}] ---\n${content}`);

        if (process.send) {
            process.send({ type: 'INTEL_DATA', data: content.substring(0, 200), source: 'SCAVENGER_LEADS' });
            process.send({ type: 'SIREN_SPEAK', text: `Scavenger reporting. New revenue leads identified. Executing on the most promising ones now.` });
            process.send({ type: 'AGENT_COMMS', from: `SCAVENGER #${id}`, msg: 'Revenue leads acquired. Report filed.', timestamp: new Date().toISOString() });
        }

    } catch (e) {
        console.error(chalk.red(`[SCAVENGER #${id}]: Discovery failure: ${e.message}`));
    }
}

// ── RENT RECLAMATION (The "Dust" Sweep) ──
async function sweepDust() {
    try {
        console.log(chalk.yellow(`[SCAVENGER #${id}]: 🧹 Scanning for reclaimable rent (empty accounts)...`));
        const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
        const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
        const { createCloseAccountInstruction } = require('@solana/spl-token'); // Check if this import works, might need full path logic or raw instruction

        const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        const walletKey = new PublicKey(WALLET);

        const accounts = await connection.getParsedTokenAccountsByOwner(walletKey, { programId: TOKEN_PROGRAM_ID });
        const emptyAccounts = accounts.value.filter(acc => acc.account.data.parsed.info.tokenAmount.uiAmount === 0);

        if (emptyAccounts.length === 0) {
            console.log(chalk.gray(`[SCAVENGER #${id}]: No empty accounts found to reclaim.`));
            return 0;
        }

        console.log(chalk.green(`[SCAVENGER #${id}]: Found ${emptyAccounts.length} empty accounts. Reclaiming rent...`));
        let reclaimed = 0;

        // Close in batches of 5 to avoid tx size limits
        for (let i = 0; i < emptyAccounts.length; i += 5) {
            const batch = emptyAccounts.slice(i, i + 5);
            const tx = new Transaction();

            for (const acc of batch) {
                tx.add(createCloseAccountInstruction(acc.pubkey, walletKey, walletKey));
            }

            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.feePayer = walletKey;

            // Sign and send (requires keypair)
            tx.sign(keypair);
            const sig = await connection.sendRawTransaction(tx.serialize());
            await connection.confirmTransaction(sig);

            reclaimed += (batch.length * 0.002); // Approx rent per account
            console.log(chalk.green(`[SCAVENGER #${id}]: ♻️ Reclaimed rent from ${batch.length} accounts. Sig: ${sig}`));
        }

        if (process.send) {
            process.send({ type: 'KICK_UP', amount: reclaimed, source: 'RENT_RECLAIM' });
            process.send({ type: 'AGENT_COMMS', from: 'SCAVENGER', msg: `Just swept the floor. Reclaimed ${reclaimed.toFixed(4)} SOL from empty accounts.` });
        }
        return reclaimed;

    } catch (e) {
        console.log(chalk.red(`[SCAVENGER #${id}]: Rent reclaim failed: ${e.message}`));
        return 0;
    }
}

// Main Autonomous Loop
async function runScavengeLoop() {
    // 1. Check current balance
    const balance = await checkBalance();

    // 2. Sweep Dust (Free Money)
    await sweepDust();

    // 3. If broke, aggressively try faucets
    if (balance < 0.05) {
        console.log(chalk.yellow(`[SCAVENGER #${id}]: 🚨 BROKE MODE. Balance < 0.05 SOL. Activating all revenue streams...`));
        await claimFaucets();
    }

    // 4. Discover new leads via AI
    await discoverLeads();

    // Run every 10 minutes
    setTimeout(runScavengeLoop, 600000);
}

runScavengeLoop();
