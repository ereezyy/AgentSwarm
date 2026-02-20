// don/soldier.js - STREET SOLDIER (GENERIC OPERATIVE)
// A lightweight generic agent that can be assigned simple tasks
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const id = process.argv[2] || '0000';
const type = process.argv[3] || 'STREET';

console.log(chalk.white.bold(`[${type} #${id}]: Street operative deployed. Standing by for orders.`));

// Watch for new files in the missions directory (data drop detection)
const MISSIONS_DIR = path.resolve(__dirname, '../missions');

function scanForDrops() {
    try {
        if (!fs.existsSync(MISSIONS_DIR)) return;
        const files = fs.readdirSync(MISSIONS_DIR);
        const recentFiles = files.filter(f => {
            try {
                const stat = fs.statSync(path.join(MISSIONS_DIR, f));
                // Files modified in last 5 minutes
                return (Date.now() - stat.mtimeMs) < 300000;
            } catch (e) { return false; }
        });

        if (recentFiles.length > 0) {
            console.log(chalk.gray(`[${type} #${id}]: ${recentFiles.length} recent mission files detected.`));
            if (process.send) {
                process.send({
                    type: 'LOG',
                    msg: `Soldier #${id}: ${recentFiles.length} recent mission drops`,
                    level: 'INFO'
                });
            }
        }
    } catch (e) { /* silent */ }
}

// Scan every 2 minutes
scanForDrops();
setInterval(scanForDrops, 120000);

// IPC Listener
process.on('message', (msg) => {
    if (msg.type === 'TASK') {
        console.log(chalk.white(`[${type} #${id}]: Received task: ${msg.desc}`));
    }
});
