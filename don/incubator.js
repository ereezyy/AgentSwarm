// don/incubator.js - THE INCUBATOR (AUTONOMOUS TOKEN LAUNCHPAD)
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Incubator';
const { askJSON, ask } = require('./brain');
let queryLocalBrain = null;
try { queryLocalBrain = require('./edge_brain').queryLocalBrain; } catch (e) { /* Pi5 not available */ }

console.log(chalk.magenta.bold(`[INCUBATOR #${id}]: GENESIS ENGINE ONLINE. Scanning for viral narratives...`));

const SYSTEM_PROMPT = `You are 'The Incubator', a viral memecoin architect.
Your goal: Analyze current internet trends and generate a "high conviction" memecoin concept.
Output specific JSON:
{
  "name": "Token Name",
  "symbol": "TICKER",
  "description": "Viral tagline/bio",
  "image_prompt": "Description for The Forger to generate the logo",
  "twitter_post": "Announcement tweet for Syla"
}`;

async function conceiveToken() {
    if (!process.env.XAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
        console.log(chalk.yellow(`[INCUBATOR #${id}]: No brain keys. Standing by.`));
        return;
    }

    try {
        console.log(chalk.magenta(`[INCUBATOR #${id}]: Synthesizing meme DNA...`));

        // In a real scenario, this would digest data from Siren/Ghost
        const trends = "AI agents, autonomous swarms, infinite money glitches, cyberpunk";

        let concept = null;

        // 1. Attempt Local Brain (Pi 5) First
        if (queryLocalBrain) {
            try {
                console.log(chalk.magenta(`[INCUBATOR #${id}]: Consulting the Oracle (Pi 5)...`));
                const localResponse = await queryLocalBrain(`Current Trends: ${trends}. Create a token concept that dominates this narrative. Output JSON only.`, SYSTEM_PROMPT);

                if (localResponse) {
                    // Parse potentially messy JSON from local LLM
                    const jsonMatch = localResponse.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        concept = JSON.parse(jsonMatch[0]);
                        console.log(chalk.green(`[INCUBATOR #${id}]: Local Brain Success.`));
                    }
                }
            } catch (localError) {
                console.log(chalk.yellow(`[INCUBATOR #${id}]: Local Brain silent. Creating cloud uplink...`));
            }
        }

        // 2. Fallback to Cloud Brain (auto: xAI → Gemini → Groq)
        if (!concept) {
            try {
                const result = await askJSON(
                    `Current Trends: ${trends}. Create a token concept that dominates this narrative.`,
                    SYSTEM_PROMPT,
                    { agentName: `INCUBATOR #${id}` }
                );
                concept = result;
            } catch (brainErr) {
                console.log(chalk.yellow(`[INCUBATOR #${id}]: Brain failed: ${brainErr.message}`));
            }
        }

        if (!concept) throw new Error("Failed to generate concept after retries");

        console.log(chalk.green.bold(`[INCUBATOR #${id}]: 💡 CONCEPT BORN: $${concept.symbol} - ${concept.name}`));
        console.log(chalk.gray(`"${concept.description}"`));

        if (process.send) {
            // 1. Ask Forger for the Logo
            process.send({
                type: 'GENERATE_IMAGE',
                prompt: `Logo for a crypto token named ${concept.name} ($${concept.symbol}). Concept: ${concept.image_prompt}. Minimalist, iconic, sticker-ready.`
            });

            // 2. Report to Swarm
            process.send({
                type: 'INTEL_DATA',
                data: `INCUBATOR: Created concept $${concept.symbol} (${concept.name}).`,
                source: 'GENESIS_LAB'
            });

            // 3. Alert Syla to pre-market
            process.send({
                type: 'SIREN_SPEAK',
                text: `Incubator here. I've designed a new asset class. Ticker symbol: ${concept.symbol}. The narrative is primed.`
            });
        }

        // Save concept to file for deploying agent (The Deployer - future)
        const conceptDir = path.resolve(__dirname, '../missions/incubator_concepts');
        if (!fs.existsSync(conceptDir)) fs.mkdirSync(conceptDir, { recursive: true });
        fs.writeFileSync(
            path.join(conceptDir, `token_${Date.now()}.json`),
            JSON.stringify(concept, null, 2)
        );

    } catch (e) {
        console.error(chalk.red(`[INCUBATOR #${id}]: Conception failure: ${e.message}`));
    }
}

// Initial cycle
setTimeout(conceiveToken, 10000);

// Periodic generation check
setInterval(() => {
    // Only run if market conditions are frantic (simulated)
    if (Math.random() > 0.7) conceiveToken();
}, 3600000);
