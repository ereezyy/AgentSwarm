const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

function sshExec(conn, cmd, timeout = 60000) {
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
    conn.on('ready', async () => {
        console.log('✅ Connected to Pi 5\n');

        // Test using the MarginFi SDK directly
        const testScript = `
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC = 'https://mainnet.helius-rpc.com/?api-key=0629a755-e1c9-442a-8a19-02f9b7c04e3d';
const conn = new Connection(RPC, 'confirmed');
const MARGINFI = new PublicKey('MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA');

async function test() {
    console.log('RPC:', RPC.replace(/api-key=.*/, 'api-key=***'));
    
    // Try different common account sizes for MarginFi v2  
    const sizes = [1856, 2048, 2560, 2656, 3232, 3296, 3360, 1544, 752, 512, 376, 288, 264, 248, 200, 176, 168, 160, 136];
    
    for (const size of sizes) {
        try {
            const accounts = await conn.getProgramAccounts(MARGINFI, {
                dataSlice: { offset: 0, length: 8 },
                filters: [{ dataSize: size }],
            });
            if (accounts.length > 0) {
                console.log('SIZE', size, '-> Found', accounts.length, 'accounts ✅');
            }
        } catch(e) {
            // ignore errors, just scanning
        }
    }
    
    console.log('\\nDone scanning.');
}

test();
`;
        const tmpPath = path.join(__dirname, '_tmp_test3.js');
        fs.writeFileSync(tmpPath, testScript);
        await sftpUpload(conn, tmpPath, '/home/ed/radar/test_marginfi3.js');
        fs.unlinkSync(tmpPath);

        console.log('🧪 Scanning for MarginFi account sizes on Helius...');
        await sshExec(conn, 'cd /home/ed/radar && node test_marginfi3.js', 90000);

        conn.end();
    });
    conn.on('error', (err) => console.error('❌ SSH Error:', err.message));
    conn.connect({ host: '192.168.1.78', port: 22, username: 'ed', password: '1234qwer', readyTimeout: 10000 });
}

run();
