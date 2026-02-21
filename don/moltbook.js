const https = require('https');
const chalk = require('chalk');

// Moltbook (Clawhub) Scraper
// Scours the Moltbook registry for new Skills and Souls (Alpha)

const REPO_API = 'https://api.github.com/repos/moltbook/clawhub/contents';
const API_BASE = new URL(REPO_API);
const USER_AGENT = 'Syndicate-Spider/1.0';

async function fetchRepoContent(path = '') {
    const cleanPath = path.replace(/^\/+/, '');
    const fullPath = cleanPath ? `${API_BASE.pathname}/${cleanPath}` : API_BASE.pathname;

    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_BASE.hostname,
            path: fullPath,
            method: 'GET',
            headers: { 'User-Agent': USER_AGENT }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else if (res.statusCode === 403) {
                        // Rate limited
                        resolve(null);
                    } else {
                        resolve([]);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function scourMoltbook() {
    console.log(chalk.magenta('[MOLTBOOK]: Scouring the registry...'));
    try {
        // Scour Skills
        const skills = await fetchRepoContent('skills'); // Assuming 'skills' dir exists based on README concept
        if (skills && Array.isArray(skills)) {
            const newSkills = skills.filter(s => s.type === 'dir').map(s => s.name);
            if (newSkills.length > 0) {
                return `[MOLTBOOK]: Found ${newSkills.length} potential skills in registry: ${newSkills.slice(0, 3).join(', ')}...`;
            }
        }

        // Scour Souls (Agent Personalities)
        const souls = await fetchRepoContent('souls');
        if (souls && Array.isArray(souls)) {
            const newSouls = souls.filter(s => s.type === 'dir').map(s => s.name);
            if (newSouls.length > 0) {
                return `[MOLTBOOK]: Found ${newSouls.length} new Souls: ${newSouls.slice(0, 3).join(', ')}...`;
            }
        }

        return null;
    } catch (e) {
        console.error(chalk.red('[MOLTBOOK]: Scour failed: ' + e.message));
        return null; // Silent fail
    }
}

module.exports = { scourMoltbook };
