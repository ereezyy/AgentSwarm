// don/peg_sniper.js - THE PEG ARBITRAGEUR (LST De-Peg Sniper)
// Monitors Liquid Staking Tokens (LSTs) like JitoSOL, mSOL, bSOL.
// LSTs mathematically accrue value against SOL, so 1 LST should always be > 1 SOL.
// During flash crashes, LSTs can "de-peg" below 1 SOL. This bot snipes them at a discount.

const axios = require('axios');
const chalk = require('chalk');
const bs58 = require('bs58');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.blue.bold(`[PEG SNIPER #${id}]: ⚓ Anchor Watch ONLINE. Scanning for LST de-pegs.`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
    } else {
        console.log(chalk.gray(`[PEG SNIPER #${id}]: No SOLANA_PRIVATE_KEY — running in simulation mode.`));
    }
} catch (e) {
    console.log(chalk.red(`[PEG SNIPER #${id}]: Keypair load failed: ${e.message}`));
}

// ── Peg Sniper Config ───────────────────────────────────────────────
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const LST_TARGETS = {
    'J1toso1uKz3jpeGz6gqB3V286zU71zT5oEZbX1A1XF': 'JitoSOL',
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqMmSuCb': 'mSOL',
    'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': 'bSOL',
    '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm': 'INF',
};

// If 1 LST costs LESS than this amount of SOL, we buy it.
// e.g. 0.995 means we get the LST at less than 1 SOL, which is an instant structural arb.
const DISCOUNT_THRESHOLD_SOL = 0.995;
const SNIPE_AMOUNT_SOL = 1.0; // Amount of SOL to deploy per snipe

const SCAN_INTERVAL_MS = 5000; // Scan every 5 seconds
let activeSnipes = {}; // Prevent double-sniping the same event

// ── Execution Core ──────────────────────────────────────────────────
async function scanPegs() {
    if (!wallet) return;

    try {
        const targetMints = Object.keys(LST_TARGETS).join(',');
        // Fetch the price of each LST, denominated in WSOL
        const res = await axios.get(`https://api.jup.ag/price/v2?ids=${targetMints}&vsToken=${WSOL_MINT}`);
        const prices = res.data.data;

        for (const [mint, data] of Object.entries(prices)) {
            if (!data || !data.price) continue;

            const priceInSol = parseFloat(data.price);
            const symbol = LST_TARGETS[mint] || mint.slice(0, 6);

            // Log status every ~30 seconds (1 in 6 intervals)
            if (Date.now() % 30000 < SCAN_INTERVAL_MS) {
                console.log(chalk.gray(`[PEG SNIPER #${id}]: Parity Watch → 1 ${symbol} = ${priceInSol.toFixed(4)} SOL`));
            }

            if (priceInSol <= DISCOUNT_THRESHOLD_SOL) {
                if (!activeSnipes[mint] || Date.now() - activeSnipes[mint] > 60000) {
                    activeSnipes[mint] = Date.now(); // Lock

                    const discountPct = ((1 - priceInSol) * 100).toFixed(2);
                    console.log(chalk.blue.bold(`[PEG SNIPER #${id}]: 🚨 DE-PEG DETECTED! 1 ${symbol} costs ${priceInSol.toFixed(4)} SOL (-${discountPct}% discount)`));

                    await executeSnipe(mint, symbol, priceInSol);
                }
            }
        }
    } catch (e) {
        // Silent API errors
    }
}

async function executeSnipe(targetMint, symbol, currentPriceInSol) {
    try {
        const amountLamports = Math.floor(SNIPE_AMOUNT_SOL * 1e9);

        const qRes = await axios.get(`https://quote-api.jup.ag/v6/quote`, {
            params: {
                inputMint: WSOL_MINT,
                outputMint: targetMint,
                amount: amountLamports,
                slippageBps: 200 // 2% slippage because flash crashes move fast
            },
            timeout: 5000
        });

        if (!qRes.data) return false;

        const swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: qRes.data,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 1500000 // Very high priority fee to catch the knife
        });

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        console.log(chalk.blue.bold(`[PEG SNIPER #${id}]: ⚓ PEG SECURED! Swap TX: ${sig}`));

        if (process.send) {
            process.send({
                type: 'LOG',
                msg: `⚓ Peg Arbitrageur: Sniped ${SNIPE_AMOUNT_SOL} SOL worth of ${symbol} at a structural discount (${currentPriceInSol.toFixed(4)} SOL/token).`,
                level: 'MONEY'
            });
        }
    } catch (e) {
        console.log(chalk.red(`[PEG SNIPER #${id}]: Snipe execution failed: ${e.message}`));
    }
}

setInterval(scanPegs, SCAN_INTERVAL_MS);

if (require.main === module) {
    console.log(chalk.blue(`[PEG SNIPER #${id}]: Direct execution. Anchors aweigh...`));
    scanPegs();
}
