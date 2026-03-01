const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

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

function sshExec(conn, cmd, timeout = 15000) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve('[TIMEOUT]'), timeout);
        conn.exec(cmd, (err, stream) => {
            if (err) { clearTimeout(timer); return resolve('ERROR: ' + err.message); }
            let out = '';
            stream.on('data', d => { out += d.toString(); process.stdout.write(d); });
            stream.stderr.on('data', d => { out += d.toString(); process.stderr.write(d); });
            stream.on('close', () => { clearTimeout(timer); resolve(out.trim()); });
        });
    });
}

async function run() {
    const conn = new Client();
    conn.on('ready', async () => {
        console.log('✅ Connected to Pi 5');
        try {
            let radarCode = fs.readFileSync(path.join(__dirname, 'radar_node.js'), 'utf8');
            radarCode = radarCode.replace(/169\.254\.79\.164/g, '192.168.1.175');
            const tmpPath = path.join(__dirname, '_tmp_radar.js');
            fs.writeFileSync(tmpPath, radarCode);
            await sftpUpload(conn, tmpPath, '/home/ed/radar/radar_node.js');
            fs.unlinkSync(tmpPath);
            console.log('✅ radar_node.js deployed (with dotenv loader)');

            // Verify .env is still there
            console.log('\n📋 .env check:');
            await sshExec(conn, 'cat /home/ed/radar/.env');

            console.log('\n\n🚀 Ready to launch! Run on Pi:');
            console.log('   cd /home/ed/radar && node radar_node.js');

        } catch (e) {
            console.error('Error:', e.message);
        }
        conn.end();
    });
    conn.on('error', (err) => console.error('❌ SSH Error:', err.message));
    conn.connect({ host: '192.168.1.78', port: 22, username: 'ed', password: '1234qwer', readyTimeout: 10000 });
}

run();
