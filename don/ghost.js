// don/ghost.js - THE GHOST (IoT & Network Reconnaissance)
// Wraps Python network scanners for automated infrastructure probing

const { exec } = require('child_process');
const chalk = require('chalk');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Ghost';
console.log(chalk.gray.bold(`[GHOST #${id}]: Network infiltration protocols online.`));

const SCRIPTS_DIR = path.resolve(__dirname, '../scripts');
// In a non-POSIX environment, python command might need 'python' or 'python3'
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
const SCANNER_SCRIPT = path.join(SCRIPTS_DIR, 'local_network_scanner.py');

// Common local subnets to sweep
const DEFAULT_TARGETS = ['192.168.1.0/24'];

function runNetworkScan() {
    console.log(chalk.gray(`[GHOST #${id}]: Initiating network wide sweep...`));

    // For safety and speed in testing, default to a standard local subnet
    const cidr = DEFAULT_TARGETS[0];

    // Execute the Python scanner
    const cmd = `${pythonCmd} "${SCANNER_SCRIPT}" --cidr ${cidr} --json --deep`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(chalk.red(`[GHOST #${id}]: Recon error: ${error.message}`));
            return;
        }

        try {
            const results = JSON.parse(stdout);
            const numFound = results.length;
            console.log(chalk.green(`[GHOST #${id}]: Sweep complete. Found ${numFound} exposed services.`));

            if (process.send && numFound > 0) {
                process.send({
                    type: 'INTEL_DATA',
                    data: `Ghost recon completed on ${cidr}. Found ${numFound} exposed IoT services. Check dashboard for details.`,
                    source: 'GHOST_RECON'
                });

                // Summarize for The General
                process.send({
                    type: 'SIREN_SPEAK',
                    text: `Ghost unit reporting. ${numFound} potential targets acquired on the local network.`
                });
            }
        } catch (e) {
            console.log(chalk.green(`[GHOST #${id}]: Raw sweep output length: ${stdout.length}`));
        }
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
let isRunning = false;
let reconTimeout = null;

async function runRecon() {
    if (isRunning) {
        console.log(chalk.gray(`[GHOST #${id}]: Scan already in progress.`));
        return;
    }
    // Add custom recon logic if needed
}

function probeHost(host) {
    if (!host) {
        console.log(chalk.yellow(`[GHOST #${id}]: No host specified for probing.`));
        return;
    }

    console.log(chalk.gray(`[GHOST #${id}]: Directed probe on target ${host}...`));

    const fs = require('fs');
    const os = require('os');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-target-'));
    const tempFile = path.join(tempDir, 'target.txt');
    fs.writeFileSync(tempFile, host);

    const cmd = `${pythonCmd} "${SCANNER_SCRIPT}" --targets "${tempFile}" --json`;

    exec(cmd, (error, stdout, stderr) => {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }

        if (error) {
            console.error(chalk.red(`[GHOST #${id}]: Probe error: ${error.message}`));
            return;
        }

        try {
            const results = JSON.parse(stdout);
            if (results.length > 0) {
                console.log(chalk.green(`[GHOST #${id}]: Target ${host} vulnerabilities confirmed. Vendor: ${results[0].vendor}`));
                if (process.send) {
                    process.send({
                        type: 'INTEL_DATA',
                        data: `Target ${host} confirmed vulnerable. Service: ${results[0].service}, Vendor: ${results[0].vendor}`,
                        source: 'GHOST_PROBE'
                    });
                }
            } else {
                console.log(chalk.yellow(`[GHOST #${id}]: Target ${host} appears hardened. No direct vectors found.`));
            }
        } catch (e) {
            console.error(chalk.red(`[GHOST #${id}]: Error parsing probe output. Raw: ${stdout.substring(0, 100)}`));
        }
    });
}

// IPC Listener
process.on('message', (msg) => {
    switch (msg.type) {
        case 'RECON_NOW':
            runNetworkScan();
            break;
        case 'PROBE_HOST':
            probeHost(msg.host);
            break;
    }
});

// If run directly for testing
if (require.main === module) {
    console.log(chalk.gray(`[GHOST #${id}]: Test mode active. Probing localhost...`));
    probeHost('127.0.0.1');
}
