const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

async function checkBalance() {
    const RPC_URL = process.env.SOLANA_RPC_URL;
    const PRIVATE_KEY_HEX = process.env.SOLANA_PRIVATE_KEY;

    if (!RPC_URL || !PRIVATE_KEY_HEX) {
        console.log('Missing env assets');
        return;
    }

    const connection = new Connection(RPC_URL, 'confirmed');
    const wallet = Keypair.fromSecretKey(Buffer.from(PRIVATE_KEY_HEX, 'hex'));

    console.log('Wallet Address:', wallet.publicKey.toString());
    const balance = await connection.getBalance(wallet.publicKey);
    console.log('Balance:', balance / 1e9, 'SOL');
}

checkBalance();
