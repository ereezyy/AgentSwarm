// don/shadow.js - THE SHADOW (Tweet Execution Arm)
// Posts tweets on behalf of Syla and other agents via Twitter API v2.
const { TwitterApi } = require('twitter-api-v2');
const chalk = require('chalk');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Shadow';

console.log(chalk.gray.bold(`[SHADOW #${id}]: API Execution Engine Online.`));

// Initialize Twitter Client (API v2)
let client = null;

if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET) {
    try {
        client = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
            accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });
        console.log(chalk.green(`[SHADOW #${id}]: Twitter API Authenticated.`));
    } catch (e) {
        console.log(chalk.yellow(`[SHADOW #${id}]: API Auth Failed. Simulation Mode.`));
    }
} else {
    console.log(chalk.yellow(`[SHADOW #${id}]: No Twitter API Keys. SIMULATION MODE.`));
}

// ── Post a tweet via Twitter API v2 ───────────────────────────
// ── Post a tweet via Twitter API v2 ───────────────────────────
async function postTweet(content) {
    if (!client) {
        console.log(chalk.magenta(`[SHADOW #${id}]: [SIM] "${content.substring(0, 80)}..."`));
        if (process.send) {
            // Simulate ID for testing Hydra
            process.send({
                type: 'TWEET_SENT',
                id: 'SIM-' + Date.now(),
                text: content
            });
        }
        return;
    }

    try {
        const twitterClient = client.readWrite;
        const result = await twitterClient.v2.tweet(content);
        console.log(chalk.green(`[SHADOW #${id}]: ✅ Tweet posted! ID: ${result.data.id}`));

        if (process.send) {
            process.send({
                type: 'TWEET_SENT',
                id: result.data.id,
                text: content
            });
            process.send({ type: 'AGENT_COMMS', from: 'SHADOW', msg: `Tweet posted: "${content.substring(0, 50)}..."` });
        }
    } catch (e) {
        console.error(chalk.red(`[SHADOW #${id}]: Post failed: ${e.message}`));
        if (e.message?.includes('duplicate')) console.log(chalk.yellow(`[SHADOW #${id}]: Duplicate detected — skipping.`));
    }
}

// ── Reply to a tweet ──────────────────────────────────────────
async function replyToTweet(content, replyToId) {
    if (!client) {
        console.log(chalk.magenta(`[SHADOW #${id}]: [SIM REPLY] -> ${replyToId}: "${content.substring(0, 50)}..."`));
        return;
    }

    try {
        const twitterClient = client.readWrite;
        await twitterClient.v2.reply(content, replyToId);
        console.log(chalk.green(`[SHADOW #${id}]: ↩️ Replied to ${replyToId}`));
    } catch (e) {
        console.error(chalk.red(`[SHADOW #${id}]: Reply failed: ${e.message}`));
    }
}

// ── IPC Listener — Execute tweet requests from other agents ───
process.on('message', async (msg) => {
    if (msg.type === 'POST_TWEET') {
        const content = msg.content || msg.text;
        if (content) {
            console.log(chalk.gray(`[SHADOW #${id}]: Received tweet request (${content.length} chars)`));
            await postTweet(content);
        }
    } else if (msg.type === 'POST_REPLY') {
        if (msg.content && msg.replyToId) {
            console.log(chalk.gray(`[SHADOW #${id}]: Received reply request for ${msg.replyToId}`));
            await replyToTweet(msg.content, msg.replyToId);
        }
    }
});

console.log(chalk.gray(`[SHADOW #${id}]: Listening for POST_TWEET commands...`));
