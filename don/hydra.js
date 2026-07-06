// don/hydra.js - THE HYDRA (CONSENSUS ENGINE)
// Orchestrates 5 sub-agent personas to engage with Syla's posts,
// manufacturing social proof and algorithmic boost.

const chalk = require('chalk');
require('dotenv').config();

const { orchestrateEngagement } = require('./skills/twitter/engagement');

const id = process.argv[2] || 'Hydra';

console.log(chalk.hex('#7000FF').bold(`[HYDRA #${id}]: Social Consensus Engine Online. 5 Heads Active.`));

// ── IPC Listener ─────────────────────────────────────────────
process.on('message', (msg) => {
    switch (msg.type) {
        case 'TWEET_SENT':
            // Triggered when Syla (via Shadow) posts a tweet
            if (msg.id && msg.text) {
                // 80% chance to engage (don't ratio every single tweet)
                if (Math.random() < 0.8) {
                    orchestrateEngagement(msg.id, msg.text, id);
                } else {
                    console.log(chalk.gray(`[HYDRA #${id}]: Standing down on Tweet ${msg.id}. Natural pause.`));
                }
            }
            break;

        case 'HYDRA_TEST':
            // Manual test trigger
            orchestrateEngagement('TEST-ID', 'Just deployed the new consensus algorithm. The swarm is evolving.', id);
            break;
    }
});

// Boot message
if (process.send) {
    process.send({ type: 'AGENT_COMMS', from: 'HYDRA', msg: 'Consensus Engine active. Waiting for signals.' });
}
