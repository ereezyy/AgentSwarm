// don/banker.js - THE BANKER (ASSET MANAGEMENT & MINING MONITOR)
const axios = require('axios');
const chalk = require('chalk');
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);
require('dotenv').config();

const id = process.argv[2] || 'Banker';
console.log(chalk.yellow.bold(`[BANKER #${id}]: Vault & Treasury Management Online.`));

// Doge Network Params
const dogma = {
    messagePrefix: '\x19Dogecoin Signed Message:\n',
    bech32: 'doge',
    bip32: { public: 0x02facafd, private: 0x02fac398 },
    pubKeyHash: 0x1e,
    scriptHash: 0x16,
    wif: 0x9e,
};

const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// SOLANA CONNECTION
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const SOL_WALLET = process.env.SOLANA_PUBLIC_KEY;

// Trade Ledger
const TRADES_PATH = path.resolve(__dirname, '../missions/active_trades.json');

async function checkBalance() {
    let totalValueUsd = 0;

    // 1. Check SOL Balance
    try {
        if (SOL_WALLET) {
            const balance = await connection.getBalance(new PublicKey(SOL_WALLET));
            const solBalance = balance / 1e9;

            // Get SOL Price
            const priceRes = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            const solPrice = priceRes.data.solana.usd;
            const solValue = solBalance * solPrice;
            totalValueUsd += solValue;

            console.log(chalk.yellow(`[BANKER #${id}]: 🏛️ TREASURY: ${solBalance.toFixed(4)} SOL ($${solValue.toFixed(2)})`));

            if (process.send) {
                process.send({
                    type: 'MINING_UPDATE', // Reusing existing message type for dashboard compatibility
                    coin: 'SOL',
                    address: SOL_WALLET,
                    balance: solBalance.toFixed(4),
                    value: solValue.toFixed(2),
                    source: 'Mainnet'
                });
            }
        }
    } catch (e) {
        console.error(chalk.red(`[BANKER #${id}]: SOL Check Failed: ${e.message}`));
    }

    // 2. Estimate Active Position Value (Sniper Holdings)
    try {
        if (fs.existsSync(TRADES_PATH)) {
            const trades = JSON.parse(fs.readFileSync(TRADES_PATH, 'utf8'));
            let positionsValue = 0;
            // We assume entry price for now if live price unavailable, or use last known
            // Ideally Hustler provides prices, but for Banker we just sum entries as "Book Value"
            // Real equity requires live price which is heavy.

            trades.forEach(t => {
                positionsValue += (parseFloat(t.entrySol) * 150); // Rough USD conversion if simpler
                // Better: just track SOL exposure
            });

            console.log(chalk.yellow(`[BANKER #${id}]: 💼 ACTIVE POSITIONS: ${trades.length} Trades (${positionsValue} USD Est)`));
        }
    } catch (e) { }

    // ── LEGACY MINING (DOGE/ZEC) ──
    // ... (Keep existing Doge/Zec logic if desired, or deprecate)

    setTimeout(checkBalance, 60000);
}

// Initial check
setTimeout(checkBalance, 5000);
