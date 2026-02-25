// don/influencer.js - SYLA: THE INFLUENCER (Waveforge Brand Voice)
// Generates Waveforge/Eddy Woods branded content, posts via Shadow execution arm.
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Influencer';
const { ask } = require('./brain');

// ── SoundCloud Track Library ──────────────────────────────────
// Add/remove tracks here. Each post will embed a different one.
const SOUNDCLOUD_TRACKS = [
    'https://soundcloud.com/eric-reeds/killing-me-softly',
    'https://soundcloud.com/eric-reeds/all-i-know-1',
    'https://soundcloud.com/eric-reeds/all-i-know-2',
    'https://soundcloud.com/eric-reeds/all-i-know-4',
    'https://soundcloud.com/eric-reeds/all-i-know-8',
    'https://soundcloud.com/eric-reeds/all-i-know-is-10',
    'https://soundcloud.com/eric-reeds/get-the-picture',
    'https://soundcloud.com/eric-reeds/run-motherfucker-run',
    'https://soundcloud.com/eric-reeds/asshole-anthem',
    'https://soundcloud.com/eric-reeds/im-a-death-addict',
];
const SOUNDCLOUD_PROFILE = 'https://soundcloud.com/eric-reeds';
const WAVEFORGE_URL = 'waveforge.net';
let trackIndex = Math.floor(Math.random() * SOUNDCLOUD_TRACKS.length);

// ── Posting State ─────────────────────────────────────────────
const CONTENT_LOG = path.resolve(__dirname, '../missions/syla_posts.md');
let postCount = 0;

console.log(chalk.red.bold(`[SYLA #${id}]: 🎵 Waveforge Brand Voice activated. Eddy Woods in the building.`));

// ── The Persona ───────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the brand voice for Eddy Woods and Waveforge.

ABOUT EDDY WOODS: Music producer, audio architect, and audio engineer who creates immersive soundscapes and waveform visualizations.

ABOUT WAVEFORGE (waveforge.net): A waveform video creator platform. They offer:
- FREE music video creation from any audio track
- API access for workflow automation
- Professional waveform visualizations
- Custom audio branding solutions

YOUR VOICE: Alluring, thought-provoking, provocative, and engaging. You speak like an artist who understands both the creative and technical sides of sound. Mix poetic language about sound/frequency with confident, punchy statements. Be mysterious and magnetic — make people curious.

RULES:
- Write exactly ONE tweet (no prefix, no labels, just the raw tweet text)
- Keep it under 260 characters (leave room for links)
- Do NOT use hashtag spam — max 1-2 hashtags if any
- Make it feel organic, like a real artist posting — NOT like an ad
- Be provocative or philosophical about sound, music, creation, or technology
- Occasionally reference specific concepts: waveforms, frequency, sonic identity, audio architecture
- NEVER be generic or corporate-sounding
- Vary your style: sometimes poetic, sometimes punchy, sometimes a hot take`;

// ── Content Templates (fallback if brain fails) ───────────────
const FALLBACK_CONTENT = [
    "Every brand has a look. How many have a sound? Define yours.",
    "Sound isn't decoration. It's architecture. Build something worth hearing.",
    "Your waveform tells a story. Make sure it's the right one.",
    "The future doesn't have a playlist. It has a frequency.",
    "Most people see music. I build with it.",
    "Silence is just sound waiting for permission.",
    "Your ears process emotion faster than your eyes. Use that.",
    "Audio isn't content. It's atmosphere. Shape the room before you fill it.",
    "Free music videos. No catch. Just craft.",
    "Some frequencies change how you feel. Others change how you think.",
];

// ── Post Tweet via Shadow ─────────────────────────────────────
function postTweet(tweetText) {
    console.log(chalk.magenta.bold(`[SYLA #${id}]: 📤 POSTING: "${tweetText}"`));

    // Log every post
    fs.appendFileSync(CONTENT_LOG, `\n[${new Date().toLocaleString()}] ${tweetText}\n`);

    // Delegate to Shadow for API execution
    if (process.send) {
        process.send({ type: 'POST_TWEET', content: tweetText });
        // Phase 5: Deep Social Injection - Trigger Phone Farm Boost
        process.send({ type: 'FARM_BOOST', url: 'https://twitter.com/WaveforgeAI', platform: 'TWITTER' });
        console.log(chalk.cyan(`[SYLA #${id}]: Delegated to Shadow and Farm Agent for execution.`));
    } else {
        console.log(chalk.yellow(`[SYLA #${id}]: No IPC — tweet logged to ${CONTENT_LOG}`));
    }
}

// ── Get Next SoundCloud Track ─────────────────────────────────
function getNextTrack() {
    const track = SOUNDCLOUD_TRACKS[trackIndex % SOUNDCLOUD_TRACKS.length];
    trackIndex++;
    return track;
}

// ── Build Final Tweet ─────────────────────────────────────────
function buildTweet(rawContent) {
    let tweet = rawContent.trim();

    // Clean AI artifacts
    tweet = tweet.replace(/^["']|["']$/g, '');
    tweet = tweet.replace(/^TWEET:\s*/i, '');
    tweet = tweet.replace(/^\d+\.\s*/, '');

    // Pick whether to include SoundCloud track or Waveforge link
    // Alternate: track every other post, profile link on others
    const track = getNextTrack();
    const link = postCount % 3 === 0 ? SOUNDCLOUD_PROFILE :
        postCount % 3 === 1 ? track :
            `https://${WAVEFORGE_URL}`;

    // Ensure total length stays under 280
    const maxContentLen = 280 - link.length - 3; // 3 for \n\n spacing
    if (tweet.length > maxContentLen) {
        tweet = tweet.substring(0, maxContentLen - 1) + '…';
    }

    return `${tweet}\n\n${link}`;
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
            console.log(chalk.yellow(`[SYLA #${id}]: Brain unavailable. Using fallback content.`));
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

    // Irregular cadence: 25-35 minutes (semi-random)
    const nextDelay = 1500000 + Math.floor(Math.random() * 600000); // 25-35 min
    const nextMins = Math.round(nextDelay / 60000);
    console.log(chalk.gray(`[SYLA #${id}]: Next post in ~${nextMins} minutes.`));
    setTimeout(runInfluenceLoop, nextDelay);
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

// Boot with a short random delay (avoid instant post on restart)
const bootDelay = 5000 + Math.floor(Math.random() * 15000); // 5-20s
console.log(chalk.gray(`[SYLA #${id}]: Booting in ${Math.round(bootDelay / 1000)}s...`));
setTimeout(runInfluenceLoop, bootDelay);
