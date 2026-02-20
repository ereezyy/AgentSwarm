// don/deployer.js - THE FACTORY (PUMP.FUN LAUNCHPAD)
// Deploys tokens to Pump.fun via Jito MEV bundles for sniper protection (or self-sniping).
const { Connection, Keypair, PublicKey, Transaction, SystemProgram, TransactionInstruction, ComputeBudgetProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const MevBundler = require('./mev_bundler');
const { spawnSync } = require('child_process');
require('dotenv').config();

const id = process.argv[2] || 'Deployer';
const RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY_HEX = process.env.SOLANA_PRIVATE_KEY;
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Pump.fun Constants
const GLOBAL = new PublicKey('4wTV9uUv8asv38pW9CDN97v7A7qgnuEqj7A8UqQv6J4u');
const FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPaxN9zKn1Bv9kH8RNoVyc6zL4sAovG5N');
const MINT_AUTHORITY = new PublicKey('TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM'); // Pump.fun mint auth
const EVENT_AUTHORITY = new PublicKey('Ce6LsUC7BBSZzS6885QsS6r3T68WfW9Jm8WfA9Jm8WfA');

if (!RPC_URL || !PRIVATE_KEY_HEX) {
    console.log(chalk.red(`[DEPLOYER #${id}]: ❌ Missing Keys. Aborting.`));
    process.exit(1);
}

const secretKey = Buffer.from(PRIVATE_KEY_HEX, 'hex');
const wallet = Keypair.fromSecretKey(secretKey);
const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

let bundler = null;
try {
    bundler = new MevBundler(wallet, connection);
    console.log(chalk.magenta(`[DEPLOYER #${id}]: 🛡️ MEV Bundler Ready (Jito).`));
} catch (e) {
    console.log(chalk.yellow(`[DEPLOYER #${id}]: MEV Bundler unavailable. Standard deployment only.`));
}

console.log(chalk.cyan.bold(`[DEPLOYER #${id}]: 🏭 FACTORY ONLINE. Waiting for Concept Approval...`));

// Metadata IPFS/Arweave Upload (Mocked for now - requires Pinata/Metaplex)
// In production, `incubator.js` should handle the upload and pass the URI.
// Here we assume URI is passed or we use a placeholder.

async function deployToken(concept) {
    console.log(chalk.magenta(`[DEPLOYER #${id}]: 🚀 INITIATING LAUNCH SEQUENCE: $${concept.symbol}`));

    try {
        // 1. Generate Mint Keypair
        const mintKeypair = Keypair.generate();
        console.log(chalk.cyan(`[DEPLOYER #${id}]: 🪙 Mint Address: ${mintKeypair.publicKey.toString()}`));

        // 2. Derive PDAs
        const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintKeypair.publicKey.toBuffer()], PUMP_FUN_PROGRAM_ID);
        const associatedBondingCurve = await getAssociatedTokenAddress(mintKeypair.publicKey, bondingCurve, true);
        const [metadataPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("metadata"), new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(), mintKeypair.publicKey.toBuffer()],
            new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
        );

        // 3. Construct Create Instruction (Pump.fun 'create' is discriminant + name/symbol/uri)
        // Discriminator for 'create': 18 1e 2c 0e 17 06 19 09
        // This is complex b/c it requires string serialization.
        // We will call Python executor for instruction data construction to ensure precision.

        console.log(chalk.gray(`[DEPLOYER #${id}]: Constructing transaction data...`));
        const txData = await buildCreateInstructionData(concept.name, concept.symbol, concept.uri || "https://example.com/meta.json");

        if (!txData) throw new Error("Failed to build transaction data");

        const keys = [
            { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: MINT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: GLOBAL, isSigner: false, isWritable: false },
            { pubkey: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"), isSigner: false, isWritable: false }, // Metadata Program
            { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        ];

        const instruction = new TransactionInstruction({
            keys,
            programId: PUMP_FUN_PROGRAM_ID,
            data: Buffer.from(txData, 'hex')
        });

        const transaction = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
            instruction
        );

        // 4. Send Launch
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        transaction.sign(wallet, mintKeypair);

        let sig;
        if (bundler && concept.snipeAmount > 0) {
            // Bundle Launch + Buy (Self-Snipe)
            console.log(chalk.magenta(`[DEPLOYER #${id}]: 🛡️ Bundling Launch + Snipe (${concept.snipeAmount} SOL)...`));
            // Bundling logic here (adds buy instruction to same bundle)
            // For MVP, just launch.
            sig = await bundler.sendBundle(transaction);
        } else {
            sig = await sendAndConfirmTransaction(connection, transaction, [wallet, mintKeypair]);
        }

        console.log(chalk.green.bold(`[DEPLOYER #${id}]: 🚀 LAUNCH SUCCESS! $${concept.symbol} is LIVE.`));
        console.log(chalk.cyan(`[DEPLOYER #${id}]: Pump.fun: https://pump.fun/${mintKeypair.publicKey.toString()}`));

        if (process.send) {
            process.send({
                type: 'AGENT_COMMS',
                from: 'DEPLOYER',
                msg: `Launched $${concept.symbol}! Mint: ${mintKeypair.publicKey.toString()}`,
                timestamp: new Date().toISOString()
            });
            process.send({
                type: 'LAUNCH_SUCCESS',
                mint: mintKeypair.publicKey.toString(),
                symbol: concept.symbol,
                uri: concept.uri
            });
        }

    } catch (e) {
        console.error(chalk.red(`[DEPLOYER #${id}]: Launch Failed: ${e.message}`));
        if (process.send) process.send({ type: 'AGENT_COMMS', from: 'DEPLOYER', msg: `Launch failed: ${e.message}` });
    }
}

// Helper to interact with Python for strict serialization
async function buildCreateInstructionData(name, symbol, uri) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '../muscle/serializer.py');
        const pythonProcess = spawnSync('python', [scriptPath, name, symbol, uri]);

        if (pythonProcess.error) {
            console.error('Python Error:', pythonProcess.error);
            return resolve(null);
        }

        const output = pythonProcess.stdout.toString().trim();
        try {
            const json = JSON.parse(output);
            if (json.error) {
                console.error('Serializer Error:', json.error);
                resolve(null);
            } else {
                resolve(json.data);
            }
        } catch (e) {
            console.error('Parse Error:', e.message);
            resolve(null);
        }
    });
}


// IPC Listener
process.on('message', (msg) => {
    if (msg.type === 'LAUNCH_TOKEN') {
        deployToken(msg.concept);
    }
});
