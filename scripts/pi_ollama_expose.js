const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
    console.log('SSH CONNECTED - Configuring Ollama for remote access...\n');

    // Create systemd override to set OLLAMA_HOST=0.0.0.0
    const cmds = [
        'sudo mkdir -p /etc/systemd/system/ollama.service.d',
        'echo -e "[Service]\\nEnvironment=OLLAMA_HOST=0.0.0.0" | sudo tee /etc/systemd/system/ollama.service.d/override.conf',
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
            if (output.includes('0.0.0.0:11434')) {
                console.log('\n✅ Ollama now listening on 0.0.0.0:11434 — accessible remotely!');
            } else {
                console.log('\n⚠️ May still be localhost only — check output above');
            }
            conn.end();
        });
    });
}).on('keyboard-interactive', (n, i, l, p, f) => {
    f(['1234qwer']);
}).on('error', (e) => {
    console.log('SSH ERROR:', e.message);
    process.exit(1);
}).connect({
    host: '192.168.1.78', port: 22,
    username: 'ed', password: '1234qwer',
    tryKeyboard: true, readyTimeout: 30000
});
