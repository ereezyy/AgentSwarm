// don/omega.js - PROTOCOL OMEGA (Autonomous Treasury Management)
// Automated capital allocation: Vault (40%) + Reinvest (40%) + R&D (20%)
// Flow: Profit > threshold → Banker splits → Allocation recorded → Report generated
// Value: The swarm builds a war chest that outlives any single failed trade.

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Omega';

// File paths
const TREASURY_PATH = path.resolve(__dirname, '../missions/treasury.json');
const TREASURY_REPORT = path.resolve(__dirname, '../missions/treasury_report.md');
const missionsDir = path.join(__dirname, '../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

const OM = (msg) => chalk.hex('#FFD700').bold(`[OMEGA #${id}]: ${msg}`);
const om = (msg) => chalk.hex('#FFD700')(`[OMEGA #${id}]: ${msg}`);

console.log(OM('⚡ Protocol Omega ONLINE. Treasury management active.'));

// ============================================================
// TREASURY STATE
// ============================================================
function loadTreasury() {
    try {
        if (fs.existsSync(TREASURY_PATH)) return JSON.parse(fs.readFileSync(TREASURY_PATH, 'utf8'));
    } catch { }
    return {
        balances: {
            vault: 0,       // 40% — untouchable war chest
            reinvest: 0,    // 40% — active trading capital
            rnd: 0,         // 20% — R&D / infrastructure
            pending: 0,     // unallocated income
        },
        config: {
            splitRatio: { vault: 0.40, reinvest: 0.40, rnd: 0.20 },
            autoAllocateThreshold: 0.01,  // SOL - minimum to trigger allocation
            currency: 'SOL',
        },
        history: [],
        stats: {
            totalIncome: 0,
            totalAllocated: 0,
            allocations: 0,
            largestSingle: 0,
            lastAllocation: null,
        }
    };
}

function saveTreasury(data) {
    fs.writeFileSync(TREASURY_PATH, JSON.stringify(data, null, 2));
}

// ============================================================
// CAPITAL ALLOCATION ENGINE
// ============================================================
function allocateFunds(amount, source = 'UNKNOWN') {
    if (amount <= 0) return null;

    const treasury = loadTreasury();
    const { splitRatio } = treasury.config;

    const vaultShare = parseFloat((amount * splitRatio.vault).toFixed(6));
    const reinvestShare = parseFloat((amount * splitRatio.reinvest).toFixed(6));
    const rndShare = parseFloat((amount * splitRatio.rnd).toFixed(6));

    treasury.balances.vault += vaultShare;
    treasury.balances.reinvest += reinvestShare;
    treasury.balances.rnd += rndShare;

    const allocation = {
        id: `ALLOC-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        source,
        totalAmount: amount,
        splits: {
            vault: vaultShare,
            reinvest: reinvestShare,
            rnd: rndShare,
        },
    };

    treasury.history.push(allocation);
    treasury.stats.totalIncome += amount;
    treasury.stats.totalAllocated += amount;
    treasury.stats.allocations++;
    treasury.stats.lastAllocation = new Date().toISOString();
    if (amount > treasury.stats.largestSingle) treasury.stats.largestSingle = amount;

    saveTreasury(treasury);

    console.log(OM(`💰 ALLOCATION: ${amount} ${treasury.config.currency} from ${source}`));
    console.log(om(`  🏦 Vault:    +${vaultShare} (Total: ${treasury.balances.vault.toFixed(4)})`));
    console.log(om(`  📈 Reinvest: +${reinvestShare} (Total: ${treasury.balances.reinvest.toFixed(4)})`));
    console.log(om(`  🔬 R&D:     +${rndShare} (Total: ${treasury.balances.rnd.toFixed(4)})`));

    return allocation;
}

// ============================================================
// WITHDRAWAL (from reinvest pool only)
// ============================================================
function withdraw(amount, purpose = 'TRADE') {
    const treasury = loadTreasury();

    if (amount > treasury.balances.reinvest) {
        console.log(chalk.red(`[OMEGA]: Withdrawal denied. Requested ${amount} but only ${treasury.balances.reinvest.toFixed(4)} available in reinvest pool.`));
        return null;
    }

    treasury.balances.reinvest -= amount;
    treasury.history.push({
        id: `WD-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        type: 'WITHDRAWAL',
        amount: -amount,
        pool: 'reinvest',
        purpose,
    });

    saveTreasury(treasury);
    console.log(om(`📤 Withdrawal: ${amount} SOL from reinvest pool for ${purpose}`));
    return { success: true, remaining: treasury.balances.reinvest };
}

// ============================================================
// R&D EXPENDITURE (from R&D pool)
// ============================================================
function spendRnD(amount, purpose = 'INFRASTRUCTURE') {
    const treasury = loadTreasury();

    if (amount > treasury.balances.rnd) {
        console.log(chalk.red(`[OMEGA]: R&D spend denied. Only ${treasury.balances.rnd.toFixed(4)} available.`));
        return null;
    }

    treasury.balances.rnd -= amount;
    treasury.history.push({
        id: `RND-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        type: 'RND_SPEND',
        amount: -amount,
        pool: 'rnd',
        purpose,
    });

    saveTreasury(treasury);
    console.log(om(`🔬 R&D Spend: ${amount} SOL for ${purpose}`));
    return { success: true, remaining: treasury.balances.rnd };
}

// ============================================================
// TREASURY REPORT
// ============================================================
function generateReport() {
    const treasury = loadTreasury();
    const b = treasury.balances;
    const s = treasury.stats;
    const totalAUM = b.vault + b.reinvest + b.rnd + b.pending;

    let report = `# ⚡ Protocol Omega — Treasury Report\n\n`;
    report += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    report += `---\n\n`;

    report += `## 💰 Assets Under Management: ${totalAUM.toFixed(4)} SOL\n\n`;
    report += `| Pool | Balance | Allocation | Status |\n`;
    report += `|------|---------|------------|--------|\n`;
    report += `| 🏦 Vault (Untouchable) | ${b.vault.toFixed(4)} SOL | 40% | ${b.vault > 0 ? '🟢 Active' : '⚪ Empty'} |\n`;
    report += `| 📈 Reinvest (Trading) | ${b.reinvest.toFixed(4)} SOL | 40% | ${b.reinvest > 0 ? '🟢 Active' : '⚪ Empty'} |\n`;
    report += `| 🔬 R&D (Infrastructure) | ${b.rnd.toFixed(4)} SOL | 20% | ${b.rnd > 0 ? '🟢 Active' : '⚪ Empty'} |\n`;
    report += `| ⏳ Pending | ${b.pending.toFixed(4)} SOL | — | ${b.pending > 0 ? '🟡 Awaiting' : '⚪ Clear'} |\n\n`;

    report += `## 📊 Lifetime Stats\n\n`;
    report += `- **Total Income:** ${s.totalIncome.toFixed(4)} SOL\n`;
    report += `- **Allocations Made:** ${s.allocations}\n`;
    report += `- **Largest Single:** ${s.largestSingle.toFixed(4)} SOL\n`;
    report += `- **Last Allocation:** ${s.lastAllocation || 'Never'}\n\n`;

    // Recent history
    const recent = treasury.history.slice(-10).reverse();
    if (recent.length > 0) {
        report += `## 📋 Recent Transactions\n\n`;
        report += `| ID | Time | Source | Amount |\n|---|---|---|---|\n`;
        for (const tx of recent) {
            const time = new Date(tx.timestamp).toLocaleString();
            const amt = tx.totalAmount || tx.amount;
            report += `| ${tx.id} | ${time} | ${tx.source || tx.purpose || 'N/A'} | ${amt > 0 ? '+' : ''}${amt.toFixed(4)} SOL |\n`;
        }
    }

    report += `\n---\n*Protocol Omega — The Syndicate Treasury*\n`;

    fs.writeFileSync(TREASURY_REPORT, report);
    console.log(om(`📊 Treasury report saved to ${TREASURY_REPORT}`));
    return report;
}

// ============================================================
// IPC MESSAGE HANDLER
// ============================================================
process.on('message', (msg) => {
    switch (msg.type) {
        case 'KICK_UP':
            // Revenue from any agent (Closer, Service Forge, trades, etc.)
            if (msg.amount && msg.amount > 0) {
                const solAmount = msg.currency === 'USD' ? msg.amount / 150 : msg.amount; // rough USD→SOL conversion
                allocateFunds(solAmount, msg.source || 'KICK_UP');

                if (process.send) {
                    process.send({
                        type: 'INTEL_DATA',
                        data: `OMEGA: Allocated ${solAmount.toFixed(4)} SOL from ${msg.source || 'unknown'}`,
                        source: 'PROTOCOL_OMEGA',
                    });
                }
            }
            break;

        case 'TRADE_PROFIT':
            // Direct trading profit
            if (msg.profit && msg.profit > 0) {
                allocateFunds(msg.profit, msg.source || 'TRADE');
            }
            break;

        case 'REQUEST_CAPITAL':
            // Agent requesting trading capital from reinvest pool
            if (msg.amount) {
                const result = withdraw(msg.amount, msg.purpose || msg.source || 'AGENT_REQUEST');
                if (result && process.send) {
                    process.send({
                        type: 'CAPITAL_APPROVED',
                        amount: msg.amount,
                        remaining: result.remaining,
                        requestId: msg.requestId,
                    });
                }
            }
            break;

        case 'RND_SPEND':
            if (msg.amount) {
                spendRnD(msg.amount, msg.purpose || 'INFRASTRUCTURE');
            }
            break;

        case 'TREASURY_STATUS':
            const treasury = loadTreasury();
            const total = treasury.balances.vault + treasury.balances.reinvest + treasury.balances.rnd;
            console.log(OM(`📊 Treasury Status:`));
            console.log(om(`  🏦 Vault:    ${treasury.balances.vault.toFixed(4)} SOL`));
            console.log(om(`  📈 Reinvest: ${treasury.balances.reinvest.toFixed(4)} SOL`));
            console.log(om(`  🔬 R&D:     ${treasury.balances.rnd.toFixed(4)} SOL`));
            console.log(om(`  💰 Total:    ${total.toFixed(4)} SOL`));
            console.log(om(`  📊 Allocations: ${treasury.stats.allocations}`));

            if (process.send) {
                process.send({
                    type: 'INTEL_DATA',
                    data: `OMEGA: AUM ${total.toFixed(4)} SOL | Vault ${treasury.balances.vault.toFixed(4)} | Reinvest ${treasury.balances.reinvest.toFixed(4)} | R&D ${treasury.balances.rnd.toFixed(4)}`,
                    source: 'PROTOCOL_OMEGA',
                });
            }
            break;

        case 'TREASURY_REPORT':
            generateReport();
            break;
    }
});

// ============================================================
// BOOT
// ============================================================
generateReport();
console.log(OM('⚡ Protocol Omega ready. Treasury allocation engine active.'));
setInterval(() => { }, 100000);
