// Pi5 Activity Monitor — shows visual status on the Pi when inference is running
// Deploy this to the Pi to run as a background service
const http = require('http');
const fs = require('fs');
const { execSync } = require('child_process');

const PORT = 8888;
const STATUS_FILE = '/tmp/syndicate_status.json';
let activeRequests = 0;
let totalRequests = 0;
let lastActivity = null;

// Initialize status
function updateStatus(event, details = '') {
    const status = {
        active: activeRequests > 0,
        activeRequests,
        totalRequests,
        lastEvent: event,
        lastDetails: details,
        lastActivity: lastActivity || new Date().toISOString(),
        uptime: process.uptime()
    };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));

    // Terminal output with color
    const color = activeRequests > 0 ? '\x1b[33m' : '\x1b[32m'; // Yellow=active, Green=idle
    const reset = '\x1b[0m';
    const icon = activeRequests > 0 ? '🧠' : '💤';
    console.log(`${color}${icon} [${new Date().toLocaleTimeString()}] ${event} | Active: ${activeRequests} | Total: ${totalRequests}${details ? ' | ' + details : ''}${reset}`);
}

// HTTP server to receive activity notifications
const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/start') {
        activeRequests++;
        totalRequests++;
        lastActivity = new Date().toISOString();
        const from = url.searchParams.get('from') || 'unknown';
        const model = url.searchParams.get('model') || 'unknown';
        updateStatus('INFERENCE_START', `from=${from} model=${model}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'active', id: totalRequests }));
    }
    else if (url.pathname === '/stop') {
        activeRequests = Math.max(0, activeRequests - 1);
        const elapsed = url.searchParams.get('elapsed') || '?';
        updateStatus('INFERENCE_COMPLETE', `elapsed=${elapsed}s`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: activeRequests > 0 ? 'active' : 'idle' }));
    }
    else if (url.pathname === '/status') {
        const status = fs.existsSync(STATUS_FILE)
            ? JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'))
            : { active: false, activeRequests: 0, totalRequests: 0 };

        // Inject current uptime
        status.uptime = process.uptime();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
    }
    else if (url.pathname === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getDashboardHTML());
    }
    else {
        res.writeHead(404);
        res.end('Not found');
    }
});

function getDashboardHTML() {
    return `<!DOCTYPE html>
<html>
<head>
<title>🧠 Pi5 Syndicate Monitor</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
    background: #0a0a0a; color: #e0e0e0; font-family: 'Courier New', monospace;
    display: flex; justify-content: center; align-items: center; min-height: 100vh;
}
.container { text-align: center; padding: 2rem; }
.status-icon { font-size: 6rem; animation: pulse 2s infinite; }
.status-text { font-size: 1.5rem; margin-top: 1rem; text-transform: uppercase; letter-spacing: 3px; }
.active .status-icon { animation: pulse 0.5s infinite; }
.active .status-text { color: #ff6600; }
.idle .status-text { color: #00ff88; }
.stats { margin-top: 2rem; font-size: 0.9rem; color: #888; }
.stats span { color: #ff6600; font-weight: bold; }
.event { margin-top: 1rem; padding: 0.5rem 1rem; background: #1a1a1a; border-radius: 8px; font-size: 0.8rem; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>
</head>
<body>
<div class="container" id="main">
    <div class="status-icon" id="icon">💤</div>
    <div class="status-text" id="text">INITIALIZING...</div>
    <div class="stats">
        Requests: <span id="total">0</span> | 
        Active: <span id="active">0</span> |
        Uptime: <span id="uptime">0</span>s
    </div>
    <div class="event" id="event">Waiting for data...</div>
</div>
<script>
async function update() {
    try {
        const r = await fetch('/status');
        const d = await r.json();
        document.getElementById('main').className = d.active ? 'active' : 'idle';
        document.getElementById('icon').textContent = d.active ? '🧠' : '💤';
        document.getElementById('text').textContent = d.active ? 'INFERENCE ACTIVE' : 'STANDING BY';
        document.getElementById('total').textContent = d.totalRequests || 0;
        document.getElementById('active').textContent = d.activeRequests || 0;
        document.getElementById('uptime').textContent = Math.floor(d.uptime || 0);
        document.getElementById('event').textContent = (d.lastEvent || '') + ' ' + (d.lastDetails || '');
    } catch(e) {}
}
setInterval(update, 1000);
update();
</script>
</body>
</html>`;
}

server.listen(PORT, '0.0.0.0', () => {
    updateStatus('MONITOR_ONLINE', `port=${PORT}`);
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🖥️  Pi5 Syndicate Activity Monitor`);
    console.log(`   Dashboard: http://0.0.0.0:${PORT}/dashboard`);
    console.log(`   Status API: http://0.0.0.0:${PORT}/status`);
    console.log(`${'═'.repeat(50)}\n`);
});
