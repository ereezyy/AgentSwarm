const { Connection, Keypair, PublicKey, Transaction, SystemProgram, VersionedTransaction } = require('@solana/web3.js');
const MevBundler = require('./don/mev_bundler');
const bs58 = require('bs58');
require('dotenv').config();

async function test() {
    const rpc = process.env.SOLANA_RPC_URL;
    const key = process.env.SOLANA_PRIVATE_KEY;
    if (!rpc || !key) {
        console.error("Missing env vars");
        return;
    }

    const connection = new Connection(rpc);
    const keyBytes = key.length > 88 ? Buffer.from(key, 'hex') : bs58.decode(key);
    const wallet = Keypair.fromSecretKey(keyBytes);

    console.log("Wallet:", wallet.publicKey.toBase58());
    const bundler = new MevBundler(wallet, connection);

    // Create a dummy vTx
    const tx = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: wallet.publicKey,
            lamports: 1000
        })
    );
    const bh = await connection.getLatestBlockhash();
    tx.recentBlockhash = bh.blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);

    const vTx = new VersionedTransaction(tx.compileMessage());
    vTx.sign([wallet]);

    console.log("Testing REST sendBundle...");
    try {
        const res = await bundler.sendBundle(vTx, 10000);
        console.log("Bundle Result:", res);
    } catch (e) {
        console.error("Test Caught Error:", e);
    }
}

test();
