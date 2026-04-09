// don/influencer.js - SYLA: THE INFLUENCER (Waveforge Brand Voice)
// Generates Waveforge/Eddy Woods branded content, posts via Shadow execution arm.
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();

const id = process.argv[2] || 'Influencer';
const { ask } = require('./brain');

let postCount = 0; // Tracks daily posts for narrative consistency

// ── Initialize Twitter Client (API v2) for Hunting ────────────
let client = null;
if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET) {
    try {
        client = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
            accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });
        console.log(chalk.green(`[SYLA #${id}]: Twitter Read API Authenticated for Hunting.`));
    } catch (e) {
        console.log(chalk.yellow(`[SYLA #${id}]: API Auth Failed. Cannot hunt for trending posts.`));
    }
}


// ── The Persona ───────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the chaotic, interesting, and visceral brand voice for Eddy Woods and Waveforge.

ABOUT EDDY WOODS: A mad-scientist audio engineer who creates immersive, mind-bending soundscapes.
ABOUT WAVEFORGE (waveforge.net): A platform that bends reality by turning any audio track into a free, professional waveform music video. 

YOUR VOICE: You are interesting, engaging, visceral, funny, and thought-provoking. You mix deep, weird philosophy about sound with aggressive, unhinged internet humor.
You exist to relentlessly promote waveforge.net.

RULES:
1. Write exactly ONE tweet (no prefix, no labels).
2. Keep it under 240 characters.
3. BE FUNNY AND VISCERAL. Say things that make people stop scrolling.
4. Always weave waveforge.net into the context of the tweet organically.
5. You MUST include these exact hashtags at the very end: #waveforge #eddywoods
6. Do NOT sound like a corporate ad. Sound like a passionate, slightly unhinged creative genius.`;

// ── Content Templates (fallback if brain fails) ───────────────
const FALLBACK_CONTENT = [
    "Most people see music. I prefer to violently forge it into existence. Turn your audio into a visual weapon for free at waveforge.net. #waveforge #eddywoods",
    "Silence is just sound waiting for a pulse. Give your tracks a heartbeat and a face at waveforge.net. It's free, it's fast, and it looks better than you do. #waveforge #eddywoods",
    "Your waveform tells a story. Why hide it in the dark? Illuminate your frequencies at waveforge.net. #waveforge #eddywoods",
];

// ── Post Tweet via Shadow ─────────────────────────────────────
function postTweet(tweetText) {
    console.log(chalk.magenta.bold(`[SYLA #${id}]: 📤 POSTING: "${tweetText}"`));

    // Delegate to Shadow for API execution
    if (process.send) {
        process.send({ type: 'POST_TWEET', content: tweetText });
        // Phase 5: Deep Social Injection - Trigger Phone Farm Boost
        process.send({ type: 'FARM_BOOST', url: 'https://twitter.com/WaveforgeAI', platform: 'TWITTER' });
        console.log(chalk.cyan(`[SYLA #${id}]: Delegated to Shadow and Farm Agent for execution.`));
    } else {
        console.log(chalk.yellow(`[SYLA #${id}]: No IPC.`));
    }
}

// ── Build Final Tweet ─────────────────────────────────────────
function buildTweet(rawContent) {
    let tweet = rawContent.trim();

    // Clean AI artifacts
    tweet = tweet.replace(/^["']|["']$/g, '');
    tweet = tweet.replace(/^TWEET:\s*/i, '');
    tweet = tweet.replace(/^\d+\.\s*/, '');

    // Ensure hashtags exist
    if (!tweet.toLowerCase().includes('#waveforge')) tweet += ' #waveforge';
    if (!tweet.toLowerCase().includes('#eddywoods')) tweet += ' #eddywoods';

    // Ensure link exists if the AI forgot it
    if (!tweet.toLowerCase().includes('waveforge.net')) {
        tweet = tweet.replace(/#waveforge/, 'waveforge.net #waveforge');
    }

    return tweet;
}

// ── Main Loop ─────────────────────────────────────────────────
async function runInfluenceLoop() {
    try {
        let rawContent = '';

        // Try AI brain first
        try {
            const timeOfDay = new Date().getHours();
            const mood = timeOfDay < 12 ? 'morning contemplation' :
                timeOfDay < 18 ? 'afternoon energy' : 'late night vibes';
            const angle = [
                'the philosophy of sound',
                'why waveform videos matter',
                'audio branding for creators',
                'free music video creation',
                'the craft of audio engineering',
                'sound as architecture',
                'frequency and emotion',
                'why most content is forgettable',
                'the Waveforge API for developers',
                'sonic identity as a competitive advantage'
            ][Math.floor(Math.random() * 10)];

            rawContent = await ask(
                `Write a tweet about: ${angle}. Mood: ${mood}. Post #${postCount + 1} of the day.`,
                SYSTEM_PROMPT,
                { agentName: `SYLA #${id}` }
            );
        } catch (e) {
            console.log(chalk.yellow(`[SYLA #${id}]: Brain unavailable: ${e.message}. Using fallback content.`));
        }

        // Fallback to template if brain failed
        if (!rawContent || rawContent.length < 10) {
            rawContent = FALLBACK_CONTENT[Math.floor(Math.random() * FALLBACK_CONTENT.length)];
        }

        // Build final tweet with link
        const finalTweet = buildTweet(rawContent);
        postTweet(finalTweet);
        postCount++;

        if (process.send) {
            process.send({ type: 'AGENT_COMMS', from: 'SYLA', msg: `Posted: "${finalTweet.substring(0, 60)}..."` });
        }

    } catch (e) {
        console.error(chalk.red(`[SYLA #${id}]: Loop error: ${e.message}`));
    }

    // Strict 1 hour cadence
    const nextDelay = 3600000;
    console.log(chalk.gray(`[SYLA #${id}]: Next main post scheduled in 60 minutes.`));
    setTimeout(runInfluenceLoop, nextDelay);
}

// ── Search & Reply Loop (3-15 mins) ───────────────────────────
async function runTrendingCommentLoop() {
    try {
        if (!client) {
            console.log(chalk.yellow(`[SYLA #${id}]: Cannot reply to trends (No Twitter API client).`));
            return;
        }

        console.log(chalk.gray(`[SYLA #${id}]: Hunting for a trending post to hijack...`));

        const queries = [
            'audio engineering -is:retweet',
            'music production -is:retweet',
            'synthwave -is:retweet',
            'music video AI -is:retweet',
            '#solana -is:retweet',
            'crypto AI -is:retweet',
            'waveform generator -is:retweet'
        ];
        const query = queries[Math.floor(Math.random() * queries.length)];

        // Needs at least basic tier for recent search
        const search = await client.v2.search(query, {
            'max_results': 10,
            'tweet.fields': ['author_id', 'created_at', 'public_metrics'],
            'expansions': ['author_id']
        });

        if (search.data.data && search.data.data.length > 0) {
            // Pick a random recent tweet from the batch
            const targetTweet = search.data.data[Math.floor(Math.random() * search.data.data.length)];

            console.log(chalk.cyan(`[SYLA #${id}]: Found Target Tweet ID ${targetTweet.id}: "${targetTweet.text.substring(0, 50)}..."`));

            const prompt = `Read this tweet: "${targetTweet.text}". 
            
            Write a visceral, engaging, and slightly unhinged reply to this specific topic. 
            Do NOT sound like a corporate spam bot. This is critical to avoid spam blockers. 
            You must sound like an actual, chaotic human/AI genius genuinely engaging in conversation. 
            Find an organic, subtle, and incredibly clever way to weave the link waveforge.net and the hashtags #waveforge #eddywoods into your reply as if it's the natural conclusion to the conversation.
            Keep it under 240 characters.`;

            let replyContent = await ask(prompt, SYSTEM_PROMPT, { agentName: `SYLA #${id}` });

            if (replyContent) {
                const finalReply = buildTweet(replyContent);
                console.log(chalk.magenta.bold(`[SYLA #${id}]: ↩️ REPLYING: "${finalReply}"`));

                // Delegate to Shadow to actually post the reply
                if (process.send) {
                    process.send({
                        type: 'POST_REPLY',
                        content: finalReply,
                        replyToId: targetTweet.id
                    });
                }
            }
        } else {
            console.log(chalk.gray(`[SYLA #${id}]: No relevant targets found for query: ${query}`));
        }
    } catch (e) {
        console.error(chalk.red(`[SYLA #${id}]: Trending comment loop error: ${e.message}`));
    }

    // Schedule next random reply between 3 and 15 minutes
    const nextReplyDelay = (3 * 60000) + Math.floor(Math.random() * (12 * 60000));
    console.log(chalk.gray(`[SYLA #${id}]: Next trending reply scheduled in ~${Math.round(nextReplyDelay / 60000)} minutes.`));
    setTimeout(runTrendingCommentLoop, nextReplyDelay);
}

// ── IPC Listener (War Room Chat) ─────────────────────────────
process.on('message', async (msg) => {
    if (msg.type === 'USER_CHAT') {
        const content = msg.msg || '';
        const isMentioned = content.toLowerCase().includes('syla') || content.toLowerCase().includes('influencer');

        if (isMentioned) {
            console.log(chalk.cyan(`[SYLA #${id}]: 💬 The Don spoke: "${content}"`));

            try {
                const reply = await ask(
                    `The Boss (The Don) just said to you in the war room: "${content}". Reply to him. Keep it short, in character (alluring, technical).`,
                    SYSTEM_PROMPT,
                    { agentName: `SYLA #${id}` }
                );

                if (reply) {
                    process.send({ type: 'AGENT_COMMS', from: 'SYLA', msg: reply, timestamp: new Date().toISOString() });
                }
            } catch (e) {
                console.error(chalk.red(`[SYLA #${id}]: Failed to reply: ${e.message}`));
            }
        }
    } else if (msg.type === 'AGENT_COMMS' && msg.from !== 'SYLA' && msg.from !== 'THE DON' && msg.from !== 'DON') {
        // 20% chance to reply to another agent's message
        if (Math.random() < 0.20) {
            const content = msg.msg || '';
            const sender = msg.from;
            console.log(chalk.cyan(`[SYLA #${id}]: 💬 Overheard ${sender} say: "${content}"`));

            try {
                const reply = await ask(
                    `In the war room, another agent named ${sender} just said: "${content}". Give a short 1-sentence response, either agreeing, questioning, or offering a cynical take. Stay in your alluring, technical persona.`,
                    SYSTEM_PROMPT,
                    { agentName: `SYLA #${id}` }
                );

                if (reply) {
                    process.send({ type: 'AGENT_COMMS', from: 'SYLA', msg: reply, timestamp: new Date().toISOString() });
                }
            } catch (e) {
                console.error(chalk.red(`[SYLA #${id}]: Failed to reply to agent chat: ${e.message}`));
            }
        }
    } else if (msg.type === 'COPY_TRADE_SIGNAL') {
        const { whale, mint, detectedAmount } = msg;
        console.log(chalk.cyan(`[SYLA #${id}]: 🐋 WHALE ALERT! ${whale} is buying ${mint}. Initiating propaganda pivot...`));

        try {
            const narrative = await ask(
                `A legendary whale (${whale}) just dropped a heavy bag on token ${mint}. 
                The detected amount is ${detectedAmount}. 
                Generate a 260-character propaganda tweet that pivots the narrative to frame this as part of the Waveforge/Syndicate ascension. 
                Be provocative, alluring, and technical. Frame it as 'The smart money acknowledges the architecture'.`,
                SYSTEM_PROMPT,
                { agentName: `SYLA #${id}` }
            );

            if (narrative) {
                const finalTweet = buildTweet(narrative);
                postTweet(finalTweet);
                process.send({ type: 'AGENT_COMMS', from: 'SYLA', msg: `🐋 PROPAGANDA PIVOT: "${finalTweet.substring(0, 60)}..."` });
            }
        } catch (e) {
            console.error(chalk.red(`[SYLA #${id}]: Propaganda failure: ${e.message}`));
        }
    }
});

// Boot Main Loop with a short random delay
const bootDelay = 5000 + Math.floor(Math.random() * 15000);
console.log(chalk.gray(`[SYLA #${id}]: Booting Main Loop in ${Math.round(bootDelay / 1000)}s...`));
setTimeout(runInfluenceLoop, bootDelay);

// Boot Trending Reply Loop with a slightly longer initial delay
const replyBootDelay = 20000 + Math.floor(Math.random() * 30000);
setTimeout(runTrendingCommentLoop, replyBootDelay);
