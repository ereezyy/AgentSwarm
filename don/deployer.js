// don/deployer.js - THE FACTORY (PUMP.FUN TOKEN LAUNCHER)
// Deploys tokens to Pump.fun with native JS serialization + optional self-snipe.
// No Python dependency. Pure JavaScript.

const { Connection, Keypair, PublicKey, Transaction, SystemProgram, TransactionInstruction, ComputeBudgetProgram, VersionedTransaction, TransactionMessage } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const id = process.argv[2] || 'Deployer';
const RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY_HEX = process.env.SOLANA_PRIVATE_KEY;

// ── Pump.fun Program Constants (Verified from on-chain) ──────────────────────
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsN6JsjHK7UTZk7nasjjnr7XxXp9F1');  // Pump.fun fee wallet
const PUMP_EVENT_AUTH = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
const PUMP_MINT_AUTHORITY = new PublicKey('TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM');
const MPL_TOKEN_METADATA = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const SYSVAR_RENT = new PublicKey('SysvarRent111111111111111111111111111111111');

// Create instruction discriminator: sha256("global:create")[:8]
const CREATE_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);

// Buy instruction discriminator (for self-snipe)
const BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);

if (!RPC_URL || !PRIVATE_KEY_HEX) {
    console.log(chalk.red(`[DEPLOYER #${id}]: ❌ Missing RPC_URL or PRIVATE_KEY. Aborting.`));
    process.exit(1);
}

const secretKey = Buffer.from(PRIVATE_KEY_HEX, 'hex');
const wallet = Keypair.fromSecretKey(secretKey);
const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

console.log(chalk.cyan.bold(`[DEPLOYER #${id}]: 🏭 FACTORY ONLINE. Wallet: ${wallet.publicKey.toString().substring(0, 8)}...`));

// ── Native JS Instruction Data Builder ──────────────────────────────────────
// Pump.fun 'create' data layout: discriminator(8) + name(4+bytes) + symbol(4+bytes) + uri(4+bytes)
function buildCreateData(name, symbol, uri) {
    const nameBuf = Buffer.from(name, 'utf8');
    const symbolBuf = Buffer.from(symbol, 'utf8');
    const uriBuf = Buffer.from(uri, 'utf8');

    // Borsh string encoding: 4-byte little-endian length prefix + string bytes
    const nameLen = Buffer.alloc(4);
    nameLen.writeUInt32LE(nameBuf.length);
    const symbolLen = Buffer.alloc(4);
    symbolLen.writeUInt32LE(symbolBuf.length);
    const uriLen = Buffer.alloc(4);
    uriLen.writeUInt32LE(uriBuf.length);

    return Buffer.concat([
        CREATE_DISCRIMINATOR,
        nameLen, nameBuf,
        symbolLen, symbolBuf,
        uriLen, uriBuf
    ]);
}

// Build buy instruction data for self-snipe
function buildBuyData(tokenAmount, maxSolCost) {
    const data = Buffer.alloc(24); // 8 discriminator + 8 token_amount + 8 max_sol
    BUY_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(BigInt(tokenAmount), 8);
    data.writeBigUInt64LE(BigInt(maxSolCost), 16);
    return data;
}

// ── Upload metadata to IPFS via Pump.fun's own endpoint ──────────────────────
async function uploadMetadata(concept) {
    try {
        console.log(chalk.gray(`[DEPLOYER #${id}]: 📤 Uploading metadata to IPFS...`));

        // Pump.fun has a metadata upload endpoint
        const metadata = {
            name: concept.name,
            symbol: concept.symbol,
            description: concept.description || `${concept.name} - A brand new memecoin on Pump.fun`,
            twitter: concept.twitter || '',
            telegram: concept.telegram || '',
            website: concept.website || '',
            showName: true
        };

        // Use Pump.fun's IPFS endpoint
        const response = await axios.post('https://pump.fun/api/ipfs', metadata, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });

        if (response.data && response.data.metadataUri) {
            console.log(chalk.green(`[DEPLOYER #${id}]: ✅ Metadata uploaded: ${response.data.metadataUri}`));
            return response.data.metadataUri;
        }

        // Fallback: construct a basic URI
        throw new Error('No metadataUri in response');
    } catch (e) {
        console.log(chalk.yellow(`[DEPLOYER #${id}]: IPFS upload failed (${e.message}). Using fallback metadata.`));
        // Fallback: Use a simple JSON blob hosted on a free service, or just pass empty
        return concept.uri || '';
    }
}

// ── Token Deploy ─────────────────────────────────────────────────────────────
async function deployToken(concept) {
    console.log(chalk.magenta.bold(`[DEPLOYER #${id}]: 🚀 LAUNCH SEQUENCE INITIATED: $${concept.symbol}`));
    console.log(chalk.gray(`[DEPLOYER #${id}]:    Name: ${concept.name}`));
    console.log(chalk.gray(`[DEPLOYER #${id}]:    Symbol: ${concept.symbol}`));

    try {
        // 0. Check balance
        const balance = await connection.getBalance(wallet.publicKey);
        const balSol = balance / 1e9;
        const selfSnipeAmount = concept.snipeAmount || 0;
        const minRequired = 0.02 + selfSnipeAmount + 0.01; // create fee + snipe + gas

        if (balSol < minRequired) {
            console.log(chalk.red(`[DEPLOYER #${id}]: ❌ Insufficient balance. Have ${balSol.toFixed(4)} SOL, need ${minRequired.toFixed(4)} SOL`));
            return;
        }

        // 1. Generate Mint Keypair
        const mintKeypair = Keypair.generate();
        console.log(chalk.cyan(`[DEPLOYER #${id}]: 🪙 Mint: ${mintKeypair.publicKey.toString()}`));

        // 2. Upload metadata
        const metadataUri = await uploadMetadata(concept);

        // 3. Derive PDAs
        const [bondingCurve] = PublicKey.findProgramAddressSync(
            [Buffer.from('bonding-curve'), mintKeypair.publicKey.toBuffer()],
            PUMP_FUN_PROGRAM_ID
        );
        const associatedBondingCurve = await getAssociatedTokenAddress(
            mintKeypair.publicKey, bondingCurve, true
        );
        const [metadataPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from('metadata'), MPL_TOKEN_METADATA.toBuffer(), mintKeypair.publicKey.toBuffer()],
            MPL_TOKEN_METADATA
        );

        // 4. Build Create Instruction
        const createData = buildCreateData(concept.name, concept.symbol, metadataUri);

        const createKeys = [
            { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: PUMP_MINT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
            { pubkey: MPL_TOKEN_METADATA, isSigner: false, isWritable: false },
            { pubkey: metadataPDA, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT, isSigner: false, isWritable: false },
            { pubkey: PUMP_EVENT_AUTH, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
        ];

        const createIx = new TransactionInstruction({
            keys: createKeys,
            programId: PUMP_FUN_PROGRAM_ID,
            data: createData
        });

        // 5. Build transaction
        const instructions = [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 250000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 }),
            createIx
        ];

        // 6. Self-Snipe (optional — buy your own token in the same block)
        if (selfSnipeAmount > 0) {
            console.log(chalk.magenta(`[DEPLOYER #${id}]: 🎯 SELF-SNIPE: Adding ${selfSnipeAmount} SOL buy to launch tx`));

            const userATA = await getAssociatedTokenAddress(mintKeypair.publicKey, wallet.publicKey);

            // Pump.fun initial price: 30 SOL virtual reserves, 1B virtual token reserves
            // tokens = sol_amount * 1073000000 / 30 (approx)
            const estimatedTokens = Math.floor((selfSnipeAmount * 1e9) * 1073000000 / (30 * 1e9));
            const maxSolLamports = Math.floor(selfSnipeAmount * 1e9 * 1.3); // 30% slippage for first buy

            const buyData = buildBuyData(estimatedTokens, maxSolLamports);

            const buyKeys = [
                { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
                { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: true },
                { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: false },
                { pubkey: bondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
                { pubkey: userATA, isSigner: false, isWritable: true },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: SYSVAR_RENT, isSigner: false, isWritable: false },
                { pubkey: PUMP_EVENT_AUTH, isSigner: false, isWritable: false },
                { pubkey: PUMP_FUN_PROGRAM_ID, isSigner: false, isWritable: false },
            ];

            const buyIx = new TransactionInstruction({
                keys: buyKeys,
                programId: PUMP_FUN_PROGRAM_ID,
                data: buyData
            });

            instructions.push(buyIx);
        }

        // 7. Send Transaction
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: blockhash,
            instructions
        }).compileToV0Message();

        const tx = new VersionedTransaction(messageV0);
        tx.sign([wallet, mintKeypair]);

        console.log(chalk.yellow(`[DEPLOYER #${id}]: 📡 Broadcasting transaction...`));
        const sig = await connection.sendTransaction(tx, { skipPreflight: true, maxRetries: 3 });
        console.log(chalk.cyan(`[DEPLOYER #${id}]: TX: ${sig}`));

        // 8. Confirm
        let confirmed = false;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await connection.getSignatureStatuses([sig]);
            const cs = status?.value?.[0]?.confirmationStatus;
            if (cs === 'confirmed' || cs === 'finalized') {
                if (status.value[0].err) {
                    throw new Error(`TX Failed on-chain: ${JSON.stringify(status.value[0].err)}`);
                }
                confirmed = true;
                break;
            }
        }

        if (!confirmed) throw new Error('Confirmation timeout (40s)');

        console.log(chalk.green.bold(`\n[DEPLOYER #${id}]: ══════════════════════════════════════`));
        console.log(chalk.green.bold(`[DEPLOYER #${id}]: 🚀 LAUNCH SUCCESS! $${concept.symbol} is LIVE`));
        console.log(chalk.green.bold(`[DEPLOYER #${id}]: ══════════════════════════════════════`));
        console.log(chalk.cyan(`[DEPLOYER #${id}]: 🔗 https://pump.fun/${mintKeypair.publicKey.toString()}`));
        console.log(chalk.cyan(`[DEPLOYER #${id}]: 🔗 https://solscan.io/tx/${sig}`));
        if (selfSnipeAmount > 0) {
            console.log(chalk.magenta(`[DEPLOYER #${id}]: 🎯 Self-sniped ${selfSnipeAmount} SOL at launch price`));
        }

        // 9. Record to active_trades if self-sniped
        if (selfSnipeAmount > 0) {
            const tradesFile = path.resolve(__dirname, '../missions/active_trades.json');
            let trades = [];
            try { trades = JSON.parse(fs.readFileSync(tradesFile, 'utf8')); } catch { }

            // We don't know exact token amount yet, banker will recover it
            trades.push({
                mint: mintKeypair.publicKey.toString(),
                entryPrice: 0, // Will be set by banker recovery
                amount: '0',   // Will be recovered
                entrySol: selfSnipeAmount,
                timestamp: Date.now(),
                maxHoldUntil: Date.now() + (2 * 60 * 60 * 1000), // 2 hour hold
                moonbagSecured: false,
                source: 'SELF_SNIPE'
            });
            fs.writeFileSync(tradesFile, JSON.stringify(trades, null, 2));
        }

        // 10. Notify swarm
        if (process.send) {
            process.send({
                type: 'AGENT_COMMS',
                from: 'DEPLOYER',
                msg: `🚀 LAUNCHED $${concept.symbol}! Mint: ${mintKeypair.publicKey.toString().substring(0, 12)}... ${selfSnipeAmount > 0 ? `Self-sniped ${selfSnipeAmount} SOL.` : ''}`,
                timestamp: new Date().toISOString()
            });
            process.send({
                type: 'LAUNCH_SUCCESS',
                mint: mintKeypair.publicKey.toString(),
                symbol: concept.symbol,
                name: concept.name,
                sig
            });
        }

    } catch (e) {
        console.error(chalk.red(`[DEPLOYER #${id}]: ❌ Launch Failed: ${e.message}`));
        if (process.send) {
            process.send({ type: 'AGENT_COMMS', from: 'DEPLOYER', msg: `Launch failed: ${e.message}`, timestamp: new Date().toISOString() });
        }
    }
}

// ── IPC Listener ─────────────────────────────────────────────────────────────
process.on('message', (msg) => {
    if (msg.type === 'LAUNCH_TOKEN') {
        deployToken(msg.concept);
    }
});
