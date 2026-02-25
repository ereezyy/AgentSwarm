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
<title>🧠 Pi5 Syndicate Command</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
    background: #050505; color: #e0e0e0; font-family: 'Courier New', monospace;
    display: flex; flex-direction: column; min-height: 100vh; overflow: hidden;
}
.header {
    background: #000; border-bottom: 2px solid #333; padding: 1rem 2rem;
    display: flex; justify-content: space-between; align-items: center;
}
.header-left { display: flex; align-items: center; gap: 1rem; }
.clock { font-size: 1.5rem; color: #00ffcc; font-weight: bold; text-shadow: 0 0 10px rgba(0,255,204,0.5); }
.alarm-ui { display: flex; align-items: center; gap: 0.5rem; background: #111; padding: 0.3rem 0.6rem; border-radius: 4px; border: 1px solid #222; }
.alarm-ui input { background: transparent; border: none; color: #888; width: 60px; outline: none; font-family: inherit; }
.alarm-ui .toggle { cursor: pointer; color: #444; transition: 0.3s; font-size: 0.8rem; }
.alarm-ui .toggle.active { color: #f00; text-shadow: 0 0 8px #f00; }

.main-content {
    flex: 1; display: flex; justify-content: center; align-items: center; position: relative;
}
.container { text-align: center; padding: 2rem; z-index: 10; }
.status-icon { font-size: 8rem; animation: pulse 2s infinite; filter: drop-shadow(0 0 20px rgba(255,102,0,0.2)); }
.status-text { font-size: 2rem; margin-top: 1rem; text-transform: uppercase; letter-spacing: 5px; font-weight: bold; }
.active .status-icon { animation: pulse 0.5s infinite; filter: drop-shadow(0 0 30px rgba(255,102,0,0.6)); }
.active .status-text { color: #ff6600; text-shadow: 0 0 10px #ff6600; }
.idle .status-text { color: #00ff88; text-shadow: 0 0 10px #00ff88; }
.stats { margin-top: 2rem; font-size: 1rem; color: #888; }
.stats span { color: #ff6600; font-weight: bold; }
.event { margin-top: 1.5rem; padding: 0.8rem 1.5rem; background: #111; border: 1px solid #222; border-radius: 8px; font-size: 0.9rem; max-width: 500px; margin-left: auto; margin-right: auto; }

.ticker-wrap {
    width: 100%; overflow: hidden; background: #000; border-top: 1px solid #333; height: 40px; line-height: 40px;
}
.ticker {
    display: inline-block; white-space: nowrap; padding-right: 100%; box-sizing: content-box;
    animation: ticker 30s linear infinite; font-size: 0.9rem; color: #666;
}
.ticker span { color: #00ffcc; font-weight: bold; margin-right: 10px; }

@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
@keyframes ticker {
    0% { transform: translate3d(0, 0, 0); }
    100% { transform: translate3d(-100%, 0, 0); }
}

/* Background grid effect */
.bg-grid {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background-image: 
        linear-gradient(rgba(255, 102, 0, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 102, 0, 0.05) 1px, transparent 1px);
    background-size: 40px 40px; z-index: 1;
}

#alarm-indicator { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,0,0,0.2); animation: flash 0.5s infinite; z-index: 100; pointer-events: none; }
@keyframes flash { 0%,100% { opacity: 0; } 50% { opacity: 1; } }
</style>
</head>
<body>
<div id="alarm-indicator"></div>
<div class="header">
    <div class="header-left">
        <div class="clock" id="clock">00:00:00</div>
        <div class="alarm-ui">
            <input type="time" id="alarm-time">
            <span class="toggle" id="alarm-toggle" onclick="toggleAlarm()">[ ALARM OFF ]</span>
        </div>
    </div>
    <div style="font-weight:bold; color:#444;">PI5_OUTPOST_v1.2</div>
</div>

<div class="main-content">
    <div class="bg-grid"></div>
    <div class="container" id="main">
        <div class="status-icon" id="icon">💤</div>
        <div class="status-text" id="text">INITIALIZING...</div>
        <div class="stats">
            REQ_TOTAL: <span id="total">0</span> | 
            REQ_ACTIVE: <span id="active">0</span> |
            UPTIME: <span id="uptime">0</span>s
        </div>
        <div class="event" id="event">Waiting for intel...</div>
    </div>
</div>

<div class="ticker-wrap">
    <div class="ticker" id="ticker">
        <span>[SYNDICATE]</span> Securing remote node... | <span>[BRAIN]</span> Calibrating edge inference... | <span>[OUTPOST]</span> Standing by for mission orders...
    </div>
</div>

<script>
let alarmEnabled = false;
let isRinging = false;

function updateClock() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    document.getElementById('clock').textContent = h + ":" + m + ":" + s;

    // Alarm Check
    if (alarmEnabled) {
        const setT = document.getElementById('alarm-time').value;
        if (setT === h + ":" + m && !isRinging) {
            isRinging = true;
            document.getElementById('alarm-indicator').style.display = 'block';
            console.log('🚨 ALARM TRIGGERED');
        }
    }
}

function toggleAlarm() {
    alarmEnabled = !alarmEnabled;
    const btn = document.getElementById('alarm-toggle');
    btn.className = alarmEnabled ? 'toggle active' : 'toggle';
    btn.textContent = alarmEnabled ? '[ ALARM ACTIVE ]' : '[ ALARM OFF ]';
    if (!alarmEnabled) {
        isRinging = false;
        document.getElementById('alarm-indicator').style.display = 'none';
    }
}

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
        
        // Update Ticker if active
        if (d.active && d.lastDetails) {
             const ticker = document.getElementById('ticker');
             const msg = \` | <span>[INFERENCE]</span> \${d.lastDetails} | \`;
             if (!ticker.innerHTML.includes(d.lastDetails)) {
                 ticker.innerHTML += msg;
             }
        }
    } catch(e) {}
}

setInterval(updateClock, 1000);
setInterval(update, 1000);
updateClock();
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
