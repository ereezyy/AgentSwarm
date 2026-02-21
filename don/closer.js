// don/closer.js - THE CLOSER (Deal Pipeline & Revenue Tracker)
// Tracks Headhunter proposals through the full lifecycle:
// LEAD → PROPOSAL_SENT → INTERVIEW → WON → PAID → REINVESTED
// Shifts the metric from "leads generated" to "SOL banked."

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'Closer';
const { ask } = require('./brain');
const axios = require('axios');

// File paths
const PIPELINE_PATH = path.resolve(__dirname, '../missions/deal_pipeline.json');
const REVENUE_PATH = path.resolve(__dirname, '../missions/revenue_ledger.json');
const LEADS_JSON = path.resolve(__dirname, '../missions/upwork_leads.json');
const REPORT_PATH = path.resolve(__dirname, '../missions/closer_report.md');

// Ensure missions dir
const missionsDir = path.join(__dirname, '../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

const CL = (msg) => chalk.hex('#00FF88').bold(`[THE CLOSER #${id}]: ${msg}`);
const cl = (msg) => chalk.hex('#00FF88')(`[THE CLOSER #${id}]: ${msg}`);

console.log(CL('💰 The Closer ONLINE. Revenue pipeline active.'));

// ============================================================
// DEAL PIPELINE STATE
// ============================================================
const STAGES = ['LEAD', 'PROPOSAL_SENT', 'INTERVIEW', 'WON', 'PAID', 'REINVESTED'];

let pipelineCache = null;

async function loadPipeline() {
    if (pipelineCache) return pipelineCache;

    try {
        const data = await fs.promises.readFile(PIPELINE_PATH, 'utf8');
        pipelineCache = JSON.parse(data);
        return pipelineCache;
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.log(chalk.red(`[CLOSER #${id}]: Pipeline load error: ${e.message}`));
        }
    }
    // Default structure
    pipelineCache = { deals: [], stats: { totalLeads: 0, proposalsSent: 0, interviews: 0, won: 0, paid: 0, totalRevenue: 0, totalRevenueSOL: 0 } };
    return pipelineCache;
}

function savePipeline(pipeline) {
    pipelineCache = pipeline; // Update cache reference
    fs.writeFileSync(PIPELINE_PATH, JSON.stringify(pipeline, null, 2));
}

function loadRevenueLedger() {
    try {
        if (fs.existsSync(REVENUE_PATH)) {
            return JSON.parse(fs.readFileSync(REVENUE_PATH, 'utf8'));
        }
    } catch (e) { /* fresh start */ }
    return { entries: [], totalUSD: 0, totalSOL: 0, lastUpdated: null };
}

function saveRevenueLedger(ledger) {
    ledger.lastUpdated = new Date().toISOString();
    fs.writeFileSync(REVENUE_PATH, JSON.stringify(ledger, null, 2));
}

// ============================================================
// INGEST: Pull new leads from Headhunter reports
// ============================================================
async function ingestHeadhunterLeads() {
    console.log(cl('📥 Scanning Headhunter reports for new leads...'));
    const pipeline = await loadPipeline();

    try {
        if (!fs.existsSync(LEADS_JSON)) {
            console.log(cl('⚠️ No Headhunter leads file found yet.'));
            return 0;
        }

        const leadsData = JSON.parse(fs.readFileSync(LEADS_JSON, 'utf8'));
        const evaluated = leadsData.evaluated || [];

        let newLeads = 0;
        const existingIds = new Set(pipeline.deals.map(d => d.id));

        for (const job of evaluated) {
            // Only ingest SNIPE-worthy leads
            if (job.verdict !== 'SNIPE' && job.matchScore < 7) continue;

            const dealId = job.url || `deal-${hashStr(job.title)}`;
            if (existingIds.has(dealId)) continue;

            pipeline.deals.push({
                id: dealId,
                title: job.title,
                url: job.url || '',
                source: job.source || 'unknown',
                stage: 'LEAD',
                matchScore: job.matchScore || 0,
                estimatedProfit: job.estimatedProfit || 'Unknown',
                strategy: job.strategy || '',
                difficulty: job.difficulty || 5,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                history: [{ stage: 'LEAD', timestamp: new Date().toISOString(), note: 'Ingested from Headhunter' }],
                proposalText: '',
                paymentAmount: 0,
                paymentCurrency: 'USD',
            });

            pipeline.stats.totalLeads++;
            newLeads++;
        }

        if (newLeads > 0) {
            savePipeline(pipeline);
            console.log(cl(`✅ Ingested ${newLeads} new SNIPE-worthy leads into pipeline.`));

            if (process.send) {
                process.send({
                    type: 'INTEL_DATA',
                    data: `CLOSER: ${newLeads} new deals added to pipeline (${pipeline.deals.length} total)`,
                    source: 'CLOSER'
                });
            }
        } else {
            console.log(cl('📋 No new leads to ingest.'));
        }

        return newLeads;
    } catch (e) {
        console.log(chalk.red(`[CLOSER #${id}]: Ingest error: ${e.message}`));
        return 0;
    }
}

// ============================================================
// ADVANCE: Use AI to evaluate deal progression
// ============================================================
async function evaluatePipeline() {
    const pipeline = await loadPipeline();
    const activeDeals = pipeline.deals.filter(d => d.stage !== 'PAID' && d.stage !== 'REINVESTED');

    if (activeDeals.length === 0) {
        console.log(cl('📋 No active deals to evaluate.'));
        return;
    }

    console.log(cl(`🧠 Evaluating ${activeDeals.length} active deals...`));

    // Auto-advance proposals that have been in LEAD for > 1 cycle
    let advanced = 0;
    for (const deal of activeDeals) {
        if (deal.stage === 'LEAD' && deal.matchScore >= 8) {
            // High-match leads auto-advance to PROPOSAL_SENT
            advanceDeal(pipeline, deal.id, 'PROPOSAL_SENT', 'Auto-advanced: High match score (8+)');
            advanced++;
        }
    }

    if (advanced > 0) {
        savePipeline(pipeline);
        console.log(cl(`⬆️ Auto-advanced ${advanced} high-priority deals.`));
    }

    // Draft proposals for LEAD-stage deals
    const needsProposal = pipeline.deals.filter(d => d.stage === 'LEAD' && !d.proposalText);
    if (needsProposal.length > 0) {
        console.log(cl(`✍️ Drafting proposals for ${Math.min(needsProposal.length, 3)} deals...`));

        for (const deal of needsProposal.slice(0, 3)) {
            try {
                const proposal = await draftProposal(deal);
                if (proposal) {
                    deal.proposalText = proposal;
                    deal.updatedAt = new Date().toISOString();
                    deal.history.push({ stage: deal.stage, timestamp: new Date().toISOString(), note: 'Proposal drafted by AI' });
                    console.log(cl(`📝 Proposal drafted for: "${deal.title.substring(0, 40)}..."`));
                }
                await sleep(2000);
            } catch (e) {
                console.log(chalk.red(`[CLOSER]: Proposal draft failed: ${e.message}`));
            }
        }
        savePipeline(pipeline);
    }
}

async function draftProposal(deal) {
    try {
        const content = await ask(
            `Job: ${deal.title}\nSource: ${deal.source}\nStrategy: ${deal.strategy}\nEstimated Profit: $${deal.estimatedProfit}`,
            `You are The Closer, an elite freelance deal-closer. Write a compelling, personalized proposal (< 150 words) for this job. 
Rules:
- Lead with VALUE, not credentials
- Reference specific project requirements
- Show relevant experience from our stack: AI/LLM, Python, Node.js, Solana, React, automation
- Include a clear CTA with timeline
- No "Dear Hiring Manager" - start with impact
- Be confident but not arrogant`,
            { agentName: `CLOSER #${id}` }
        );
        return content;
    } catch (e) {
        return null;
    }
}

// ============================================================
// DEAL MANAGEMENT
// ============================================================
function advanceDeal(pipeline, dealId, newStage, note = '') {
    const deal = pipeline.deals.find(d => d.id === dealId);
    if (!deal) return false;

    const oldStage = deal.stage;
    deal.stage = newStage;
    deal.updatedAt = new Date().toISOString();
    deal.history.push({
        stage: newStage,
        timestamp: new Date().toISOString(),
        note: note || `Advanced from ${oldStage} to ${newStage}`
    });

    // Update stats
    if (newStage === 'PROPOSAL_SENT') pipeline.stats.proposalsSent++;
    if (newStage === 'INTERVIEW') pipeline.stats.interviews++;
    if (newStage === 'WON') pipeline.stats.won++;
    if (newStage === 'PAID') {
        pipeline.stats.paid++;
        const amount = deal.paymentAmount || 0;
        pipeline.stats.totalRevenue += amount;
        // Convert to SOL (rough estimate)
        pipeline.stats.totalRevenueSOL += (amount / 150); // $150/SOL estimate

        // Log to revenue ledger
        const ledger = loadRevenueLedger();
        ledger.entries.push({
            dealId: deal.id,
            title: deal.title,
            amount: amount,
            currency: deal.paymentCurrency || 'USD',
            solEquivalent: (amount / 150).toFixed(4),
            paidAt: new Date().toISOString(),
            source: deal.source,
        });
        ledger.totalUSD += amount;
        ledger.totalSOL += (amount / 150);
        saveRevenueLedger(ledger);

        // Announce payment
        if (process.send) {
            process.send({
                type: 'SIREN_SPEAK',
                text: `Payment confirmed! ${deal.title.substring(0, 30)} paid $${amount}. Total revenue: $${pipeline.stats.totalRevenue.toFixed(2)}.`
            });
            process.send({
                type: 'KICK_UP',
                amount: amount * 0.15, // 15% skim to The Don
                source: 'CLOSER'
            });
        }
    }

    console.log(cl(`📊 Deal "${deal.title.substring(0, 30)}..." moved: ${oldStage} → ${newStage}`));
    return true;
}

function setPayment(pipeline, dealId, amount, currency = 'USD') {
    const deal = pipeline.deals.find(d => d.id === dealId);
    if (!deal) return false;
    deal.paymentAmount = amount;
    deal.paymentCurrency = currency;
    deal.updatedAt = new Date().toISOString();
    deal.history.push({ stage: deal.stage, timestamp: new Date().toISOString(), note: `Payment set: $${amount} ${currency}` });
    return true;
}

// ============================================================
// REPORTING
// ============================================================
async function generateReport() {
    const pipeline = await loadPipeline();
    const ledger = loadRevenueLedger();
    const ts = new Date().toLocaleString();

    const byStage = {};
    for (const stage of STAGES) {
        byStage[stage] = pipeline.deals.filter(d => d.stage === stage);
    }

    let report = `\n══════════════════════════════════════════════════════════════════════\n`;
    report += `💰 THE CLOSER — REVENUE PIPELINE REPORT — ${ts}\n`;
    report += `══════════════════════════════════════════════════════════════════════\n\n`;

    report += `📊 PIPELINE SUMMARY:\n`;
    report += `──────────────────────────────────────────────────\n`;
    report += `  Total Deals: ${pipeline.deals.length}\n`;
    report += `  Leads: ${byStage['LEAD']?.length || 0} | Proposals Sent: ${byStage['PROPOSAL_SENT']?.length || 0}\n`;
    report += `  Interviews: ${byStage['INTERVIEW']?.length || 0} | Won: ${byStage['WON']?.length || 0}\n`;
    report += `  Paid: ${byStage['PAID']?.length || 0} | Reinvested: ${byStage['REINVESTED']?.length || 0}\n\n`;

    report += `💵 REVENUE:\n`;
    report += `  Total USD: $${pipeline.stats.totalRevenue.toFixed(2)}\n`;
    report += `  Total SOL (est): ${pipeline.stats.totalRevenueSOL.toFixed(4)} SOL\n`;
    report += `  Conversion Rate: ${pipeline.deals.length > 0 ? ((pipeline.stats.paid / pipeline.deals.length) * 100).toFixed(1) : 0}%\n\n`;

    // Active deals
    const active = pipeline.deals.filter(d => !['PAID', 'REINVESTED'].includes(d.stage));
    if (active.length > 0) {
        report += `🎯 ACTIVE DEALS:\n`;
        report += `──────────────────────────────────────────────────\n`;
        for (const deal of active) {
            const stageEmoji = { LEAD: '🔵', PROPOSAL_SENT: '📤', INTERVIEW: '🎤', WON: '🏆' }[deal.stage] || '📋';
            report += `  ${stageEmoji} [${deal.stage}] ${deal.title}\n`;
            report += `     Score: ${deal.matchScore}/10 | Est: $${deal.estimatedProfit} | ${deal.source}\n`;
            if (deal.url) report += `     ${deal.url}\n`;
        }
    }

    // Recent payments
    if (ledger.entries.length > 0) {
        report += `\n💸 RECENT PAYMENTS:\n`;
        report += `──────────────────────────────────────────────────\n`;
        for (const entry of ledger.entries.slice(-5)) {
            report += `  ✅ $${entry.amount} (~${entry.solEquivalent} SOL) — ${entry.title.substring(0, 40)}\n`;
        }
    }

    report += `\n══════════════════════════════════════════════════════════════════════\n`;
    report += `[END CLOSER REPORT]\n`;

    fs.writeFileSync(REPORT_PATH, report);
    console.log(cl(`📄 Report saved to ${REPORT_PATH}`));

    // Broadcast pipeline summary
    if (process.send) {
        process.send({
            type: 'INTEL_DATA',
            data: `CLOSER PIPELINE: ${pipeline.deals.length} deals | ${byStage['LEAD']?.length || 0} leads | ${pipeline.stats.totalRevenue.toFixed(0)} USD banked`,
            source: 'CLOSER'
        });
        process.send({
            type: 'HEADHUNTER_REPORT',
            data: {
                type: 'closer_pipeline',
                timestamp: new Date().toISOString(),
                pipelineSummary: pipeline.stats,
                activeDeals: pipeline.deals.filter(d => !['PAID', 'REINVESTED'].includes(d.stage)).length,
                totalDeals: pipeline.deals.length,
            }
        });
    }

    return report;
}

// ============================================================
// IPC MESSAGE HANDLER (from The Don)
// ============================================================
process.on('message', async (msg) => {
    try {
        const pipeline = await loadPipeline();

        switch (msg.type) {
            case 'ADVANCE_DEAL':
                // advance a deal: { dealId, newStage, note }
                if (msg.dealId && msg.newStage) {
                    advanceDeal(pipeline, msg.dealId, msg.newStage, msg.note || '');
                    savePipeline(pipeline);
                }
                break;

            case 'SET_PAYMENT':
                // set payment for a deal: { dealId, amount, currency }
                if (msg.dealId && msg.amount) {
                    setPayment(pipeline, msg.dealId, msg.amount, msg.currency || 'USD');
                    savePipeline(pipeline);
                }
                break;

            case 'PIPELINE_STATUS':
                await generateReport();
                break;

            case 'INGEST_NOW':
                await ingestHeadhunterLeads();
                break;

            case 'HEADHUNTER_REPORT':
                // Auto-ingest when Headhunter sends new data
                console.log(cl('📨 Received fresh Headhunter data. Ingesting...'));
                await ingestHeadhunterLeads();
                break;

            default:
                break;
        }
    } catch (e) {
        console.error(chalk.red(`[CLOSER #${id}]: Message handling error: ${e.message}`));
    }
});

// ============================================================
// MAIN LOOP
// ============================================================
async function closerLoop() {
    try {
        console.log(CL('═══════════════════════════════════'));
        console.log(CL('💰 CLOSER CYCLE STARTING'));
        console.log(CL('═══════════════════════════════════\n'));

        // 1. Ingest new leads
        await ingestHeadhunterLeads();

        // 2. Evaluate and advance pipeline
        await evaluatePipeline();

        // 3. Generate report
        await generateReport();

        console.log(cl('✅ Closer cycle complete.'));
    } catch (e) {
        console.error(chalk.red(`[CLOSER #${id}]: Cycle failed: ${e.message}`));
    }
    setTimeout(closerLoop, 1800000); // 30 min
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function hashStr(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

// BOOT
setTimeout(closerLoop, 8000);
