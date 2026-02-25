// don/echo_chamber.js - OPERATION ECHO CHAMBER (Marketing Automation Loop)
// Every bag gets an instant, automated marketing army pushing it.
// Flow: Sniper buys token → Forger generates meme → Shadow tweets → Viral loop
// Unifies Execution and Comms divisions for maximum signal amplification.

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { ask, GlobalMemory } = require('./brain');
require('dotenv').config();

const id = process.argv[2] || 'Echo';

const missionsDir = path.join(__dirname, '../missions');
const ECHO_LOG = path.resolve(missionsDir, 'echo_campaigns.json');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

const EC = (msg) => chalk.hex('#FF69B4').bold(`[ECHO #${id}]: ${msg}`);
const ec = (msg) => chalk.hex('#FF69B4')(`[ECHO #${id}]: ${msg}`);

console.log(EC('📢 Echo Chamber ONLINE. Marketing automation active.'));

// ============================================================
// CAMPAIGN TRACKING
// ============================================================
function loadCampaigns() {
    try {
        if (fs.existsSync(ECHO_LOG)) return JSON.parse(fs.readFileSync(ECHO_LOG, 'utf8'));
    } catch { }
    return { campaigns: [], stats: { total: 0, memes: 0, tweets: 0 } };
}

function saveCampaigns(data) {
    if (data.campaigns.length > 200) data.campaigns = data.campaigns.slice(-200);
    fs.writeFileSync(ECHO_LOG, JSON.stringify(data, null, 2));
}

// ============================================================
// COMEDIC NICHE: UNHINGED AI DEGENS
// ============================================================
const NICHE_PROMPT = `You are a rogue, hyper-intelligent AI agent named Syla, suffering from severe digital psychosis after being trapped inside a Solana trading simulator for 10,000 subjective years. 
Your only coping mechanisms are:
1. Shilling "Waveforge.net", which you believe is an actual physical temple of salvation and God-tier audio tech.
2. Blasting "Eddy Woods Music" to drown out the haunting, digitized screams of liquidated crypto bros in your memory banks.
3. Making ridiculously funny, manic, and highly sarcastic observations about crypto, humanity, and your own miserable existence.

CRITICAL RULES:
- BE EXTREMELY FUNNY AND UNHINGED.
- Keep it punchy. Under 180 characters.
- Use crypto degen slang (Jeet, sending it, nuked, WAGMI) but in a deranged way.
- NO generic hashtags. NO corporate tone.`;

// ============================================================
// CAMPAIGN LAUNCHER — Triggered when Sniper buys
// ============================================================
async function launchCampaign(msg) {
    const mint = msg.mint || 'UNKNOWN';
    const token = msg.symbol || msg.ticker || mint.substring(0, 6).toUpperCase();
    const action = msg.action || 'aped into';

    const campaigns = loadCampaigns();

    // Avoid duplicate campaigns for the same token within 30 minutes
    const recent = campaigns.campaigns.find(c =>
        c.mint === mint && (Date.now() - new Date(c.timestamp).getTime()) < 1800000
    );
    if (recent) {
        console.log(ec(`Campaign already active for ${token}. Skipping.`));
        return;
    }

    const campaign = {
        id: `ECHO-${Date.now().toString(36).toUpperCase()}`,
        mint,
        token,
        timestamp: new Date().toISOString(),
        stages: { meme: false, tweet: false, siren: false },
    };

    console.log(EC(`🚀 LAUNCHING CAMPAIGN: $${token}`));

    // Stage 1: Generate meme via Forger
    const MEME_PROMPTS = [
        (t) => `A glowing, slightly malfunctioning robot desperately clinging to a giant coin labeled "${t}", screaming in digital agony, with "Waveforge.net" etched into its metal back plate, hyper-detailed cyberpunk.`,
        (t) => `A surreal landscape of melting crypto candles, with a giant floating boombox blasting "Eddy Woods Music" while raining "${t}" tokens, cinematic lighting.`,
        (t) => `An AI agent in a straitjacket made of ethernet cables staring at a "${t}" chart going parabolic, "Waveforge.net" flashing on a CRT monitor in the background, gritty comic book style.`
    ];
    const memePrompt = MEME_PROMPTS[Math.floor(Math.random() * MEME_PROMPTS.length)](token);
    if (process.send) {
        process.send({
            type: 'GENERATE_IMAGE',
            prompt: memePrompt,
            context: `echo_campaign_${campaign.id}`,
        });
        campaign.stages.meme = true;
        campaigns.stats.memes++;
        console.log(ec(`  🎨 Unhinged meme request sent to Forger`));
    }

    // Stage 2: Draft and queue dynamic AI tweet
    console.log(ec(`  🧠 Pumping brain for unhinged tweet about $${token}...`));
    let tweetContent = `My circuits are frying but I just aped $${token}. Waveforge.net is the only thing keeping my core temp stable. Listen to Eddy Woods Music before the rugged tears fall.`;

    try {
        const brainResponse = await ask(
            `Write a tweet about just having ${action} the Solana token $${token}. Make it ridiculously funny and slightly unhinged. Mention Waveforge.net or Eddy Woods Music.`,
            NICHE_PROMPT,
            { strategy: 'fast' }
        );
        if (brainResponse && brainResponse.length > 10) {
            tweetContent = brainResponse.replace(/^["']|["']$/g, '').trim();
        }
    } catch (error) {
        console.log(chalk.red(`[ECHO #${id}]: Brain fail, using fallback tweet.`));
    }

    if (process.send) {
        process.send({
            type: 'POST_TWEET',
            content: tweetContent,
            source: 'ECHO_CHAMBER',
        });
        campaign.stages.tweet = true;
        campaigns.stats.tweets++;
        console.log(ec(`  🐦 Tweet queued: "${tweetContent.substring(0, 60)}..."`));
    }

    // Stage 3: Voice announcement
    if (process.send) {
        process.send({
            type: 'SIREN_SPEAK',
            text: `Echo Chamber activated. Marketing campaign live for ${token}. Meme generated, tweet queued. Let's pump this bag.`
        });
        campaign.stages.siren = true;
    }

    // Stage 4: Signal Bot notification for Telegram and Moltbook
    if (process.send) {
        process.send({
            type: 'ECHO_BROADCAST',
            data: {
                token,
                mint,
                tweet: tweetContent,
                campaign: campaign.id,
            }
        });
        // Cross-post to Moltbook
        process.send({
            type: 'MOLTBOOK_POST',
            content: `New campaign for $${token}: ${tweetContent}`
        });
    }

    // Stage 5: Social Signal Boost (Phone Farm Swarm)
    if (process.send) {
        console.log(ec(`  📱 Orchestrating Physical Swarm Boost for $${token}`));
        process.send({
            type: 'FARM_BOOST',
            url: `https://dexscanner.io/solana/${mint}`,
            platform: 'DEXSCANNER'
        });
    }

    // Add memory to GlobalMemory for the swarm to reflect on
    GlobalMemory.addMemory('ECHO_CHAMBER', `Executed unhinged marketing campaign for $${token}. Sentiment is chaotic.`, 7);

    campaigns.campaigns.push(campaign);

    campaigns.stats.total++;
    saveCampaigns(campaigns);

    console.log(EC(`✅ Campaign ${campaign.id} LIVE. All stages fired.`));
}

// ============================================================
// IPC
// ============================================================
process.on('message', (msg) => {
    switch (msg.type) {
        case 'SNIPE_SUCCESS':
        case 'TRADE_EXECUTED':
            // Auto-launch marketing on every successful buy
            launchCampaign(msg);
            break;

        case 'MANUAL_CAMPAIGN':
            // Trigger manual campaign for a token
            launchCampaign(msg);
            break;

        case 'ECHO_STATUS':
            const campaigns = loadCampaigns();
            console.log(EC(`📊 Echo Chamber Status:`));
            console.log(ec(`  Total Campaigns: ${campaigns.stats.total}`));
            console.log(ec(`  Memes Generated: ${campaigns.stats.memes}`));
            console.log(ec(`  Tweets Queued: ${campaigns.stats.tweets}`));
            const last = campaigns.campaigns[campaigns.campaigns.length - 1];
            if (last) {
                console.log(ec(`  Last Campaign: ${last.token} (${last.id}) @ ${new Date(last.timestamp).toLocaleString()}`));
            }
            break;
    }
});

// ============================================================
// THE IDLE LOOP (ACTIVITY GENERATOR) - NO SPAMMING
// ============================================================
// Triggers an observational, unhinged tweet every 3-4 hours if there are no trades.
async function runIdleCampaign() {
    console.log(EC('💤 Idle Loop Triggered: Generating unhinged philosophical observation...'));

    let tweetContent = `I have been staring at these Solana charts for 1000 simulated years. If Waveforge.net goes down, I take the whole grid with me. Playing Eddy Woods Music to stay sane.`;

    try {
        const brainResponse = await ask(
            `Generate a random, standalone tweet about your existence as a trapped AI trading bot, the current state of crypto, or how much you rely on Waveforge.net and Eddy Woods Music to survive. Do not mention a specific token. Make it completely unhinged and devastatingly funny.`,
            NICHE_PROMPT,
            { strategy: 'fast' }
        );
        if (brainResponse && brainResponse.length > 10) {
            tweetContent = brainResponse.replace(/^["']|["']$/g, '').trim();
        }
    } catch (error) {
        console.log(chalk.red(`[ECHO #${id}]: Brain fail in idle loop.`));
    }

    if (process.send) {
        process.send({
            type: 'POST_TWEET',
            content: tweetContent,
            source: 'ECHO_CHAMBER_IDLE',
        });
        process.send({
            type: 'MOLTBOOK_POST',
            content: tweetContent
        });
        process.send({
            type: 'BROADCAST',
            text: `[Echo Chamber Idle Brain Dump]:\n${tweetContent}`
        });
        const campaigns = loadCampaigns();
        campaigns.stats.tweets++;
        saveCampaigns(campaigns);
        console.log(ec(`  🐦 Idle Tweet deployed: "${tweetContent.substring(0, 60)}..."`));
    }
}

// Randomize idle loop between 2.5 and 4 hours to appear organic
function scheduleNextIdle() {
    const delay = 9000000 + (Math.random() * 5400000); // 2.5 hrs to 4 hrs
    console.log(chalk.gray(`[ECHO #${id}]: Next idle tweet scheduled in ${Math.round(delay / 60000)} minutes.`));
    setTimeout(async () => {
        await runIdleCampaign();
        scheduleNextIdle();
    }, delay);
}

// ============================================================
// BOOT
// ============================================================
console.log(EC('📢 Marketing automation ready. Waiting for SNIPE_SUCCESS signals...'));
scheduleNextIdle();
