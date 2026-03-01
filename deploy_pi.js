const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

function sshExec(conn, cmd, timeout = 60000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve('[TIMEOUT]'), timeout);
        conn.exec(cmd, (err, stream) => {
            if (err) { clearTimeout(timer); return reject(err); }
            let out = '';
            stream.on('data', d => out += d.toString());
            stream.stderr.on('data', d => process.stderr.write(d));
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

async function deploy() {
    const conn = new Client();

    conn.on('ready', async () => {
        console.log('✅ Connected to Pi 5 over SSH!');

        try {
            await sshExec(conn, 'mkdir -p /home/ed/radar/dataset /home/ed/radar/models');
            console.log('📁 Directories ready.');

            // Upload scripts via SFTP (reliable for all sizes)
            const uploads = [
                { local: path.join(__dirname, 'ai_engine', 'train_model.py'), remote: '/home/ed/radar/train_model.py' },
                { local: path.join(__dirname, 'ai_engine', 'inference_server.py'), remote: '/home/ed/radar/inference_server.py' },
            ];

            // Patch and save radar_node.js to temp
            let radarCode = fs.readFileSync(path.join(__dirname, 'radar_node.js'), 'utf8');
            radarCode = radarCode.replace(/169\.254\.79\.164/g, '192.168.1.175');
            const tmpRadar = path.join(__dirname, '_tmp_radar.js');
            fs.writeFileSync(tmpRadar, radarCode);
            uploads.push({ local: tmpRadar, remote: '/home/ed/radar/radar_node.js' });

            // Add CSV files
            const csvDir = path.join(__dirname, 'data', 'SolRPDS', 'dataset', 'CSV');
            for (const f of ['2021.csv', '2022.csv', '2023.csv', 'Jan_2024-Nov_2024.csv']) {
                const p = path.join(csvDir, f);
                if (fs.existsSync(p)) uploads.push({ local: p, remote: `/home/ed/radar/dataset/${f}` });
            }

            // Upload all files sequentially via SFTP
            for (const { local, remote } of uploads) {
                const size = (fs.statSync(local).size / 1024 / 1024).toFixed(1);
                console.log(`📤 Uploading ${path.basename(local)} (${size} MB) → ${remote}`);
                await sftpUpload(conn, local, remote);
                console.log(`   ✅ Done`);
            }

            // Clean up temp
            if (fs.existsSync(tmpRadar)) fs.unlinkSync(tmpRadar);

            console.log('\n🚀 All files deployed. Starting training on Pi 5...\n');

            // Run the training script remotely
            const trainOutput = await sshExec(conn, 'cd /home/ed/radar && python3 train_model.py 2>&1', 180000);
            console.log(trainOutput);

        } catch (e) {
            console.error('Deploy error:', e.message);
        }

        conn.end();
    });

    conn.on('error', (err) => console.error('❌ SSH Error:', err.message));
    conn.connect({ host: '192.168.1.78', port: 22, username: 'ed', password: '1234qwer', readyTimeout: 10000 });
}

deploy();
