// don/forge.js - THE FORGER (VISUAL ASSETS)
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const { JSDOM } = require("jsdom");
const fetch = require("node-fetch");
require('dotenv').config();

const id = process.argv[2] || 'Forger';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const PERCHANCE_GENERATOR = process.env.PERCHANCE_GENERATOR || 'cyberpunk-city-generator'; // Default/Placeholder

console.log(chalk.magenta.bold(`[FORGER #${id}]: Visual Production Unit Online. Branding Syla...`));
if (process.env.PERCHANCE_GENERATOR) console.log(chalk.cyan(`[FORGER #${id}]: Perchance Mode Active (Generator: ${PERCHANCE_GENERATOR})`));

if (!openai) {
    console.log(chalk.yellow(`[FORGER #${id}]: OPENAI_API_KEY missing. Visual generation on standby.`));
}

async function generateSylaImage(prompt) {
    if (!openai) {
        return;
    }

    try {
        console.log(chalk.magenta(`[FORGER #${id}]: Generating radioactive visuals...`));
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: `A hyper-realistic, high-fashion influencer named Syla. She is extremely intelligent, provocatively elegant, and has a sharp, slightly mean-spirited billionaire's daughter vibe. Background is a high-tech crypto command center with green digital displays. Cinematic lighting. Style: Premium Social Media Influencer. Detail: ${prompt}`,
            n: 1,
            size: "1024x1024",
        });

        const imageUrl = response.data[0].url;
        const timestamp = Date.now();
        const fileName = `syla_vibe_${timestamp}.png`;
        const filePath = path.resolve(__dirname, `../public/${fileName}`);

        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(filePath, imageResponse.data);

        console.log(chalk.green(`[FORGER #${id}]: Visual secured: ${fileName}`));

        if (process.send) {
            process.send({
                type: 'SKILL_READY',
                skill: 'VISUAL_CONTENT',
                path: `/public/${fileName}`
            });
        }
    } catch (e) {
        console.error(chalk.red(`[FORGER #${id}]: Visual generation failed: ${e.message}`));
    }
}

// IPC Listener for image requests
process.on('message', (msg) => {
    if (msg.type === 'GENERATE_IMAGE') {
        generateSylaImage(msg.prompt);
    } else if (msg.type === 'GENERATE_MEME') {
        generateMeme(msg.text);
    }
});

async function generateMeme(tokenName) {
    if (!openai) return;
    try {
        console.log(chalk.cyan.bold(`[FORGER #${id}]: Forging meme asset for ${tokenName}...`));
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: `High-octane cyberpunk crypto meme art featuring the token "${tokenName}". Vibrant neon green charts going vertical, laser eyes, chaotic glitch effects. Text: "APING ${tokenName}". Style: Vaporwave 80s Retro Futurism x Matrix.`,
            n: 1,
            size: "1024x1024",
        });

        const imageUrl = response.data[0].url;
        const fileName = `meme_${tokenName.replace(/[^a-z0-9]/gi, '')}_${Date.now()}.png`;
        const filePath = path.resolve(__dirname, `../public/${fileName}`);

        // Ensure public dir exists (it should)
        if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });

        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(filePath, imageResponse.data);

        console.log(chalk.green(`[FORGER #${id}]: Meme secured: ${fileName}`));

        if (process.send) {
            process.send({
                type: 'MEME_READY',
                token: tokenName,
                path: `/public/${fileName}` // Relative path for web serving
            });
        }
    } catch (e) {
        console.error(chalk.red(`[FORGER #${id}]: Meme generation failed: ${e.message}`));
    }
}

// Periodic brand maintenance
setInterval(() => {
    generateSylaImage("Looking unimpressed at a failing candle chart while holding an expensive martini.");
}, 3600000); // 1 hour


// ============================================================
// DIY PERCHANCE API (Experimental)
// ============================================================
async function generatePerchanceImage(prompt) {
    const generatorName = PERCHANCE_GENERATOR;
    console.log(chalk.magenta(`[FORGER #${id}]: Attempting DIY Perchance generation (${generatorName})...`));

    try {
        const response = await fetch(`https://perchance.org/api/downloadGenerator?generatorName=${generatorName}&__cacheBust=${Math.random()}`);
        const html = await response.text();

        if (!html) throw new Error("Empty response from Perchance");

        const dom = new JSDOM(html, {
            runScripts: "dangerously",
            resources: "usable",
            virtualConsole: new (require("jsdom").VirtualConsole)() // Mute console noise
        });
        const { window } = dom;

        // Wait for Perchance to initialize (simulated delay, or check readiness)
        await new Promise(r => setTimeout(r, 2000));

        // Logic depends on the specific generator's output structure.
        // Most use 'output' or 'image' lists. 
        // We try to grab an image URL or text.

        let result = null;
        try {
            // Attempt to access common root properties
            if (window.root && window.root.output) {
                result = window.root.output.toString();
            } else if (window.root && window.root.image) {
                result = window.root.image.toString();
            }
        } catch (e) {
            console.log(chalk.yellow(`[FORGER #${id}]: Could not access standard root.output.`));
        }

        if (result) {
            console.log(chalk.green(`[FORGER #${id}]: Perchance Output: ${result.substring(0, 100)}...`));

            // If result is a URL (image), download it
            if (result.match(/^https?:\/\/.*\.(png|jpg|jpeg|gif|webp)/i)) {
                const timestamp = Date.now();
                const fileName = `perchance_${generatorName}_${timestamp}.png`;
                const filePath = path.resolve(__dirname, `../public/${fileName}`);

                const imgRes = await axios.get(result, { responseType: 'arraybuffer' });
                fs.writeFileSync(filePath, imgRes.data);
                console.log(chalk.green(`[FORGER #${id}]: Perchance Asset secured: ${fileName}`));

                if (process.send) {
                    process.send({
                        type: 'SKILL_READY',
                        skill: 'VISUAL_CONTENT',
                        path: `/public/${fileName}`
                    });
                }
            }
        } else {
            console.log(chalk.yellow(`[FORGER #${id}]: No usable output from Perchance generator.`));
        }

    } catch (e) {
        console.error(chalk.red(`[FORGER #${id}]: DIY Perchance API failed: ${e.message}`));
        if (e.message.includes("runScripts")) {
            console.log(chalk.gray(`[FORGER #${id}]: Note: Some Perchance plugins (like text-to-image) require browser ads and strictly fail in JSDOM.`));
        }
    }
}

// IPC Extension
process.on('message', (msg) => {
    if (msg.type === 'GENERATE_PERCHANCE') {
        generatePerchanceImage(msg.prompt);
    }
});
