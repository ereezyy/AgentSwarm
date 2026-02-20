const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
    console.log('SSH CONNECTED\n');
    const cmds = [
        'echo "=== OLLAMA STATUS ==="',
        'systemctl is-active ollama 2>/dev/null || echo "not a systemd service"',
        'pgrep -a ollama 2>/dev/null || echo "ollama process not found"',
        'echo ""',
        'echo "=== OLLAMA LISTEN ADDR ==="',
        'ss -tlnp 2>/dev/null | grep 11434 || netstat -tlnp 2>/dev/null | grep 11434 || echo "port 11434 not listening"',
        'echo ""',
        'echo "=== OLLAMA ENV ==="',
        'cat /etc/systemd/system/ollama.service 2>/dev/null | grep -i host || echo "no systemd override found"',
        'grep -r OLLAMA_HOST /etc/environment /etc/default/ollama ~/.bashrc 2>/dev/null || echo "no OLLAMA_HOST env found"',
        'echo ""',
        'echo "=== LOCAL TEST ==="',
        'curl -s http://localhost:11434/api/tags 2>/dev/null | head -c 200 || echo "localhost:11434 unreachable"',
        'echo ""',
        'echo "=== 0.0.0.0 TEST ==="',
        'curl -s http://0.0.0.0:11434/api/tags 2>/dev/null | head -c 200 || echo "0.0.0.0:11434 unreachable"',
    ];

    conn.exec(cmds.join(' && '), (err, stream) => {
        if (err) { console.log('Exec error:', err.message); conn.end(); return; }
        let output = '';
        stream.on('data', (d) => { output += d.toString(); });
        stream.stderr.on('data', (d) => { output += d.toString(); });
        stream.on('close', () => { console.log(output); conn.end(); });
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
