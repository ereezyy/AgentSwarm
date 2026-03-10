require('dotenv').config();
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

function sshExec(conn, cmd, timeout = 180000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve('[TIMEOUT]'), timeout);
        conn.exec(cmd, (err, stream) => {
            if (err) { clearTimeout(timer); return reject(err); }
            let out = '';
            stream.on('data', d => { out += d.toString(); process.stdout.write(d); });
            stream.stderr.on('data', d => { out += d.toString(); process.stderr.write(d); });
            stream.on('close', () => { clearTimeout(timer); resolve(out.trim()); });
        });
    });
}

function sftpUpload(conn, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
            if (err) return reject(err);
            sftp.fastPut(localPath, remotePath, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

async function run() {
    const conn = new Client();

    const host = process.env.PI_HOST;
    const port = process.env.PI_PORT ? parseInt(process.env.PI_PORT, 10) : undefined;
    const username = process.env.PI_USER;
    const password = process.env.PI_PASSWORD;

    if (!host || !port || !username || !password) {
        console.error('❌ Error: PI_HOST, PI_PORT, PI_USER, and PI_PASSWORD environment variables must be set.');
        process.exit(1);
    }

    conn.on('ready', async () => {
        console.log('✅ Connected to Pi 5');
        try {
            await sshExec(conn, 'mkdir -p /home/ed/radar/pumpfun_data /home/ed/radar/models', 10000);

            // Upload Pump.fun trainer
            await sftpUpload(conn,
                path.join(__dirname, 'ai_engine', 'train_pumpfun.py'),
                '/home/ed/radar/train_pumpfun.py'
            );
            console.log('✅ train_pumpfun.py uploaded');

            // Upload updated inference_server.py
            await sftpUpload(conn,
                path.join(__dirname, 'ai_engine', 'inference_server.py'),
                '/home/ed/radar/inference_server.py'
            );
            console.log('✅ inference_server.py uploaded');

            // Run the Pump.fun training (downloads HF data + trains)
            console.log('\n🚀 Starting Pump.fun model training (downloading + training)...\n');
            await sshExec(conn, 'cd /home/ed/radar && python3 train_pumpfun.py 2>&1', 300000);

        } catch (e) {
            console.error('Error:', e.message);
        }
        conn.end();
    });
    conn.on('error', (err) => console.error('❌ SSH Error:', err.message));
    conn.connect({ host, port, username, password, readyTimeout: 10000 });
}

run();
