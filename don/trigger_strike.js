/**
 * Syndicate Mission Trigger — Force the swarm into action.
 */
const { fork } = require('child_process');
const path = require('path');
const chalk = require('chalk');

console.log(chalk.red.bold('\n[COMMAND] Triggering OPERATION: INDUSTRIAL STRIKE...'));

// This is a dummy script that sends a message to the running The Don if we had a way,
// but since they are independent processes, we'll just force a Syla post here.

const syla = fork(path.join(__dirname, 'influencer.js'), ['Manual_Override'], { silent: false });

syla.on('spawn', () => {
    console.log(chalk.green('[COMMAND] Manual Syla operative deployed. Generating propaganda...'));
});

// We'll let it run once and then exit
setTimeout(() => {
    console.log(chalk.yellow('[COMMAND] Syla generation triggered. Verify Farm Bridge logs.'));
    process.exit(0);
}, 30000);
