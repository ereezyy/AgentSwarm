const WebSocket = require('ws');
const chalk = require('chalk');

const WS_URL = 'ws://localhost:8080';
const args = process.argv.slice(2);
const token = args[0];

console.log(chalk.blue.bold(`Testing WebSocket connection to ${WS_URL}`));
console.log(token ? chalk.green(`Using token: ${token}`) : chalk.yellow('No token provided'));

const ws = new WebSocket(token ? `${WS_URL}?token=${token}` : WS_URL);

let openTimeout;

ws.on('open', () => {
    console.log('Connection opened.');
    // Wait to see if it closes immediately
    openTimeout = setTimeout(() => {
        if (!token) {
            console.log(chalk.red.bold('FAIL: Connection remained open without token!'));
            ws.close();
            process.exit(1);
        } else {
            console.log(chalk.green.bold('SUCCESS: Connection stable with token.'));
            ws.close();
            process.exit(0);
        }
    }, 500);
});

ws.on('close', (code, reason) => {
    clearTimeout(openTimeout);
    console.log(`Connection closed: ${code} ${reason}`);
    if (!token) {
        if (code === 1008) {
            console.log(chalk.green.bold('SUCCESS: Connection rejected as expected (1008).'));
            process.exit(0);
        } else {
            console.log(chalk.yellow(`Closed with ${code}. Not 1008, but closed.`));
            process.exit(0);
        }
    } else {
        console.log(chalk.red.bold(`FAIL: Connection closed unexpectedly with token! Code: ${code}`));
        process.exit(1);
    }
});

ws.on('error', (err) => {
    console.log(`Error: ${err.message}`);
    process.exit(1);
});
