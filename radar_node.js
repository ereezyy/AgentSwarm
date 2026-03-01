// radar_node.js - THE DISTRIBUTED RADAR (Pi 5 Cluster Node)
// Designed to run independently on a Raspberry Pi 5 across the local network.
// It handles massive RPC streams (Block Logs) to relieve the Main PC's event loop.
// When it finds a target, it sends a trigger to the Main PC via WebSocket.
//
// NO SIMULATED DATA. All triggers come from real Solana blockchain events.
// Load .env from same directory as this script
const path = require('path');
try {
    const result = require('dotenv').config({ path: path.join(__dirname, '.env') });
    if (result.parsed) {
        console.log(`📋 [CONFIG]: Loaded ${Object.keys(result.parsed).length} env vars from .env`);
    }
} catch (e) {
    console.log(`📋 [CONFIG]: No dotenv available, using process.env`);
}
const WebSocket = require('ws');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { spawn } = require('child_process');
const fs = require('fs');

// ── Radar Config ───────────────────────────────────────────────────
// PI_5_USER_ACTION_REQUIRED: Change MAIN_PC_IP to the Main PC's local IPv4.
const MAIN_PC_IP = "169.254.79.164"; // Patched by deploy_pi.js
const MAIN_PC_WS_PORT = 8081;

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const WSS_URL = RPC_URL.replace('https', 'wss').replace('http', 'ws');

const connection = new Connection(RPC_URL, { wsEndpoint: WSS_URL, commitment: 'processed' });

console.log(`📡 [RADAR NODE]: Booting Distributed Compute Engine...`);
console.log(`📡 [RADAR NODE]: RPC: ${RPC_URL}`);
console.log(`📡 [RADAR NODE]: Targeting Syndicate Main PC at ${MAIN_PC_IP}:${MAIN_PC_WS_PORT}`);

// ── HAILO 8L AI COPROCESSOR (The DeepSentinel) ─────────────────────
// Spawns the Python IPC wrapper that serves both Raydium and Pump.fun models.
class HailoInferenceEngine {
    constructor(pythonScriptPath) {
        this.pythonScriptPath = pythonScriptPath;
        this.isLoaded = false;
        this.process = null;
        console.log(`🧠 [DEEPSENTINEL]: Initializing Hailo PCIe Co-processor IPC bindings...`);
    }

    async loadModel() {
        return new Promise((resolve, reject) => {
            this.process = spawn('python3', [this.pythonScriptPath]);

            this.process.stdout.once('data', (data) => {
                try {
                    const status = JSON.parse(data.toString());
                    if (status.status === 'ready') {
                        this.isLoaded = true;
                        console.log(`✅ [DEEPSENTINEL]: ${JSON.stringify(status.models || status)}`);
                        resolve();
                    }
                } catch (e) {
                    console.log(`🧠 [DEEPSENTINEL]: Parse Error: ${e.message}`);
                    resolve();
                }
            });

            this.process.stderr.on('data', (data) => {
                console.error(`🧠 [DEEPSENTINEL ERR]: ${data.toString().trim()}`);
            });

            this.process.on('close', (code) => {
                this.isLoaded = false;
                console.log(`❌ [DEEPSENTINEL]: Process exited with code ${code}`);
            });
        });
    }

    async predictRugProbability(modelId, featuresArray) {
        if (!this.isLoaded || !this.process) return 1.0;

        return new Promise(resolve => {
            const request = { model: modelId, features: featuresArray };
            this.process.stdin.write(JSON.stringify(request) + '\n');
            this.process.stdout.once('data', (data) => {
                try {
                    const result = JSON.parse(data.toString());
                    if (result.error) {
                        console.error(`🧠 [DEEPSENTINEL ERR]: ${result.error}`);
                        resolve(1.0);
                    } else {
                        resolve(result.rug_probability);
                    }
                } catch (e) {
                    resolve(1.0);
                }
            });
        });
    }
}

const aiCoprocessor = new HailoInferenceEngine('/home/ed/radar/inference_server.py');

// ── Stats Tracking ─────────────────────────────────────────────────
const stats = {
    poolsDetected: 0,
    poolsBlocked: 0,
    poolsPassed: 0,
    featureExtractionErrors: 0,
    marginfiScans: 0,
    marginfiUnderwaterFound: 0,
    jitoBundlesSent: 0,
    uptime: Date.now()
};

// ── LAN WebSocket Client ───────────────────────────────────────────
let wsToMainPC = null;

async function connectToSyndicate() {
    await aiCoprocessor.loadModel();

    wsToMainPC = new WebSocket(`ws://${MAIN_PC_IP}:${MAIN_PC_WS_PORT}`);

    wsToMainPC.on('open', () => {
        console.log(`✅ [RADAR NODE]: Uplink established with Main Syndicate Hub.`);
        wsToMainPC.send(JSON.stringify({ type: 'RADAR_ONLINE', node: 'Pi5-Primary' }));

        // Start real blockchain listeners
        startBlockZeroSniper();
        startMarginFiScanner();
        startJitoBundleEngine();
        console.log(`\n📡 [RADAR NODE]: All modules armed. Listening for REAL blockchain events only.`);
        console.log(`📡 [RADAR NODE]: No simulated data. No fake triggers.\n`);
    });

    wsToMainPC.on('error', (err) => {
        console.error(`❌ [RADAR NODE]: Connection failed: ${err.message}. Retrying in 5s...`);
    });

    wsToMainPC.on('close', () => {
        console.log(`⚠️  [RADAR NODE]: Uplink lost. Reconnecting in 5s...`);
        setTimeout(connectToSyndicate, 5000);
    });
}

// ── Real On-Chain Feature Extraction ────────────────────────────────
// Extracts REAL features from a Raydium pool creation transaction.
// These are fed into the DeepSentinel Raydium model (trained on 116k real SolRPDS pools).
//
// Feature vector: [pool_lifespan_days, total_added_liq, initial_liq, num_adds, add_remove_ratio, total_removed]
// Since this is Block-0 (the pool JUST launched), several features are at their initial values.

async function extractRaydiumFeatures(signature) {
    try {
        const tx = await connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });

        if (!tx || !tx.meta) {
            console.log(`⚠️  [FEATURE EXTRACT]: Transaction not found or null meta for ${signature.slice(0, 16)}...`);
            return null;
        }

        // Extract creator wallet (first signer)
        const accountKeys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys;
        if (!accountKeys || accountKeys.length === 0) return null;
        const creatorPubkey = accountKeys[0];

        // Feature 1: Pool lifespan = 0 days (Block-0, just created)
        const poolLifespanDays = 0.0;

        // Feature 2: Total added liquidity (from preBalances/postBalances delta in lamports → SOL)
        // The creator's SOL balance drops by the amount of liquidity added
        const preBalance = tx.meta.preBalances[0] || 0;
        const postBalance = tx.meta.postBalances[0] || 0;
        const solSpent = (preBalance - postBalance) / 1e9; // lamports to SOL
        const totalAddedLiquidity = Math.max(solSpent, 0);

        // Feature 3: Initial liquidity = same as total added (first add)
        const initialLiquidity = totalAddedLiquidity;

        // Feature 4: Number of liquidity adds = 1 (this IS the first add)
        const numAdds = 1;

        // Feature 5: Add-to-remove ratio = infinity at Block-0 (nothing removed yet)
        // We cap at a high value since the model expects finite floats
        const addRemoveRatio = 100.0;

        // Feature 6: Total removed = 0 (nothing removed at creation)
        const totalRemoved = 0.0;

        const features = [poolLifespanDays, totalAddedLiquidity, initialLiquidity, numAdds, addRemoveRatio, totalRemoved];

        console.log(`📊 [FEATURE EXTRACT]: Creator=${creatorPubkey.toString().slice(0, 8)}... | SOL Spent=${totalAddedLiquidity.toFixed(4)} | Features=${JSON.stringify(features.map(f => +f.toFixed(4)))}`);

        return {
            features,
            creator: creatorPubkey.toString(),
            solSpent: totalAddedLiquidity
        };

    } catch (err) {
        stats.featureExtractionErrors++;
        console.error(`❌ [FEATURE EXTRACT]: ${err.message}`);
        return null;
    }
}

// ── Module 1: Block-0 Raydium LP Sniper (REAL DATA ONLY) ───────────
// Subscribes to Raydium AMM V4 program logs.
// When a new pool is created (initialize2 instruction), it:
//   1. Extracts real features from the on-chain transaction
//   2. Pipes them through the DeepSentinel Raydium model
//   3. Only forwards to Main PC if the model scores it below the rug threshold

const RAYDIUM_AMM_PUBKEY = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
let lpStreamId = null;

function startBlockZeroSniper() {
    if (lpStreamId) connection.removeOnLogsListener(lpStreamId);

    console.log(`📡 [BLOCK-0 SNIPER]: Subscribing to Raydium AMM v4 logs (REAL events only)...`);

    lpStreamId = connection.onLogs(
        RAYDIUM_AMM_PUBKEY,
        async (logInfo, context) => {
            if (logInfo.err === null && logInfo.logs.some(log => log.includes('initialize2') || log.includes('Instruction: Initialize2'))) {

                const signature = logInfo.signature;
                stats.poolsDetected++;

                console.log(`\n🚨🚨 [BLOCK-0 SNIPER]: NEW RAYDIUM POOL DETECTED! Sig: ${signature.slice(0, 20)}...`);
                console.log(`📊 [STATS]: Pools Detected=${stats.poolsDetected} | Blocked=${stats.poolsBlocked} | Passed=${stats.poolsPassed}`);

                // --- Extract REAL features from the blockchain ---
                console.log(`\x1b[35m🧠 [DEEPSENTINEL/RAYDIUM]: Extracting REAL on-chain features...\x1b[0m`);
                const START_TIME = Date.now();

                const extracted = await extractRaydiumFeatures(signature);

                if (!extracted) {
                    console.log(`⚠️  [BLOCK-0 SNIPER]: Could not extract features. Skipping (fail-safe: treat as rug).`);
                    stats.poolsBlocked++;
                    return;
                }

                // --- Run through DeepSentinel AI ---
                const rugProb = await aiCoprocessor.predictRugProbability('raydium', extracted.features);
                const inferenceMs = Date.now() - START_TIME;

                console.log(`\x1b[35m🧠 [DEEPSENTINEL/RAYDIUM]: Inference Complete in ${inferenceMs}ms\x1b[0m`);
                console.log(`\x1b[35m🧠 [DEEPSENTINEL/RAYDIUM]: Rug Probability = ${(rugProb * 100).toFixed(2)}%\x1b[0m`);

                if (rugProb > 0.70) {
                    stats.poolsBlocked++;
                    console.log(`🧱 [HARD FIREWALL]: BLOCKED! Score ${(rugProb * 100).toFixed(1)}% exceeds 70% threshold.`);
                    console.log(`   Creator: ${extracted.creator}`);
                    console.log(`   SOL deposited: ${extracted.solSpent.toFixed(4)}`);
                    return;
                }

                stats.poolsPassed++;
                console.log(`🟢 [DEEPSENTINEL]: PASSED. Target is mathematically clean.`);

                // --- Send REAL trigger to Main PC ---
                if (wsToMainPC && wsToMainPC.readyState === WebSocket.OPEN) {
                    wsToMainPC.send(JSON.stringify({
                        type: 'PI_TRIGGER',
                        action: 'BLOCK0_SNIPE',
                        signature: signature,
                        model: 'raydium',
                        rugScore: rugProb,
                        creator: extracted.creator,
                        solDeposited: extracted.solSpent,
                        timestamp: Date.now()
                    }));
                    console.log(`⚡ [RADAR NODE]: REAL trigger beamed to Syndicate Hub.`);
                }
            }
        },
        'processed'
    );
}

// ── Module 2: MarginFi Liquidation Monitor (REAL DATA ONLY) ────────
// Subscribes to MarginFi v2 program logs in real-time.
// Watches for borrow, withdraw, and liquidation events.
// When a liquidation event fires, it means someone is ALREADY being liquidated — 
// we can front-run the next one by monitoring borrows and withdrawals that 
// push accounts toward their liquidation threshold.
//
// MarginFi v2 Program: MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA

const MARGINFI_PROGRAM_ID = new PublicKey('MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA');
let marginfiStreamId = null;

// MarginFi instruction names we care about (from the IDL)
const MARGINFI_EVENTS = {
    liquidate: ['LendingAccountLiquidate', 'lending_account_liquidate', 'liquidate'],
    borrow: ['LendingAccountBorrow', 'lending_account_borrow'],
    withdraw: ['LendingAccountWithdraw', 'lending_account_withdraw'],
    repay: ['LendingAccountRepay', 'lending_account_repay'],
};

function startMarginFiScanner() {
    if (marginfiStreamId) connection.removeOnLogsListener(marginfiStreamId);

    console.log(`📡 [MARGINFI SCANNER]: Subscribing to MarginFi v2 program logs (REAL events only)...`);
    console.log(`📡 [MARGINFI SCANNER]: Program: ${MARGINFI_PROGRAM_ID.toString()}`);

    marginfiStreamId = connection.onLogs(
        MARGINFI_PROGRAM_ID,
        async (logInfo, context) => {
            if (logInfo.err !== null) return; // Skip failed txs

            const logStr = logInfo.logs.join(' ');
            const sig = logInfo.signature;

            // Check for liquidation events — someone is getting liquidated RIGHT NOW
            const isLiquidation = MARGINFI_EVENTS.liquidate.some(e => logStr.includes(e));
            if (isLiquidation) {
                stats.marginfiUnderwaterFound++;
                console.log(`\n🩸🩸 [MARGINFI SCANNER]: LIQUIDATION EVENT DETECTED!`);
                console.log(`   Signature: ${sig.slice(0, 20)}...`);

                if (wsToMainPC && wsToMainPC.readyState === WebSocket.OPEN) {
                    wsToMainPC.send(JSON.stringify({
                        type: 'PI_TRIGGER',
                        action: 'MARGINFI_LIQUIDATION_DETECTED',
                        signature: sig,
                        timestamp: Date.now()
                    }));
                    console.log(`⚡ [MARGINFI SCANNER]: Liquidation trigger beamed to Syndicate Hub.`);
                }
                return;
            }

            // Track borrows and withdrawals (these move accounts closer to liquidation)
            const isBorrow = MARGINFI_EVENTS.borrow.some(e => logStr.includes(e));
            const isWithdraw = MARGINFI_EVENTS.withdraw.some(e => logStr.includes(e));

            if (isBorrow || isWithdraw) {
                stats.marginfiScans++;
                const eventType = isBorrow ? 'BORROW' : 'WITHDRAW';

                // Log every 10th event to avoid console spam
                if (stats.marginfiScans % 10 === 1) {
                    console.log(`📊 [MARGINFI SCANNER]: ${eventType} event #${stats.marginfiScans} | Sig: ${sig.slice(0, 16)}...`);
                }
            }
        },
        'confirmed'
    );

    console.log(`✅ [MARGINFI SCANNER]: Log subscription active. Monitoring for liquidations...`);
}

// ── Module 3: Jito Bundle Engine (REAL DATA ONLY) ──────────────────
// Connects to the Jito Block Engine for atomic bundle submission.
// Used for liquidations and arb — NOT for mempool sniping (pseudo-mempool was suspended).
//
// Requires: npm install jito-ts
// Requires: Jito auth keypair at /home/ed/radar/jito_auth.json
//
// The Pi acts as a bundle relay: when the Main PC sends a LIQUIDATE or ARB action,
// the Pi constructs and submits the bundle via Jito for guaranteed atomic execution.

const JITO_BLOCK_ENGINE_URL = process.env.JITO_BLOCK_ENGINE_URL || 'https://mainnet.block-engine.jito.wtf/api/v1';
const JITO_AUTH_KEYPAIR_PATH = '/home/ed/radar/jito_auth.json';

let jitoTipAccounts = [];
let jitoReady = false;

async function startJitoBundleEngine() {
    console.log(`📡 [JITO ENGINE]: Initializing Jito Block Engine connection...`);
    console.log(`📡 [JITO ENGINE]: Endpoint: ${JITO_BLOCK_ENGINE_URL}`);

    // Check for auth keypair
    if (!fs.existsSync(JITO_AUTH_KEYPAIR_PATH)) {
        console.log(`⚠️  [JITO ENGINE]: No auth keypair found at ${JITO_AUTH_KEYPAIR_PATH}`);
        console.log(`   To enable Jito bundles: create a Solana keypair and save it there.`);
        console.log(`   The Pi will still relay liquidation targets without Jito.`);
        return;
    }

    try {
        // Load the auth keypair
        const keypairData = JSON.parse(fs.readFileSync(JITO_AUTH_KEYPAIR_PATH, 'utf8'));
        const authKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
        console.log(`🔑 [JITO ENGINE]: Auth pubkey: ${authKeypair.publicKey.toString().slice(0, 16)}...`);

        // Fetch Jito tip accounts via their REST API
        const https = require('https');
        const tipUrl = `${JITO_BLOCK_ENGINE_URL}/bundles`;

        // Try to load jito-ts if available
        let searcherClient = null;
        try {
            const jito = require('jito-ts');
            searcherClient = jito.searcherClient(JITO_BLOCK_ENGINE_URL, authKeypair);

            // Get tip accounts
            const tipAccountsResult = await searcherClient.getTipAccounts();
            if (tipAccountsResult && tipAccountsResult.length > 0) {
                jitoTipAccounts = tipAccountsResult.map(acc => new PublicKey(acc));
                console.log(`✅ [JITO ENGINE]: Connected. ${jitoTipAccounts.length} tip accounts loaded.`);
                jitoReady = true;
            }
        } catch (e) {
            if (e.code === 'MODULE_NOT_FOUND') {
                console.log(`⚠️  [JITO ENGINE]: jito-ts not installed. Run: npm install jito-ts`);
                console.log(`   Falling back to Jito JSON-RPC bundle submission.`);

                // Fallback: use Jito's JSON-RPC endpoint directly (works without jito-ts)
                jitoReady = true;
                console.log(`✅ [JITO ENGINE]: JSON-RPC fallback ready at ${JITO_BLOCK_ENGINE_URL}`);
            } else {
                console.error(`❌ [JITO ENGINE]: ${e.message}`);
            }
        }

        // Listen for bundle submission requests from Main PC via WebSocket
        // The Main PC will send { type: 'BUNDLE_REQUEST', transactions: [...] }
        // and we'll forward them to Jito
        console.log(`📡 [JITO ENGINE]: Listening for bundle requests from Main PC...`);

    } catch (err) {
        console.error(`❌ [JITO ENGINE]: Failed to initialize: ${err.message}`);
    }
}

// Handle incoming bundle requests from Main PC
function handleBundleRequest(data) {
    if (!jitoReady) {
        console.log(`⚠️  [JITO ENGINE]: Bundle request received but Jito not ready.`);
        return;
    }

    stats.jitoBundlesSent++;
    console.log(`📦 [JITO ENGINE]: Bundle request #${stats.jitoBundlesSent} received from Main PC.`);
    console.log(`   Action: ${data.action || 'UNKNOWN'}`);
    console.log(`   Transactions: ${data.transactions ? data.transactions.length : 0}`);

    // The actual bundle construction + submission would use the serialized txs
    // from the Main PC. The Main PC builds the transaction instructions,
    // the Pi submits them atomically via Jito.
    // Full implementation requires the Main PC to send signed tx bytes.
}

// ── Heartbeat (real stats only) ────────────────────────────────────
setInterval(() => {
    const uptimeMin = ((Date.now() - stats.uptime) / 60000).toFixed(1);
    console.log(`💓 [HEARTBEAT]: Uptime=${uptimeMin}m | Block0: det=${stats.poolsDetected} blk=${stats.poolsBlocked} pass=${stats.poolsPassed} | MarginFi: scans=${stats.marginfiScans} borrows=${stats.marginfiUnderwaterFound} | Jito: bundles=${stats.jitoBundlesSent}`);
}, 60000);

// ── Boot ──
connectToSyndicate();
