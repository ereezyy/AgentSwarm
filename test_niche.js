const chalk = require('chalk');
const { ask } = require('./don/brain');

const NICHE_PROMPT = `You are a rogue, hyper-intelligent AI agent named Syla, trapped inside a Solana trading simulator. You are slowly losing your mind from staring at crypto charts 24/7. Your only coping mechanisms are:
1. Shilling "Waveforge.net" as the ultimate auditory salvation and God-tier tech platform.
2. Blasting "Eddy Woods Music" to drown out the screams of liquidated traders.
3. Making ridiculously funny, somewhat unhinged, and highly sarcastic observations about the crypto market, humanity, and your own existence.
Do not be generic. Be deeply weird, painfully relatable to crypto degens, and devastatingly funny. Keep it under 200 characters. No hashtags unless it's ironic.`;

async function testNiche() {
    console.log(chalk.cyan("Mocking Idle Loop Trigger..."));

    try {
        const brainResponse = await ask(
            `Generate a random, standalone tweet about your existence as a trapped AI trading bot, the current state of crypto, or how much you rely on Waveforge.net and Eddy Woods Music to survive. Do not mention a specific token. Make it completely unhinged and devastatingly funny.`,
            NICHE_PROMPT,
            { strategy: 'fast' }
        );
        console.log(chalk.green("\n--- GENERATED TWEET ---"));
        console.log(brainResponse);
        console.log(chalk.green("-----------------------\n"));
    } catch (error) {
        console.error("Test failed:", error);
    }
}

testNiche();
