const { Client } = require('ssh2');

function sshExec(conn, cmd, timeout = 30000) {
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
            // Write .env file with Helius RPC URL
            await sshExec(conn, `echo 'SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=0629a755-e1c9-442a-8a19-02f9b7c04e3d' > /home/ed/radar/.env`);
            console.log('✅ .env written with Helius RPC URL');

            // Verify .env
            await sshExec(conn, 'cat /home/ed/radar/.env');

            // Install dotenv on Pi if not already present
            await sshExec(conn, 'cd /home/ed/radar && npm list dotenv 2>/dev/null || npm install dotenv 2>&1 | tail -3', 30000);
            console.log('✅ dotenv ready');

            // Kill any running radar_node process
            await sshExec(conn, 'pkill -f "node radar_node" 2>/dev/null; echo "Killed old process"');

        } catch (e) {
            console.error('Error:', e.message);
        }
        conn.end();
    });
    conn.on('error', (err) => console.error('❌ SSH Error:', err.message));
    conn.connect({ host: '192.168.1.78', port: 22, username: 'ed', password: '1234qwer', readyTimeout: 10000 });
}

run();
