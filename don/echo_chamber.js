// don/echo_chamber.js - OPERATION ECHO CHAMBER (Marketing Automation Loop)
// Every bag gets an instant, automated marketing army pushing it.
// Flow: Sniper buys token → Forger generates meme → Shadow tweets → Viral loop
// Unifies Execution and Comms divisions for maximum signal amplification.

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
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
// CAMPAIGN TEMPLATES
// ============================================================
const TWEET_TEMPLATES = [
    (token, action) => `🚀 Just ${action} $${token}. The chart looks absolutely filthy. NFA but this is it. 🫡`,
    (token, action) => `👀 $${token} just popped up on my radar. Smart money flowing in. Don't sleep.`,
    (token, action) => `📈 Loaded up on $${token}. Dev team shipping, community strong. Early. Very early.`,
    (token, action) => `🔥 $${token} — when the whales move, I move. Simple.`,
    (token, action) => `💎 $${token} is giving 100x energy. In early. Let's see where this goes.`,
    (token, action) => `🧠 Studied $${token} for 20 minutes. The tokenomics are actually solid. Aping.`,
    (token, action) => `⚡ New entry: $${token}. Chart pattern + whale accumulation = let's ride.`,
];

const MEME_PROMPTS = [
    (token) => `Futuristic holographic coin with "${token}" glowing in neon, surrounded by rocket emojis and laser beams, crypto meme style, vibrant colors`,
    (token) => `A rocket ship made of gold coins labeled "${token}" launching through clouds, dynamic angle, crypto hype art style`,
    (token) => `A diamond-handed warrior holding a glowing token labeled "${token}", epic anime style, dramatic lighting`,
];

// ============================================================
// CAMPAIGN LAUNCHER — Triggered when Sniper buys
// ============================================================
function launchCampaign(msg) {
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
    const memePrompt = MEME_PROMPTS[Math.floor(Math.random() * MEME_PROMPTS.length)](token);
    if (process.send) {
        process.send({
            type: 'GENERATE_IMAGE',
            prompt: memePrompt,
            context: `echo_campaign_${campaign.id}`,
        });
        campaign.stages.meme = true;
        campaigns.stats.memes++;
        console.log(ec(`  🎨 Meme request sent to Forger`));
    }

    // Stage 2: Draft and queue tweet via Syla/Shadow
    const tweet = TWEET_TEMPLATES[Math.floor(Math.random() * TWEET_TEMPLATES.length)](token, action);
    if (process.send) {
        process.send({
            type: 'POST_TWEET',
            content: tweet,
            source: 'ECHO_CHAMBER',
        });
        campaign.stages.tweet = true;
        campaigns.stats.tweets++;
        console.log(ec(`  🐦 Tweet queued: "${tweet.substring(0, 60)}..."`));
    }

    // Stage 3: Voice announcement
    if (process.send) {
        process.send({
            type: 'SIREN_SPEAK',
            text: `Echo Chamber activated. Marketing campaign live for ${token}. Meme generated, tweet queued. Let's pump this bag.`
        });
        campaign.stages.siren = true;
    }

    // Stage 4: Signal Bot notification for Telegram
    if (process.send) {
        process.send({
            type: 'ECHO_BROADCAST',
            data: {
                token,
                mint,
                tweet,
                campaign: campaign.id,
            }
        });
    }

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
// BOOT
// ============================================================
console.log(EC('📢 Marketing automation ready. Waiting for SNIPE_SUCCESS signals...'));
setInterval(() => { }, 100000);
