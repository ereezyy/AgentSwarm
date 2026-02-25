const { fork } = require('child_process');
const path = require('path');
const chalk = require('chalk');

const CALLER_PATH = path.resolve(__dirname, '../don/caller.js');
const caller = fork(CALLER_PATH, ['TestRunner']);

console.log(chalk.cyan('Starting Vocal & Audio Verification...'));

caller.on('message', (msg) => {
    console.log(chalk.gray(`[CALLER MESSAGE]: ${JSON.stringify(msg)}`));
});

async function runTests() {
    // 1. Test Regular Status Update (WW2 General Style + TICK)
    console.log(chalk.yellow('\n--- Test 1: Periodic Report (WW2 style + Tick) ---'));
    // We can't easily trigger the interval, so we send a MANUAL_UPDATE command if added, 
    // or just wait for the initial greeting which should trigger automatically on spawn.
    // wait 10s for initial greeting
    await new Promise(r => setTimeout(r, 10000));

    // 2. Test TTS Sanitization (Star fix)
    console.log(chalk.yellow('\n--- Test 2: TTS Sanitization (Star fix) ---'));
    caller.send({
        type: 'SPEAK_ALERT',
        text: 'The mission target is *Alpha* One. Proceed to *Sector* 7.',
        level: 'INFO'
    });
    await new Promise(r => setTimeout(r, 8000));

    // 3. Test Critical Error (BAD Tone)
    console.log(chalk.yellow('\n--- Test 3: Critical Error (BAD Tone) ---'));
    caller.send({
        type: 'SPEAK_ALERT',
        text: 'System breach detected! Casualty count rising.',
        level: 'ERROR'
    });
    await new Promise(r => setTimeout(r, 8000));

    // 4. Test Snipe Success (GOOD Tone)
    console.log(chalk.yellow('\n--- Test 4: Snipe Success (GOOD Tone) ---'));
    caller.send({
        type: 'PLAY_CUE',
        cue: 'GOOD'
    });
    caller.send({
        type: 'SPEAK_ALERT',
        text: 'Target eliminated. Secured five hundred thousand profit units. Excellent work.',
        cue: 'GOOD'
    });
    await new Promise(r => setTimeout(r, 10000));

    console.log(chalk.cyan('\nVerification Sequence Complete.'));
    caller.kill();
    process.exit(0);
}

runTests();
