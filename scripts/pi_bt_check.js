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

const cmds = [
    'echo "=== BLUETOOTH STATUS ==="',
    'bluetoothctl show 2>/dev/null || echo "bluetoothctl unavailable"',
    'echo ""',
    'echo "=== PAIRED DEVICES ==="',
    'bluetoothctl devices Paired 2>/dev/null || bluetoothctl paired-devices 2>/dev/null || echo "none"',
    'echo ""',
    'echo "=== CONNECTED DEVICES ==="',
    'bluetoothctl devices Connected 2>/dev/null || echo "checking info..."',
    'echo ""',
    'echo "=== BT SERVICE ==="',
    'systemctl is-active bluetooth 2>/dev/null',
    'echo ""',
    'echo "=== NETWORK (BT PAN) ==="',
    'ip addr show 2>/dev/null | grep -A2 -E "bnep|bt|pan" || echo "no BT network interface"',
    'echo ""',
    'echo "=== RFCOMM ==="',
    'ls -la /dev/rfcomm* 2>/dev/null || echo "no rfcomm devices"',
    'echo ""',
    'echo "=== AUDIO SINKS ==="',
    'pactl list sinks short 2>/dev/null || echo "no pulseaudio"',
    'echo ""',
    'echo "=== HCICONFIG ==="',
    'hciconfig -a 2>/dev/null || echo "hciconfig not available"',
];

conn.on('ready', () => {
    console.log('SSH CONNECTED\n');
    conn.exec(cmds.join(' && '), (err, stream) => {
        if (err) { console.log('Exec error:', err.message); conn.end(); return; }
        let output = '';
        stream.on('data', (d) => { output += d.toString(); });
        stream.stderr.on('data', (d) => { output += d.toString(); });
        stream.on('close', () => { console.log(output); conn.end(); });
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
