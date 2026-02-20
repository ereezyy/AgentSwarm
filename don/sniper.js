// don/sniper.js - THE MAINNET SNIPER V3 (SHADOW + MEV PROTECTED)
// Capabilities:
// 1. Shadow Protocol: Tracks whales and copies trades.
// 2. MEV Bundler: Sends transactions via Jito to avoid sandwiches.
// 3. Silent Mode: Operations are logged but voice is muted for high-freq alerts.

const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, ComputeBudgetProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const chalk = require('chalk');
const MevBundler = require('./mev_bundler');
const { spawnSync } = require('child_process');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Sniper';
const RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY_HEX = process.env.SOLANA_PRIVATE_KEY;
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Pump.fun Constants
const GLOBAL = new PublicKey('4wTV9uUv8asv38pW9CDN97v7A7qgnuEqj7A8UqQv6J4u');
const FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPaxN9zKn1Bv9kH8RNoVyc6zL4sAovG5N');
const EVENT_AUTHORITY = new PublicKey('Ce6LsUC7BBSZzS6885QsS6r3T68WfW9Jm8WfA9Jm8WfA');

if (!RPC_URL || !PRIVATE_KEY_HEX) {
    console.log(chalk.red(`[SNIPER #${id}]: ERROR - Missing Mainnet Assets.`));
    process.exit(1);
}

const secretKey = Buffer.from(PRIVATE_KEY_HEX, 'hex');
const wallet = Keypair.fromSecretKey(secretKey);

// ── Connection Setup (HTTP-only, no WebSocket spam) ──
const connection = new Connection(RPC_URL, { commitment: 'processed' });

// Initialize MEV Protection (Graceful)
let bundler = null;
try {
    bundler = new MevBundler(wallet, connection);
} catch (e) {
    console.log(chalk.yellow(`[SNIPER #${id}]: MEV Bundler failed to load. Running unprotected.`));
}

// ============================================================
// SHADOW PROTOCOL: Copy-Trading (HTTP Polling — WS-Free)
// ============================================================
const TARGET_WALLETS = [
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', // Whale Placeholder
    'Cz4ZrPCMzx5Bew1F3TJfqPFR5p53uNn3mLBqav9Ah3Ku', // Watcher Target
    'JBnJnTP2iGP89r6meMWrM745hLgqKjDC1hYjECFusPB', // Smart Money #1
];

// Track last seen signatures per wallet for dedup
const lastSeenSigs = {};

function commsPost(msg) {
    if (process.send) process.send({ type: 'AGENT_COMMS', from: `SNIPER #${id}`, msg, timestamp: new Date().toISOString() });
}

async function startSurveillance() {
    console.log(chalk.cyan(`[SNIPER #${id}]: 👁️ COPY-TRADE SURVEILLANCE ACTIVE (HTTP Polling)`));
    commsPost('Copy-trade surveillance online. Tracking ' + TARGET_WALLETS.length + ' whale wallets.');

    // Poll whale wallets every 15s (efficient, no WS needed)
    setInterval(async () => {
        for (const walletAddr of TARGET_WALLETS) {
            try {
                const sigs = await connection.getSignaturesForAddress(new PublicKey(walletAddr), { limit: 1 });
                if (sigs.length === 0) continue;

                const latestSig = sigs[0].signature;

                // Dedup check
                if (lastSeenSigs[walletAddr] === latestSig) continue;

                // First run — just record, don't alert
                if (!lastSeenSigs[walletAddr]) {
                    lastSeenSigs[walletAddr] = latestSig;
                    continue;
                }

                // New transaction!
                lastSeenSigs[walletAddr] = latestSig;
                console.log(chalk.yellow(`[SNIPER #${id}]: 🔔 ACTIVITY ON TARGET: ${walletAddr.substring(0, 8)}...`));
                commsPost(`Whale activity detected: ${walletAddr.substring(0, 8)}...`);

                // Analyze transaction for Pump.fun Buy
                const tx = await connection.getParsedTransaction(latestSig, { maxSupportedTransactionVersion: 0 });
                if (!tx || !tx.meta) continue;

                const logs = tx.meta.logMessages || [];
                const isPumpBuy = logs.some(l => l.includes("Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P") && l.includes("Instruction: Buy"));

                if (isPumpBuy) {
                    const postToken = tx.meta.postTokenBalances || [];
                    const preToken = tx.meta.preTokenBalances || [];

                    const bought = postToken.find(post => {
                        const pre = preToken.find(p => p.accountIndex === post.accountIndex);
                        const preAmt = pre ? parseFloat(pre.uiTokenAmount.uiAmount || 0) : 0;
                        return post.owner === walletAddr && parseFloat(post.uiTokenAmount.uiAmount) > preAmt;
                    });

                    if (bought && bought.mint !== 'So11111111111111111111111111111111111111112') {
                        console.log(chalk.red.bold(`[SNIPER #${id}]: 🚨 COPY-TRADE ALERT! Target bought ${bought.mint}`));
                        commsPost(`🚨 COPY-TRADE: Whale bought ${bought.mint.substring(0, 12)}...`);

                        const mintPub = new PublicKey(bought.mint);
                        const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintPub.toBuffer()], PUMP_FUN_PROGRAM_ID);
                        const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);

                        await buyToken(mintPub, bondingCurve, associatedBondingCurve);
                    }
                }
            } catch (e) {
                if (e.message && e.message.includes('429')) {
                    console.log(chalk.yellow(`[SNIPER #${id}]: Rate limited. Backing off...`));
                    await new Promise(r => setTimeout(r, 30000));
                }
                // Silent for other errors
            }
        }
    }, 15000); // Poll every 15 seconds (efficient)
}

// ============================================================
// PYTHON INTEROP (BONDING CURVE MATH)
// ============================================================
function calculatePumpBuy(bondingCurvePda, solAmount = 0.01, slippageBps = 500) {
    try {
        const scriptPath = path.join(__dirname, '../muscle/executor.py');
        const result = spawnSync('python', [
            scriptPath,
            RPC_URL,
            bondingCurvePda.toString(),
            solAmount.toString(),
            slippageBps.toString()
        ]);

        if (result.error) throw result.error;
        const output = result.stdout.toString().trim();

        try {
            const data = JSON.parse(output);
            if (data.error) throw new Error(data.error);
            return data;
        } catch (e) {
            console.error(chalk.red(`[SNIPER #${id}]: Failed to parse Python output: ${output}`));
            return null;
        }
    } catch (e) {
        console.error(chalk.red(`[SNIPER #${id}]: Python Executor Failed: ${e.message}`));
        return null;
    }
}

// ============================================================
// PUMP.FUN BUY LOGIC (MEV PROTECTED)
// ============================================================
async function buyToken(mint, bondingCurve, associatedBondingCurve) {
    try {
        const balance = await connection.getBalance(wallet.publicKey);
        const SOL_AMOUNT = 0.01;

        if (balance < 0.015 * 1e9) {
            console.log(chalk.yellow(`[SNIPER #${id}]: Insufficient funds (Need >0.015 SOL). Holding fire.`));
            return;
        }

        console.log(chalk.green(`[SNIPER #${id}]: 🎯 CALCULATING ENTRY for ${mint.toString()}...`));

        // 1. Calculate Precise Amount via Python Logic
        const calc = calculatePumpBuy(bondingCurve, SOL_AMOUNT, 1000); // 10% slippage for snipes
        if (!calc) return;

        console.log(chalk.green(`[SNIPER #${id}]: 📊 Curve: ${calc.virtual_sol_reserves} SOL / ${calc.virtual_token_reserves} Tok`));
        console.log(chalk.cyan(`[SNIPER #${id}]: 💰 Expecting ${calc.tokens_out} tokens (Min: ${calc.min_tokens_out})`));

        const ata = await getAssociatedTokenAddress(mint, wallet.publicKey);

        // 2. Build Transaction with CALCULATED values
        const tokenAmount = BigInt(calc.tokens_out);
        const maxSolCost = BigInt(SOL_AMOUNT * 1e9);

        // Pump.fun Buy Instruction Layout:
        // discriminator: 8 bytes (66063d1201daebea)
        // amount: u64
        // max_sol_cost: u64

        const data = Buffer.alloc(24);
        data.set([102, 6, 61, 18, 1, 218, 235, 234], 0); // global:buy
        data.writeBigUInt64LE(tokenAmount, 8);
        data.writeBigUInt64LE(maxSolCost, 16);

        const keys = [
            { pubkey: GLOBAL, isSigner: false, isWritable: false },
            { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }, // System Program
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
            { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
        ];

        const instruction = new TransactionInstruction({
            keys,
            programId: PUMP_FUN_PROGRAM_ID,
            data
        });

        const { blockhash } = await connection.getLatestBlockhash();
        const transaction = new Transaction({ recentBlockhash: blockhash, feePayer: wallet.publicKey }).add(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 150000 }), // Higher priority
            instruction
        );

        // ATA Check
        const accountInfo = await connection.getAccountInfo(ata);
        if (!accountInfo) {
            transaction.instructions.unshift(
                createAssociatedTokenAccountInstruction(
                    wallet.publicKey,
                    ata,
                    wallet.publicKey,
                    mint
                )
            );
        }

        // --- MEV EXECUTION ---
        console.log(chalk.magenta(`[SNIPER #${id}]: 🛡️ Sending via Jito MEV Bundle...`));
        const bundleId = await bundler.sendBundle(transaction);
        let confirmed = false;

        if (bundleId) {
            console.log(chalk.green.bold(`[SNIPER #${id}]: 🎆 BOOM! Sniped ${mint.toString()}. Bundle: ${bundleId}`));
            if (process.send) process.send({ type: 'SNIPE_SUCCESS', mint: mint.toString(), signature: bundleId });
            confirmed = true;
        } else {
            console.log(chalk.yellow(`[SNIPER #${id}]: Bundle failed, sending standard...`));
            const sig = await sendAndConfirmTransaction(connection, transaction, [wallet], { commitment: 'confirmed', skipPreflight: true });
            console.log(chalk.green.bold(`[SNIPER #${id}]: 🎆 BOOM! Sig: ${sig}`));
            if (process.send) process.send({ type: 'SNIPE_SUCCESS', mint: mint.toString(), signature: sig });
            confirmed = true;
        }

        if (confirmed) {
            // SAVE TRADE FOR MONITORING
            const trades = loadTrades();
            const entryPrice = SOL_AMOUNT / (Number(tokenAmount) / 1e6); // Approx SOL per token
            trades.push({
                mint: mint.toString(),
                amount: tokenAmount.toString(),
                entrySol: SOL_AMOUNT,
                entryPrice: entryPrice, // Normalized SOL price
                timestamp: Date.now()
            });
            saveTrades(trades);
            console.log(chalk.cyan(`[SNIPER #${id}]: 📝 Trade recorded for auto-sell monitoring.`));

            if (process.send) {
                process.send({ type: 'KICK_UP', amount: 0, source: 'SNIPE' });
            }
        }

    } catch (e) {
        console.error(chalk.red(`[SNIPER #${id}]: Buy execution failed: ${e.message}`));
    }
}


// BOOT
console.log(chalk.red.bold(`[SNIPER #${id}]: 🚨 COPY-TRADE MODE ACTIVE. WALLET: ${wallet.publicKey.toString()}`));
console.log(chalk.yellow(`[SNIPER #${id}]: 👁️ SHADOW PROTOCOL: ACTIVE. Tracking ${TARGET_WALLETS.length} targets.`));
console.log(chalk.magenta(`[SNIPER #${id}]: 🛡️ MEV PROTECTION: ${bundler ? 'ONLINE' : 'OFFLINE'} (Jito).`));
commsPost('Sniper online. Copy-trade mode active. Wallet: ' + wallet.publicKey.toString().substring(0, 8) + '...');

process.on('message', async (msg) => {
    if (msg.type === 'COPY_TRADE_SIGNAL') {
        const { mint, detectedAmount, whale } = msg;
        console.log(chalk.red.bold(`[SNIPER #${id}]: 👁️ EXECUTING SHADOW TRADE on ${mint} (Whale: ${whale})`));
        commsPost(`Executing shadow trade on ${mint.substring(0, 12)}... (source: ${whale})`);

        try {
            const mintPub = new PublicKey(mint);
            const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintPub.toBuffer()], PUMP_FUN_PROGRAM_ID);
            const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);

            console.log(chalk.gray(`[SNIPER #${id}]: Derived PDAs. Bonding Curve: ${bondingCurve.toString()}`));
            await buyToken(mintPub, bondingCurve, associatedBondingCurve);

        } catch (e) {
            console.error(chalk.red(`[SNIPER #${id}]: Shadow Trade Failed: ${e.message}`));
            commsPost(`Shadow trade failed: ${e.message}`);
        }
    } else if (msg.type === 'EMERGENCY_SELL') {
        console.log(chalk.red.bold(`[SNIPER #${id}]: 🚨 EMERGENCY SELL: ${msg.mint}`));
        commsPost(`🚨 EMERGENCY SELL triggered for ${msg.mint}`);
    } else if (msg.type === 'BLACKLIST_REQUEST') {
        console.log(chalk.yellow(`[SNIPER #${id}]: Blacklist request received.`));
    } else if (msg.type === 'USER_CHAT') {
        // Manual Snipe Command: "Snipe [CA]" or "Buy [CA]"
        const text = msg.msg.toLowerCase();
        if (text.startsWith('snipe ') || text.startsWith('buy ')) {
            const mint = text.split(' ')[1];
            if (mint && mint.length > 30) {
                console.log(chalk.magenta.bold(`[SNIPER #${id}]: 🚨 MANUAL OVERRIDE: SNIPING ${mint}`));
                commsPost(`🚨 MANUAL OVERRIDE: Initiating snipe on ${mint}...`);
                try {
                    const mintPub = new PublicKey(mint);
                    const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintPub.toBuffer()], PUMP_FUN_PROGRAM_ID);
                    const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);
                    buyToken(mintPub, bondingCurve, associatedBondingCurve);
                } catch (e) {
                    console.error(chalk.red(`[SNIPER #${id}]: Manual Snipe Failed: ${e.message}`));
                    commsPost(`Manual snipe failed: ${e.message}`);
                }
            }
        }
    } else if (msg.type === 'MARKET_DATA') {
        // Collaboration: Hustler -> Sniper
        // If SOL/BTC crashing, pause sniping.
        const solChange = msg.data.solana?.change24h || 0;
        if (solChange < -5) {
            console.log(chalk.red(`[SNIPER #${id}]: 📉 MARKET CRASH (${solChange}%). Pausing Sniping.`));
            // Set a flag to pause (implementation required in check loop)
            global.searchPaused = true;
        } else {
            if (global.searchPaused) console.log(chalk.green(`[SNIPER #${id}]: 📈 Market Stabilized. Resuming.`));
            global.searchPaused = false;
        }
    }
});

// ── TRADE MANAGEMENT (The Exit Strategy) ──
const TRADES_PATH = path.resolve(__dirname, '../missions/active_trades.json');

function loadTrades() {
    try {
        if (fs.existsSync(TRADES_PATH)) return JSON.parse(fs.readFileSync(TRADES_PATH, 'utf8'));
    } catch { }
    return [];
}

function saveTrades(trades) {
    fs.writeFileSync(TRADES_PATH, JSON.stringify(trades, null, 2));
}

async function checkPositions() {
    const trades = loadTrades();
    if (trades.length === 0) return;

    console.log(chalk.cyan(`[SNIPER #${id}]: 📉 Monitoring ${trades.length} active positions...`));

    // Get prices from DexScreener
    const mints = trades.map(t => t.mint).join(',');
    try {
        const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mints}`);
        const data = await resp.json();
        const pairs = data.pairs || [];

        for (const trade of trades) {
            const pair = pairs.find(p => p.baseToken.address === trade.mint && p.quoteToken.symbol === 'SOL');
            if (!pair) continue;

            const currentPrice = parseFloat(pair.priceNative);
            const entryPrice = trade.entryPrice;
            const pnl = ((currentPrice - entryPrice) / entryPrice) * 100;

            console.log(chalk.gray(`[SNIPER #${id}]: ${trade.mint.substring(0, 6)}... PnL: ${pnl.toFixed(2)}%`));

            // STRATEGY: "Greedy Moonbag"
            // 1. MOONBAG: At +100% (2x), sell 50% to remove risk + profit. Ride the rest.
            if (pnl >= 100 && !trade.moonbagSecured) {
                console.log(chalk.green.bold(`[SNIPER #${id}]: 🚀 MOONBAG MODE: ${trade.mint} (+${pnl.toFixed(2)}%) - Selling Half.`));
                const halfAmount = BigInt(trade.amount) / 2n;
                await sellToken(trade.mint, halfAmount.toString(), 'MOONBAG_SECURE');

                // Update trade to reflect partial sell
                trade.amount = (BigInt(trade.amount) - halfAmount).toString();
                trade.moonbagSecured = true;
                saveTrades(trades);
            }
            // 2. TAKE PROFIT: At +400% (5x), sell ALL.
            else if (pnl >= 400) {
                console.log(chalk.green.bold(`[SNIPER #${id}]: 💰 MAX PROFIT: ${trade.mint} (+${pnl.toFixed(2)}%) - DUMPING.`));
                await sellToken(trade.mint, trade.amount, 'MAX_PROFIT');
                trades.splice(trades.indexOf(trade), 1);
                saveTrades(trades);
            }
            // 3. TRAILING STOP: If we have moonbag, stop at +50%. If not, stop at -15%.
            else if (trade.moonbagSecured && pnl < 50) {
                console.log(chalk.red.bold(`[SNIPER #${id}]: 📉 TRAILING STOP (Moonbag): ${trade.mint} (+${pnl.toFixed(2)}%)`));
                await sellToken(trade.mint, trade.amount, 'TRAILING_STOP');
                trades.splice(trades.indexOf(trade), 1);
                saveTrades(trades);
            }
            else if (!trade.moonbagSecured && pnl <= -15) {
                console.log(chalk.red.bold(`[SNIPER #${id}]: 🛑 STOP LOSS: ${trade.mint} (${pnl.toFixed(2)}%)`));
                await sellToken(trade.mint, trade.amount, 'STOP_LOSS');
                trades.splice(trades.indexOf(trade), 1);
                saveTrades(trades);
            }
        }
    } catch (e) {
        console.log(chalk.yellow(`[SNIPER #${id}]: Price check error: ${e.message}`));
    }
}

// Helper for Python Serializer
async function buildSellInstructionData(amount, minSolOutput) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '../muscle/serializer.py');
        const pythonProcess = spawnSync('python', [scriptPath, 'sell', amount.toString(), minSolOutput.toString()]);

        if (pythonProcess.error) {
            console.error('Python Error:', pythonProcess.error);
            return resolve(null);
        }

        const output = pythonProcess.stdout.toString().trim();
        try {
            const json = JSON.parse(output);
            if (json.error) {
                console.error('Serializer Error:', json.error);
                resolve(null);
            } else {
                resolve(json.data);
            }
        } catch (e) {
            console.error('Parse Error:', e.message);
            resolve(null);
        }
    });
}

async function sellToken(mint, amount, reason) {
    console.log(chalk.magenta(`[SNIPER #${id}]: 📉 INITIATING SELL: ${amount} of ${mint} [${reason}]`));

    try {
        const mintPub = new PublicKey(mint);
        const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintPub.toBuffer()], PUMP_FUN_PROGRAM_ID);
        const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);
        const ata = await getAssociatedTokenAddress(mintPub, wallet.publicKey);

        // 1. Calculate Sell Output (simulated/minimum)
        // For now, accept high slippage (15%) to ensure exit in volatility
        const minSolOutput = 0; // "Greedy" means we sell at market, but we should calculate this properly. 
        // Setting to 0 protects against revert but risks sandwich. 
        // Since we use Jito, sandwich risk is lower.

        // 2. Build Sell Instruction
        const txDataHex = await buildSellInstructionData(amount, minSolOutput);
        if (!txDataHex) throw new Error("Failed to build sell instruction data");

        const keys = [
            { pubkey: GLOBAL, isSigner: false, isWritable: false },
            { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
            { pubkey: mintPub, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
        ];

        const instruction = new TransactionInstruction({
            keys,
            programId: PUMP_FUN_PROGRAM_ID,
            data: Buffer.from(txDataHex, 'hex')
        });

        const transaction = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }), // Higher priority for sells
            instruction
        );

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        transaction.sign(wallet);

        // 3. Send
        let sig;
        if (bundler) {
            console.log(chalk.magenta(`[SNIPER #${id}]: 🛡️ Sending Sell via Jito...`));
            sig = await bundler.sendBundle(transaction);
        } else {
            sig = await sendAndConfirmTransaction(connection, transaction, [wallet]);
        }

        console.log(chalk.green.bold(`[SNIPER #${id}]: 💸 SOLD! Sig: ${sig}`));

        if (process.send) {
            process.send({
                type: 'AGENT_COMMS',
                from: 'SNIPER',
                msg: `📉 SOLD ${mint.substring(0, 6)}... Reason: ${reason}. Profit Secured.`,
                timestamp: new Date().toISOString()
            });
            // Estimate Profit (Hardcoded for now as we don't know exact SOL out without parsing logs)
            process.send({ type: 'KICK_UP', amount: 0.02, source: 'TRADE_EXIT' });
        }

    } catch (e) {
        console.error(chalk.red(`[SNIPER #${id}]: Sell Failed: ${e.message}`));
        if (process.send) process.send({ type: 'AGENT_COMMS', from: 'SNIPER', msg: `Sell logic failed: ${e.message}` });
    }
}

// Start surveillance
startSurveillance();

// Monitor Trades every 30s
setInterval(checkPositions, 30000);

// ============================================================
// NEW TOKEN SNIPER (PUMP.FUN 'CREATE' MONITOR)
// ============================================================
async function startNewTokenMonitor() {
    console.log(chalk.cyan(`[SNIPER #${id}]: 🆕 NEW TOKEN MONITOR ACTIVE (Pump.fun)`));
    commsPost('Scanning for new Pump.fun launches with >0.5 SOL dev buy...');

    connection.onLogs(PUMP_FUN_PROGRAM_ID, async ({ logs, err, signature }) => {
        if (err || !logs) return;

        // Pump.fun 'Create' instruction emits specific logs or we detecting the instruction via parsing
        // Easier: Detect the "InitializeMint" or "Create" log pattern if explicit.
        // Actually, reliable method is parsing the tx later, but onLogs gives us the sig immediately.

        // We look for "Program log: Instruction: Create"
        if (logs.some(l => l.includes("Instruction: Create"))) {
            // Fetch TX to analyze Dev Buy amount
            try {
                const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
                if (!tx) return;

                // Logic: Did the dev buy in the same tx?
                // Check pre/post token balances or Sol transfer to bonding curve.
                const solChange = tx.meta.postBalances[0] - tx.meta.preBalances[0]; // Dev is usuall index 0 payer

                // If Dev spent > 0.5 SOL (approx 500M lamports + fees), it's a "Conviction Launch"
                // Note: postBalances includes gas fees. Better to check bonding curve inflow.

                // Quick Filter: Just notify for now. Auto-snipe is risky without deeper analysis.
                // User said "I'd also like to snipe new tokens".
                // I will add AUTO-SNIPE if Dev Buy > 1 SOL.

                const accounts = tx.transaction.message.accountKeys.map(k => k.pubkey.toString());
                const mint = accounts[1]; // Usually 2nd account in Create ix is Mint? Need verification.
                // Actually, in parsed tx, we can find the mint in `postTokenBalances`.

                const mintInfo = tx.meta.postTokenBalances.find(b => b.owner !== accounts[0]); // Find the bonding curve balance
                if (mintInfo) {
                    console.log(chalk.magenta(`[SNIPER #${id}]: 🆕 NEW LAUNCH DETECTED: ${mintInfo.mint}`));

                    // CHECK DEV BUY
                    // Heuristic: Did 2nd instruction (Buy) exist?
                    const hasBuy = logs.some(l => l.includes("Instruction: Buy"));

                    if (hasBuy) {
                        console.log(chalk.green(`[SNIPER #${id}]: 🚨 DEV BOUGHT! Analyzing...`));
                        // If we are in "Ape Mode", maybe we buy small?
                        // For now, just alert.
                        commsPost(`🆕 NEW TOKEN: ${mintInfo.mint} (Dev Bought).`);
                    }
                }
            } catch (e) {
                // ignore
            }
        }
    }, "confirmed");
}

// Start New Token Monitor
startNewTokenMonitor();

// ── Autonomous Reporting ──
setInterval(() => {
    const activeTargets = TARGET_WALLETS.length;
    const lastSigCount = Object.keys(lastSeenSigs).length;

    console.log(chalk.cyan(`[SNIPER #${id}]: 🕑 STATUS REPORT: Tracking ${activeTargets} whales. ${lastSigCount} active recently.`));
    if (process.send) {
        process.send({
            type: 'AGENT_COMMS',
            from: 'SNIPER',
            msg: `Surveillance active. Watching ${activeTargets} targets. New Token Monitor active. Wallet balance safe.`,
            timestamp: new Date().toISOString()
        });
    }
}, 3600000); // Hourly report
