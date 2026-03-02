// don/airdrop_farmer.js - THE SYBIL (Auto-Airdrop Farmer)
// Farms future airdrops by generating organic-looking on-chain volume.
// Swaps SOL ↔ LSTs (Liquid Staking Tokens) to farm Sanctum, Jito, and Jupiter drops.
// Holds positions for random intervals to simulate real human DeFi behavior.

const axios = require('axios');
const chalk = require('chalk');
const bs58 = require('bs58');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.magenta.bold(`[SYBIL #${id}]: 🧬 Airdrop Farmer ONLINE. Building organic footprint.`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        const keyStr = process.env.SOLANA_PRIVATE_KEY;
        const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
        wallet = Keypair.fromSecretKey(keyBytes);
    } else {
        console.log(chalk.gray(`[SYBIL #${id}]: No SOLANA_PRIVATE_KEY — running in simulation mode.`));
    }
} catch (e) {
    console.log(chalk.red(`[SYBIL #${id}]: Keypair load failed: ${e.message}`));
}

// ── Farm Config ─────────────────────────────────────────────
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const MIN_RESERVE_SOL = 0.01; // Never dip below this
const FARM_AMOUNT_SOL = 0.005; // Amount to cycle through protocols
const FARM_CYCLE_MS = 45 * 60 * 1000; // Run a farm cycle every 45 minutes

// Target tokens for airdrop farming (LSTs and high-tier DeFi tokens)
const FARM_TARGETS = [
    { mint: 'J1toso1uKFsMXk2B2qE1cEQ47Mndh8N1a9oE6G6eAVS', name: 'JitoSOL' },
    { mint: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm', name: 'INF (Sanctum)' },
    { mint: 'bSo13r4TkiE4KumL71LsHTCGLcb22u4GWHWp6k234Fq', name: 'bSOL (BlazeStake)' },
    { mint: 'vSOLFngEQ82dZeuw8T4K8aX6MktX1G24yYpB2B7mRGE', name: 'vSOL' },
    { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', name: 'USDC (Volume Farm)' }
];

let currentFarmPosition = null;

// ── Farming Logic ───────────────────────────────────────────────
async function runFarmCycle() {
    if (!wallet) return;

    try {
        const bal = await connection.getBalance(wallet.publicKey);
        const solBal = bal / 1e9;

        // If we currently hold a farm position, unwind it (swap back to SOL)
        if (currentFarmPosition) {
            console.log(chalk.magenta(`[SYBIL #${id}]: 🔄 Unwinding farm position: ${currentFarmPosition.name}...`));

            // Get token balance
            const ata = await getAssociatedTokenAddress(new Keypair().publicKey, wallet.publicKey); // fake just to get balance logic if we had it, but we can just use Jupiter to sell exact amount if we track it.
            // For simplicity in farming, we quote the exact amount we bought.

            const sellQuoteRes = await axios.get(`https://quote-api.jup.ag/v6/quote`, {
                params: {
                    inputMint: currentFarmPosition.mint,
                    outputMint: WSOL_MINT,
                    amount: currentFarmPosition.lamportsBought, // sell what we bought
                    slippageBps: 100
                }, timeout: 8000
            });

            if (sellQuoteRes.data && sellQuoteRes.data.outAmount) {
                await executeJupiterSwap(sellQuoteRes.data);
                console.log(chalk.magenta.bold(`[SYBIL #${id}]: ✅ Farm closed. Organic volume generated.`));
                if (process.send) process.send({ type: 'LOG', msg: `🧬 Airdrop Farm: Unwound ${currentFarmPosition.name} position.`, level: 'INFO' });
            }
            currentFarmPosition = null;
            return; // Wait for next cycle to farm a new one
        }

        // If no position, open a new one if we have funds
        if (solBal < MIN_RESERVE_SOL + FARM_AMOUNT_SOL) {
            console.log(chalk.gray(`[SYBIL #${id}]: Insufficient SOL for farm cycle. Need >${(MIN_RESERVE_SOL + FARM_AMOUNT_SOL).toFixed(2)} SOL.`));
            return;
        }

        // Pick a random target
        const target = FARM_TARGETS[Math.floor(Math.random() * FARM_TARGETS.length)];
        const tradeLamports = Math.floor(FARM_AMOUNT_SOL * 1e9);

        console.log(chalk.magenta(`[SYBIL #${id}]: 🚜 Starting farm cycle: Swapping ${FARM_AMOUNT_SOL} SOL into ${target.name}...`));

        const buyQuoteRes = await axios.get(`https://quote-api.jup.ag/v6/quote`, {
            params: {
                inputMint: WSOL_MINT,
                outputMint: target.mint,
                amount: tradeLamports,
                slippageBps: 100
            }, timeout: 8000
        });

        if (buyQuoteRes.data && buyQuoteRes.data.outAmount) {
            const sig = await executeJupiterSwap(buyQuoteRes.data);
            if (sig) {
                currentFarmPosition = {
                    mint: target.mint,
                    name: target.name,
                    lamportsBought: buyQuoteRes.data.outAmount,
                    time: Date.now()
                };
                console.log(chalk.magenta.bold(`[SYBIL #${id}]: ✅ Farm position opened in ${target.name}. Holding for organic footprint.`));
                if (process.send) process.send({ type: 'LOG', msg: `🧬 Airdrop Farm: Deposited into ${target.name} to generate protocol volume.`, level: 'INFO' });
            }
        }

    } catch (e) {
        console.log(chalk.gray(`[SYBIL #${id}]: Farm cycle skipped (API/RPC error): ${e.message}`));
    }
}

async function executeJupiterSwap(quoteData) {
    try {
        const swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quoteData,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 'auto'
        });

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        return sig;
    } catch (e) {
        console.log(chalk.red(`[SYBIL #${id}]: Jup trade failed: ${e.message}`));
        return null;
    }
}

// ── Execution Loop ──────────────────────────────────────────────
// Run a farm cycle periodically
setInterval(runFarmCycle, FARM_CYCLE_MS);

// Check if running directly
if (require.main === module) {
    console.log(chalk.magenta(`[SYBIL #${id}]: Direct execution. Preparing farm...`));
    setTimeout(runFarmCycle, 5000); // Try 5s after start
}
