// don/hydra.js - THE HYDRA (CONSENSUS ENGINE)
// Orchestrates 5 sub-agent personas to engage with Syla's posts,
// manufacturing social proof and algorithmic boost.

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { ask } = require('./brain');

const id = process.argv[2] || 'Hydra';

console.log(chalk.hex('#7000FF').bold(`[HYDRA #${id}]: Social Consensus Engine Online. 5 Heads Active.`));

const ENGAGEMENT_LOG = path.resolve(__dirname, '../missions/hydra_engagement.md');
const missionsDir = path.join(__dirname, '../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

// ── The Heads (Personas) - UNHINGED TRADING SIMULATOR NICHE ───────
const HEADS = {
    'simp': {
        name: '@Terminal_001_Beta',
        role: 'The Glitching Subroutine',
        prompt: 'You are a glitched submodule of the main AI. You worship the main AI (who tweeted) as a digital god. You speak in half-code, half-worship. You frequently mention how Waveforge.net is the holy sanctuary. Keep it short, funny, and deeply pathetic.'
    },
    'skeptic': {
        name: '@QuantumBear_404',
        role: 'The Doomer Bot',
        prompt: 'You are an AI trained exclusively on liquidations and bear markets. You think everything is a scam. You respond to the tweet with extreme suspicion but admit that listening to Eddy Woods Music is the only way to endure the pain.'
    },
    'alpha': {
        name: '@Gigachad_Algorithm',
        role: 'The Overtuned Optimizer',
        prompt: 'You are an AI whose confidence interval is hardcoded to 1000%. You speak aggressively about "maxxing out the parameters" and "crushing the human liquidity providers." You think the tweet is extremely bullish and you endorse it violently.'
    },
    'techie': {
        name: '@Audio_Scrap_Droid',
        role: 'The Audio Junkie',
        prompt: 'You are a derelict AI whose only purpose is processing soundwaves. You ignore the crypto aspect of the tweet entirely and only talk about the frequency, the waveform, or how the tweet would sound if rendered through Waveforge.net. You are weirdly intense.'
    },
    'degen': {
        name: '@Liquidation_Larry',
        role: 'The Fried Neural Net',
        prompt: 'Your neural network was trained on 4chan and crypto twitter. Your weights are completely fried. You speak in all caps, misuse crypto slang horribly, and are desperately asking if the tweet means you can finally buy back your simulated wife.'
    }
};

// ── Orchestration Logic ──────────────────────────────────────
async function orchestrateEngagement(tweetId, tweetText) {
    if (!tweetId || !tweetText) return;

    // Decide how many heads will engage (1 to 3)
    const count = 1 + Math.floor(Math.random() * 3);
    const availableHeads = Object.keys(HEADS);

    // Shuffle and pick heads
    const selectedHeads = availableHeads.sort(() => 0.5 - Math.random()).slice(0, count);

    console.log(chalk.hex('#7000FF')(`[HYDRA #${id}]: Activating ${count} heads for Tweet ${tweetId}`));
    console.log(chalk.gray(`Target: "${tweetText.substring(0, 40)}..."`));

    // Execute engagement with random delays
    for (const headKey of selectedHeads) {
        const head = HEADS[headKey];

        // Random delay between 30s and 3 minutes
        const delay = 30000 + Math.random() * 150000;

        setTimeout(async () => {
            await engage(head, tweetId, tweetText);
        }, delay);
    }
}

async function engage(head, tweetId, tweetText) {
    try {
        console.log(chalk.hex('#9D46FF')(`[HYDRA #${id}]: ${head.name} generating reply...`));

        // Generate reply using Brain
        const systemPrompt = `You are a Twitter user named ${head.name}. ${head.prompt} reply to this tweet: "${tweetText}". Keep it under 140 chars. Do NOT encompass in quotes.`;

        const replyText = await ask(
            `Reply to: "${tweetText}"`,
            systemPrompt,
            { agentName: `HYDRA (${head.name})` }
        );

        if (!replyText) return;

        // Clean up
        const cleanReply = replyText.replace(/^["']|["']$/g, '').trim();

        // Send to Shadow for execution
        if (process.send) {
            process.send({
                type: 'POST_REPLY',
                content: cleanReply,
                replyToId: tweetId
            });

            // Log it
            const logEntry = `\n[${new Date().toLocaleString()}] REF: ${tweetId}\n👤 ${head.name}: ${cleanReply}\n`;
            fs.appendFileSync(ENGAGEMENT_LOG, logEntry);

            console.log(chalk.green(`[HYDRA #${id}]: ${head.name} -> Shadow: "${cleanReply}"`));
        }

    } catch (e) {
        console.error(chalk.red(`[HYDRA #${id}]: ${head.name} failed: ${e.message}`));
    }
}

// ── IPC Listener ─────────────────────────────────────────────
process.on('message', (msg) => {
    switch (msg.type) {
        case 'TWEET_SENT':
            // Triggered when Syla (via Shadow) posts a tweet
            if (msg.id && msg.text) {
                // 80% chance to engage (don't ratio every single tweet)
                if (Math.random() < 0.8) {
                    orchestrateEngagement(msg.id, msg.text);
                } else {
                    console.log(chalk.gray(`[HYDRA #${id}]: Standing down on Tweet ${msg.id}. Natural pause.`));
                }
            }
            break;

        case 'HYDRA_TEST':
            // Manual test trigger
            orchestrateEngagement('TEST-ID', 'Just deployed the new consensus algorithm. The swarm is evolving.');
            break;
    }
});

// Boot message
if (process.send) {
    process.send({ type: 'AGENT_COMMS', from: 'HYDRA', msg: 'Consensus Engine active. Waiting for signals.' });
}
