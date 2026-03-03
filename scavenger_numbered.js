1 // don/scavenger.js - THE SCAVENGER (FULLY AUTONOMOUS REVENUE GRIND)
2 // This agent EXECUTES: it opens browsers, claims faucets, and hunts BOUNTIES.
3 const { Keypair } = require('@solana/web3.js');
4 const axios = require('axios');
5 const chalk = require('chalk');
6 const fs = require('fs');
7 const path = require('path');
8 const { exec, execSync } = require('child_process');
9 require('dotenv').config();
10
11 const id = process.argv[2] || 'Scavenger';
12 const { ask } = require('./brain');
13 const { SyndicateCore } = require('./SyndicateCore');
14 const core = new SyndicateCore();
15
16 const MAX_RETRIES = 3;
17 const RETRY_DELAY = 5000;
18
19 async function runWithRetry(fn, label) {
20     for (let i = 0; i < MAX_RETRIES; i++) {
21         try {
22             return await fn();
23         } catch (e) {
24             console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ ${label} attempt ${i + 1} failed: ${e.message}. Retrying...`));
25             if (i < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, RETRY_DELAY));
26         }
27     }
28     throw new Error(`${label} failed after ${MAX_RETRIES} attempts.`);
29 }
30
31 // Derive Wallet from .env
32 const secretKey = Buffer.from(process.env.SOLANA_PRIVATE_KEY, 'hex');
33 const keypair = Keypair.fromSecretKey(secretKey);
34 const WALLET = keypair.publicKey.toString();
35
36 const REPORT_PATH = path.resolve(__dirname, '../missions/scavenge_leads.md');
37 const BOUNTY_TRACKER = path.resolve(__dirname, '../missions/bounty_tracker.json');
38
39 console.log(chalk.green.bold(`[SCAVENGER #${id}]: 🦾 BOUNTY HUNTER MODE. Wallet: ${WALLET}`));
40
41 const SYSTEM_PROMPT = `You are 'The Scavenger', a ruthless automated agent for The Syndicate.
42 Your ONLY goal: Find ways to get FREE Solana (SOL) or high-value bounties RIGHT NOW.
43 Focus on:
44 1. Technical bounties on Bountycaster, Gitcoin, or Superteam Earn.
45 2. Active Solana devnet/testnet faucets (if balance is low).
46 3. Airdrop claim pages that are live TODAY.
47
48 For each bounty, identify if the Syndicate (or Jules) can complete it automatically.
49 Provide EXACT details for Jules to generate a solution.`;
50
51 // Initialize Tracker
52 function loadTracker() {
53     try {
54         if (fs.existsSync(BOUNTY_TRACKER)) {
55             const raw = fs.readFileSync(BOUNTY_TRACKER, 'utf8').trim();
56             if (!raw) throw new Error('empty file');
57             const data = JSON.parse(raw);
58             // Validate structure
59             if (!data.found || !data.submitted || !data.paid) throw new Error('malformed tracker');
60             return data;
61         }
62     } catch (e) {
63         console.log(chalk.yellow(`[SCAVENGER #${id}]: ⚠️ Bounty tracker corrupted/missing — resetting. (${e.message})`));
64     }
65     const fresh = { found: [], submitted: [], paid: [] };
66     saveTracker(fresh);
67     return fresh;
68 }
69
70 function saveTracker(data) {
71     try {
72         const tmp = BOUNTY_TRACKER + '.tmp';
73         fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
74         fs.renameSync(tmp, BOUNTY_TRACKER);
75     } catch (e) {
76         console.log(chalk.red(`[SCAVENGER #${id}]: ❌ Failed to save bounty tracker: ${e.message}`));
77     }
78 }
79
80 // Ensure tracker exists on boot
81 loadTracker();
82
83 async function checkBalance() {
84     return runWithRetry(async () => {
85         const connection = core.connection;
86         const lamports = await connection.getBalance(keypair.publicKey);
87         const sol = (lamports / 1e9).toFixed(4);
88         console.log(chalk.green(`[SCAVENGER #${id}]: 💰 Balance: ${sol} SOL`));
89         return parseFloat(sol);
90     }, 'Balance Check').catch(e => {
91         console.error(chalk.red(`[SCAVENGER #${id}]: Error checking balance: ${e.message}`));
92         return 0;
93     });
94 }
95
96 async function scrapeBounties() {
97     return runWithRetry(async () => {
98         console.log(chalk.cyan(`[SCAVENGER #${id}]: 🔍 Triggering Shadow Scraper (Bounty Mode)...`));
99         const scraperPath = path.join(__dirname, 'shadow_scraper.js');
100         // maxBuffer: 5MB cap so we never OOM on binary output
101         const rawOutput = execSync(`node "${scraperPath}" "Solana Web3 Bounty" 10 --bounty`, {
102             encoding: 'utf8',
103             maxBuffer: 5 * 1024 * 1024,
104             timeout: 60000
105         });
106
107         // Strip null bytes and non-printable chars that crash JSON.parse
108         const output = rawOutput.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
109
110         // Extract JSON array from scraper output
111         // Normalize line endings (Windows \r\n → \n) before searching
112         const normalized = output.replace(/\r\n/g, '\n');
113
114         // Find the last standalone JSON array in the output
115         // Scan backwards from end for a top-level '[' that starts a valid JSON array
116         let leads = [];
117         let jsonParsed = false;
118         let searchFrom = normalized.length;
119         while (searchFrom > 0 && !jsonParsed) {
120             const idx = normalized.lastIndexOf('[', searchFrom - 1);
121             if (idx === -1) break;
122             try {
123                 const candidate = normalized.slice(idx);
124                 const parsed = JSON.parse(candidate);
125                 if (Array.isArray(parsed)) {
126                     leads = parsed;
127                     jsonParsed = true;
128                 }
129             } catch (_) {
130                 // Not valid JSON starting here, keep scanning
131             }
132             searchFrom = idx;
133         }
134
135         if (!jsonParsed) {
136             throw new Error('No valid JSON array found in scraper output');
137         }
138
139         console.log(chalk.green(`[SCAVENGER #${id}]: 🎯 ${leads.length} potential bounties discovered.`));
140
141         const tracker = loadTracker();
142
143         for (const lead of leads) {
144             if (tracker.found.includes(lead.id)) continue;
145
146             console.log(chalk.yellow(`[SCAVENGER #${id}]: 💎 New Bounty: ${lead.title} (${lead.budget.range || lead.budget.amount})`));
147             tracker.found.push(lead.id);
148
149             // Draft Proposal via Jules if it's technical
150             const isTechnical = lead.skills?.some(s => ['python', 'node', 'solana', 'javascript', 'ts', 'web3'].includes(s.toLowerCase()));
151             if (isTechnical) {
152                 await draftBountySolution(lead);
153             }
154         }
155
156         saveTracker(tracker);
157     }, 'Bounty Scrape').catch(e => {
158         console.error(chalk.red(`[SCAVENGER #${id}]: ❌ Critical Scrape failure: ${e.message}`));
159     });
160 }
161
162 async function draftBountySolution(bounty) {
163     try {
164         console.log(chalk.magenta(`[SCAVENGER #${id}]: 🧬 Sending bounty "${bounty.title}" to Jules for solution drafting...`));
165
166         const prompt = `Draft a technical solution and a submission proposal for this bounty:
167 Title: ${bounty.title}
168 Desc: ${bounty.description}
169 Budget: ${JSON.stringify(bounty.budget)}
170 URL: ${bounty.url}
171
172 If the bounty requires a script, write the script. If it requires a guide, write the guide.
173 Save the result as a polished submission.`;
174
175         const bridgePath = path.join(__dirname, '../muscle/jules_bridge.py');
176         const cmd = `python "${bridgePath}" --create "${prompt}" "syndicate-repo" --title "Bounty: ${bounty.id}" --auto-pr`;
177
178         exec(cmd, (err, stdout) => {
179             if (err) return;
180             console.log(chalk.green(`[SCAVENGER #${id}]: ✅ Jules session created for bounty ${bounty.id}.`));
181
182             if (process.send) {
183                 process.send({
184                     type: 'AGENT_COMMS',
185                     from: 'SCAVENGER',
186                     msg: `💎 Bounty hunter at work. Sparked Jules evolution for: "${bounty.title}". Solution incoming.`,
187                     timestamp: new Date().toISOString()
188                 });
189             }
190         });
191     } catch (e) {
192         console.error(chalk.red(`[SCAVENGER #${id}]: Jules bridge failure: ${e.message}`));
193     }
194 }
195
196 // ── RENT RECLAMATION (Standard Sweep via VAULT) ──
197 async function sweepDust() {
198     try {
199         console.log(chalk.yellow(`[SCAVENGER #${id}]: 🧹 Reclaiming rent via VAULT...`));
200         const { PublicKey, Transaction } = require('@solana/web3.js');
201         const { TOKEN_PROGRAM_ID, createCloseAccountInstruction } = require('@solana/spl-token');
202
203         const connection = core.connection;
204         const walletKey = keypair.publicKey;
205
206         const accounts = await connection.getParsedTokenAccountsByOwner(walletKey, { programId: TOKEN_PROGRAM_ID });
207         const emptyAccounts = accounts.value.filter(acc => acc.account.data.parsed.info.tokenAmount.uiAmount === 0);
208
209         if (emptyAccounts.length === 0) return;
210
211         const tx = new Transaction();
212         for (const acc of emptyAccounts.slice(0, 5)) {
213             tx.add(createCloseAccountInstruction(acc.pubkey, walletKey, walletKey));
214         }
215
216         const { blockhash } = await connection.getLatestBlockhash();
217         tx.recentBlockhash = blockhash;
218         tx.feePayer = walletKey;
219
220         // Request signature from VAULT via SyndicateCore
221         const serializedTx = tx.serialize({ requireAllSignatures: false }).toString('base64');
222
223         if (process.env.LIVE_MODE === 'true') {
224             core.log('Requesting VAULT signature for rent reclamation...', 'POWER');
225             const signedTxBase64 = await core.requestSign(serializedTx);
226             const signedTx = Transaction.from(Buffer.from(signedTxBase64, 'base64'));
227             const sig = await connection.sendRawTransaction(signedTx.serialize());
228             core.log(`Reclaimed rent. Sig: ${sig}`, 'MONEY');
229         } else {
230             console.log(chalk.gray(`[SCAVENGER]: SIMULATION: Would reclaimed rent from ${emptyAccounts.length} accounts via VAULT.`));
231         }
232     } catch (e) {
233         console.error(chalk.red(`[SCAVENGER]: Rent reclaim failed: ${e.message}`));
234     }
235 }
236
237 async function runScavengeLoop() {
238     const balance = await checkBalance();
239     await sweepDust();
240
241     // Aggressive bounty hunt
242     await scrapeBounties();
243
244     // Run every 15 minutes
245     setTimeout(runScavengeLoop, 900000);
246 }
247
248 runScavengeLoop();
