require('dotenv').config();
const { Client } = require('ssh2');

const host = process.env.PI_HOST || '192.168.1.78';
const port = parseInt(process.env.PI_PORT || '22', 10);
const username = process.env.PI_USER || 'ed';
const password = process.env.PI_PASSWORD;

if (!password) {
    console.error('❌ Error: PI_PASSWORD environment variable is not set.');
    process.exit(1);
}

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH READY');
    const cmds = [
        'cat /home/ed/start_monitor.sh'
    ];
    conn.exec(cmds.join('\n'), (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            conn.end();
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).connect({
    host,
    port,
    username,
    password
});
