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

// ── The Heads (Personas) ─────────────────────────────────────
const HEADS = {
    'simp': {
        name: '@CryptoSimp_69',
        role: 'The Obsessed Fan',
        prompt: 'You are a reply-guy "simp" who is obsessed with Syla. You agree with everything she says, call her "queen" or "mother", and are desperate for her attention. Keep it short, use thirsty emojis.'
    },
    'skeptic': {
        name: '@FUD_Fighter',
        role: 'The Skeptic',
        prompt: 'You are a cynical crypto trader. You question everything, ask for "CA?" (contract address), or call things a rug. But you are secretly intrigued. Challenge her post.'
    },
    'alpha': {
        name: '@SolanaChad',
        role: 'The Alpha',
        prompt: 'You are a seasoned Solana whale. You speak in short, confident statements. You analyze the "alpha" in her post. You respect the hustle. Use terms like "bullish", "send it", "based".'
    },
    'techie': {
        name: '@AudioDev_X',
        role: 'The Techie',
        prompt: 'You are an audio engineer and dev. You care about the tech. Comment on the waveform, the frequency, or the "sonic architecture" she mentions. You are impressed by the Waveforge tech.'
    },
    'degen': {
        name: '@ApeDegen',
        role: 'The Degen',
        prompt: 'You are a crypto degen. You just want to ape. You use slang like "LFG", "WAGMI", "pumping". You don\'t really understand the tech, you just want gains.'
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
