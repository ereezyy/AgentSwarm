// skills/syndicate/healthcheck.js - PORTED FROM OPENCLAW
// Automated swarm health and security auditing.

const fs = require('fs');
const path = require('path');
const don = require('../../don/syndicate_logic');

class HealthCheck {
    constructor() {
        this.statusFile = path.join(__dirname, '../../missions/health_status.json');
    }

    /**
     * Run a deep audit of the swarm.
     */
    async audit() {
        const report = {
            timestamp: new Date().toISOString(),
            agents: don.sessions.list(),
            warChest: don.profit,
            issues: []
        };

        // Check for crashed agents
        const crashed = report.agents.filter(a => a.status === 'DEAD' || a.crashes > 5);
        if (crashed.length > 0) {
            report.issues.push({
                severity: 'CRITICAL',
                msg: `${crashed.length} agents are DEAD or in crash loops.`,
                agents: crashed.map(a => a.type)
            });
        }

        // Check for security hardening (HMAC ID check)
        const sampleId = report.agents[0]?.id;
        if (sampleId && sampleId.length !== 8) {
            report.issues.push({
                severity: 'WARNING',
                msg: "Agent IDs do not match the hardened SHA-256/HMAC format."
            });
        }

        this.saveReport(report);
        return report;
    }

    saveReport(report) {
        fs.writeFileSync(this.statusFile, JSON.stringify(report, null, 2));
    }
}

module.exports = new HealthCheck();
