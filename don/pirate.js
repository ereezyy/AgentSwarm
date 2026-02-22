// don/pirate.js - THE PIRATE (CONTENT REUSE ENGINE) 🏴‍☠️
// Scrapes viral content, analyzes it, and feeds it to Syla for reaction/reposting.

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

const { ask } = require('./brain');

const id = process.argv[2] || 'Pirate';
const RIPPER_SCRIPT = path.resolve(__dirname, '../muscle/ripper.py');
const LOOT_DIR = path.resolve(__dirname, '../loot');

console.log(chalk.hex('#FF4500').bold(`[PIRATE #${id}]: HOISTING THE COLORS. Content Engine Online.`));

if (!fs.existsSync(LOOT_DIR)) fs.mkdirSync(LOOT_DIR);

// ── Capabilities ─────────────────────────────────────────────

async function ripContent(url, mode = 'full') {
    console.log(chalk.hex('#FF4500')(`[PIRATE #${id}]: ⚔️ Ripping content from ${url} (${mode})...`));

    return new Promise((resolve, reject) => {
        const python = spawn('python', [RIPPER_SCRIPT, url, mode]);
        let dataStr = '';
        let errorStr = '';

        python.stdout.on('data', (data) => {
            dataStr += data.toString();
        });

        python.stderr.on('data', (data) => {
            errorStr += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                console.error(chalk.red(`[PIRATE #${id}]: Rip failed. Code: ${code}`));
                console.error(errorStr);
                return resolve({ error: 'Process failed', details: errorStr });
            }

            try {
                // Find JSON in output
                const jsonMatch = dataStr.match(/\{.*\}/s);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    if (result.error) {
                        console.error(chalk.red(`[PIRATE #${id}]: Rip error: ${result.error}`));
                        resolve({ error: result.error });
                    } else {
                        console.log(chalk.green(`[PIRATE #${id}]: ✅ LOOT SECURED: ${result.title}`));
                        console.log(chalk.gray(`Path: ${result.path}`));
                        resolve(result);
                    }
                } else {
                    resolve({ error: 'No JSON output from ripper' });
                }
            } catch (e) {
                resolve({ error: `JSON Parse error: ${e.message}`, raw: dataStr });
            }
        });
    });
}

async function analyzeAndReact(loot) {
    if (loot.error) return;

    console.log(chalk.hex('#FF4500')(`[PIRATE #${id}]: Analyzing loot for Syla reaction...`));

    // Construct context
    const context = `
    Video Title: ${loot.title}
    Uploader: ${loot.uploader}
    Views: ${loot.views}
    Likes: ${loot.likes}
    Description: (Viral Crypto/Audio Content)
    `;

    const systemPrompt = `You are Syla (The Influencer), a virtual being obsessed with "sonic identity" and "waveforms".
    A viral video just dropped. Data: ${context}.
    
    Write a tweet reacting to this content.
    - If it's cool: "The waveform on this is immaculate." or "High fidelity signal detected."
    - If it's dumb: "Noise floor is too high." or "Destructive interference."
    - Keep it under 280 chars.
    - Include the hashtag #Waveforge.
    - Mention the original uploader if known.
    `;

    const reaction = await ask(
        `React to this viral video: ${loot.title}`,
        systemPrompt,
        { agentName: 'PIRATE' }
    );

    if (reaction) {
        console.log(chalk.cyan(`[PIRATE #${id}]: Generated Reaction: "${reaction}"`));

        // Send to Shadow
        if (process.send) {
            process.send({
                type: 'POST_TWEET',
                text: reaction,
                mediaPath: loot.path
            });

            // Log for manual review
            const logEntry = `\n[${new Date().toLocaleString()}] RIP: ${loot.url}\nTITLE: ${loot.title}\nREACTION: ${reaction}\nPATH: ${loot.path}\n`;
            fs.appendFileSync(path.resolve(__dirname, '../missions/pirate_loot.md'), logEntry);
        }
    }
}

// ── IPC Listener ─────────────────────────────────────────────
process.on('message', async (msg) => {
    switch (msg.type) {
        case 'RIP_VIDEO':
            if (msg.url) {
                const loot = await ripContent(msg.url, msg.mode || 'full');
                await analyzeAndReact(loot);
            }
            break;

        case 'PIRATE_TEST':
            // Manual test
            console.log(chalk.hex('#FF4500')(`[PIRATE #${id}]: Running self-test...`));
            break;
    }
});


console.log(chalk.hex('#FF4500')(`[PIRATE #${id}]: Waiting for coordinates (IPC)...`));

// Keep alive
setInterval(() => { }, 60000);
