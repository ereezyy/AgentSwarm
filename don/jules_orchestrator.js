/**
 * don/jules_orchestrator.js - THE EVOLVER (Autonomous Self-Healing Loop)
 * Monitors system telemetry and logs to trigger Jules fixing/expansion sessions.
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
require('dotenv').config();

const id = process.argv[2] || 'Orchestrator';
const TELEMETRY_FILE = path.join(__dirname, '../missions/telemetry.json');
const LOG_FILE = path.join(__dirname, '../missions/evolution_log.md');
const SOURCE_NAME = process.env.JULES_SOURCE_NAME || 'syndicate-repo'; // User needs to set this

console.log(chalk.green.bold(`[JULES_ORCHESTRATOR #${id}]: 🧬 Autonomous Evolution online.`));


// Track sessions we've already triggered to avoid loops
let activeSessions = new Set();
let eventLog = [];
let attemptedFixes = {};


async function monitorSyndicate() {
    try {
        if (!fs.existsSync(TELEMETRY_FILE)) return;

        const telemetry = JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf8'));
        const agents = telemetry.agents || {};

        for (const [agentName, data] of Object.entries(agents)) {
            // Trigger 1: Repeated Crashes
            if (data.status === 'CRASHED' && data.restarts > 5 && !activeSessions.has(agentName)) {

                console.log(chalk.red.bold(`[JULES_ORCHESTRATOR]: 🚨 Agent ${agentName} is stuck in a crash loop (${data.restarts} restarts). Calling Jules...`));
                attemptedFixes[agentName] = (attemptedFixes[agentName] || 0) + 1;
                eventLog.push({ type: 'CRASH_LOOP', agent: agentName, restarts: data.restarts, time: new Date().toISOString() });
                triggerFix(agentName, `The agent ${agentName} is crashing repeatedly (restarts: ${data.restarts}). Analyze its telemetry and code in don/${agentName.toLowerCase()}.js and fix the root cause.`);

                activeSessions.add(agentName);
            }

            // Trigger 2: Opportunity (e.g. profitable but high latency)
            if (data.status === 'ACTIVE' && data.latency > 5000 && !activeSessions.has(`${agentName}_opt`)) {

                console.log(chalk.yellow(`[JULES_ORCHESTRATOR]: 💡 Optimization found for ${agentName} (Latency: ${data.latency}ms). Calling Jules...`));
                attemptedFixes[agentName + "_opt"] = (attemptedFixes[agentName + "_opt"] || 0) + 1;
                eventLog.push({ type: 'HIGH_LATENCY_ANOMALY', agent: agentName, latency: data.latency, time: new Date().toISOString() });
                triggerFix(agentName, `Optimize the performance of ${agentName}. Current latency is too high (${data.latency}ms). Refactor for non-blocking execution.`);

                activeSessions.add(`${agentName}_opt`);
            }
        }

        // Check active session status and auto-approve
        await checkSessons();


    } catch (e) {
        eventLog.push({ type: 'MONITOR_ERROR', error: e.message, time: new Date().toISOString() });
        console.error(chalk.red(`[JULES_ORCHESTRATOR]: Monitor error: ${e.message}`));
    }


    setTimeout(monitorSyndicate, 60000); // Check every minute
}

function triggerFix(agent, prompt) {
    const cmd = `python muscle/jules_bridge.py --create "${prompt}" "${SOURCE_NAME}" --title "Auto-fix: ${agent}" --auto-pr`;

    exec(cmd, (err, stdout, stderr) => {

        if (err) {
            eventLog.push({ type: 'TRIGGER_FIX_ERROR', agent, error: stderr, time: new Date().toISOString() });
            console.error(chalk.red(`[JULES_ORCHESTRATOR]: Failed to trigger Jules: ${stderr}`));
            return;
        }


        try {
            const res = JSON.parse(stdout);
            if (res.name) {
                const sessId = res.name.split('/').pop();
                console.log(chalk.cyan(`[JULES_ORCHESTRATOR]: 🧬 Session sparked! ID: ${sessId}`));
                logEvolution(`Sparked fix for ${agent}. Prompt: ${prompt}. Session: ${sessId}`);
            }
        } catch (e) {
            console.log(chalk.yellow(`[JULES_ORCHESTRATOR]: Jules output received, but could not parse JSON.`));
        }
    });
}

async function checkSessons() {
    exec(`python muscle/jules_bridge.py --list-sessions`, (err, stdout, stderr) => {
        if (err) return;

        try {
            const data = JSON.parse(stdout);
            const sessions = data.sessions || [];

            for (const sess of sessions) {
                const sessId = sess.name.split('/').pop();

                // If a session is complete and has a PR, auto-approve
                if (sess.state === 'SUCCEEDED' && sess.automationResult && sess.automationResult.pullRequestUrl) {
                    console.log(chalk.green.bold(`[JULES_ORCHESTRATOR]: ✅ Jules finished task "${sess.title}". Approving and Merging...`));
                    approveSession(sessId);
                }
            }
        } catch (e) { }
    });
}

function approveSession(sessId) {
    exec(`python muscle/jules_bridge.py --approve ${sessId}`, (err, stdout, stderr) => {
        if (!err) {
            console.log(chalk.green(`[JULES_ORCHESTRATOR]: 🚀 Session ${sessId} approved and merged.`));
            logEvolution(`Merged session ${sessId}. Evolution complete.`);
        }
    });
}

function logEvolution(msg) {
    const log = `\n[${new Date().toISOString()}] ${msg}`;
    fs.appendFileSync(LOG_FILE, log);
}


function reportToJules() {
    if (eventLog.length === 0) {
        console.log(chalk.gray(`[JULES_ORCHESTRATOR]: No new events to report to Jules.`));
        return;
    }

    console.log(chalk.magenta.bold(`[JULES_ORCHESTRATOR]: 📊 Sending 25-min Periodic Swarm Report to Jules...`));

    let summary = `Periodic Swarm Report:\n\n`;
    summary += `Event Log:\n` + JSON.stringify(eventLog, null, 2) + `\n\n`;
    summary += `Attempted Fixes (Recurring Issues):\n` + JSON.stringify(attemptedFixes, null, 2) + `\n\n`;
    summary += `Analyze the event log and attempted fixes. If any recurring issues are failing to resolve, suggest new fixes or architectural changes.`;

    // Clear the event log
    eventLog = [];

    const cmd = `python muscle/jules_bridge.py --create "${summary.replace(/"/g, '\\"')}" "${SOURCE_NAME}" --title "Periodic Swarm Report"`;

    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            console.error(chalk.red(`[JULES_ORCHESTRATOR]: Failed to dispatch report to Jules: ${stderr}`));
            return;
        }
        console.log(chalk.green(`[JULES_ORCHESTRATOR]: ✅ Periodic Swarm Report dispatched to Jules.`));
    });
}

// 25 minutes = 1,500,000 milliseconds
setInterval(reportToJules, 1500000);



function syncAndRestart() {
    console.log(chalk.cyan.bold(`[JULES_ORCHESTRATOR]: 🔄 Initiating 63-min Repo Sync & Swarm Restart...`));

    exec(`git pull origin HEAD`, (err, stdout, stderr) => {
        if (err) {
            console.error(chalk.red(`[JULES_ORCHESTRATOR]: Git pull failed: ${stderr}`));
            eventLog.push({ type: 'SYNC_ERROR', error: stderr, time: new Date().toISOString() });
            return;
        }

        console.log(chalk.green(`[JULES_ORCHESTRATOR]: ✅ Swarm synced with repo successfully. Triggering swarm restart.`));
        // Send IPC message to the main syndicate_logic.js process
        if (process.send) {
            process.send({ type: 'RESTART_SWARM' });
        } else {
            console.error(chalk.red(`[JULES_ORCHESTRATOR]: No IPC channel found. Cannot trigger swarm restart.`));
        }
    });
}

// 63 minutes = 3,780,000 milliseconds
setInterval(syncAndRestart, 3780000);

monitorSyndicate();
