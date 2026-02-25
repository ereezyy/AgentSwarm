// skills/syndicate/session-logs.js - PORTED FROM OPENCLAW
// Logic for persistent session logging and auditing.

const fs = require('fs');
const path = require('path');

class SessionLogger {
    constructor() {
        this.logDir = path.join(__dirname, '../../missions/session_logs');
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    log(agent, type, data) {
        const timestamp = new Date().toISOString();
        const logFile = path.join(this.logDir, `${agent.toLowerCase()}.jsonl`);
        const entry = JSON.stringify({ timestamp, type, data }) + '\n';
        fs.appendFileSync(logFile, entry);
    }
}

module.exports = new SessionLogger();
