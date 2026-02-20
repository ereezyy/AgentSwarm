const { Connection, Keypair } = require('@solana/web3.js');
require('dotenv').config();

async function check() {
    const RPC = process.env.SOLANA_RPC_URL;
    const KEY = process.env.SOLANA_PRIVATE_KEY;

    if (!KEY) {
        console.log("No private key found in .env");
        return;
    }

    try {
        const secretKey = Buffer.from(KEY, 'hex');
        const wallet = Keypair.fromSecretKey(secretKey);
        console.log("Wallet Public Key:", wallet.publicKey.toString());

        const connection = new Connection(RPC, 'confirmed');
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`Balance: ${balance / 1e9} SOL`);

    } catch (e) {
        console.error("Error:", e.message);
    }
}

check();
