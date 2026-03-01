// don/nft_sweeper.js - THE FLOOR SWEEPER (NFT Arbitrage)
// Monitors high-tier "Blue Chip" NFT collections on MagicEden.
// Looks for "fat finger" listings (>15% below the active floor price).
// Immediately generates and signs a buy transaction to secure the discounted asset.

const axios = require('axios');
const chalk = require('chalk');
const bs58 = require('bs58');
const { Connection, Keypair, Transaction, TransactionInstruction, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

const id = process.argv[2] || require('crypto').randomBytes(4).toString('hex');
console.log(chalk.magenta.bold(`[NFT SWEEPER #${id}]: 🧹 Broom prepared. Sweeping fat-finger listings.`));

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

let wallet = null;
try {
    if (process.env.SOLANA_PRIVATE_KEY) {
        wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
    } else {
        console.log(chalk.gray(`[SWEEPER #${id}]: No SOLANA_PRIVATE_KEY — running in alert-only mode.`));
    }
} catch (e) {
    console.log(chalk.red(`[SWEEPER #${id}]: Keypair load failed: ${e.message}`));
}

// ── Target Collections (Magic Eden Slugs) ──────────────────────────
const TARGET_COLLECTIONS = [
    'mad_lads',
    'tensorians',
    'retardio_cousins',
    'famous_fox_federation'
];

const FAT_FINGER_DISCOUNT = 0.15; // 15% below floor
const LAMPORTS_PER_SOL = 1e9;
const SCAN_INTERVAL_MS = 8000; // ME API is rate limited, don't spam too hard
let activeSnipes = {}; // Prevent double spending on the same mint

// ── Execution Core ──────────────────────────────────────────────────
async function scanFloors() {
    if (!wallet) return;

    for (const slug of TARGET_COLLECTIONS) {
        try {
            // 1. Fetch current true floor price
            const statsRes = await axios.get(`https://api-mainnet.magiceden.dev/v2/collections/${slug}/stats`, { timeout: 5000 });
            if (!statsRes.data || !statsRes.data.floorPrice) continue;

            const floorPriceLamports = statsRes.data.floorPrice;
            const floorPriceSol = floorPriceLamports / LAMPORTS_PER_SOL;

            // 2. Fetch the lowest active listings
            const listRes = await axios.get(`https://api-mainnet.magiceden.dev/v2/collections/${slug}/listings?offset=0&limit=5`, { timeout: 5000 });
            if (!listRes.data || listRes.data.length === 0) continue;

            if (Date.now() % 40000 < SCAN_INTERVAL_MS) {
                console.log(chalk.gray(`[SWEEPER #${id}]: Scanning ${slug} | Floor: ${floorPriceSol.toFixed(2)} SOL`));
            }

            for (const listing of listRes.data) {
                const listPriceSol = listing.price;
                const discount = (floorPriceSol - listPriceSol) / floorPriceSol;

                // Did someone fat-finger the listing price? (e.g., listed for 10 SOL instead of 100 SOL)
                if (discount >= FAT_FINGER_DISCOUNT) {
                    if (!activeSnipes[listing.tokenMint]) {
                        activeSnipes[listing.tokenMint] = Date.now();

                        console.log(chalk.magenta.bold(`[SWEEPER #${id}]: 🚨 FAT FINGER DETECTED on ${slug}!`));
                        console.log(chalk.magenta(`    Listed: ${listPriceSol} SOL | Floor: ${floorPriceSol} SOL (-${(discount * 100).toFixed(1)}%)`));

                        await executeSnipe(listing, listPriceSol);
                    }
                }
            }

            // Minimal delay between collections to respect API rate limits
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            // Rate limit or API error
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function executeSnipe(listing, priceSol) {
    try {
        console.log(chalk.magenta.bold(`[SWEEPER #${id}]: ⚡ Constructing Buy Transaction for ${listing.tokenMint}...`));

        // Magic Eden provides a /buy_now endpoint that returns the transaction buffer/instructions
        // Requires buyer, seller, auctionHouse, tokenMint, price
        const buyRes = await axios.get(`https://api-mainnet.magiceden.dev/v2/instructions/buy_now`, {
            params: {
                buyer: wallet.publicKey.toString(),
                seller: listing.seller,
                auctionHouseAddress: listing.auctionHouse,
                tokenMint: listing.tokenMint,
                tokenATA: listing.tokenAddress,
                price: listing.price,
                sellerReferral: '',
                buyerReferral: ''
            },
            timeout: 8000
        });

        if (!buyRes.data || !buyRes.data.txSigned) {
            console.log(chalk.red(`[SWEEPER #${id}]: Failed to build ME buy transaction. Mostly likely sold already.`));
            return false;
        }

        // Deserialize the transaction buffer returned by Magic Eden
        const txBuf = Buffer.from(buyRes.data.txSigned.data);
        const tx = Transaction.from(txBuf);

        // Add extreme priority fee to frontrun manual buyers
        // Note: In real scenarios you'd insert a ComputeBudgetInstruction here if ME didn't include one.

        tx.partialSign(wallet);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });

        console.log(chalk.magenta.bold(`[SWEEPER #${id}]: 🧹 NFT SWEPT! Sig: ${sig}`));

        if (process.send) {
            process.send({
                type: 'LOG',
                msg: `🧹 Floor Sweeper: Sniped ${listing.tokenMint} for ${priceSol} SOL (Floor was heavily discounted).`,
                level: 'MONEY'
            });
        }
        return true;
    } catch (e) {
        console.log(chalk.red(`[SWEEPER #${id}]: Sweep execution failed: ${e.response?.data?.msg || e.message}`));
        return false;
    }
}

setInterval(scanFloors, SCAN_INTERVAL_MS);

if (require.main === module) {
    console.log(chalk.magenta(`[SWEEPER #${id}]: Direct execution. Hunting fat-fingers...`));
    scanFloors();
}
