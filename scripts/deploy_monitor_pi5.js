const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PI_IP = process.env.PI_HOST || '192.168.1.78';
const PI_USER = process.env.PI_USER || 'ed';
const PI_PASSWORD = process.env.PI_PASSWORD;

if (!PI_PASSWORD) {
    console.error('❌ Error: PI_PASSWORD environment variable is not set.');
    process.exit(1);
}

async function deploy() {
    console.log('🚀 Deploying updated monitor to Pi5 via SCP...');

    const localPath = path.resolve(__dirname, '../scripts/pi_activity_monitor.js');
    const remotePath = `${PI_USER}@${PI_IP}:/home/ed/pi_activity_monitor.js`;

    // Note: This assumes SSH keys are set up or sshpass is available. 
    // Since the user provided the password and I don't have sshpass, I'll use the ssh2 library's SFTP capability for a truly reliable transfer.
    const conn = new Client();

    conn.on('ready', () => {
        console.log('✅ SSH Connected');
        conn.sftp((err, sftp) => {
            if (err) throw err;

            console.log('📤 Uploading file...');
            sftp.fastPut(localPath, '/home/ed/pi_activity_monitor.js', (err) => {
                if (err) throw err;
                console.log('✅ File uploaded');

                const startScript = `#!/bin/bash
pkill -f pi_activity_monitor.js || true
nohup node /home/ed/pi_activity_monitor.js > /home/ed/monitor.log 2>&1 &
`;
                sftp.writeFile('/home/ed/start_monitor.sh', startScript, (err) => {
                    if (err) throw err;

                    console.log('🔄 Restarting service via script...');
                    const commands = [
                        'chmod +x /home/ed/start_monitor.sh',
                        '/home/ed/start_monitor.sh',
                        'sleep 2',
                        'ps aux | grep pi_activity_monitor.js | grep -v grep'
                    ];

                    conn.exec(commands.join('\n'), (err, stream) => {
                        if (err) throw err;
                        stream.on('close', () => {
                            console.log('✅ Done');
                            conn.end();
                        }).on('data', (d) => console.log('STDOUT: ' + d))
                            .stderr.on('data', (data) => {
                                console.log('STDERR: ' + data);
                            });
                    });
                });
            });
        });
    }).on('error', (err) => {
        console.error('❌ Connection error:', err.message);
    }).connect({
        host: PI_IP,
        port: 22,
        username: PI_USER,
        password: PI_PASSWORD,
        readyTimeout: 30000
    });
}

deploy();
