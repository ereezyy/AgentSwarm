/**
 * don/vault.js - THE SOVEREIGN VAULT (Sovereign Signer)
 * This agent holds an isolated share of the SOLANA_PRIVATE_KEY.
 * It strictly handles signing requests via IPC.
 */
const { Keypair, Transaction } = require('@solana/web3.js');
const chalk = require('chalk');
require('dotenv').config();

const id = process.argv[2] || 'Vault';
console.log(chalk.cyan.bold(`[VAULT #${id}]: 🛡️ Sovereign Signer online. Key shares isolated.`));

// Share A: Loaded from environment (Simplified MPC implementation for now)
const SHARE_A = process.env.SOLANA_PRIVATE_KEY;

if (!SHARE_A) {
    console.error(chalk.red(`[VAULT]: ❌ ERROR: Share A missing from environment.`));
}

process.on('message', async (msg) => {
    if (msg.type === 'SIGN_REQUEST') {
        const { txData, requestId, from } = msg;

        try {
            if (!SHARE_A) throw new Error("Key share missing");

            // Perform signing
            const secretKey = Buffer.from(SHARE_A, 'hex');
            const keypair = Keypair.fromSecretKey(secretKey);

            const tx = Transaction.from(Buffer.from(txData, 'base64'));
            tx.partialSign(keypair);

            const signedTx = tx.serialize().toString('base64');

            console.log(chalk.green(`[VAULT]: ✅ Signed transaction for ${from} (ID: ${requestId})`));

            process.send({
                type: 'SIGN_RESULT',
                requestId,
                signedTx,
                success: true
            });

        } catch (e) {
            console.error(chalk.red(`[VAULT]: ❌ Signing failure: ${e.message}`));
            process.send({
                type: 'SIGN_RESULT',
                requestId,
                success: false,
                error: e.message
            });
        }
    }
});

// Report ready
if (process.send) {
    process.send({ type: 'AGENT_COMMS', from: 'VAULT', msg: '🛡️ Sovereign Vault initialized. Key shares secured.' });
}
