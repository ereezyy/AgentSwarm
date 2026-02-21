// Quick Pi5 + Hailo diagnostics
require('dotenv').config();
const { Client } = require('ssh2');

const COMMANDS = [
    'echo "=== HOSTNAME ==="',
    'hostname',
    'echo "=== KERNEL ==="',
    'uname -a',
    'echo "=== HAILO PCI ==="',
    'lspci 2>/dev/null | grep -i hailo || echo "No Hailo on PCI bus"',
    'echo "=== HAILO DEVICES ==="',
    'ls -la /dev/hailo* 2>/dev/null || echo "No /dev/hailo devices found"',
    'echo "=== HAILO PACKAGES ==="',
    'dpkg -l 2>/dev/null | grep -i hailo || echo "No hailo dpkg packages"',
    'echo "=== HAILORT CLI ==="',
    'hailortcli fw-control identify 2>&1 || echo "hailortcli not available"',
    'echo "=== PYTHON HAILO ==="',
    "python3 -c 'import hailo_platform; print(hailo_platform.__version__)' 2>&1 || echo 'No hailo_platform python module'",
    'echo "=== MEMORY ==="',
    'free -h',
    'echo "=== DISK ==="',
    'df -h /',
    'echo "=== TEMPERATURE ==="',
    'vcgencmd measure_temp 2>/dev/null || echo "temp unavailable"',
    'echo "=== UPTIME ==="',
    'uptime',
    'echo "=== OLLAMA ==="',
    'curl -s http://localhost:11434/api/tags 2>/dev/null | head -c 500 || echo "Ollama not running"',
];

const bigCmd = COMMANDS.join(' && ');

function checkPi(ClientConstructor = Client) {
    const conn = new ClientConstructor();

    const host = process.env.PI_HOST || '192.168.1.78';
    const port = parseInt(process.env.PI_PORT || '22', 10);
    const username = process.env.PI_USER || 'ed';
    const password = process.env.PI_PASSWORD;

    if (!password) {
        console.error('Error: PI_PASSWORD environment variable is not set.');
        // If testing, throw error instead of exit so we can catch it
        if (process.env.NODE_ENV === 'test') {
            throw new Error('PI_PASSWORD environment variable is not set.');
        }
        process.exit(1);
    }

    conn.on('ready', () => {
        console.log('SSH CONNECTED TO PI5\n');
        conn.exec(bigCmd, (err, stream) => {
            if (err) { console.log('Exec error:', err.message); conn.end(); return; }
            let output = '';
            stream.on('data', (data) => { output += data.toString(); });
            stream.stderr.on('data', (data) => { output += data.toString(); });
            stream.on('close', () => {
                console.log(output);
                conn.end();
            });
        });
    }).on('keyboard-interactive', (name, instr, lang, prompts, finish) => {
        finish([password]);
    }).on('error', (err) => {
        console.log('SSH ERROR:', err.message);
        if (process.env.NODE_ENV !== 'test') process.exit(1);
    }).connect({
        host,
        port,
        username,
        password,
        tryKeyboard: true,
        readyTimeout: 30000
    });
}

if (require.main === module) {
    checkPi();
}

module.exports = { checkPi };
