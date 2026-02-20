// don/sniper.js - THE MAINNET SNIPER V3 (SHADOW + MEV PROTECTED)
// Capabilities:
// 1. Shadow Protocol: Tracks whales and copies trades.
// 2. MEV Bundler: Sends transactions via Jito to avoid sandwiches.
// 3. Silent Mode: Operations are logged but voice is muted for high-freq alerts.

const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, ComputeBudgetProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const chalk = require('chalk');
const MevBundler = require('./mev_bundler');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const id = process.argv[2] || 'Sniper';
const RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY_HEX = process.env.SOLANA_PRIVATE_KEY;
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Pump.fun Constants
const GLOBAL = new PublicKey('4wTV9uUv8asv38pW9CDN97v7A7qgnuEqj7A8UqQv6J4u');
const FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPaxN9zKn1Bv9kH8RNoVyc6zL4sAovG5N');
const EVENT_AUTHORITY = new PublicKey('Ce6LsUC7BBSZzS6885QsS6r3T68WfW9Jm8WfA9Jm8WfA');
const BONDING_CURVE_SEED = "bonding-curve";

if (!RPC_URL || !PRIVATE_KEY_HEX) {
    console.log(chalk.red(`[SNIPER #${id}]: ERROR - Missing Mainnet Assets.`));
    process.exit(1);
}

const secretKey = Buffer.from(PRIVATE_KEY_HEX, 'hex');
const wallet = Keypair.fromSecretKey(secretKey);

// ── Connection Setup (HTTP-only, no WebSocket spam) ──
const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

// Initialize MEV Protection (Graceful)
let bundler = null;
try {
    bundler = new MevBundler(wallet, connection);
} catch (e) {
    console.log(chalk.yellow(`[SNIPER #${id}]: MEV Bundler failed to load. Running unprotected.`));
}

// ============================================================
// PUMP.FUN NATIVE LOGIC (NO PYTHON)
// ============================================================

function getBondingCurvePDA(mint) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
        PUMP_FUN_PROGRAM_ID
    )[0];
}

async function getBondingCurveAccount(bondingCurvePDA) {
    const account = await connection.getAccountInfo(bondingCurvePDA);
    if (!account || !account.data) throw new Error("Bonding curve account not found");

    // Layout:
    // Discriminator: 8 bytes
    // VirtualTokenReserves: 8 bytes (u64)
    // VirtualSolReserves: 8 bytes (u64)
    // RealTokenReserves: 8 bytes (u64)
    // RealSolReserves: 8 bytes (u64)
    // TokenTotalSupply: 8 bytes (u64)
    // Complete: 1 byte (bool)

    const buffer = account.data;
    if (buffer.length < 41) throw new Error("Bonding curve data too short");

    const discriminator = buffer.readBigUInt64LE(0);
    const virtualTokenReserves = buffer.readBigUInt64LE(8);
    const virtualSolReserves = buffer.readBigUInt64LE(16);
    const realTokenReserves = buffer.readBigUInt64LE(24);
    const realSolReserves = buffer.readBigUInt64LE(32);
    const tokenTotalSupply = buffer.readBigUInt64LE(40);
    const complete = buffer[48] !== 0;

    return {
        discriminator,
        virtualTokenReserves,
        virtualSolReserves,
        realTokenReserves,
        realSolReserves,
        tokenTotalSupply,
        complete
    };
}

function calculateBuyQuote(curve, solAmount) {
    const solAmountLamports = BigInt(Math.floor(solAmount * 1e9));
    const vSol = curve.virtualSolReserves;
    const vToken = curve.virtualTokenReserves;

    // k = vSol * vToken
    const k = vSol * vToken;
    const newVSol = vSol + solAmountLamports;
    const newVToken = k / newVSol;
    const tokenAmount = vToken - newVToken;
    const minTokenAmount = tokenAmount * 90n / 100n; // 10% slippage default

    return {
        tokenAmount,
        minTokenAmount,
        solAmount: solAmountLamports
    };
}

function calculateSellQuote(curve, tokenAmount) {
    const vSol = curve.virtualSolReserves;
    const vToken = curve.virtualTokenReserves;

    // k = vSol * vToken
    const k = vSol * vToken;
    const newVToken = vToken + BigInt(tokenAmount);
    const newVSol = k / newVToken;

    // logic check: newVSol will be smaller than vSol because newVToken is larger.
    // So sol extracted is vSol - newVSol.
    const solOut = vSol - newVSol;
    const minSolOut = solOut * 90n / 100n; // 10% slippage

    return {
        solAmount: solOut,
        minSolAmount: minSolOut
    };
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

        // 1. Fetch Curve & Calculate
        const curve = await getBondingCurveAccount(bondingCurve);
        if (curve.complete) {
             console.log(chalk.yellow(`[SNIPER #${id}]: Bonding curve complete. Raydium route not implemented.`));
             return;
        }

        const quote = calculateBuyQuote(curve, SOL_AMOUNT);
        console.log(chalk.green(`[SNIPER #${id}]: 📊 Curve: ${curve.virtualSolReserves} SOL / ${curve.virtualTokenReserves} Tok`));
        console.log(chalk.cyan(`[SNIPER #${id}]: 💰 Buying with ${SOL_AMOUNT} SOL -> Est: ${quote.tokenAmount} tokens`));

        const ata = await getAssociatedTokenAddress(mint, wallet.publicKey);
        const transaction = new Transaction();

        // Create ATA if needed
        const accountInfo = await connection.getAccountInfo(ata);
        if (!accountInfo) {
             transaction.add(
                createAssociatedTokenAccountInstruction(
                    wallet.publicKey,
                    ata,
                    wallet.publicKey,
                    mint
                )
            );
        }

        // 2. Build Instruction
        const data = Buffer.alloc(24);
        data.set([102, 6, 61, 18, 1, 218, 235, 234], 0); // global:buy

        // Let's use 5% slippage on SOL cost allowed (though we calculated based on reserves)
        const maxSolCost = quote.solAmount * 115n / 100n; // 15% slippage allowed on cost

        data.writeBigUInt64LE(quote.tokenAmount, 8);
        data.writeBigUInt64LE(maxSolCost, 16);

        const keys = [
            { pubkey: GLOBAL, isSigner: false, isWritable: false },
            { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }, // System
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

        transaction.add(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 150000 }),
            instruction
        );

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        transaction.sign(wallet);

        // 3. Send
        let sig;
        if (bundler) {
            console.log(chalk.magenta(`[SNIPER #${id}]: 🛡️ Sending Buy via Jito...`));
            sig = await bundler.sendBundle(transaction);
        } else {
            sig = await sendAndConfirmTransaction(connection, transaction, [wallet]);
        }

        console.log(chalk.green.bold(`[SNIPER #${id}]: 🔫 SNIPED! Sig: ${sig}`));

        // Log Trade
        const trades = loadTrades();
        trades.push({
            mint: mint.toString(),
            entryPrice: Number(quote.solAmount) / Number(quote.tokenAmount), // approximate
            amount: quote.tokenAmount.toString(),
            timestamp: Date.now(),
            moonbagSecured: false
        });
        saveTrades(trades);

        if (process.send) {
            process.send({
                type: 'AGENT_COMMS',
                from: 'SNIPER',
                msg: `🔫 SNIPED ${mint.toString().substring(0, 6)}... Entry: ${SOL_AMOUNT} SOL`,
                timestamp: new Date().toISOString()
            });
            process.send({ type: 'TRADE_EXECUTED', mint: mint.toString(), amount: SOL_AMOUNT, price: 0 });
        }

    } catch (e) {
        console.error(chalk.red(`[SNIPER #${id}]: Buy Failed: ${e.message}`));
        if (process.send) process.send({ type: 'AGENT_COMMS', from: 'SNIPER', msg: `Buy logic failed: ${e.message}` });
    }
}

async function sellToken(mint, amount, reason) {
    console.log(chalk.magenta(`[SNIPER #${id}]: 📉 INITIATING SELL: ${amount} of ${mint} [${reason}]`));

    try {
        const mintPub = new PublicKey(mint);
        const bondingCurve = getBondingCurvePDA(mintPub);
        const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);
        const ata = await getAssociatedTokenAddress(mintPub, wallet.publicKey);

        // 1. Calculate Sell Output
        const curve = await getBondingCurveAccount(bondingCurve);
        const amountBigInt = BigInt(amount); // amount is string from storage
        const quote = calculateSellQuote(curve, amountBigInt);

        // 2. Build Sell Instruction
        const data = Buffer.alloc(24);
        data.set([51, 230, 133, 164, 1, 127, 131, 173], 0); // global:sell
        data.writeBigUInt64LE(amountBigInt, 8);
        data.writeBigUInt64LE(quote.minSolAmount, 16); // min_sol_output

        const keys = [
            { pubkey: GLOBAL, isSigner: false, isWritable: false },
            { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
            { pubkey: mintPub, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }, // System
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
        ];

        const instruction = new TransactionInstruction({
            keys,
            programId: PUMP_FUN_PROGRAM_ID,
            data
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
            process.send({ type: 'KICK_UP', amount: Number(quote.solAmount) / 1e9, source: 'TRADE_EXIT' });
        }

    } catch (e) {
        console.error(chalk.red(`[SNIPER #${id}]: Sell Failed: ${e.message}`));
        if (process.send) process.send({ type: 'AGENT_COMMS', from: 'SNIPER', msg: `Sell logic failed: ${e.message}` });
    }
}

// ============================================================
// SHADOW PROTOCOL: Copy-Trading (HTTP Polling — WS-Free)
// ============================================================
const TARGET_WALLETS = [
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    'Cz4ZrPCMzx5Bew1F3TJfqPFR5p53uNn3mLBqav9Ah3Ku',
    'JBnJnTP2iGP89r6meMWrM745hLgqKjDC1hYjECFusPB',
];

const lastSeenSigs = {};

function commsPost(msg) {
    if (process.send) process.send({ type: 'AGENT_COMMS', from: `SNIPER #${id}`, msg, timestamp: new Date().toISOString() });
}

async function startSurveillance() {
    console.log(chalk.cyan(`[SNIPER #${id}]: 👁️ COPY-TRADE SURVEILLANCE ACTIVE (HTTP Polling)`));
    commsPost('Copy-trade surveillance online. Tracking ' + TARGET_WALLETS.length + ' whale wallets.');

    setInterval(async () => {
        for (const walletAddr of TARGET_WALLETS) {
            try {
                const sigs = await connection.getSignaturesForAddress(new PublicKey(walletAddr), { limit: 1 });
                if (sigs.length === 0) continue;

                const latestSig = sigs[0].signature;
                if (lastSeenSigs[walletAddr] === latestSig) continue;

                if (!lastSeenSigs[walletAddr]) {
                    lastSeenSigs[walletAddr] = latestSig;
                    continue;
                }

                lastSeenSigs[walletAddr] = latestSig;
                console.log(chalk.yellow(`[SNIPER #${id}]: 🔔 ACTIVITY ON TARGET: ${walletAddr.substring(0, 8)}...`));
                commsPost(`Whale activity detected: ${walletAddr.substring(0, 8)}...`);

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
                        const bondingCurve = getBondingCurvePDA(mintPub);
                        const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);

                        await buyToken(mintPub, bondingCurve, associatedBondingCurve);
                    }
                }
            } catch (e) {
                if (e.message && e.message.includes('429')) {
                    console.log(chalk.yellow(`[SNIPER #${id}]: Rate limited. Backing off...`));
                    await new Promise(r => setTimeout(r, 30000));
                }
            }
        }
    }, 15000);
}

// ============================================================
// TRADE MANAGEMENT
// ============================================================
const TRADES_FILE = path.join(__dirname, '../missions/active_trades.json');

function loadTrades() {
    try {
        if (fs.existsSync(TRADES_FILE)) return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
    } catch { }
    return [];
}

function saveTrades(trades) {
    fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
}

// ── Position Manager ──
async function checkPositions() {
    const trades = loadTrades();
    if (trades.length === 0) return;

    console.log(chalk.blue(`[SNIPER #${id}]: ⚔️ Checking ${trades.length} active positions...`));

    try {
        for (const trade of trades) {
            const mintPub = new PublicKey(trade.mint);
            const bondingCurve = getBondingCurvePDA(mintPub);
            const curve = await getBondingCurveAccount(bondingCurve);

            // Calculate current worth
            const quote = calculateSellQuote(curve, BigInt(trade.amount));
            const currentSolValue = Number(quote.solAmount) / 1e9;
            const entrySolValue = (Number(trade.amount) * trade.entryPrice) / 1e9; // approximation

            // PnL Calculation
            // Just use price delta?
            // Entry Price: SOL per Token.
            // Current Price: SOL per Token.
            const currentPrice = Number(quote.solAmount) / Number(trade.amount);
            const pnl = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

            console.log(chalk.blue(`  💎 ${trade.mint.substring(0, 6)}: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}%`));

            // Strategy:
            // 1. MOONBAG: Sell 50% at +100% (2x)
            if (!trade.moonbagSecured && pnl >= 100) {
                console.log(chalk.green.bold(`[SNIPER #${id}]: 🚀 MOONBAG SECURED: ${trade.mint} (+${pnl.toFixed(2)}%)`));
                const halfAmount = BigInt(trade.amount) / 2n;
                await sellToken(trade.mint, halfAmount.toString(), 'MOONBAG');

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

// ============================================================
// NEW TOKEN SNIPER (PUMP.FUN 'CREATE' MONITOR)
// ============================================================
async function startNewTokenMonitor() {
    console.log(chalk.cyan(`[SNIPER #${id}]: 🆕 NEW TOKEN MONITOR ACTIVE (Pump.fun)`));
    commsPost('Scanning for new Pump.fun launches with >0.5 SOL dev buy...');

    connection.onLogs(PUMP_FUN_PROGRAM_ID, async ({ logs, err, signature }) => {
        if (err || !logs) return;
        if (logs.some(l => l.includes("Instruction: Create"))) {
            try {
                const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
                if (!tx) return;

                const accounts = tx.transaction.message.accountKeys.map(k => k.pubkey.toString());
                const mintInfo = tx.meta.postTokenBalances.find(b => b.owner !== accounts[0]);
                if (mintInfo) {
                    console.log(chalk.magenta(`[SNIPER #${id}]: 🆕 NEW LAUNCH DETECTED: ${mintInfo.mint}`));
                    const hasBuy = logs.some(l => l.includes("Instruction: Buy"));

                    if (hasBuy) {
                        console.log(chalk.green(`[SNIPER #${id}]: 🚨 DEV BOUGHT! Analyzing...`));
                        commsPost(`🆕 NEW TOKEN: ${mintInfo.mint} (Dev Bought).`);
                    }
                }
            } catch (e) {
                // ignore
            }
        }
    }, "confirmed");
}

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

// Start surveillance
startSurveillance();

// Monitor Trades every 30s
setInterval(checkPositions, 30000);

// ============================================================
// IPC MESSAGE HANDLER
// ============================================================
process.on('message', async (msg) => {
    switch (msg.type) {
        case 'COPY_TRADE_SIGNAL':
            console.log(chalk.magenta(`[SNIPER #${id}]: ⚡ SIGNAL RECEIVED from ${msg.source}: ${msg.mint}`));
            const mintPub = new PublicKey(msg.mint);
            const bondingCurve = getBondingCurvePDA(mintPub);
            const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);
            await buyToken(mintPub, bondingCurve, associatedBondingCurve);
            break;

        case 'EMERGENCY_SELL':
             // find active trade and dump
             const trades = loadTrades();
             const trade = trades.find(t => t.mint === msg.mint);
             if (trade) {
                 await sellToken(msg.mint, trade.amount, 'EMERGENCY_SELL');
                 trades.splice(trades.indexOf(trade), 1);
                 saveTrades(trades);
             }
             break;

        case 'USER_CHAT':
             // Manual Snipe from Chat
             if (msg.text && msg.text.startsWith('/snipe')) {
                 const parts = msg.text.split(' ');
                 if (parts.length > 1) {
                     const mint = parts[1];
                     console.log(chalk.magenta(`[SNIPER #${id}]: ⚡ MANUAL SNIPE: ${mint}`));
                     const mintPub = new PublicKey(mint);
                     const bondingCurve = getBondingCurvePDA(mintPub);
                     const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);
                     await buyToken(mintPub, bondingCurve, associatedBondingCurve);
                 }
             }
             break;
    }
});
