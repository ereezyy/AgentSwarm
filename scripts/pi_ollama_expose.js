require('dotenv').config();
const { Client } = require('ssh2');
const conn = new Client();

const host = process.env.PI_HOST || '192.168.1.78';
const port = parseInt(process.env.PI_PORT || '22', 10);
const username = process.env.PI_USER || 'ed';
const password = process.env.PI_PASSWORD;

if (!password) {
    console.error('❌ Error: PI_PASSWORD environment variable is not set.');
    process.exit(1);
}

conn.on('ready', () => {
    console.log('SSH CONNECTED - Configuring Ollama for secure local-only access...\n');

    // Create systemd override to set OLLAMA_HOST=127.0.0.1
    const cmds = [
        'sudo mkdir -p /etc/systemd/system/ollama.service.d',
        'echo -e "[Service]\\nEnvironment=OLLAMA_HOST=127.0.0.1" | sudo tee /etc/systemd/system/ollama.service.d/override.conf',
        'sudo systemctl daemon-reload',
        'sudo systemctl restart ollama',
        'sleep 3',
        'echo "=== VERIFY ==="',
        'ss -tlnp 2>/dev/null | grep 11434',
        'curl -s http://localhost:11434/api/tags 2>/dev/null | head -c 100 || echo "failed"',
    ];

    conn.exec(cmds.join(' && '), (err, stream) => {
        if (err) { console.log('Exec error:', err.message); conn.end(); return; }
        let output = '';
        stream.on('data', (d) => { output += d.toString(); });
        stream.stderr.on('data', (d) => { output += d.toString(); });
        stream.on('close', () => {
            console.log(output);

            console.log('\n🔒 Securing Ollama... Establishing encrypted SSH tunnel...');
            const net = require('net');
            const server = net.createServer((socket) => {
                conn.forwardOut(socket.remoteAddress, socket.remotePort, '127.0.0.1', 11434, (err, fwdStream) => {
                    if (err) {
                        console.error('Forward error:', err);
                        socket.end();
                        return;
                    }
                    socket.pipe(fwdStream).pipe(socket);
                });
            });

            server.on('error', (e) => {
                if (e.code === 'EADDRINUSE') {
                    console.log('\n⚠️  Local port 11434 is already in use. Is a tunnel already running or local Ollama active?');
                } else {
                    console.error('\n❌ Tunnel error:', e.message);
                }
                conn.end();
            });

            server.listen(11434, '127.0.0.1', () => {
                console.log('\n✅ Secure SSH tunnel established!');
                console.log('   Ollama is now securely accessible locally at http://127.0.0.1:11434');
                console.log('   Keep this script running to maintain the connection. Press Ctrl+C to exit.');
            });

            // Do not call conn.end() so the tunnel stays open
        });
    });
}).on('keyboard-interactive', (n, i, l, p, f) => {
    f([password]);
}).on('error', (e) => {
    console.log('SSH ERROR:', e.message);
    process.exit(1);
}).connect({
    host, port,
    username, password,
    tryKeyboard: true, readyTimeout: 30000
});
