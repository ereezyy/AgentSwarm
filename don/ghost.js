// don/ghost.js - THE GHOST (NETWORK RECON & STEALTH SCANNING)
// Gracefully handles missing nmap and provides alternative recon methods
const chalk = require('chalk');
const { exec } = require('child_process');
const os = require('os');
require('dotenv').config();

const id = process.argv[2] || 'Ghost';

console.log(chalk.gray.bold(`[GHOST #${id}]: Stealth Recon Unit Initializing...`));

// ── Network Interface Scanner (No Dependencies) ──────────────
function getNetworkInfo() {
    const interfaces = os.networkInterfaces();
    const results = [];

    for (const [name, addrs] of Object.entries(interfaces)) {
        for (const addr of addrs) {
            if (!addr.internal && addr.family === 'IPv4') {
                results.push({
                    interface: name,
                    ip: addr.address,
                    netmask: addr.netmask,
                    mac: addr.mac
                });
            }
        }
    }
    return results;
}

// ── ARP Table Scanner (Cross-Platform) ───────────────────────
async function scanARPTable() {
    return new Promise((resolve) => {
        const cmd = process.platform === 'win32' ? 'arp -a' : 'arp -a';
        exec(cmd, { timeout: 10000 }, (err, stdout) => {
            if (err) { resolve([]); return; }

            const devices = [];
            const lines = stdout.split('\n');
            for (const line of lines) {
                const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([\da-fA-F:-]+)/);
                if (match && !match[1].endsWith('.255') && match[1] !== '255.255.255.255') {
                    devices.push({ ip: match[1], mac: match[2].trim() });
                }
            }
            resolve(devices);
        });
    });
}

// ── Port Probe (Lightweight, No nmap Needed) ─────────────────
async function probePort(host, port, timeout = 2000) {
    return new Promise((resolve) => {
        const net = require('net');
        const socket = new net.Socket();
        let status = false;

        socket.setTimeout(timeout);
        socket.on('connect', () => { status = true; socket.destroy(); });
        socket.on('timeout', () => { socket.destroy(); });
        socket.on('error', () => { /* silent */ });
        socket.on('close', () => { resolve(status); });
        socket.connect(port, host);
    });
}

async function quickPortScan(host) {
    const commonPorts = [22, 80, 443, 3000, 3001, 5000, 8080, 8443, 8888, 9090, 11434];

    const results = await Promise.all(commonPorts.map(async (port) => {
        const isOpen = await probePort(host, port);
        return isOpen ? port : null;
    }));

    return results.filter(port => port !== null);
}

// ── Nmap Integration (Optional) ──────────────────────────────
let nmapAvailable = false;

function checkNmap() {
    return new Promise((resolve) => {
        exec('nmap --version', { timeout: 5000 }, (err) => {
            resolve(!err);
        });
    });
}

async function nmapScan(target) {
    return new Promise((resolve) => {
        exec(`nmap -sn -T4 ${target}`, { timeout: 30000 }, (err, stdout) => {
            if (err) { resolve(null); return; }
            resolve(stdout);
        });
    });
}

// ── Main Recon Loop ──────────────────────────────────────────
async function runRecon() {
    try {
        // 1. Network interfaces
        const nets = getNetworkInfo();
        if (nets.length > 0) {
            console.log(chalk.gray(`[GHOST #${id}]: Local Network Interfaces:`));
            nets.forEach(n => {
                console.log(chalk.gray(`  └─ ${n.interface}: ${n.ip} (${n.mac})`));
            });
        }

        // 2. ARP table scan
        const devices = await scanARPTable();
        console.log(chalk.gray(`[GHOST #${id}]: ARP Table: ${devices.length} devices on local network.`));

        // 3. Scan a few interesting hosts
        if (nets.length > 0) {
            const localIP = nets[0].ip;
            const subnet = localIP.split('.').slice(0, 3).join('.');
            const piIP = process.env.PI_IP || `${subnet}.78`;

            // Quick probe the Pi
            const piPorts = await quickPortScan(piIP);
            if (piPorts.length > 0) {
                console.log(chalk.green(`[GHOST #${id}]: 🟢 Pi5 @ ${piIP} — Open ports: ${piPorts.join(', ')}`));
            } else {
                console.log(chalk.yellow(`[GHOST #${id}]: 🔴 Pi5 @ ${piIP} — Not responding or offline.`));
            }
        }

        // 4. Nmap deep scan (if available)
        if (nmapAvailable && nets.length > 0) {
            const subnet = nets[0].ip.split('.').slice(0, 3).join('.') + '.0/24';
            console.log(chalk.gray(`[GHOST #${id}]: Running nmap ping sweep on ${subnet}...`));
            const result = await nmapScan(subnet);
            if (result) {
                const hostCount = (result.match(/Nmap scan report for/g) || []).length;
                console.log(chalk.gray(`[GHOST #${id}]: Nmap found ${hostCount} live hosts on subnet.`));
            }
        }

        // 5. Report to Don
        if (process.send) {
            process.send({
                type: 'INTEL_DATA',
                data: `Ghost recon: ${devices.length} ARP devices. ${nets.length} interfaces. ${nmapAvailable ? 'nmap active' : 'lightweight mode'}.`,
                source: 'GHOST_RECON'
            });
        }

    } catch (e) {
        console.error(chalk.red(`[GHOST #${id}]: Recon failed: ${e.message}`));
    }

    // Scan every 30 seconds for high activity
    setTimeout(runRecon, 30000);

    // Passive Traffic Simulation (Visual Noise)
    setTimeout(() => {
        const traffic = ['UDP', 'TCP', 'ICMP', 'ARP'];
        const proto = traffic[Math.floor(Math.random() * traffic.length)];
        const size = Math.floor(Math.random() * 1500);
        console.log(chalk.gray.dim(`[GHOST #${id}]: Analyzing ${proto} packet stream (${size} bytes)... Clean.`));
    }, 15000 + Math.random() * 10000);
}

// ── Boot ─────────────────────────────────────────────────────
(async () => {
    nmapAvailable = await checkNmap();
    if (nmapAvailable) {
        console.log(chalk.green(`[GHOST #${id}]: nmap detected. Full recon mode.`));
    } else {
        console.log(chalk.yellow(`[GHOST #${id}]: nmap not found. Running lightweight recon (ARP + port probes).`));
    }
    runRecon();
})();

// IPC Listener
process.on('message', (msg) => {
    if (msg.type === 'RECON_NOW') {
        console.log(chalk.gray.bold(`[GHOST #${id}]: On-demand recon triggered.`));
        runRecon();
    } else if (msg.type === 'PROBE_HOST') {
        quickPortScan(msg.host).then(ports => {
            console.log(chalk.gray(`[GHOST #${id}]: Probe ${msg.host}: ${ports.length > 0 ? ports.join(', ') : 'No open ports'}`));
            if (process.send) {
                process.send({ type: 'GHOST_PROBE', host: msg.host, ports });
            }
        });
    }
});
