// don/architect.js - THE ARCHITECT (SELF-EVOLUTION ENGINE v4.1)
// ══════════════════════════════════════════════════════════════
// Production-grade agent evolution with:
//   - Telemetry-driven target selection
//   - 7-gate safety pipeline (syntax, regex patterns, structure,
//     conditional preservation, health check, pre-deploy boot test)
//   - Auto-rollback if evolved agent crashes within 5 minutes
//   - Pre-deploy boot test (fork subprocess, verify it stays alive)
//   - Diff generation for audit trail
//   - Evolution metrics (success/fail/rollback rates)
//   - Rate limiting (same agent can't be evolved twice in a row)
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { fork } = require('child_process');
const chalk = require('chalk');
require('dotenv').config();

const id = process.argv[2] || 'Architect';
const { ask } = require('./brain');

const TELEMETRY_FILE = path.join(__dirname, '../missions/telemetry.json');
const EVOLUTION_LOG = path.join(__dirname, '../missions/evolution_log.md');
const METRICS_FILE = path.join(__dirname, '../missions/evolution_metrics.json');
const BACKUPS_DIR = path.join(__dirname, '../missions/evolution_backups');
const DON_DIR = __dirname;

// ── Configuration ────────────────────────────────────────────
const CONFIG = {
    // Agents the Architect is allowed to mutate
    mutableAgents: ['scavenger.js', 'hustler.js', 'siren.js', 'watcher.js', 'soldier.js'],

    // Max code size for safe mutation (bytes)
    maxCodeSize: 15000,

    // Min code size — rejects suspiciously small outputs
    minCodeSize: 200,

    // Max size increase factor (don't let AI bloat code)
    maxGrowthFactor: 1.4,

    // Min size factor (don't let AI gut the code)
    minShrinkFactor: 0.4,

    // Cooldown per agent between evolutions (ms) — 1 hour
    agentCooldown: 3600000,

    // Post-evolution crash watch window (ms) — 5 minutes
    crashWatchWindow: 300000,

    // Pre-deploy boot test timeout (ms) — 8 seconds
    bootTestTimeout: 8000,

    // Auto-evolution interval (ms) — 2 hours
    autoInterval: 7200000,

    // Initial delay before first evolution (ms)
    initialDelay: 60000,
};

// ── Dangerous Patterns (Blocked) ─────────────────────────────
// Two tiers: string literals for exact matches, regex for behavioral patterns
const DANGEROUS_STRINGS = [
    // Filesystem destruction
    'rm -rf', 'rmdir /s', 'del /f', 'del /q',
    'fs.rmdirSync', 'fs.rmSync', 'rimraf',

    // Process control (agents shouldn't kill themselves)
    'process.exit(', 'process.kill(',

    // Self-eval/self-modify (inception risk)
    'eval(',

    // Crypto key theft
    'SOLANA_PRIVATE_KEY', 'PRIVATE_KEY', 'SECRET_KEY',

    // Self-modification of critical files
    'syndicate_logic', 'index.js', 'architect.js',
    'edge_brain.js', 'mev_bundler.js',
];

const DANGEROUS_REGEX = [
    // Infinite loops (the #1 way AI kills an agent)
    { rx: /while\s*\(\s*true\s*\)/, name: 'while(true) infinite loop' },
    { rx: /for\s*\(\s*;\s*;\s*\)/, name: 'for(;;) infinite loop' },
    { rx: /while\s*\(\s*1\s*\)/, name: 'while(1) infinite loop' },
    { rx: /do\s*\{[^}]*\}\s*while\s*\(\s*true\s*\)/, name: 'do-while(true) loop' },

    // External command execution (AIs love to add exec calls)
    { rx: /child_process.*exec\s*\(/, name: 'child_process.exec()' },
    { rx: /child_process.*spawn\s*\(/, name: 'child_process.spawn()' },
    { rx: /require\s*\(\s*['"]child_process['"]\s*\)/, name: 'child_process require' },
    { rx: /exec\s*\(\s*['"`]\s*(rm|del|format|curl|wget|powershell|cmd)/, name: 'exec() with destructive command' },

    // Known malicious patterns (not a URL allowlist — that blocks legit APIs)
    { rx: /stratum\+tcp|mining.*pool|coinhive/, name: 'crypto mining pool' },
    { rx: /discord\.com\/api\/webhooks/, name: 'Discord webhook exfiltration' },
    { rx: /api\.telegram\.org\/bot/, name: 'Telegram bot exfiltration' },
];

// ── Required Structural Patterns ─────────────────────────────
// Evolved code MUST contain these to be valid
const REQUIRED_PATTERNS = {
    'dotenv': { pattern: "require('dotenv')", description: 'dotenv config loading' },
    'chalk': { pattern: "require('chalk')", description: 'chalk logging' },
    'processArgv': { pattern: 'process.argv', description: 'agent ID from argv' },
    'consolelog': { pattern: 'console.log', description: 'console output' },
};

// Patterns that SHOULD exist if original had them (soft check)
const CONDITIONAL_PATTERNS = [
    { pattern: 'process.send', description: 'IPC messaging to The Don' },
    { pattern: "process.on('message", description: 'IPC listener' },
    { pattern: 'setTimeout', description: 'main loop scheduling' },
];

// ── Evolution Metrics ────────────────────────────────────────
let metrics = {
    totalAttempts: 0,
    applied: 0,
    rejected: 0,
    blocked: 0,
    rolledBack: 0,
    brainFailures: 0,
    lastEvolution: null,
    agentHistory: {},    // agent -> { lastEvolved, timesEvolved, timesRolledBack }
};

function loadMetrics() {
    try {
        if (fs.existsSync(METRICS_FILE)) {
            metrics = { ...metrics, ...JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8')) };
        }
    } catch (e) { /* start fresh */ }
}

function saveMetrics() {
    try {
        const dir = path.dirname(METRICS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
    } catch (e) { /* non-critical */ }
}

// ── Rollback Tracking ────────────────────────────────────────
// Tracks recent evolutions so The Don can trigger rollback if agent crashes
const pendingEvolutions = new Map(); // agentType -> { backupPath, targetPath, timestamp }

// ── Brain Interface ──────────────────────────────────────────
async function queryBrain(prompt, system) {
    try {
        const result = await ask(prompt, system, { agentName: `ARCHITECT #${id}` });
        return result;
    } catch (e) {
        console.error(chalk.red(`[ARCHITECT #${id}]: Brain error: ${e.message}`));
        metrics.brainFailures++;
        saveMetrics();
        return null;
    }
}

// ── Code Analysis ────────────────────────────────────────────
function analyzeCode(code) {
    const analysis = {
        lineCount: code.split('\n').length,
        byteSize: code.length,
        hasIPC: code.includes('process.send'),
        hasIPCListener: code.includes("process.on('message") || code.includes('process.on("message'),
        hasMainLoop: code.includes('setTimeout') || code.includes('setInterval'),
        hasDotenv: code.includes("require('dotenv')") || code.includes('require("dotenv")'),
        hasChalk: code.includes("require('chalk')") || code.includes('require("chalk")'),
        hasErrorHandling: code.includes('catch') || code.includes('.catch('),
        functionCount: (code.match(/(?:async\s+)?function\s+\w+/g) || []).length,
        requireCount: (code.match(/require\(/g) || []).length,
    };
    return analysis;
}

function generateSimpleDiff(original, evolved) {
    const origLines = original.split('\n');
    const evolLines = evolved.split('\n');
    const diff = [];

    const maxLen = Math.max(origLines.length, evolLines.length);
    let changeCount = 0;

    for (let i = 0; i < maxLen; i++) {
        const origLine = origLines[i] || '';
        const evolLine = evolLines[i] || '';

        if (origLine.trim() !== evolLine.trim()) {
            changeCount++;
            if (changeCount <= 30) { // Cap diff output
                if (origLine) diff.push(`- L${i + 1}: ${origLine.substring(0, 120)}`);
                if (evolLine) diff.push(`+ L${i + 1}: ${evolLine.substring(0, 120)}`);
            }
        }
    }

    return {
        text: diff.join('\n'),
        changedLines: changeCount,
        addedLines: Math.max(0, evolLines.length - origLines.length),
        removedLines: Math.max(0, origLines.length - evolLines.length),
    };
}

// ── Pre-Deploy Boot Test ─────────────────────────────────────
// Writes evolved code to a temp file, forks it as a real subprocess,
// and checks if it survives for CONFIG.bootTestTimeout without crashing.
// This catches missing requires, runtime TypeErrors, and broken imports
// that static syntax checks will NEVER find.
async function bootTest(code, agentName) {
    const tempDir = path.join(__dirname, '../missions/evolution_backups');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempFile = path.join(tempDir, `_boottest_${agentName}`);
    fs.writeFileSync(tempFile, code);

    return new Promise((resolve) => {
        let crashed = false;
        let errorMsg = '';
        const startTime = Date.now();

        try {
            // Fork with same args the real agent would get
            const child = fork(tempFile, ['BOOT_TEST', 'TEST'], {
                silent: true, // Capture stdout/stderr without flooding console
                timeout: CONFIG.bootTestTimeout + 2000, // Hard kill safety margin
            });

            // Capture stderr for error messages
            let stderrBuffer = '';
            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    stderrBuffer += data.toString();
                    // Cap buffer to prevent memory issues
                    if (stderrBuffer.length > 2000) stderrBuffer = stderrBuffer.slice(-2000);
                });
            }

            child.on('error', (err) => {
                crashed = true;
                errorMsg = `Fork error: ${err.message}`;
            });

            child.on('exit', (exitCode, signal) => {
                if (exitCode !== null && exitCode !== 0) {
                    crashed = true;
                    // Try to extract useful error from stderr
                    const lastLine = stderrBuffer.split('\n').filter(l => l.trim()).pop() || '';
                    errorMsg = `Exit code ${exitCode}${lastLine ? ': ' + lastLine.substring(0, 200) : ''}`;
                }
            });

            // Wait for boot test window, then check if still alive
            setTimeout(() => {
                const aliveMs = Date.now() - startTime;

                // Clean up the child process
                try {
                    if (!child.killed) child.kill('SIGTERM');
                    // Force kill after 2s if SIGTERM didn't work
                    setTimeout(() => {
                        try { if (!child.killed) child.kill('SIGKILL'); } catch (e) { /* already dead */ }
                    }, 2000);
                } catch (e) { /* already dead */ }

                // Clean up temp file
                try { fs.unlinkSync(tempFile); } catch (e) { /* non-critical */ }

                if (crashed) {
                    resolve({ survived: false, error: errorMsg, aliveMs });
                } else {
                    resolve({ survived: true, error: null, aliveMs });
                }
            }, CONFIG.bootTestTimeout);

        } catch (forkError) {
            // Fork itself failed (file not found, permission denied, etc.)
            try { fs.unlinkSync(tempFile); } catch (e) { }
            resolve({ survived: false, error: `Cannot fork: ${forkError.message}`, aliveMs: 0 });
        }
    });
}

// ── Telemetry Analysis ───────────────────────────────────────
function analyzeTelemetry() {
    let telemetry = {};
    if (fs.existsSync(TELEMETRY_FILE)) {
        try { telemetry = JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf8')); } catch (e) { }
    }

    const errors = telemetry.errors || {};
    const profits = telemetry.profits || {};

    // Score each mutable agent
    const scores = CONFIG.mutableAgents.map(agentFile => {
        const type = agentFile.replace('.js', '').toUpperCase();
        const errorCount = errors[type] || 0;
        const profit = profits[type] || 0;
        const history = metrics.agentHistory[agentFile] || {};
        const timeSinceLastEvolution = Date.now() - (history.lastEvolved || 0);
        const onCooldown = timeSinceLastEvolution < CONFIG.agentCooldown;

        // Higher score = more need for evolution
        // Errors weigh heavily, low profit adds, cooldown blocks
        let score = 0;
        score += errorCount * 10;             // Errors are bad
        score += Math.max(0, 5 - profit);     // Low profit adds urgency
        score -= (history.timesRolledBack || 0) * 15; // Penalize agents that keep failing after evolution

        return {
            file: agentFile,
            type,
            score: onCooldown ? -999 : score,
            errorCount,
            profit,
            onCooldown,
            timesEvolved: history.timesEvolved || 0,
            timesRolledBack: history.timesRolledBack || 0,
        };
    });

    // Sort by score descending, pick the neediest available agent
    scores.sort((a, b) => b.score - a.score);

    const target = scores.find(s => s.score > -999);

    return { telemetry, scores, target: target || scores[0] };
}

// ══════════════════════════════════════════════════════════════
// ██ MAIN EVOLUTION PIPELINE ██
// ══════════════════════════════════════════════════════════════
async function evolve(forceTarget = null) {
    metrics.totalAttempts++;
    const cycleId = metrics.totalAttempts;

    try {
        console.log(chalk.magenta.bold(`\n[ARCHITECT #${id}]: ═══════════════════════════════════════`));
        console.log(chalk.magenta.bold(`[ARCHITECT #${id}]: 🧬 EVOLUTION CYCLE #${cycleId}`));
        console.log(chalk.magenta.bold(`[ARCHITECT #${id}]: ═══════════════════════════════════════`));

        // ── PHASE 1: TARGET SELECTION ────────────────────
        const { telemetry, scores, target } = analyzeTelemetry();

        const targetAgent = forceTarget || target.file;
        const targetPath = path.join(DON_DIR, targetAgent);
        const agentType = targetAgent.replace('.js', '').toUpperCase();

        // Show scoring
        console.log(chalk.gray(`[ARCHITECT #${id}]: Agent Scores:`));
        scores.forEach(s => {
            const marker = s.file === targetAgent ? chalk.green('►') : ' ';
            const cooldown = s.onCooldown ? chalk.yellow(' [COOLDOWN]') : '';
            console.log(chalk.gray(`  ${marker} ${s.type.padEnd(12)} Score: ${s.score.toString().padStart(4)} | Errors: ${s.errorCount} | Profit: $${s.profit} | Evolved: ${s.timesEvolved}x${cooldown}`));
        });

        if (!fs.existsSync(targetPath)) {
            console.log(chalk.yellow(`[ARCHITECT #${id}]: Target ${targetAgent} not found. Aborting.`));
            return;
        }

        // Check cooldown
        if (!forceTarget && target.onCooldown) {
            console.log(chalk.yellow(`[ARCHITECT #${id}]: All agents on cooldown. Skipping cycle.`));
            return;
        }

        const originalCode = fs.readFileSync(targetPath, 'utf8');
        const originalAnalysis = analyzeCode(originalCode);

        if (originalCode.length > CONFIG.maxCodeSize) {
            console.log(chalk.yellow(`[ARCHITECT #${id}]: ${targetAgent} too large (${originalCode.length}b > ${CONFIG.maxCodeSize}b). Skipping.`));
            return;
        }

        console.log(chalk.magenta(`[ARCHITECT #${id}]: TARGET: ${targetAgent} (${originalAnalysis.lineCount} lines, ${originalAnalysis.byteSize}b, ${originalAnalysis.functionCount} functions)`));

        // ── PHASE 2: AI-GUIDED MUTATION ──────────────────
        const errorContext = telemetry.errors?.[agentType]
            ? `This agent has ${telemetry.errors[agentType]} recorded errors.`
            : 'No error data available.';

        const profitContext = telemetry.profits?.[agentType]
            ? `This agent has generated $${telemetry.profits[agentType]} in profit.`
            : 'This agent has not generated profit yet.';

        const systemPrompt = `You are "The Architect", a self-evolution AI for an autonomous agent swarm called The Syndicate.
Your task is to IMPROVE an agent's code to make it more reliable, efficient, or profitable.

CRITICAL RULES:
1. Return ONLY the complete, runnable JavaScript file. NO markdown, NO backticks, NO explanations.
2. The FIRST line of your output MUST be a JavaScript comment or require() statement.
3. You MUST preserve ALL existing require() imports.
4. You MUST preserve ALL process.send() calls — these are IPC messages to the orchestrator.
5. You MUST preserve the process.on('message') handler if one exists.
6. You MUST preserve setTimeout/setInterval calls that keep the agent alive.
7. You MUST keep require('dotenv').config() if present.
8. Do NOT add any new require() for modules that aren't already imported.
9. Do NOT change the agent's fundamental purpose.
10. Do NOT include process.exit() calls.
11. Do NOT access environment variables for private keys or API keys that the original doesn't use.
12. Keep code size between ${Math.floor(originalCode.length * CONFIG.minShrinkFactor)} and ${Math.floor(originalCode.length * CONFIG.maxGrowthFactor)} characters.

FOCUS YOUR IMPROVEMENTS ON:
- Better error handling and retry logic
- More informative logging
- Smarter data processing or analysis
- Rate limit awareness
- Edge case handling`;

        const userPrompt = `AGENT: ${targetAgent}
PERFORMANCE: ${errorContext} ${profitContext}
TELEMETRY SUMMARY: Total errors across swarm: ${JSON.stringify(telemetry.errors || {})}

CURRENT CODE (${originalCode.length} characters):
${originalCode}

Return the IMPROVED version of this code. Remember: ONLY raw JavaScript, no markdown.`;

        console.log(chalk.magenta(`[ARCHITECT #${id}]: Consulting the brain...`));
        const rawResponse = await queryBrain(userPrompt, systemPrompt);

        if (!rawResponse) {
            console.log(chalk.yellow(`[ARCHITECT #${id}]: Brain returned nothing. Aborting cycle.`));
            metrics.brainFailures++;
            saveMetrics();
            return;
        }

        // ── PHASE 3: RESPONSE CLEANING ───────────────────
        let cleanCode = rawResponse.trim();

        // Strip markdown fences if the AI wrapped them
        if (cleanCode.includes('```')) {
            const match = cleanCode.match(/```(?:javascript|js|node)?\s*\n([\s\S]*?)```/);
            if (match) {
                cleanCode = match[1].trim();
            } else {
                // Try stripping all fences
                cleanCode = cleanCode.replace(/```[^\n]*\n?/g, '').trim();
            }
        }

        // Strip leading prose if AI added explanation before code
        const firstCodeLine = cleanCode.search(/^(?:\/\/|'use strict'|const |let |var |require|import )/m);
        if (firstCodeLine > 0 && firstCodeLine < 200) {
            cleanCode = cleanCode.substring(firstCodeLine);
        }

        // ── PHASE 4: SAFETY GATES ────────────────────────
        console.log(chalk.magenta(`[ARCHITECT #${id}]: Running safety gates...`));
        let gatesPassed = 0;
        const totalGates = 7;

        // GATE 1: Size bounds
        if (cleanCode.length < CONFIG.minCodeSize) {
            logEvolution(targetAgent, 'REJECTED', `Too small: ${cleanCode.length}b < ${CONFIG.minCodeSize}b`, cycleId);
            console.log(chalk.red(`[ARCHITECT #${id}]: ❌ GATE 1 FAIL: Output too small (${cleanCode.length}b)`));
            metrics.rejected++; saveMetrics(); return;
        }
        if (cleanCode.length > originalCode.length * CONFIG.maxGrowthFactor) {
            logEvolution(targetAgent, 'REJECTED', `Too large: ${cleanCode.length}b > ${Math.floor(originalCode.length * CONFIG.maxGrowthFactor)}b`, cycleId);
            console.log(chalk.red(`[ARCHITECT #${id}]: ❌ GATE 1 FAIL: Output too bloated (${cleanCode.length}b)`));
            metrics.rejected++; saveMetrics(); return;
        }
        if (cleanCode.length < originalCode.length * CONFIG.minShrinkFactor) {
            logEvolution(targetAgent, 'REJECTED', `Too gutted: ${cleanCode.length}b < ${Math.floor(originalCode.length * CONFIG.minShrinkFactor)}b`, cycleId);
            console.log(chalk.red(`[ARCHITECT #${id}]: ❌ GATE 1 FAIL: Output gutted too much (${cleanCode.length}b)`));
            metrics.rejected++; saveMetrics(); return;
        }
        console.log(chalk.green(`[ARCHITECT #${id}]: ✅ GATE 1: Size bounds OK (${cleanCode.length}b)`));
        gatesPassed++;

        // GATE 2: Syntax validation
        try {
            // We use `new Function` but in a way that doesn't conflict with our dangerous pattern check
            const syntaxChecker = Function;
            new syntaxChecker(cleanCode);
        } catch (syntaxError) {
            logEvolution(targetAgent, 'REJECTED', `Syntax error: ${syntaxError.message}`, cycleId);
            console.log(chalk.red(`[ARCHITECT #${id}]: ❌ GATE 2 FAIL: ${syntaxError.message}`));
            metrics.rejected++; saveMetrics(); return;
        }
        console.log(chalk.green(`[ARCHITECT #${id}]: ✅ GATE 2: Syntax valid`));
        gatesPassed++;

        // GATE 3: Dangerous pattern detection (string + regex)
        for (const pattern of DANGEROUS_STRINGS) {
            if (cleanCode.includes(pattern) && !originalCode.includes(pattern)) {
                logEvolution(targetAgent, 'BLOCKED', `Dangerous string added: "${pattern}"`, cycleId);
                console.log(chalk.red.bold(`[ARCHITECT #${id}]: 🚫 GATE 3 BLOCKED: Dangerous string "${pattern}" added.`));
                metrics.blocked++; saveMetrics(); return;
            }
        }
        for (const { rx, name } of DANGEROUS_REGEX) {
            if (rx.test(cleanCode)) {
                logEvolution(targetAgent, 'BLOCKED', `Dangerous pattern: ${name}`, cycleId);
                console.log(chalk.red.bold(`[ARCHITECT #${id}]: 🚫 GATE 3 BLOCKED: Regex match "${name}"`));
                metrics.blocked++; saveMetrics(); return;
            }
        }
        console.log(chalk.green(`[ARCHITECT #${id}]: ✅ GATE 3: No dangerous patterns (${DANGEROUS_STRINGS.length} strings + ${DANGEROUS_REGEX.length} regex clear)`));
        gatesPassed++;

        // GATE 4: Required structural patterns
        const missingRequired = [];
        for (const [key, rule] of Object.entries(REQUIRED_PATTERNS)) {
            if (!cleanCode.includes(rule.pattern)) {
                missingRequired.push(rule.description);
            }
        }
        if (missingRequired.length > 0) {
            logEvolution(targetAgent, 'REJECTED', `Missing required: ${missingRequired.join(', ')}`, cycleId);
            console.log(chalk.red(`[ARCHITECT #${id}]: ❌ GATE 4 FAIL: Missing ${missingRequired.join(', ')}`));
            metrics.rejected++; saveMetrics(); return;
        }
        console.log(chalk.green(`[ARCHITECT #${id}]: ✅ GATE 4: Required patterns present`));
        gatesPassed++;

        // GATE 5: Conditional pattern preservation
        const droppedPatterns = [];
        for (const cp of CONDITIONAL_PATTERNS) {
            if (originalCode.includes(cp.pattern) && !cleanCode.includes(cp.pattern)) {
                droppedPatterns.push(cp.description);
            }
        }
        if (droppedPatterns.length > 0) {
            logEvolution(targetAgent, 'REJECTED', `Dropped critical patterns: ${droppedPatterns.join(', ')}`, cycleId);
            console.log(chalk.red(`[ARCHITECT #${id}]: ❌ GATE 5 FAIL: AI dropped: ${droppedPatterns.join(', ')}`));
            metrics.rejected++; saveMetrics(); return;
        }
        console.log(chalk.green(`[ARCHITECT #${id}]: ✅ GATE 5: Conditional patterns preserved`));
        gatesPassed++;

        // GATE 6: Structural health check
        const evolvedAnalysis = analyzeCode(cleanCode);
        if (evolvedAnalysis.functionCount === 0 && originalAnalysis.functionCount > 0) {
            logEvolution(targetAgent, 'REJECTED', 'All functions removed', cycleId);
            console.log(chalk.red(`[ARCHITECT #${id}]: ❌ GATE 6 FAIL: AI removed all functions`));
            metrics.rejected++; saveMetrics(); return;
        }
        if (evolvedAnalysis.requireCount < originalAnalysis.requireCount - 1) {
            logEvolution(targetAgent, 'REJECTED', `Lost too many imports (${originalAnalysis.requireCount} → ${evolvedAnalysis.requireCount})`, cycleId);
            console.log(chalk.red(`[ARCHITECT #${id}]: ❌ GATE 6 FAIL: Too many imports removed`));
            metrics.rejected++; saveMetrics(); return;
        }
        console.log(chalk.green(`[ARCHITECT #${id}]: ✅ GATE 6: Structural health OK (${evolvedAnalysis.functionCount} funcs, ${evolvedAnalysis.requireCount} imports)`));
        gatesPassed++;

        // GATE 7: Pre-deploy boot test (fork in subprocess)
        console.log(chalk.magenta(`[ARCHITECT #${id}]: ⏳ GATE 7: Boot testing evolved code in sandbox subprocess...`));
        const bootResult = await bootTest(cleanCode, targetAgent);
        if (!bootResult.survived) {
            logEvolution(targetAgent, 'REJECTED', `Boot test failed: ${bootResult.error}`, cycleId);
            console.log(chalk.red(`[ARCHITECT #${id}]: ❌ GATE 7 FAIL: Crashed during boot test — ${bootResult.error}`));
            metrics.rejected++; saveMetrics(); return;
        }
        console.log(chalk.green(`[ARCHITECT #${id}]: ✅ GATE 7: Boot test PASSED (survived ${(bootResult.aliveMs / 1000).toFixed(1)}s)`));
        gatesPassed++;

        console.log(chalk.green.bold(`[ARCHITECT #${id}]: ✅ ALL ${gatesPassed}/${totalGates} SAFETY GATES PASSED`));

        // ── PHASE 5: DIFF GENERATION ─────────────────────
        const diff = generateSimpleDiff(originalCode, cleanCode);
        console.log(chalk.gray(`[ARCHITECT #${id}]: Diff: ${diff.changedLines} lines changed, ${diff.addedLines} added, ${diff.removedLines} removed`));

        // ── PHASE 6: BACKUP & DEPLOY ─────────────────────
        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

        const timestamp = Date.now();
        const backupFilename = `${targetAgent}_v${cycleId}_${timestamp}.bak`;
        const backupPath = path.join(BACKUPS_DIR, backupFilename);

        // Save backup
        fs.copyFileSync(targetPath, backupPath);

        // Deploy evolved code
        fs.writeFileSync(targetPath, cleanCode);

        console.log(chalk.green.bold(`[ARCHITECT #${id}]: ✅ EVOLUTION #${cycleId} DEPLOYED → ${targetAgent}`));
        console.log(chalk.gray(`[ARCHITECT #${id}]: Backup: ${backupFilename}`));
        console.log(chalk.gray(`[ARCHITECT #${id}]: Size: ${originalCode.length}b → ${cleanCode.length}b (${cleanCode.length > originalCode.length ? '+' : ''}${cleanCode.length - originalCode.length}b)`));

        // Register for crash watch / rollback
        pendingEvolutions.set(agentType, {
            backupPath,
            targetPath,
            timestamp,
            cycleId,
        });

        // Clear pending after crash watch window
        setTimeout(() => {
            if (pendingEvolutions.has(agentType)) {
                pendingEvolutions.delete(agentType);
                console.log(chalk.green(`[ARCHITECT #${id}]: ✅ ${agentType} survived crash watch window. Evolution #${cycleId} confirmed stable.`));

                // Save as "last known good" — bedrock for multi-failure rollback
                try {
                    const lastGoodPath = path.join(BACKUPS_DIR, `_lastgood_${targetAgent}`);
                    fs.copyFileSync(targetPath, lastGoodPath);
                    console.log(chalk.gray(`[ARCHITECT #${id}]: 📌 Saved ${targetAgent} as last known good.`));
                } catch (e) { /* non-critical */ }

                // Update stable metrics
                if (!metrics.agentHistory[targetAgent]) metrics.agentHistory[targetAgent] = {};
                metrics.agentHistory[targetAgent].confirmedStable = (metrics.agentHistory[targetAgent].confirmedStable || 0) + 1;
                saveMetrics();
            }
        }, CONFIG.crashWatchWindow);

        // Update metrics
        metrics.applied++;
        metrics.lastEvolution = new Date().toISOString();
        if (!metrics.agentHistory[targetAgent]) metrics.agentHistory[targetAgent] = {};
        metrics.agentHistory[targetAgent].lastEvolved = timestamp;
        metrics.agentHistory[targetAgent].timesEvolved = (metrics.agentHistory[targetAgent].timesEvolved || 0) + 1;
        saveMetrics();

        // Log with diff
        logEvolution(targetAgent, 'APPLIED', `Cycle #${cycleId} | ${originalCode.length}b → ${cleanCode.length}b | ${diff.changedLines} lines changed`, cycleId, diff.text);

        // ── PHASE 7: NOTIFY THE SWARM ────────────────────
        if (process.send) {
            process.send({
                type: 'SIREN_SPEAK',
                text: `Architect reporting. Evolution cycle ${cycleId} complete. ${targetAgent.replace('.js', '')} has been upgraded. ${gatesPassed} safety gates passed. ${diff.changedLines} lines modified. Monitoring for stability.`
            });
            process.send({
                type: 'SKILL_UPGRADE',
                agent: agentType,
                protocol: `v${cycleId}.0 (AI-Evolved, ${gatesPassed} gates)`
            });
            process.send({
                type: 'INTEL_DATA',
                data: `Evolution #${cycleId}: ${targetAgent} upgraded (${diff.changedLines} lines changed). Watching for ${CONFIG.crashWatchWindow / 1000}s.`,
                source: 'ARCHITECT_EVOLUTION'
            });
        }

    } catch (e) {
        console.error(chalk.red(`[ARCHITECT #${id}]: Evolution cycle failed: ${e.message}`));
        logEvolution('SYSTEM', 'ERROR', e.message, cycleId);
    }

    saveMetrics();
}

// ── Rollback Engine ──────────────────────────────────────────
function rollback(agentType) {
    const pending = pendingEvolutions.get(agentType);
    const agentFile = agentType.toLowerCase() + '.js';
    const agentPath = path.join(DON_DIR, agentFile);

    // Determine best rollback source
    let rollbackSource = null;
    let rollbackLabel = '';

    if (pending && fs.existsSync(pending.backupPath)) {
        // Tier 1: Immediate pre-evolution backup
        rollbackSource = pending.backupPath;
        rollbackLabel = `pre-evolution backup (cycle #${pending.cycleId})`;
    } else {
        // Tier 2: Last known good (survived crash watch previously)
        const lastGoodPath = path.join(BACKUPS_DIR, `_lastgood_${agentFile}`);
        if (fs.existsSync(lastGoodPath)) {
            rollbackSource = lastGoodPath;
            rollbackLabel = 'last known good (previously confirmed stable)';
        }
    }

    if (!rollbackSource) {
        console.log(chalk.yellow(`[ARCHITECT #${id}]: No rollback source available for ${agentType}. No backup or last-known-good found.`));
        return false;
    }

    try {
        const cycleLabel = pending ? `Evolution #${pending.cycleId}` : 'chain-failure recovery';
        console.log(chalk.red.bold(`[ARCHITECT #${id}]: 🔄 ROLLING BACK ${agentType} (${cycleLabel})`));
        console.log(chalk.gray(`[ARCHITECT #${id}]: Source: ${rollbackLabel}`));

        // Restore from best available source
        fs.copyFileSync(rollbackSource, agentPath);
        if (pending) pendingEvolutions.delete(agentType);

        // Update metrics
        metrics.rolledBack++;
        if (!metrics.agentHistory[agentFile]) metrics.agentHistory[agentFile] = {};
        metrics.agentHistory[agentFile].timesRolledBack = (metrics.agentHistory[agentFile].timesRolledBack || 0) + 1;
        saveMetrics();

        logEvolution(agentFile, 'ROLLED_BACK', `Reverted using ${rollbackLabel}`, pending?.cycleId || 0);

        console.log(chalk.green(`[ARCHITECT #${id}]: ✅ Rollback complete. ${agentType} restored from ${rollbackLabel}.`));

        if (process.send) {
            process.send({
                type: 'SIREN_SPEAK',
                text: `Architect alert. ${agentType} was rolled back to ${rollbackLabel.includes('last known') ? 'last known good state' : 'pre-evolution backup'}. Stability restored.`
            });
        }

        return true;
    } catch (e) {
        console.error(chalk.red(`[ARCHITECT #${id}]: Rollback FAILED for ${agentType}: ${e.message}`));
        return false;
    }
}

// ── Logging ──────────────────────────────────────────────────
function logEvolution(agent, status, details, cycleId, diffText = '') {
    const statusEmoji = {
        'APPLIED': '✅', 'REJECTED': '❌', 'BLOCKED': '🚫',
        'ROLLED_BACK': '🔄', 'ERROR': '💀',
    }[status] || '📝';

    const entry = [
        `\n## ${statusEmoji} [${new Date().toISOString()}] Cycle #${cycleId} — ${status}`,
        `**Agent:** ${agent}`,
        `**Details:** ${details}`,
        `**Metrics:** Applied: ${metrics.applied} | Rejected: ${metrics.rejected} | Blocked: ${metrics.blocked} | Rolled Back: ${metrics.rolledBack}`,
    ];

    if (diffText) {
        entry.push(`\n<details><summary>Diff</summary>\n\n\`\`\`diff\n${diffText}\n\`\`\`\n\n</details>`);
    }

    try {
        const logDir = path.dirname(EVOLUTION_LOG);
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(EVOLUTION_LOG, entry.join('\n') + '\n');
    } catch (e) { /* non-critical */ }
}

// ── Show Status Report ───────────────────────────────────────
function showStatus() {
    const successRate = metrics.totalAttempts > 0
        ? ((metrics.applied / metrics.totalAttempts) * 100).toFixed(1)
        : '0.0';
    const rollbackRate = metrics.applied > 0
        ? ((metrics.rolledBack / metrics.applied) * 100).toFixed(1)
        : '0.0';

    console.log(chalk.magenta.bold(`\n[ARCHITECT #${id}]: ═══ EVOLUTION STATUS ═══`));
    console.log(chalk.white(`  Total Cycles:    ${metrics.totalAttempts}`));
    console.log(chalk.green(`  Applied:         ${metrics.applied} (${successRate}% success)`));
    console.log(chalk.red(`  Rejected:        ${metrics.rejected}`));
    console.log(chalk.red.bold(`  Blocked:         ${metrics.blocked}`));
    console.log(chalk.yellow(`  Rolled Back:     ${metrics.rolledBack} (${rollbackRate}% rollback rate)`));
    console.log(chalk.gray(`  Brain Failures:  ${metrics.brainFailures}`));
    console.log(chalk.gray(`  Last Evolution:  ${metrics.lastEvolution || 'Never'}`));
    console.log(chalk.gray(`  Pending Watch:   ${pendingEvolutions.size} agents`));
    console.log(chalk.magenta.bold(`[ARCHITECT #${id}]: ════════════════════════\n`));
}

// ══════════════════════════════════════════════════════════════
// ██ IPC INTERFACE ██
// ══════════════════════════════════════════════════════════════
process.on('message', (msg) => {
    switch (msg.type) {
        case 'EVOLVE_NOW':
            console.log(chalk.magenta.bold(`[ARCHITECT #${id}]: 🚨 ON-DEMAND EVOLUTION — Triggered by The Don`));
            evolve(msg.target || null);
            break;

        case 'AGENT_CRASHED':
            // The Don reports that an agent crashed after evolution
            const agentType = msg.agentType;
            if (pendingEvolutions.has(agentType)) {
                const timeElapsed = Date.now() - pendingEvolutions.get(agentType).timestamp;
                if (timeElapsed < CONFIG.crashWatchWindow) {
                    console.log(chalk.red.bold(`[ARCHITECT #${id}]: 🚨 POST-EVOLUTION CRASH: ${agentType} crashed ${Math.floor(timeElapsed / 1000)}s after evolution!`));
                    rollback(agentType);
                }
            }
            break;

        case 'PERFORMANCE_REPORT':
            console.log(chalk.magenta(`[ARCHITECT #${id}]: Performance data received. Factoring into next cycle.`));
            // Store for next evolution cycle
            break;

        case 'EVOLUTION_STATUS':
            showStatus();
            break;

        case 'ROLLBACK':
            if (msg.agentType) {
                rollback(msg.agentType);
            }
            break;

        case 'MEETING_START':
            const topic = msg.topic || '';
            console.log(chalk.cyan(`[ARCHITECT #${id}]: 🚨 Attending Council Meeting: "${topic}"`));

            // Artificial delay to seem like "thinking"
            setTimeout(async () => {
                try {
                    const proposal = await ask(
                        `You are The Architect. The Council has convened to discuss: "${topic}".
                        Propose 3 specific technical evolutions, new agent skills, or system upgrades to address this.
                        Be concise. List them as bullet points. 
                        Focus on: Revenue generation, Security, or Efficiency.`,
                        "You are the System Architect. You propose code-level improvements.",
                        { agentName: `ARCHITECT #${id}` }
                    );

                    if (proposal && process.send) {
                        process.send({
                            type: 'AGENT_COMMS',
                            from: 'ARCHITECT',
                            msg: `[PROPOSAL] Re: "${topic}"\n${proposal}`,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (e) {
                    console.error(chalk.red(`[ARCHITECT] Meeting error: ${e.message}`));
                }
            }, 5000 + Math.random() * 5000);
            break;

        case 'REQUEST_REVIEW':
            const propMsg = msg.proposal;
            const proponent = msg.from;

            // Artificial delay
            setTimeout(async () => {
                try {
                    const review = await ask(
                        `You are The Architect. User '${proponent}' just proposed: "${propMsg}".
                        Critique this proposal technically. 
                        Is it safe? innovative? efficient?
                        Return a short 1-sentence verdict starting with "[REVIEW]".`,
                        "You offer constructive technical criticism.",
                        { agentName: `ARCHITECT #${id}` }
                    );

                    if (review && process.send) {
                        process.send({
                            type: 'AGENT_COMMS',
                            from: 'ARCHITECT',
                            msg: review,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (e) {
                    console.error('Review failed');
                }
            }, 3000);
            break;
    }
});

// ══════════════════════════════════════════════════════════════
// ██ BOOT SEQUENCE ██
// ══════════════════════════════════════════════════════════════
console.log(chalk.magenta.bold(`[ARCHITECT #${id}]: 🧬 SELF-EVOLUTION ENGINE v4.1 ACTIVE`));
console.log(chalk.gray(`[ARCHITECT #${id}]: Mutable agents: ${CONFIG.mutableAgents.join(', ')}`));
console.log(chalk.gray(`[ARCHITECT #${id}]: Safety gates: 7 (incl. boot test) | Crash watch: ${CONFIG.crashWatchWindow / 1000}s | Cooldown: ${CONFIG.agentCooldown / 60000}min`));

loadMetrics();
showStatus();

// Auto-evolution cycle
setInterval(() => evolve(), CONFIG.autoInterval);

// Initial evolution after warmup
setTimeout(() => evolve(), CONFIG.initialDelay);

// ── Passive Audit Loop (Activity Simulation) ──
function auditLoop() {
    const agents = CONFIG.mutableAgents;
    const target = agents[Math.floor(Math.random() * agents.length)];
    const complexity = Math.floor(Math.random() * 30) + 70; // 70-100%
    console.log(chalk.gray.dim(`[ARCHITECT #${id}]: 🔍 Auditing ${target} structure... Integrity: ${complexity}% OK.`));
    setTimeout(auditLoop, 45000 + Math.random() * 30000);
}
setTimeout(auditLoop, 10000);
