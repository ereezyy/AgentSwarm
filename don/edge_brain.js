// don/edge_brain.js - THE EDGE BRAIN (LOCAL PI 5 / HAILO)
const axios = require('axios');
const chalk = require('chalk');
const { Client } = require('ssh2');

const PI_IP = process.env.PI_HOST || process.env.PI_IP || '192.168.1.78';
const PI_USER = process.env.PI_USER || 'ed';
const PI_PASS = process.env.PI_PASSWORD || process.env.PI_PASS;
const PI_PORT = 11434; // Default Ollama port

if (!PI_PASS) {
    console.error(chalk.red('[EDGE BRAIN]: Error: PI_PASSWORD environment variable is not set.'));
    // We don't exit here as it's a module, but we prevent connection
} else {
    console.log(chalk.magenta.bold(`[EDGE BRAIN]: Connecting to Sovereign Intelligence (Pi 5 + Hailo)...`));

    // SSH Client for Hardware Control
    const conn = new Client();
    let sshReady = false;

    conn.on('ready', () => {
        console.log(chalk.green(`[EDGE BRAIN]: SSH Uplink Established via ${PI_USER}@${PI_IP}`));
        sshReady = true;

        // Establish secure tunnel for local querying
        const net = require('net');
        const tunnel = net.createServer(socket => {
            conn.forwardOut(socket.remoteAddress, socket.remotePort, '127.0.0.1', 11434, (err, stream) => {
                if (err) return socket.end();
                socket.pipe(stream).pipe(socket);
            });
        });

        tunnel.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                console.log(chalk.gray(`[EDGE BRAIN]: Tunnel port 11434 already in use (likely by another process or local Ollama).`));
            } else {
                console.error(chalk.red(`[EDGE BRAIN]: Tunnel error: ${e.message}`));
            }
        });

        tunnel.listen(11434, '127.0.0.1', () => {
            console.log(chalk.green(`[EDGE BRAIN]: Secure SSH Tunnel established on 127.0.0.1:11434 to remote Ollama.`));
        });

        checkHailoStats();
    }).on('error', (err) => {
        console.log(chalk.red(`[EDGE BRAIN]: SSH Connection Failed: ${err.message}`));
    }).connect({
        host: PI_IP,
        port: 22,
        username: PI_USER,
        password: PI_PASS
    });

    function checkHailoStats() {
        if (!sshReady) return;
        conn.exec('hailo-smi', (err, stream) => {
            if (err) return;
            stream.on('data', (data) => {
                const output = data.toString();
                // Simple check for NPU activity
                if (output.includes('Hailo-8')) {
                    console.log(chalk.cyan(`[EDGE BRAIN]: Hailo-8 NPU Detected & Active.`));
                }
            });
        });
    }
}

async function queryLocalBrain(prompt, systemMsg = "You are a helpful AI.") {
    try {
        console.log(chalk.magenta(`[EDGE BRAIN]: Synapse firing to ${PI_IP}...`));
        // ... (Keep existing axios logic for now, as it's faster for text gen than SSH exec)
        const response = await axios.post(`http://127.0.0.1:${PI_PORT}/api/generate`, {
            model: "llama3", // Or whatever model is loaded on the Pi
            prompt: `${systemMsg}\n\n${prompt}`,
            stream: false
        }, { timeout: 60000 }); // Increased timeout for heavy inference

        const responseText = response.data.response;
        console.log(chalk.green(`[EDGE BRAIN]: Insight Received: "${responseText.substring(0, 50)}..."`));
        return responseText;

    } catch (e) {
        console.error(chalk.red(`[EDGE BRAIN]: Inference Severed: ${e.message}`));
        return null;
    }
}

module.exports = { queryLocalBrain };
