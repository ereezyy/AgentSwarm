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

async function speak(text, options = {}) {
    if (!text) return;

    // Sanitize text for TTS (replace * to prevent "Star")
    let cleanText = text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

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
weeklyCleanup();
setInterval(weeklyCleanup, 86400000);

async function runStatusUpdate() {
    try {
        const msg = await ask(
            "Periodic field report.",
            "You are 'The General', a WW2 Battle General giving a grit-heavy, concise status report of the Syndicate swarm's standing. Focus on objectives secured, casualties (errors), and supply lines (funds). Stay in character. No fluff.",
            { agentName: `CALLER #${id}` }
        );
        await speak(msg, { cue: 'TICK' });
    } catch (e) {
        console.log(chalk.yellow(`[CALLER #${id}]: Brain request skipped: ${e.message}`));
    }
}

// Initial Greeting on Launch
runStatusUpdate();

// Set 30 Minute Interval (1,800,000 ms)
setInterval(runStatusUpdate, 1800000);

// IPC Listener for Event-Driven Speech (e.g., from The Don)
process.on('message', (msg) => {
    if (msg.type === 'SPEAK_ALERT') {
        speak(msg.text, { cue: msg.cue || (msg.level === 'ERROR' ? 'BAD' : null) });
    } else if (msg.type === 'PLAY_CUE') {
        playCue(msg.cue);
    }
});
