const { ElevenLabsClient } = require('elevenlabs-node');
const { createClient } = require('@deepgram/sdk');
const { Readable } = require('stream');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const player = require('play-sound')(opts = {});
require('dotenv').config();

const id = process.argv[2] || 'Caller';
const DG_KEY = process.env.DEEPGRAM_API_KEY;
const EL_KEY = process.env.ELEVEN_LABS_API_KEY;
const { ask } = require('./brain');

// Audio Cues
const CUES = {
    TICK: '"C:\\Windows\\Media\\Windows Navigation Start.wav"',
    BAD: '"C:\\Windows\\Media\\Windows Critical Stop.wav"',
    GOOD: '"C:\\Windows\\Media\\tada.wav"'
};

console.log(chalk.red.bold(`[CALLER #${id}]: Audio Mode Active. Frequency: 30min.`));

async function playCue(type) {
    const cuePath = CUES[type];
    if (cuePath) {
        const cleanPath = cuePath.replace(/"/g, ''); // For fs check
        if (fs.existsSync(cleanPath)) {
            return new Promise((resolve) => {
                console.log(chalk.green(`[CALLER #${id}]: 🔊 Playing cue: ${type}`));
                player.play(cuePath, (err) => {
                    if (err) console.error(chalk.red(`[CALLER #${id}]: Cue error for ${type}: ${err.message || 'Check player logs'}`));
                    else console.log(chalk.green(`[CALLER #${id}]: ✅ Cue ${type} complete.`));
                    resolve();
                });
            });
        }
    }
}


function sanitizeTTS(text) {
    if (!text) return '';
    return text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}
async function speak(text, options = {}) {
    if (!text) return;

    let cleanText = sanitizeTTS(text);

    console.log(chalk.white(`[CALLER #${id}] 🎙️: "${cleanText.substring(0, 100)}..."`));

    // Play cue if requested
    if (options.cue) {
        await playCue(options.cue);
    }

    // PRIORITY 1: ELEVENLABS (High Fidelity)
    if (EL_KEY) {
        try {
            const axios = require('axios');
            const timestamp = Date.now();
            const tempFile = path.resolve(__dirname, `../temp_voice_${id}_${timestamp}.mp3`);

            const response = await axios({
                method: 'post',
                url: `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': EL_KEY
                },
                data: {
                    text: cleanText,
                    model_id: "eleven_monolingual_v1",
                    voice_settings: { stability: 0, similarity_boost: 0, style: 0 }
                },
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(tempFile);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(chalk.green(`[CALLER #${id}]: 🔊 Playing (ElevenLabs)...`));
            player.play(tempFile, (err) => {
                if (err) console.error(chalk.red(`[CALLER #${id}]: Playback error: ${err.message}`));
                else console.log(chalk.green(`[CALLER #${id}]: ✅ Playback complete.`));
            });
            return;
        } catch (e) {
            // Enhanced error logging to catch 401 Unauthorized or Quota Exceeded silently
            const status = e.response?.status;
            const errorMsg = status === 401 ? '401 Unauthorized (Invalid API Key)' : (status === 429 ? '429 Quota Exceeded' : e.message);
            console.error(chalk.yellow(`[CALLER #${id}]: ElevenLabs failed (${errorMsg}). Falling back to Deepgram.`));
        }
    }

    // PRIORITY 2: DEEPGRAM (Fast / Backup)
    if (!DG_KEY) {
        console.log(chalk.yellow(`[CALLER #${id}]: No Voice Keys. Text-only mode.`));
        return;
    }

    try {
        const deepgram = createClient(DG_KEY);

        // Split text if it exceeds Deepgram's limit (approx 2000 chars)
        const chunks = cleanText.match(/[\s\S]{1,1800}/g) || [];

        for (const chunk of chunks) {
            const response = await deepgram.speak.request(
                { text: chunk },
                { model: "aura-helios-en", encoding: "linear16", container: "wav" }
            );

            const stream = await response.getStream();
            if (!stream) throw new Error("Voice stream is empty");

            const timestamp = Date.now();
            const tempFile = path.resolve(__dirname, `../temp_voice_${id}_${timestamp}.wav`);
            const writeStream = fs.createWriteStream(tempFile);

            const nodeStream = Readable.fromWeb(stream);
            nodeStream.pipe(writeStream);

            await new Promise((resolve) => {
                writeStream.on('finish', () => {
                    console.log(chalk.green(`[CALLER #${id}]: 🔊 Playing (Deepgram chunk)...`));
                    player.play(tempFile, (err) => {
                        if (err) console.error(chalk.red(`[CALLER #${id}]: Playback error: ${err.message}`));
                        else console.log(chalk.green(`[CALLER #${id}]: ✅ Chunk complete.`));
                        resolve();
                    });
                });
            });
        }
    } catch (e) {
        console.error(chalk.red(`[CALLER #${id}]: Deepgram failure: ${e.message}`));
    }
}

// Global cleanup: Purge files older than 7 days
async function weeklyCleanup() {
    const dir = path.resolve(__dirname, "../");
    try {
        const files = await fs.promises.readdir(dir);
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        await Promise.all(files.map(async (file) => {
            if (file.startsWith("temp_voice_") && (file.endsWith(".wav") || file.endsWith(".mp3"))) {
                const filePath = path.join(dir, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    if (now - stats.mtimeMs > oneWeek) {
                        await fs.promises.unlink(filePath);
                        console.log(chalk.gray(`[CALLER] Weekly Purge: Deleted ${file}`));
                    }
                } catch (e) { }
            }
        }));
    } catch (err) {
        console.error(chalk.red(`[CALLER] Cleanup error: ${err.message}`));
    }
}

// Run cleanup on launch and every 24 hours

// ── 30-MINUTE RECAP (DATA-DRIVEN, NASTY, VISCERAL) ──────────────
let pendingRecapResolve = null;

async function runRecap() {
    try {
        // Request real data from The Don
        if (!process.send) return;

        const recapData = await new Promise((resolve) => {
            pendingRecapResolve = resolve;
            process.send({ type: 'RECAP_REQUEST' });
            // 10s timeout in case Don doesn't respond
            setTimeout(() => {
                if (pendingRecapResolve) {
                    pendingRecapResolve(null);
                    pendingRecapResolve = null;
                }
            }, 10000);
        });

        // Build the event summary from real data
        let eventSummary = 'No significant events in the last 30 minutes. Dead silence.';
        if (recapData && recapData.events && recapData.events.length > 0) {
            const events = recapData.events;
            const errors = events.filter(e => e.type === 'ERROR');
            const money = events.filter(e => e.type === 'MONEY');
            const crypto = events.filter(e => e.type === 'CRYPTO');
            const power = events.filter(e => e.type === 'POWER');

            const lines = [];
            if (money.length) lines.push(`REVENUE EVENTS (${money.length}): ${money.slice(-5).map(e => e.msg).join(' | ')}`);
            if (crypto.length) lines.push(`CRYPTO/TRADE EVENTS (${crypto.length}): ${crypto.slice(-5).map(e => e.msg).join(' | ')}`);
            if (errors.length) lines.push(`ERRORS/CRASHES (${errors.length}): ${errors.slice(-3).map(e => e.msg).join(' | ')}`);
            if (power.length) lines.push(`SYSTEM EVENTS (${power.length}): ${power.slice(-3).map(e => e.msg).join(' | ')}`);
            eventSummary = lines.join('\n');
        }

        const stats = recapData?.stats || {};
        const statsLine = `Active Agents: ${stats.activeAgents || '?'} | War Chest: $${(stats.warChest || 0).toFixed(2)} | Open Positions: ${stats.openPositions || 0} | Uptime: ${stats.uptime || 0} min`;

        const msg = await ask(
            `30-MINUTE SYNDICATE RECAP.\n\nSTATS: ${statsLine}\n\nEVENTS:\n${eventSummary}\n\nGive a short, punchy, visceral recap. Be funny, nasty, and brutally honest. Roast agents that fucked up. Celebrate any wins. If nothing happened, roast the swarm for being lazy. Keep it under 4 sentences. No corporate bullshit.`,
            `You are the foul-mouthed narrator of a criminal AI swarm. You recap the last 30 minutes like a drunk mafia underboss giving a debrief at 3am. Be vulgar, funny, and visceral. Real talk only. If there's nothing to report, roast the whole operation. Never use corporate-speak. Short and brutal.`,
            { agentName: `CALLER #${id}` }
        );
        await speak(msg, { cue: 'TICK' });
    } catch (e) {
        console.log(chalk.yellow(`[CALLER #${id}]: Recap skipped: ${e.message}`));
    }
}

// Initial greeting on launch (quick, not a full recap)

// 30 Minute Recap Interval

// IPC Listener

if (require.main === module) {
    weeklyCleanup();
    setInterval(weeklyCleanup, 86400000);
    setTimeout(async () => {
        try {
            const greeting = await ask(
                "The swarm just booted up. Give a one-sentence launch announcement.",
                "You are a foul-mouthed AI swarm narrator. One nasty sentence announcing the swarm is online. Keep it short and mean.",
                { agentName: `CALLER #${id}` }
            );
            await speak(greeting, { cue: 'GOOD' });
        } catch (e) { }
    }, 5000);
    setInterval(runRecap, 1800000);
    process.on('message', (msg) => {
        if (msg.type === 'SPEAK_ALERT') {
            speak(msg.text, { cue: msg.cue || (msg.level === 'ERROR' ? 'BAD' : null) });
        } else if (msg.type === 'PLAY_CUE') {
            playCue(msg.cue);
        } else if (msg.type === 'RECAP_DATA') {
            // Response from Don with activity buffer
            if (pendingRecapResolve) {
                pendingRecapResolve(msg);
                pendingRecapResolve = null;
            }
        }
    });
}

module.exports = { sanitizeTTS, speak, playCue };
