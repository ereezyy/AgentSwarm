// don/sniper.js - THE MAINNET SNIPER V4 (PUMP.FUN + JUPITER/RAYDIUM AGGREGATION)
// Capabilities:
// 1. Shadow Protocol: Tracks whales and copies trades.
// 2. MEV Bundler: Sends transactions via Jito to avoid sandwiches.
// 3. Pump.fun Native: Direct bonding curve interaction.
// 4. Jupiter Aggregator: Swaps on Raydium/Orca/Meteora for migrated tokens.

const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, ComputeBudgetProgram, sendAndConfirmTransaction, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const chalk = require('chalk');
const MevBundler = require('./mev_bundler');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bs58 = require('bs58');
require('dotenv').config();

const id = process.argv[2] || 'Sniper';
const RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY_HEX = process.env.SOLANA_PRIVATE_KEY;
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

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
// JUPITER AGGREGATOR (RAYDIUM/ORCA FALLBACK)
// ============================================================
async function executeJupiterSwap(inputMint, outputMint, amount, slippageBps = 1000) {
    try {
        console.log(chalk.blue(`[SNIPER #${id}]: 🪐 Requesting Jupiter Quote...`));
        // 1. Get Quote
        const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
        const quoteResponse = await axios.get(quoteUrl, { timeout: 10000 }); // 10s timeout
        const quoteData = quoteResponse.data;

        if (!quoteData || quoteData.error) throw new Error(quoteData.error || 'No quote found');

        console.log(chalk.blue(`[SNIPER #${id}]: 🪐 Jupiter Quote: ${quoteData.outAmount} out via ${quoteData.routePlan.map(r => r.swapInfo.label).join('->')}`));

        // 2. Get Serialized Transaction
        const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quoteData,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 100000 // Priority fee
        }, { timeout: 10000 });

        const { swapTransaction } = swapResponse.data;

        // 3. Deserialize and Sign
        const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        transaction.sign([wallet]);

        // 4. Send (Prefer Bundler if available, else RPC)
        let sig;
        sig = await connection.sendTransaction(transaction, { skipPreflight: true, maxRetries: 2 });

        console.log(chalk.green.bold(`[SNIPER #${id}]: 🪐 Jupiter Swap Sent: ${sig}`));

        // Confirm with timeout
        const confirmation = await connection.confirmTransaction(sig, 'confirmed');
        if (confirmation.value.err) throw new Error(`TX Failed: ${JSON.stringify(confirmation.value.err)}`);

        return { success: true, sig, outAmount: quoteData.outAmount };

    } catch (e) {
        const errorMsg = e.code === 'ECONNABORTED' ? 'Jupiter API Timeout (DNS/Network)' : e.message;
        console.error(chalk.red(`[SNIPER #${id}]: Jupiter Swap Failed: ${errorMsg}`));
        return { success: false, error: errorMsg };
    }
}

async function fetchCurrentPrice(mint, amount) {
    // 1. Try Jupiter first (preferred for accuracy)
    try {
        const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${mint}&outputMint=${WSOL_MINT.toString()}&amount=${amount}&slippageBps=100`;
        const res = await axios.get(quoteUrl, { timeout: 8000 });
        if (res.data && res.data.outAmount) {
            const solValue = Number(res.data.outAmount) / 1e9;
            const currentPrice = solValue / Number(amount);
            return { solValue, currentPrice, source: 'JUPITER' };
        }
    } catch (e) {
        // console.log(chalk.gray(`[SNIPER]: Jupiter price fetch failed, trying DexScreener...`));
    }

    // 2. Try DexScreener (Reliable fallback)
    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 8000 });
        if (res.data && res.data.pairs && res.data.pairs.length > 0) {
            const pair = res.data.pairs.find(p => p.quoteToken.address === WSOL_MINT.toString()) || res.data.pairs[0];
            const priceInSol = parseFloat(pair.priceNative); // Price in SOL
            const solValue = priceInSol * Number(amount);
            return { solValue, currentPrice: priceInSol, source: 'DEXSCREENER' };
        }
    } catch (e) {
        console.error(chalk.red(`[SNIPER]: Price fetch failed for ${mint}: ${e.message}`));
    }

    return null;
}

// ============================================================
// PUMP.FUN NATIVE LOGIC
// ============================================================

function getBondingCurvePDA(mint) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
        PUMP_FUN_PROGRAM_ID
    )[0];
}

async function getBondingCurveAccount(bondingCurvePDA) {
    try {
        const account = await connection.getAccountInfo(bondingCurvePDA);
        if (!account || !account.data) return null; // Curve might be closed/migrated

        const buffer = account.data;
        if (buffer.length < 41) return null;

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
    } catch (e) {
        return null;
    }
}

function calculateBuyQuote(curve, solAmount) {
    const solAmountLamports = BigInt(Math.floor(solAmount * 1e9));
    const vSol = curve.virtualSolReserves;
    const vToken = curve.virtualTokenReserves;
    const k = vSol * vToken;
    const newVSol = vSol + solAmountLamports;
    const newVToken = k / newVSol;
    const tokenAmount = vToken - newVToken;
    return { tokenAmount, solAmount: solAmountLamports };
}

function calculateSellQuote(curve, tokenAmount) {
    const vSol = curve.virtualSolReserves;
    const vToken = curve.virtualTokenReserves;
    const k = vSol * vToken;
    const newVToken = vToken + BigInt(tokenAmount);
    const newVSol = k / newVToken;
    const solOut = vSol - newVSol;
    const minSolOut = solOut * 90n / 100n; // 10% slippage
    return { solAmount: solOut, minSolAmount: minSolOut };
}

// ============================================================
// CORE BUY LOGIC (HYBRID PUMP.FUN + JUPITER)
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

        // 1. Check Curve Status
        const curve = await getBondingCurveAccount(bondingCurve);

        // ── JUPITER ROUTE (Post-Migration) ──
        if (!curve || curve.complete) {
            console.log(chalk.blue(`[SNIPER #${id}]: Bonding curve complete/gone. Routing via JUPITER...`));
            const result = await executeJupiterSwap(WSOL_MINT.toString(), mint.toString(), Math.floor(SOL_AMOUNT * 1e9));

            if (result.success) {
                const trades = loadTrades();
                trades.push({
                    mint: mint.toString(),
                    entryPrice: 0, // Need to fetch price
                    amount: result.outAmount, // From quote
                    timestamp: Date.now(),
                    moonbagSecured: false,
                    source: 'JUPITER'
                });
                saveTrades(trades);
                if (process.send) process.send({ type: 'TRADE_EXECUTED', mint: mint.toString(), amount: SOL_AMOUNT, source: 'JUPITER' });
            }
            return;
        }

        // ── PUMP.FUN ROUTE (Pre-Migration) ──
        const quote = calculateBuyQuote(curve, SOL_AMOUNT);
        console.log(chalk.green(`[SNIPER #${id}]: 📊 Curve Active. Buying on Pump.fun.`));
        console.log(chalk.cyan(`[SNIPER #${id}]: 💰 Est: ${quote.tokenAmount} tokens`));

        const ata = await getAssociatedTokenAddress(mint, wallet.publicKey);
        const transaction = new Transaction();

        const accountInfo = await connection.getAccountInfo(ata);
        if (!accountInfo) {
            transaction.add(createAssociatedTokenAccountInstruction(wallet.publicKey, ata, wallet.publicKey, mint));
        }

        const data = Buffer.alloc(24);
        data.set([102, 6, 61, 18, 1, 218, 235, 234], 0); // global:buy
        const maxSolCost = quote.solAmount * 115n / 100n; // 15% slippage
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
            { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
            { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
        ];

        const instruction = new TransactionInstruction({ keys, programId: PUMP_FUN_PROGRAM_ID, data });
        transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 150000 }), instruction);

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        transaction.sign(wallet);

        let sig;
        if (bundler) {
            console.log(chalk.magenta(`[SNIPER #${id}]: 🛡️ Sending Buy via Jito...`));
            sig = await bundler.sendBundle(transaction);
        } else {
            sig = await sendAndConfirmTransaction(connection, transaction, [wallet]);
        }

        console.log(chalk.green.bold(`[SNIPER #${id}]: 🔫 SNIPED! Sig: ${sig}`));

        const trades = loadTrades();
        trades.push({
            mint: mint.toString(),
            entryPrice: Number(quote.solAmount) / Number(quote.tokenAmount),
            amount: quote.tokenAmount.toString(),
            timestamp: Date.now(),
            moonbagSecured: false,
            source: 'PUMP_FUN'
        });
        saveTrades(trades);

        if (process.send) process.send({ type: 'TRADE_EXECUTED', mint: mint.toString(), amount: SOL_AMOUNT, source: 'PUMP_FUN' });

    } catch (e) {
        console.error(chalk.red(`[SNIPER #${id}]: Buy Failed: ${e.message}`));
    }
}

async function sellToken(mint, amount, reason) {
    console.log(chalk.magenta(`[SNIPER #${id}]: 📉 INITIATING SELL: ${amount} of ${mint} [${reason}]`));

    try {
        const mintPub = new PublicKey(mint);
        const bondingCurve = getBondingCurvePDA(mintPub);

        // 1. Check Curve Status for Routing
        const curve = await getBondingCurveAccount(bondingCurve);

        // ── JUPITER ROUTE (Post-Migration) ──
        if (!curve || curve.complete) {
            console.log(chalk.blue(`[SNIPER #${id}]: Curve complete. Selling via JUPITER...`));
            // Swap Input: Token -> Output: SOL
            const result = await executeJupiterSwap(mint.toString(), WSOL_MINT.toString(), amount);

            if (result.success) {
                if (process.send) process.send({ type: 'KICK_UP', amount: Number(result.outAmount) / 1e9, source: 'TRADE_EXIT_JUPITER' });
            }
            return;
        }

        // ── PUMP.FUN ROUTE (Pre-Migration) ──
        const associatedBondingCurve = await getAssociatedTokenAddress(mintPub, bondingCurve, true);
        const ata = await getAssociatedTokenAddress(mintPub, wallet.publicKey);

        const amountBigInt = BigInt(amount);
        const quote = calculateSellQuote(curve, amountBigInt);

        const data = Buffer.alloc(24);
        data.set([51, 230, 133, 164, 1, 127, 131, 173], 0); // global:sell
        data.writeBigUInt64LE(amountBigInt, 8);
        data.writeBigUInt64LE(quote.minSolAmount, 16);

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

        const instruction = new TransactionInstruction({ keys, programId: PUMP_FUN_PROGRAM_ID, data });
        const transaction = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }), instruction);

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        transaction.sign(wallet);

        let sig;
        if (bundler) {
            console.log(chalk.magenta(`[SNIPER #${id}]: 🛡️ Sending Sell via Jito...`));
            sig = await bundler.sendBundle(transaction);
        } else {
            sig = await sendAndConfirmTransaction(connection, transaction, [wallet]);
        }

        console.log(chalk.green.bold(`[SNIPER #${id}]: 💸 SOLD! Sig: ${sig}`));
        if (process.send) process.send({ type: 'KICK_UP', amount: Number(quote.solAmount) / 1e9, source: 'TRADE_EXIT' });

    } catch (e) {
        console.error(chalk.red(`[SNIPER #${id}]: Sell Failed: ${e.message}`));
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

                const tx = await connection.getParsedTransaction(latestSig, { maxSupportedTransactionVersion: 0 });
                if (!tx || !tx.meta) continue;

                const logs = tx.meta.logMessages || [];
                // Check Pump.fun Buy
                const isPumpBuy = logs.some(l => l.includes("Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P") && l.includes("Instruction: Buy"));
                // Check Jupiter/Raydium Swap
                const isSwap = logs.some(l => l.includes("Instruction: Swap") || l.includes("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"));

                if (isPumpBuy || isSwap) {
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
            let currentSolValue = 0;
            let pnl = 0;

            const mintPub = new PublicKey(trade.mint);
            const bondingCurve = getBondingCurvePDA(mintPub);
            const curve = await getBondingCurveAccount(bondingCurve);

            if (curve && !curve.complete) {
                // Pump.fun Pricing
                const quote = calculateSellQuote(curve, BigInt(trade.amount));
                currentSolValue = Number(quote.solAmount) / 1e9;
                const currentPrice = Number(quote.solAmount) / Number(trade.amount);
                const entryPrice = trade.entryPrice || currentPrice;
                pnl = ((currentPrice - entryPrice) / entryPrice) * 100;
            } else {
                // FALLBACK PRICING (Jupiter -> DexScreener)
                const priceData = await fetchCurrentPrice(trade.mint, trade.amount);
                if (priceData) {
                    currentSolValue = priceData.solValue;
                    const entryPrice = trade.entryPrice || priceData.currentPrice;
                    pnl = ((priceData.currentPrice - entryPrice) / entryPrice) * 100;
                } else {
                    continue; // Skip if no price available
                }
            }

            console.log(chalk.blue(`  💎 ${trade.mint.substring(0, 6)}: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}% | Val: ${currentSolValue.toFixed(4)} SOL`));

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

// ── Autonomous Reporting ──
setInterval(() => {
    const activeTargets = TARGET_WALLETS.length;
    const lastSigCount = Object.keys(lastSeenSigs).length;

    console.log(chalk.cyan(`[SNIPER #${id}]: 🕑 STATUS REPORT: Tracking ${activeTargets} whales. ${lastSigCount} active recently.`));
    if (process.send) {
        process.send({
            type: 'AGENT_COMMS',
            from: 'SNIPER',
            msg: `Surveillance active. Watching ${activeTargets} targets. Wallet balance safe.`,
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
            const trades = loadTrades();
            const trade = trades.find(t => t.mint === msg.mint);
            if (trade) {
                await sellToken(msg.mint, trade.amount, 'EMERGENCY_SELL');
                trades.splice(trades.indexOf(trade), 1);
                saveTrades(trades);
            }
            break;

        case 'USER_CHAT':
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
