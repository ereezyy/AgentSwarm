// don/skills/twitter/engagement.js

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { HEADS } = require('./personas.js');
const { ask } = require('../../brain.js');

const ENGAGEMENT_LOG = path.resolve(__dirname, '../../../missions/hydra_engagement.md');
const missionsDir = path.join(__dirname, '../../../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

async function engage(head, tweetId, tweetText, id) {
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

// ── Orchestration Logic ──────────────────────────────────────
async function orchestrateEngagement(tweetId, tweetText, id) {
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
            await engage(head, tweetId, tweetText, id);
        }, delay);
    }
}

module.exports = { orchestrateEngagement, engage };
