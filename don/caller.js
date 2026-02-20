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

console.log(chalk.red.bold(`[CALLER #${id}]: Audio Mode Active. Frequency: 30min.`));

async function speak(text) {
    if (!text) return;
    console.log(chalk.white(`[CALLER #${id}] 🎙️: "${text.substring(0, 100)}..."`));

    // PRIORITY 1: ELEVENLABS (High Fidelity)
    if (EL_KEY) {
        try {
            const el = new ElevenLabsClient({ apiKey: EL_KEY });
            // "Rachel" Voice ID: 21m00Tcm4TlvDq8ikWAM (or use Syla's custom voice if we had one)
            const audioStream = await el.textToSpeech.convert("21m00Tcm4TlvDq8ikWAM", {
                text: text,
                model_id: "eleven_monolingual_v1"
            });

            const timestamp = Date.now();
            const tempFile = path.resolve(__dirname, `../temp_voice_${id}_${timestamp}.mp3`);
            const writeStream = fs.createWriteStream(tempFile);

            audioStream.pipe(writeStream);

            writeStream.on('finish', () => {
                console.log(chalk.green(`[CALLER #${id}]: 🔊 Playing (ElevenLabs)...`));
                player.play(tempFile, (err) => {
                    if (err) console.error(chalk.red(`[CALLER #${id}]: Playback error: ${err.message}`));
                    else console.log(chalk.green(`[CALLER #${id}]: ✅ Playback complete.`));
                });
            });
            return; // Success
        } catch (e) {
            console.error(chalk.yellow(`[CALLER #${id}]: ElevenLabs failed (${e.message}). Falling back to Deepgram.`));
        }
    }

    // PRIORITY 2: DEEPGRAM (Fast / Backup)
    if (!DG_KEY) {
        console.log(chalk.yellow(`[CALLER #${id}]: No Voice Keys. Text-only mode.`));
        return;
    }

    try {
        const deepgram = createClient(DG_KEY);
        const response = await deepgram.speak.request(
            { text },
            { model: "aura-helios-en", encoding: "linear16", container: "wav" }
        );

        const stream = await response.getStream();
        if (!stream) throw new Error("Voice stream is empty");

        const timestamp = Date.now();
        const tempFile = path.resolve(__dirname, `../temp_voice_${id}_${timestamp}.wav`);
        const writeStream = fs.createWriteStream(tempFile);

        const nodeStream = Readable.fromWeb(stream);
        nodeStream.pipe(writeStream);

        writeStream.on('finish', () => {
            console.log(chalk.green(`[CALLER #${id}]: 🔊 Playing (Deepgram)...`));
            player.play(tempFile, (err) => {
                if (err) console.error(chalk.red(`[CALLER #${id}]: Playback error: ${err.message}`));
                else console.log(chalk.green(`[CALLER #${id}]: ✅ Playback complete.`));
            });
        });
    } catch (e) {
        console.error(chalk.red(`[CALLER #${id}]: Deepgram failure: ${e.message}`));
    }
}

// Global cleanup: Purge files older than 7 days
function weeklyCleanup() {
    const files = fs.readdirSync(path.resolve(__dirname, '../'));
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    files.forEach(file => {
        if (file.startsWith('temp_voice_') && file.endsWith('.wav')) {
            const filePath = path.resolve(__dirname, '../', file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > oneWeek) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(chalk.gray(`[CALLER] Weekly Purge: Deleted ${file}`));
                } catch (e) { }
            }
        }
    });
}

// Run cleanup on launch and every 24 hours
weeklyCleanup();
setInterval(weeklyCleanup, 86400000);

async function runStatusUpdate() {
    try {
        const msg = await ask(
            "Periodic update.",
            "You are 'The Caller'. Give a 1-sentence executive summary of the syndicate's standing. No fluff.",
            { agentName: `CALLER #${id}` }
        );
        await speak(msg);
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
        speak(msg.text);
    }
});
