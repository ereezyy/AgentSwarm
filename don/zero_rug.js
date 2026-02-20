// don/zero_rug.js - OPERATION ZERO-RUG (Pre-Snipe Defense Gate)
// Synchronous blacklist check before Sniper fires. Async deep audit after buy.
// Flow: Signal → Local Blacklist Check → If clean: Buy → Async Oracle audit → Dump if Fail
// Value: Drastically increases win rate by filtering known scams at speed.

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'ZeroRug';

// File paths
const BLACKLIST_PATH = path.resolve(__dirname, '../missions/blacklist.json');
const AUDIT_LOG_PATH = path.resolve(__dirname, '../missions/zero_rug_log.json');
const missionsDir = path.join(__dirname, '../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

const ZR = (msg) => chalk.red.bold(`[ZERO-RUG #${id}]: ${msg}`);
const zr = (msg) => chalk.red(`[ZERO-RUG #${id}]: ${msg}`);

console.log(ZR('🛡️ Operation Zero-Rug ONLINE. Defense gate active.'));

// ============================================================
// BLACKLIST DATABASE
// ============================================================
function loadBlacklist() {
    try {
        if (fs.existsSync(BLACKLIST_PATH)) return JSON.parse(fs.readFileSync(BLACKLIST_PATH, 'utf8'));
    } catch { }
    return {
        tokens: {},      // mint -> { reason, addedAt, source }
        deployers: {},   // address -> { reason, rugCount, addedAt }
        patterns: [      // Known rug patterns
            'PUMP_AND_DUMP', 'HONEYPOT', 'MINT_AUTHORITY', 'FREEZE_AUTHORITY',
            'WHALE_CONCENTRATION', 'ZERO_LIQUIDITY', 'COPYCAT_NAME'
        ],
        stats: { blocked: 0, approved: 0, rugsStopped: 0 }
    };
}

function saveBlacklist(data) {
    fs.writeFileSync(BLACKLIST_PATH, JSON.stringify(data, null, 2));
}

function loadAuditLog() {
    try {
        if (fs.existsSync(AUDIT_LOG_PATH)) return JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, 'utf8'));
    } catch { }
    return [];
}

function saveAuditLog(log) {
    // Keep last 500 entries
    if (log.length > 500) log = log.slice(-500);
    fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(log, null, 2));
}

// ============================================================
// FAST GATE CHECK (< 10ms — no network calls)
// ============================================================
function fastGateCheck(mint, metadata = {}) {
    const blacklist = loadBlacklist();

    // 1. Direct token blacklist
    if (blacklist.tokens[mint]) {
        return {
            allowed: false,
            reason: `BLACKLISTED: ${blacklist.tokens[mint].reason}`,
            source: 'TOKEN_BLACKLIST'
        };
    }

    // 2. Deployer blacklist
    if (metadata.deployer && blacklist.deployers[metadata.deployer]) {
        const deployer = blacklist.deployers[metadata.deployer];
        return {
            allowed: false,
            reason: `DEPLOYER BLACKLISTED: ${deployer.reason} (${deployer.rugCount} known rugs)`,
            source: 'DEPLOYER_BLACKLIST'
        };
    }

    // 3. Name/symbol pattern checks (common rug patterns)
    const name = (metadata.name || '').toLowerCase();
    const suspiciousPatterns = [
        /^(test|scam|rug|fake|clone)/i,
        /airdrop.*free/i,
        /elon.*official/i,
        /trump.*official/i,
    ];
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(name)) {
            return {
                allowed: false,
                reason: `SUSPICIOUS NAME: "${name}" matches known scam pattern`,
                source: 'PATTERN_MATCH'
            };
        }
    }

    // 4. Passed all checks
    return { allowed: true, reason: 'CLEAN', source: 'FAST_GATE' };
}

// ============================================================
// SIGNAL INTERCEPTOR — All buy signals route through here
// ============================================================
function interceptSignal(msg) {
    const mint = msg.mint;
    if (!mint) return;

    const gateResult = fastGateCheck(mint, msg.metadata || {});
    const log = loadAuditLog();

    const entry = {
        id: `ZR-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        mint: mint.substring(0, 12) + '...',
        fullMint: mint,
        source: msg.source || msg.whale || 'UNKNOWN',
        gateResult: gateResult.allowed ? 'APPROVED' : 'BLOCKED',
        reason: gateResult.reason,
        confidence: msg.confidence || 0,
    };

    log.push(entry);
    saveAuditLog(log);

    const blacklist = loadBlacklist();

    if (!gateResult.allowed) {
        // BLOCKED
        blacklist.stats.blocked++;
        blacklist.stats.rugsStopped++;
        saveBlacklist(blacklist);

        console.log(ZR(`🚫 BLOCKED: ${mint.substring(0, 12)}...`));
        console.log(zr(`  Reason: ${gateResult.reason}`));
        console.log(zr(`  Source: ${gateResult.source}`));

        if (process.send) {
            process.send({
                type: 'INTEL_DATA',
                data: `ZERO-RUG BLOCKED: ${mint.substring(0, 12)}... — ${gateResult.reason}`,
                source: 'ZERO_RUG'
            });
        }
        return;
    }

    // APPROVED — Forward to Sniper
    blacklist.stats.approved++;
    saveBlacklist(blacklist);

    console.log(chalk.green(`[ZERO-RUG #${id}]: ✅ APPROVED: ${mint.substring(0, 12)}... → Sniper`));

    if (process.send) {
        // Forward the original signal to Sniper with approval stamp
        process.send({
            type: 'APPROVED_SIGNAL',
            mint: mint,
            originalType: msg.type,
            whale: msg.whale,
            confidence: msg.confidence,
            source: msg.source,
            zeroRugApproved: true,
        });

        // Request async deep audit from Oracle (post-buy verification)
        process.send({
            type: 'REQUEST_AUDIT',
            mint: mint,
            source: 'ZERO_RUG_POST_BUY',
        });
    }
}

// ============================================================
// BLACKLIST MANAGEMENT
// ============================================================
function addToBlacklist(mint, reason, source = 'MANUAL') {
    const blacklist = loadBlacklist();
    blacklist.tokens[mint] = {
        reason,
        addedAt: new Date().toISOString(),
        source,
    };
    saveBlacklist(blacklist);
    console.log(ZR(`➕ Added ${mint.substring(0, 12)}... to blacklist: ${reason}`));
}

function addDeployerToBlacklist(address, reason, rugCount = 1) {
    const blacklist = loadBlacklist();
    if (blacklist.deployers[address]) {
        blacklist.deployers[address].rugCount += 1;
    } else {
        blacklist.deployers[address] = { reason, rugCount, addedAt: new Date().toISOString() };
    }
    saveBlacklist(blacklist);
    console.log(ZR(`➕ Deployer ${address.substring(0, 12)}... blacklisted: ${reason}`));
}

// ============================================================
// IPC — All signals route through Zero-Rug
// ============================================================
process.on('message', (msg) => {
    switch (msg.type) {
        case 'COPY_TRADE_SIGNAL':
        case 'SNIPE_TARGET':
        case 'APPROVED_ALPHA':
            // Intercept ALL buy signals
            interceptSignal(msg);
            break;

        case 'BLACKLIST_REQUEST':
            // Oracle found a dangerous token
            if (msg.mint) addToBlacklist(msg.mint, msg.reason || 'Oracle DANGER rating', 'ORACLE');
            break;

        case 'BLACKLIST_DEPLOYER':
            if (msg.address) addDeployerToBlacklist(msg.address, msg.reason || 'Known rugger');
            break;

        case 'ORACLE_AUDIT_RESULT':
            // Post-buy audit result — if DANGER, add to blacklist for future
            if (msg.rating === 'DANGER' && msg.mint) {
                addToBlacklist(msg.mint, `Post-buy audit: ${(msg.reasons || []).join(', ')}`, 'POST_BUY_AUDIT');
                console.log(ZR(`⚠️ POST-BUY ALERT: ${msg.mint.substring(0, 12)}... failed audit. Added to blacklist.`));
                if (process.send) {
                    process.send({
                        type: 'SIREN_SPEAK',
                        text: `Zero Rug alert. Post-buy audit on ${msg.mint.substring(0, 8)} came back DANGER. Adding to blacklist. Consider dumping.`
                    });
                    // Signal to dump
                    process.send({
                        type: 'EMERGENCY_SELL',
                        mint: msg.mint,
                        reason: 'POST_BUY_AUDIT_FAIL',
                    });
                }
            }
            break;

        case 'ZERO_RUG_STATUS':
            const bl = loadBlacklist();
            const auditLog = loadAuditLog();
            console.log(ZR(`📊 Zero-Rug Status:`));
            console.log(zr(`  Blacklisted Tokens: ${Object.keys(bl.tokens).length}`));
            console.log(zr(`  Blacklisted Deployers: ${Object.keys(bl.deployers).length}`));
            console.log(zr(`  Signals Blocked: ${bl.stats.blocked}`));
            console.log(zr(`  Signals Approved: ${bl.stats.approved}`));
            console.log(zr(`  Rugs Stopped: ${bl.stats.rugsStopped}`));
            console.log(zr(`  Audit Log Entries: ${auditLog.length}`));
            break;
    }
});

// ============================================================
// BOOT
// ============================================================
const bl = loadBlacklist();
console.log(ZR(`🛡️ Defense gate ready. ${Object.keys(bl.tokens).length} tokens blacklisted, ${Object.keys(bl.deployers).length} deployers banned.`));
setInterval(() => { }, 100000);
