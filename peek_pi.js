require('dotenv').config();
const { Client } = require('ssh2');

function sshExec(conn, cmd, timeout = 15000) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve('[TIMEOUT]'), timeout);
        conn.exec(cmd, (err, stream) => {
            if (err) { clearTimeout(timer); return resolve('ERROR: ' + err.message); }
            let out = '';
            stream.on('data', d => out += d.toString());
            stream.stderr.on('data', d => out += d.toString());
            stream.on('close', () => { clearTimeout(timer); resolve(out.trim()); });
        });
    });
}

const conn = new Client();

const host = process.env.PI_HOST || '192.168.1.78';
const port = parseInt(process.env.PI_PORT || '22', 10);
const username = process.env.PI_USER || 'ed';
const password = process.env.PI_PASSWORD;

if (!password) {
    console.error('❌ Error: PI_PASSWORD environment variable is not set.');
    process.exit(1);
}

conn.on('ready', async () => {
    // Peek at first record
    const sample = await sshExec(conn, 'head -1 /home/ed/radar/pumpfun_data/train-2026-02-24T21-51-18.jsonl');
    console.log('SAMPLE RECORD:\n', sample);
    conn.end();
});
conn.on('error', (err) => console.error('SSH Error:', err.message));
conn.connect({ host, port, username, password, readyTimeout: 10000 });
