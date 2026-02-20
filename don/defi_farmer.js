// don/defi_farmer.js - THE DEFI FARMER (Yield Farming Intelligence & Automation)
// Scans Solana DeFi protocols for yield opportunities, tracks APY, manages positions.
// Protocols: Raydium, Orca, Marinade, Jupiter, Kamino, Meteora
// Value: Passive income from idle capital via staking, LP, and lending.

const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Farmer';

// File paths
const FARM_DB = path.resolve(__dirname, '../missions/farm_positions.json');
const YIELD_REPORT = path.resolve(__dirname, '../missions/yield_report.md');
const missionsDir = path.join(__dirname, '../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

const FM = (msg) => chalk.hex('#32CD32').bold(`[FARMER #${id}]: ${msg}`);
const fm = (msg) => chalk.hex('#32CD32')(`[FARMER #${id}]: ${msg}`);

console.log(FM('🌾 DeFi Farmer ONLINE. Scanning yield opportunities...'));

// ============================================================
// SOLANA DEFI PROTOCOLS
// ============================================================
const PROTOCOLS = {
    marinade: {
        name: 'Marinade Finance',
        type: 'liquid_staking',
        url: 'https://api.marinade.finance/msol/apy',
        parser: (data) => ({ apy: data?.value || data?.apy || 6.5, token: 'mSOL' }),
    },
    jito: {
        name: 'Jito (MEV Staking)',
        type: 'liquid_staking',
        url: 'https://www.jito.network/api/apy',
        parser: (data) => ({ apy: data?.apy || 7.2, token: 'JitoSOL' }),
    },
    raydium: {
        name: 'Raydium (Top Pools)',
        type: 'amm_lp',
        url: 'https://api.raydium.io/v2/main/pairs',
        parser: (data) => {
            const pairs = Array.isArray(data) ? data : [];
            return pairs
                .filter(p => p.apr24h > 5 && p.liquidity > 50000)
                .sort((a, b) => b.apr24h - a.apr24h)
                .slice(0, 10)
                .map(p => ({
                    pool: p.name || `${p.token0}/${p.token1}`,
                    apy: p.apr24h || 0,
                    tvl: p.liquidity || 0,
                    volume24h: p.volume24h || 0,
                }));
        },
    },
};

// ============================================================
// POSITION TRACKING
// ============================================================
function loadPositions() {
    try {
        if (fs.existsSync(FARM_DB)) return JSON.parse(fs.readFileSync(FARM_DB, 'utf8'));
    } catch { }
    return {
        positions: [],
        watchlist: [],
        stats: { totalDeployed: 0, totalHarvested: 0, activePositions: 0 },
        config: {
            minAPY: 5.0,            // Minimum APY to consider
            maxRiskLevel: 'MEDIUM', // LOW, MEDIUM, HIGH
            autoCompound: true,
            rebalanceThreshold: 20, // Rebalance if APY drops 20% from entry
        }
    };
}

function savePositions(data) {
    fs.writeFileSync(FARM_DB, JSON.stringify(data, null, 2));
}

// ============================================================
// YIELD SCANNER
// ============================================================
async function scanYields() {
    console.log(fm('🔍 Scanning DeFi yields across Solana...'));
    const opportunities = [];

    // Scan each protocol
    for (const [key, protocol] of Object.entries(PROTOCOLS)) {
        try {
            const resp = await axios.get(protocol.url, { timeout: 15000 });

            if (protocol.type === 'amm_lp') {
                const pools = protocol.parser(resp.data);
                if (Array.isArray(pools)) {
                    pools.forEach(pool => {
                        opportunities.push({
                            protocol: protocol.name,
                            type: protocol.type,
                            pool: pool.pool,
                            apy: pool.apy,
                            tvl: pool.tvl,
                            volume24h: pool.volume24h,
                            risk: assessRisk(pool.apy, pool.tvl),
                        });
                    });
                }
            } else {
                const result = protocol.parser(resp.data);
                opportunities.push({
                    protocol: protocol.name,
                    type: protocol.type,
                    pool: result.token,
                    apy: result.apy,
                    tvl: 0,
                    risk: 'LOW',
                });
            }

            console.log(fm(`  ✅ ${protocol.name}: Scanned`));
        } catch (e) {
            console.log(chalk.yellow(`[FARMER]: ${protocol.name} scan failed: ${e.message}`));
        }

        await new Promise(r => setTimeout(r, 1000));
    }

    // Also try DeFiLlama for broader coverage
    try {
        const llamaResp = await axios.get('https://yields.llama.fi/pools', { timeout: 20000 });
        const solanaPools = (llamaResp.data?.data || [])
            .filter(p => p.chain === 'Solana' && p.apy > 5 && p.tvlUsd > 100000)
            .sort((a, b) => b.apy - a.apy)
            .slice(0, 15);

        for (const pool of solanaPools) {
            // Avoid duplicates
            if (opportunities.some(o => o.pool === pool.symbol)) continue;
            opportunities.push({
                protocol: pool.project,
                type: pool.poolMeta || 'yield',
                pool: pool.symbol,
                apy: parseFloat(pool.apy.toFixed(2)),
                tvl: pool.tvlUsd,
                risk: assessRisk(pool.apy, pool.tvlUsd),
                source: 'defillama',
            });
        }
        console.log(fm(`  ✅ DeFiLlama: ${solanaPools.length} Solana pools found`));
    } catch (e) {
        console.log(chalk.yellow(`[FARMER]: DeFiLlama scan failed: ${e.message}`));
    }

    // Sort by APY
    opportunities.sort((a, b) => b.apy - a.apy);

    return opportunities;
}

function assessRisk(apy, tvl) {
    if (apy > 100) return 'HIGH';
    if (apy > 30 && tvl < 100000) return 'HIGH';
    if (apy > 20) return 'MEDIUM';
    return 'LOW';
}

// ============================================================
// POSITION MANAGEMENT
// ============================================================
function addPosition(protocol, pool, amount, apy) {
    const positions = loadPositions();
    const pos = {
        id: `FARM-${Date.now().toString(36).toUpperCase()}`,
        protocol,
        pool,
        amount,
        entryAPY: apy,
        currentAPY: apy,
        entryDate: new Date().toISOString(),
        harvested: 0,
        status: 'ACTIVE',
    };
    positions.positions.push(pos);
    positions.stats.totalDeployed += amount;
    positions.stats.activePositions++;
    savePositions(positions);
    console.log(FM(`🌱 Position opened: ${amount} SOL → ${pool} @ ${apy}% APY`));
    return pos;
}

function harvestPosition(posId, harvestAmount) {
    const positions = loadPositions();
    const pos = positions.positions.find(p => p.id === posId);
    if (!pos) return null;

    pos.harvested += harvestAmount;
    positions.stats.totalHarvested += harvestAmount;
    savePositions(positions);

    console.log(FM(`🌾 Harvested ${harvestAmount} SOL from ${pos.pool}`));

    // Route harvest to Omega treasury
    if (process.send) {
        process.send({
            type: 'KICK_UP',
            amount: harvestAmount,
            source: `DEFI_FARMER:${pos.pool}`,
            currency: 'SOL',
        });
    }

    return pos;
}

// ============================================================
// YIELD REPORT
// ============================================================
async function generateYieldReport() {
    const opportunities = await scanYields();
    const positions = loadPositions();
    const config = positions.config;

    let report = `# 🌾 DeFi Farmer — Yield Report\n\n`;
    report += `**Generated:** ${new Date().toLocaleString()}\n\n`;

    // Active positions
    const active = positions.positions.filter(p => p.status === 'ACTIVE');
    if (active.length > 0) {
        report += `## 💼 Active Positions (${active.length})\n\n`;
        report += `| Pool | Protocol | Deployed | Entry APY | Harvested |\n|---|---|---|---|---|\n`;
        for (const pos of active) {
            report += `| ${pos.pool} | ${pos.protocol} | ${pos.amount} SOL | ${pos.entryAPY}% | ${pos.harvested.toFixed(4)} SOL |\n`;
        }
        report += '\n';
    }

    report += `## 📊 Lifetime Stats\n\n`;
    report += `- **Total Deployed:** ${positions.stats.totalDeployed.toFixed(4)} SOL\n`;
    report += `- **Total Harvested:** ${positions.stats.totalHarvested.toFixed(4)} SOL\n\n`;

    // Top opportunities
    const filtered = opportunities.filter(o => {
        if (o.apy < config.minAPY) return false;
        if (config.maxRiskLevel === 'LOW' && o.risk !== 'LOW') return false;
        if (config.maxRiskLevel === 'MEDIUM' && o.risk === 'HIGH') return false;
        return true;
    });

    report += `## 🔥 Top Yield Opportunities (Min ${config.minAPY}% APY, Max Risk: ${config.maxRiskLevel})\n\n`;
    report += `| Protocol | Pool | APY | TVL | Risk |\n|---|---|---|---|---|\n`;
    for (const opp of filtered.slice(0, 20)) {
        const tvlStr = opp.tvl > 1e6 ? `$${(opp.tvl / 1e6).toFixed(1)}M` : opp.tvl > 1000 ? `$${(opp.tvl / 1000).toFixed(0)}K` : `$${opp.tvl}`;
        const riskEmoji = opp.risk === 'LOW' ? '🟢' : opp.risk === 'MEDIUM' ? '🟡' : '🔴';
        report += `| ${opp.protocol} | ${opp.pool} | ${opp.apy.toFixed(1)}% | ${tvlStr} | ${riskEmoji} ${opp.risk} |\n`;
    }

    report += `\n---\n*DeFi Farmer — Automated Yield Intelligence*\n`;

    fs.writeFileSync(YIELD_REPORT, report);
    console.log(fm(`📊 Yield report saved to ${YIELD_REPORT}`));

    // Send top picks to Don
    if (process.send && filtered.length > 0) {
        const topPick = filtered[0];
        process.send({
            type: 'INTEL_DATA',
            data: `FARMER: Top yield — ${topPick.pool} on ${topPick.protocol} @ ${topPick.apy.toFixed(1)}% APY (${topPick.risk} risk). ${filtered.length} opportunities found.`,
            source: 'DEFI_FARMER'
        });
    }

    return report;
}

// ============================================================
// IPC
// ============================================================
process.on('message', (msg) => {
    switch (msg.type) {
        case 'SCAN_YIELDS':
        case 'FARM_SCAN':
            generateYieldReport();
            break;

        case 'OPEN_POSITION':
            if (msg.protocol && msg.pool && msg.amount) {
                addPosition(msg.protocol, msg.pool, msg.amount, msg.apy || 0);
            }
            break;

        case 'HARVEST':
            if (msg.posId && msg.amount) {
                harvestPosition(msg.posId, msg.amount);
            }
            break;

        case 'FARM_STATUS':
            const positions = loadPositions();
            const active = positions.positions.filter(p => p.status === 'ACTIVE');
            console.log(FM(`📊 DeFi Farmer Status:`));
            console.log(fm(`  Active Positions: ${active.length}`));
            console.log(fm(`  Total Deployed: ${positions.stats.totalDeployed.toFixed(4)} SOL`));
            console.log(fm(`  Total Harvested: ${positions.stats.totalHarvested.toFixed(4)} SOL`));
            if (active.length > 0) {
                active.forEach(p => {
                    console.log(fm(`  🌱 ${p.pool} (${p.protocol}) — ${p.amount} SOL @ ${p.entryAPY}% APY`));
                });
            }
            break;

        case 'MARKET_CHECK':
            // Piggyback on Hustler market checks to scan yields periodically
            break;
    }
});

// ============================================================
// BOOT — Initial yield scan
// ============================================================
console.log(FM('🌾 Starting initial yield scan...'));
setTimeout(generateYieldReport, 8000);

// Re-scan yields every 30 minutes
setInterval(generateYieldReport, 1800000);
setInterval(() => { }, 100000);
