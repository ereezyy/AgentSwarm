import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const PORT = 18888; // Dedicated launcher port

// Generate a random secure token for this session
const AUTH_TOKEN = crypto.randomBytes(32).toString('hex');


const server = http.createServer((req, res) => {
    if (req.url === '/' && req.method === 'GET') {
        fs.readFile(path.join(__dirname, 'launcher.html'), 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading launcher.html');
                return;
            }
            // Inject the authentication token into the HTML
            const htmlWithToken = data.replace('{{AUTH_TOKEN}}', AUTH_TOKEN);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlWithToken);
        });
        } else if (req.url === '/launch' && req.method === 'POST') {
        const authHeader = req.headers['authorization'];
        if (authHeader !== AUTH_TOKEN) {
            console.warn('[LAUNCHER]: Unauthorized launch attempt!');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }
        console.log('[LAUNCHER]: Received activation command!');

        // Execute the main startup script
        // We use powershell to run fire_it_up.ps1
        const child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', 'fire_it_up.ps1'], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`[LAUNCHER]: Server active at http://localhost:${PORT}`);
    console.log(`[LAUNCHER]: Ready to activate The Syndicate.`);
});
