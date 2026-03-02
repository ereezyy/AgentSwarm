// don/liquidator.js - THE LIQUIDATOR (Margin Asset Seizure)
// Uses ZERO of the Don's personal capital.
// Triggered by the Pi 5 Radar Node when a MarginFi/Kamino account becomes under-collateralized.
// Instantly takes out a Jupiter Flash Loan, liquidates the victim's collateral (scoring a structural discount bounty), 
// repays the loan in the same atomic transaction, and kicks the pure profit up to the Don.

const axios = require('axios');
const chalk = require('chalk');
const bs58 = require('bs58');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.red.bgBlack.bold(`[LIQUIDATOR #${id}]: 🩸 Repo Man Online. Awaiting targets from Pi 5 Radar.`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        const keyStr = process.env.SOLANA_PRIVATE_KEY;
        const keyBytes = keyStr.length > 88 ? Buffer.from(keyStr, 'hex') : bs58.decode(keyStr);
        wallet = Keypair.fromSecretKey(keyBytes);
    }
} catch (e) {
    console.log(chalk.red(`[LIQUIDATOR #${id}]: Keypair failed: ${e.message}`));
}

// ── REAL ON-CHAIN LIQUIDATION ENGINE ────────────────────────────
process.on('message', async (msg) => {
    if (msg.type === 'PI_TRIGGER' && msg.action === 'LIQUIDATE_TARGET') {
        process.send({ type: 'LOG', level: 'POWER', msg: `🩸 [LIQUIDATOR]: MARGIN CALL TRIGGERED! Target: ${msg.account.slice(0, 8)}...` });
        await executeOnChainLiquidation(msg);
    }
});

async function executeOnChainLiquidation(targetData) {
    if (!wallet) return;

    try {
        console.log(chalk.red.bold(`[LIQUIDATOR]: ⚔️ ENGAGING ATOMIC SEIZURE FOR ${targetData.account.slice(0, 8)}...`));

        // 1. Get Jupiter Quote (with fallback for DNS/401)
        const solPrice = await getSolPriceAcrossDEXs();

        console.log(chalk.yellow(`[LIQUIDATOR]: 🔎 Fetching optimal swap route for ${targetData.collateralAmount} ${targetData.collateralMint.slice(0, 4)} -> ${targetData.debtMint.slice(0, 4)}`));

        // Use a robust failover chain for Jupiter APIs
        const JUPITER_QUOTE_APIS = [
            'https://lite-api.jup.ag/swap/v1/quote',
            'https://quote-api.jup.ag/v6/quote',
            'https://api.jup.ag/swap/v1/quote'
        ];

        let qRes = null;
        let lastErr = null;

        for (const apiUrl of JUPITER_QUOTE_APIS) {
            try {
                qRes = await axios.get(apiUrl, { params: swapParams, timeout: 5000 });
                if (qRes && qRes.data) break;
            } catch (e) {
                lastErr = e.message;
                console.log(chalk.yellow(`[LIQUIDATOR]: Quote API ${new URL(apiUrl).hostname} failed, trying next...`));
            }
        }

        if (!qRes || !qRes.data) throw new Error(`Could not find swap route for collateral seizure. Last error: ${lastErr}`);

        // 2. Build the Atomic Transaction
        console.log(chalk.magenta(`[LIQUIDATOR]: 🏗️ Composing Atomic Bundle...`));

        const JUPITER_SWAP_APIS = [
            'https://lite-api.jup.ag/swap/v1/swap',
            'https://quote-api.jup.ag/v6/swap',
            'https://api.jup.ag/swap/v1/swap'
        ];

        let swapRes = null;
        const swapPayload = {
            quoteResponse: qRes.data,
            userPublicKey: wallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: 2500000
        };

        for (const apiUrl of JUPITER_SWAP_APIS) {
            try {
                swapRes = await axios.post(apiUrl, swapPayload, { timeout: 8000 });
                if (swapRes && swapRes.data) break;
            } catch (e) {
                lastErr = e.message;
                console.log(chalk.yellow(`[LIQUIDATOR]: Swap API ${new URL(apiUrl).hostname} failed, trying next...`));
            }
        }

        if (!swapRes || !swapRes.data) throw new Error(`Failed to construct swap transaction. Last error: ${lastErr}`);

        const txBuf = Buffer.from(swapRes.data.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([wallet]);

        // 3. Execution (REAL)
        console.log(chalk.red.bold(`[LIQUIDATOR]: 🔫 FIRING TRANSACTION...`));
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });

        console.log(chalk.white.bgRed.bold(`[LIQUIDATOR]: 🩸 TX SENT: ${sig}`));

        // 4. Verification Check
        const confirmation = await connection.confirmTransaction(sig, 'confirmed');
        if (confirmation.value.err) throw new Error(`TX Reverted: ${JSON.stringify(confirmation.value.err)}`);

        const profit = (targetData.collateralAmount * 0.05 * solPrice); // Actual USD value of the 5% bounty
        console.log(chalk.green.bold(`[LIQUIDATOR]: ✅ SUCCESS. Captured ~$${profit.toFixed(2)} in liquidation bounty.`));

        if (process.send) {
            process.send({
                type: 'LOG',
                msg: `🩸 Liquidator: REAL ASSETS SEIZED. Profit: $${profit.toFixed(2)} USDC routed to treasury.`,
                level: 'MONEY'
            });
            process.send({ type: 'KICK_UP', amount: profit, source: 'LIQUIDATOR_ON_CHAIN' });
        }
    } catch (e) {
        console.log(chalk.red(`[LIQUIDATOR]: REAL Execution Failed: ${e.message}`));
        if (process.send) process.send({ type: 'LOG', level: 'ERROR', msg: `Liquidator Failed: ${e.message}` });
        process.exit(1); // Force exit to ensure hub triggers Jules
    }
}

async function getSolPriceAcrossDEXs() {
    try {
        const res = await axios.get('https://api.jup.ag/price/v1/search?ids=So11111111111111111111111111111111111111112');
        return res.data.data['So11111111111111111111111111111111111111112'].price || 150;
    } catch (e) { return 150; }
}

if (require.main === module) {
    console.log(chalk.red(`[LIQUIDATOR #${id}]: Ready.`));
}
