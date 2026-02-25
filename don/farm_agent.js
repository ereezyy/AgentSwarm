/**
 * Syndicate Farm Agent — Orchestrates physical phone farm engagement.
 * Interface for Syla to trigger viral hype cycles.
 */

const farm = require('../muscle/farm_bridge');
const chalk = require('chalk');

const id = process.argv[2] || 'FarmActive';
const type = 'FARM_AGENT';

console.log(chalk.green.bold(`[${type} #${id}]: Physical Swarm Controller Online.`));

// Engagement metrics
let engagementTotal = 0;
let isPaused = true; // PAUSED FOR REPAIR per user request

process.on('message', async (msg) => {
    if (msg.type === 'FARM_BOOST') {
        if (isPaused) {
            console.log(chalk.yellow(`[${type} #${id}]: ⏸️ Farm is PAUSED for maintenance. Ignoring boost request.`));
            return;
        }
        const { url, platform } = msg;
        console.log(chalk.cyan(`[${type} #${id}]: 🚀 Boosting ${platform || 'URL'} target: ${url}`));

        try {
            const devices = await farm.getDevices();
            if (devices.length === 0) {
                console.log(chalk.yellow(`[${type} #${id}]: No physical devices detected. Simulation mode active.`));
                return;
            }

            console.log(chalk.green(`[${type} #${id}]: Detected ${devices.length} devices. Spreading hype...`));

            // Parallel burst across farm
            const boostPromises = devices.map(async (device) => {
                if (device.status === 'device') {
                    const p = (platform || '').toUpperCase();
                    if (p === 'TIKTOK') {
                        await farm.tiktokHighlight(device.id, url);
                    } else if (p === 'INSTAGRAM') {
                        await farm.instagramLike(device.id, url);
                    } else if (p === 'FACEBOOK') {
                        await farm.facebookLike(device.id, url);
                    } else if (p === 'YOUTUBE' || p === 'SHORTS') {
                        await farm.youtubeShorts(device.id, url);
                    } else {
                        await farm.openUrl(device.id, url);
                        await farm.humanDelay();
                        await farm.emulateEngagement(device.id);
                    }
                    engagementTotal++;
                }
            });

            await Promise.all(boostPromises);

            if (process.send) {
                process.send({
                    type: 'AGENT_COMMS',
                    from: 'FARM',
                    msg: `Boosted ${url.substring(0, 30)}... across ${devices.length} nodes.`
                });
            }

        } catch (e) {
            console.error(chalk.red(`[${type} #${id}]: Farm error: ${e.message}`));
        }
    }
});

// Periodic status report
setInterval(() => {
    if (process.send) {
        process.send({ type: 'STATUS_REPORT', status: 'HEALTHY', metrics: { engagementTotal } });
    }
}, 60000);

// Initial bootstrap
if (process.send) {
    process.send({ type: 'AGENT_COMMS', from: 'FARM', msg: 'Equipped and ready for social injection.' });
}
