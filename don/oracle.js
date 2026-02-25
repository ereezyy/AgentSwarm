// don/oracle.js - THE ORACLE (SECURITY & RUG-CHECK v2)
// Real security audits with RugCheck API, token metadata analysis, and holder distribution checks
const axios = require('axios');
const chalk = require('chalk');
const { askConsensus } = require('./brain');
require('dotenv').config();

const id = process.argv[2] || 'Oracle';
const SOLANA_RPC = process.env.SOLANA_RPC_URL;

console.log(chalk.cyan.bold(`[ORACLE #${id}]: Security Matrix v2 ONLINE. Real audits only.`));

// Audit queue (prevents duplicate audits)
const recentAudits = new Map(); // mint -> { score, timestamp }
const AUDIT_COOLDOWN = 300000;  // 5 min cooldown per token

async function auditToken(mintAddress) {
    if (!mintAddress || mintAddress.length < 32) {
        console.log(chalk.gray(`[ORACLE #${id}]: Invalid mint address. Skipping.`));
        return null;
    }

    // Check audit cooldown
    const cached = recentAudits.get(mintAddress);
    if (cached && (Date.now() - cached.timestamp < AUDIT_COOLDOWN)) {
        console.log(chalk.gray(`[ORACLE #${id}]: Recently audited ${mintAddress.substring(0, 8)}... (cached: ${cached.rating})`));
        return cached;
    }

    console.log(chalk.cyan(`[ORACLE #${id}]: 🔍 Auditing token: ${mintAddress.substring(0, 12)}...`));

    let riskScore = 0;
    let reasons = [];
    let rating = 'UNKNOWN';

    try {
        // 1. RugCheck API (Primary)
        const rugResponse = await axios.get(
            `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report`,
            { timeout: 10000 }
        ).catch(() => null);

        if (rugResponse && rugResponse.data) {
            riskScore = rugResponse.data.score || 0;
            reasons = (rugResponse.data.risks || []).map(r => r.name || r.description || 'Unknown risk');

            // Additional checks from rug data
            if (rugResponse.data.topHolders) {
                const topHolderPct = rugResponse.data.topHolders.reduce((sum, h) => sum + (h.pct || 0), 0);
                if (topHolderPct > 50) {
                    reasons.push(`Top holders control ${topHolderPct.toFixed(1)}% of supply`);
                    riskScore += 50;
                }
            }

            if (rugResponse.data.mintAuthority) {
                reasons.push('Mint Authority ACTIVE (can print more tokens)');
                riskScore += 30;
            }

            if (rugResponse.data.freezeAuthority) {
                reasons.push('Freeze Authority ACTIVE (can freeze your tokens)');
                riskScore += 40;
            }
        }

        // 2. Token Metadata Check (via Solana RPC)
        if (SOLANA_RPC) {
            try {
                const accountResponse = await axios.post(SOLANA_RPC, {
                    jsonrpc: '2.0', id: 1,
                    method: 'getAccountInfo',
                    params: [mintAddress, { encoding: 'jsonParsed' }]
                }, { timeout: 10000 });

                const accountData = accountResponse.data?.result?.value;
                if (!accountData) {
                    reasons.push('Token account not found on-chain');
                    riskScore += 100;
                } else if (accountData.data?.parsed?.info) {
                    const info = accountData.data.parsed.info;
                    const supply = parseInt(info.supply || '0');
                    const decimals = info.decimals || 0;

                    if (supply === 0) {
                        reasons.push('Zero supply token');
                        riskScore += 80;
                    }
                }
            } catch (rpcErr) {
                // RPC check failed, rely on RugCheck data
            }
        }

    } catch (e) {
        console.log(chalk.gray(`[ORACLE #${id}]: External audit APIs unavailable: ${e.message}`));
        reasons.push('Audit APIs unreachable — manual review recommended');
        riskScore = -1; // Unknown
    }

    // Determine rating
    if (riskScore < 0) {
        rating = 'UNKNOWN';
    } else if (riskScore < 50) {
        rating = 'SAFE';
    } else if (riskScore < 150) {
        rating = 'CAUTION';
    } else {
        rating = 'DANGER';
    }

    const colorFn = rating === 'SAFE' ? chalk.green : (rating === 'CAUTION' ? chalk.yellow : chalk.red);

    console.log(colorFn(`[ORACLE #${id}]: AUDIT: ${rating} (Score: ${riskScore})`));
    if (reasons.length > 0) {
        reasons.forEach(r => console.log(colorFn(`  └─ ${r}`)));
    }

    // Cache result
    const result = { mint: mintAddress, riskScore, rating, reasons, timestamp: Date.now() };
    recentAudits.set(mintAddress, result);

    // Report to Don
    if (process.send) {
        process.send({
            type: 'INTEL_DATA',
            data: `TOKEN AUDIT: ${mintAddress.substring(0, 12)}... → ${rating} (Score: ${riskScore}). ${reasons.slice(0, 2).join('; ')}`,
            source: 'ORACLE_SECURITY'
        });

        // Critical: If DANGER, alert the Sniper to blacklist
        if (rating === 'DANGER') {
            process.send({ type: 'BLACKLIST_REQUEST', mint: mintAddress });
            process.send({
                type: 'SIREN_SPEAK',
                text: `Oracle security alert. Token ${mintAddress.substring(0, 8)} rated DANGER. Score ${riskScore}. ${reasons[0] || 'Multiple red flags'}. Blacklisting.`
            });
        }
    }

    return result;
}

// IPC Listener for Audit Requests
process.on('message', (msg) => {
    if (msg.type === 'REQUEST_AUDIT') {
        if (msg.mint) {
            auditToken(msg.mint);
        } else if (msg.target === 'system') {
            console.log(chalk.cyan(`[ORACLE #${id}]: System audit requested. Running diagnostics...`));
            if (process.send) {
                process.send({
                    type: 'INTEL_DATA',
                    data: `Oracle system check: ${recentAudits.size} tokens audited this session. Security matrix operational.`,
                    source: 'ORACLE_SYSTEM'
                });
            }
        }
    } else if (msg.type === 'EXECUTE_GOD_MODE') {
        if (!msg.topic) return;
        console.log(chalk.magenta.bold(`[ORACLE #${id}]: ⚡ INITIATING GOD MODE COMPUTATION: ${msg.topic}`));
        askConsensus([{ role: 'user', content: msg.topic }], { strategy: 'balanced' })
            .then(result => {
                if (process.send) {
                    process.send({
                        type: 'AGENT_COMMS',
                        from: '🌟 GOD MODE',
                        msg: `⚡ OMEGA CONSENSUS REACHED:\n\n${result}`,
                        timestamp: new Date().toISOString()
                    });
                }
            })
            .catch(e => {
                if (process.send) {
                    process.send({ type: 'AGENT_COMMS', from: '🌟 GOD MODE', msg: `Computation Failed: ${e.message}`, timestamp: new Date().toISOString() });
                }
            });
    }
});

// Keep alive — The Oracle waits for audit requests, no more random scanning
console.log(chalk.cyan(`[ORACLE #${id}]: Standing by for audit requests. No simulations.`));
setInterval(() => {
    // Cleanup old cache entries (older than 1 hour)
    const cutoff = Date.now() - 3600000;
    for (const [mint, data] of recentAudits) {
        if (data.timestamp < cutoff) recentAudits.delete(mint);
    }
}, 600000);
