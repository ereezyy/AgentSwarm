const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const API_KEY = 'AQ.Ab8RN6IXr9kwsabtAwXnWklcnqamKQ7eqGL3r13j8JsrAMS7LQ';
const BASE_URL = 'https://jules.googleapis.com/v1alpha';
const SOURCE = 'github/ereezyy/AgentSwarm';

/**
 * Jules Repair Agent
 * Autonomous Self-Healing for the Syndicate Swarm
 */
class JulesHealer {
    constructor() {
        this.activeSessions = new Map();
        this.repairLogPath = path.resolve(__dirname, '../missions/repair_logs.md');
        if (!fs.existsSync(this.repairLogPath)) {
            fs.writeFileSync(this.repairLogPath, '# 🔧 Jules Repair Logs\n\n');
        }
    }

    async repairFile(filePath, errorMsg, stackTrace) {
        console.log(chalk.cyan.bold(`[JULES]: 🔧 SELF-HEALING INITIATED for ${path.basename(filePath)}`));
        console.log(chalk.cyan(`[JULES]: Error: ${errorMsg.slice(0, 100)}...`));

        try {
            const prompt = `The file ${filePath} is causing a crash with the following error:
${errorMsg}

Stack Trace:
${stackTrace || 'Not available'}

Please identify the root cause and provide a fix. Ensure any missing variables are initialized, network failovers are implemented for API calls, and wallet guards are present.`;

            const cleanError = errorMsg.replace(/[\r\n]+/g, ' ').replace(/\u001b\[.*?m/g, '');
            const response = await axios.post(`${BASE_URL}/sessions`, {
                prompt: prompt,
                sourceContext: {
                    source: SOURCE,
                    githubRepoContext: {
                        startingBranch: 'master'
                    }
                },
                automationMode: 'AUTO_CREATE_PR',
                title: `Repair ${path.basename(filePath)}: ${cleanError.slice(0, 30).trim()}`
            }, {
                headers: {
                    'X-Goog-Api-Key': API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            const session = response.data;
            console.log(chalk.green(`[JULES]: ✅ Repair session created: ${session.id}`));

            this.logRepair(filePath, errorMsg, session.id);

            return session;
        } catch (error) {
            const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
            console.log(chalk.red(`[JULES]: ❌ Failed to initiate repair: ${errorDetails}`));
            return null;
        }
    }

    logRepair(filePath, error, sessionId) {
        const logEntry = `
## 🛠️ Repair Session: ${new Date().toISOString()}
- **File**: \`${filePath}\`
- **Error**: \`${error}\`
- **Jules Session**: \`${sessionId}\`
- **Status**: \`Initiated / Awaiting PR\`
---
`;
        fs.appendFileSync(this.repairLogPath, logEntry);
    }

    async checkSessionStatus(sessionId) {
        try {
            const response = await axios.get(`${BASE_URL}/sessions/${sessionId}`, {
                headers: {
                    'X-Goog-Api-Key': API_KEY
                }
            });
            return response.data;
        } catch (error) {
            console.log(chalk.gray(`[JULES]: Error checking status for ${sessionId}: ${error.message}`));
            return null;
        }
    }
}

module.exports = new JulesHealer();
