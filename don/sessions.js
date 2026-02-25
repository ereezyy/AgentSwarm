// don/sessions.js - CENTRALIZED AGENT SESSION MANAGEMENT
// Mimics OpenClaw's sessions_* tools for Syndicate coordination.

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class SessionManager {
    constructor(don) {
        this.don = don;
        this.historyDir = path.join(__dirname, '../missions/session_history');
        if (!fs.existsSync(this.historyDir)) {
            fs.mkdirSync(this.historyDir, { recursive: true });
        }
    }

    /**
     * sessions_list: List all active agents and their metadata.
     */
    list() {
        return Object.keys(this.don.processes).map(type => ({
            type,
            id: this.don.processes[type].pid,
            status: this.don.agentHealth[type]?.status || 'ALIVE',
            crashes: this.don.agentHealth[type]?.crashes || 0,
            uptime: this.don.agentHealth[type]?.since ? Date.now() - this.don.agentHealth[type].since : 0
        }));
    }

    /**
     * sessions_history: Fetch the last N lines of an agent's transcript.
     */
    history(agentType, limit = 50) {
        const logPath = path.join(this.historyDir, `${agentType.toLowerCase()}.log`);
        if (!fs.existsSync(logPath)) return [];

        const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
        return lines.slice(-limit);
    }

    /**
     * sessions_send: Send a message to another agent.
     */
    send(from, to, msg, options = {}) {
        const target = this.don.processes[to];
        if (target && target.connected) {
            target.send({
                type: 'AGENT_COMMS',
                from,
                msg,
                options,
                timestamp: new Date().toISOString()
            });

            // Log for history
            this.logToHistory(from, to, msg);
            return true;
        }
        return false;
    }

    logToHistory(from, to, msg) {
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] ${from} -> ${to}: ${msg}\n`;

        // Log to both agent files
        [from, to].forEach(agent => {
            if (!agent) return;
            const logPath = path.join(this.historyDir, `${agent.toLowerCase()}.log`);
            fs.appendFileSync(logPath, entry);
        });
    }
}

module.exports = SessionManager;
