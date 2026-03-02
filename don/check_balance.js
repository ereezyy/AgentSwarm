require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const chalk = require('chalk');

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const WALLET_PUBKEY = process.env.SOLANA_PUBLIC_KEY;

if (!WALLET_PUBKEY) {
    console.error(chalk.red('❌ SOLANA_PUBLIC_KEY not found in .env'));
    process.exit(1);
}

const connection = new Connection(RPC_URL, 'confirmed');

async function checkBalance() {
    try {
        const pubkey = new PublicKey(WALLET_PUBKEY);
        const balance = await connection.getBalance(pubkey);
        const sol = balance / 1e9;
        console.log(
            chalk.green(`💰 Wallet `) +
            chalk.cyan(WALLET_PUBKEY) +
            chalk.green(` Balance: `) +
            chalk.yellow.bold(`${sol} SOL`)
        );
    } catch (err) {
        console.error(chalk.red('❌ Error checking balance:'), err.message);
    }
}

checkBalance();
