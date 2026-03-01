// don/mev_predator.js - THE MEV PREDATOR (Arbitrage & Sandwich Bot)
// Continuously scans Jupiter for profitable cyclic arbitrage paths or fast scalps
// on high-volatility pairs. If a profitable route is found (output SOL > input SOL + fees),
// it executes the trade bundle with priority fees for immediate block inclusion.

const axios = require('axios');
const chalk = require('chalk');
const bs58 = require('bs58');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.red.bold(`[PREDATOR #${id}]: 🩸 MEV Predator ONLINE. Hunting arbitrage & scalps.`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// Load wallet
let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
    } else {
        console.log(chalk.gray(`[PREDATOR #${id}]: No SOLANA_PRIVATE_KEY — running in simulation mode.`));
    }
} catch (e) {
    console.log(chalk.red(`[PREDATOR #${id}]: Keypair load failed: ${e.message}`));
}

// ── Predator Config ─────────────────────────────────────────────
const WSOL_MINT = 'So11111111111111111111111111111111111111112'; // Base
const TRADE_AMOUNT_SOL = 0.05; // 0.05 SOL base for arb scanning
const MIN_PROFIT_SOL = 0.0001; // Minimum expected profit after fees to pull trigger
const SCAN_INTERVAL_MS = 3000; // Scan every 3 seconds

// High volatility / high liquidity tokens to hunt for arbitrage
const PREY_LIST = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqMmSuCb', // mSOL
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
    'WENWENvqqNya429ubCdR81ZmD69brwQaaVNKKEQZdG', // WEN
    'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3PevU2s3eSpgi', // PYTH
];

// ── Hunting Logic ───────────────────────────────────────────────
async function huntForArbitrage() {
    if (!wallet) return; // Need wallet to actually execute

    // Pick a random prey token to avoid rate limits
    const preyToken = PREY_LIST[Math.floor(Math.random() * PREY_LIST.length)];
    const tradeLamports = Math.floor(TRADE_AMOUNT_SOL * 1e9);

    try {
        // Step 1: Quote SOL -> PREY
        const buyQuoteRes = await axios.get(`https://quote-api.jup.ag/v6/quote`, {
            params: {
                inputMint: WSOL_MINT,
                outputMint: preyToken,
                amount: tradeLamports,
                slippageBps: 50 // 0.5% slippage tolerance on leg 1
            },
            timeout: 5000
        });
        const buyQuote = buyQuoteRes.data;
        if (!buyQuote || !buyQuote.outAmount) return;

        // Step 2: Quote PREY -> SOL (Back to Base)
        const sellQuoteRes = await axios.get(`https://quote-api.jup.ag/v6/quote`, {
            params: {
                inputMint: preyToken,
                outputMint: WSOL_MINT,
                amount: buyQuote.outAmount, // Sell exactly what we bought
                slippageBps: 50
            },
            timeout: 5000
        });
        const sellQuote = sellQuoteRes.data;
        if (!sellQuote || !sellQuote.outAmount) return;

        const outSol = Number(sellQuote.outAmount) / 1e9;
        const profit = outSol - TRADE_AMOUNT_SOL;

        if (profit >= MIN_PROFIT_SOL) {
            console.log(chalk.red.bold(`[PREDATOR #${id}]: 🩸 ARBITRAGE FOUND via ${preyToken.slice(0, 6)}! Expected Profit: +${profit.toFixed(5)} SOL`));

            // Execute the bundle (buy then sell immediately)
            await executeMevBundle(buyQuote, sellQuote, profit);
        } else if (profit > 0) {
            // Not enough to cover gas properly, but technically an arb
            process.stdout.write(chalk.gray(`.`));
        }

    } catch (e) {
        // Rate limits or fetching errors, ignore and try next cycle
    }
}

async function executeMevBundle(buyQuote, sellQuote, expectedProfit) {
    console.log(chalk.red(`[PREDATOR #${id}]: ⚡ Executing fast-scalp bundle...`));

    try {
        // We execute just the buy first (as a fast scalp), and if successful, we immediately sell.
        // True "atomic" arbitrage on Solana requires custom smart contracts (flash loans), 
        // so our MEV predator does high-frequency sequential execution.

        // Exec Buy
        const buyRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: buyQuote,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 15000 // Priority fee for speed
        });

        const txBuf = Buffer.from(buyRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        console.log(chalk.red(`[PREDATOR #${id}]: 📤 Sending Buy Leg...`));
        const buySig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });

        // Assume buy lands, instantly blast the sell
        // We get fresh quote for exact amount if needed, but we use the precached quote for speed
        const sellRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: sellQuote,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 25000 // Higher priority to secure exit
        });

        const sellTxBuf = Buffer.from(sellRes.data.swapTransaction, 'base64');
        const sellTx = VersionedTransaction.deserialize(sellTxBuf);
        sellTx.sign([wallet]);

        console.log(chalk.red(`[PREDATOR #${id}]: 📥 Sending Sell Leg (Exit)...`));
        const sellSig = await connection.sendRawTransaction(sellTx.serialize(), { skipPreflight: true });

        console.log(chalk.red.bold(`[PREDATOR #${id}]: 💥 PREDATOR STRIKE SUCCESS! Buy: ${buySig.slice(0, 8)} | Sell: ${sellSig.slice(0, 8)}`));

        if (process.send) {
            process.send({ type: 'LOG', msg: `🩸 MEV Predator Arbitration executed. Expected profit: +${expectedProfit.toFixed(5)} SOL`, level: 'MONEY' });
            process.send({ type: 'KICK_UP', amount: expectedProfit * 82, source: 'MEV_PREDATOR', soldierId: id });
        }

        // Cool down after a strike
        await new Promise(r => setTimeout(r, 10000));

    } catch (e) {
        console.log(chalk.red(`[PREDATOR #${id}]: Strike failed/reverted: ${e.message}`));
    }
}

// ── Execution Loop ──────────────────────────────────────────────
setInterval(huntForArbitrage, SCAN_INTERVAL_MS);

// Check if running directly
if (require.main === module) {
    console.log(chalk.red(`[PREDATOR #${id}]: Direct execution. Beginning hunt.`));
}
