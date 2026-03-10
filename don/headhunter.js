// don/headhunter.js - THE HEADHUNTER (AI JOB HUNTER)
// Uses official Upwork API (OAuth) + REAL WORLD Sources (Reddit, HN, WWR) + Shadow Scraper (Puppeteer) + Grok AI evaluation.
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
require('dotenv').config();

const id = process.argv[2] || 'Headhunter';
const { ask } = require('./brain');
const initSearch = require('./headhunter_search');
const initEval = require('./headhunter_eval');

const UPWORK_TOKEN = process.env.UPWORK_ACCESS_TOKEN;
const UPWORK_API = 'https://www.upwork.com/api';

const REPORT_PATH = path.resolve(__dirname, '../missions/upwork_leads.md');
const LEADS_JSON = path.resolve(__dirname, '../missions/upwork_leads.json');

// Ensure missions dir
if (!fs.existsSync(path.join(__dirname, '../missions'))) {
    fs.mkdirSync(path.join(__dirname, '../missions'));
}

const HH = (msg) => chalk.hex('#FF6600').bold(`[HEADHUNTER #${id}]: ${msg}`);
const hh = (msg) => chalk.hex('#FF6600')(`[HEADHUNTER #${id}]: ${msg}`);

const searchConfig = { id, hh, UPWORK_TOKEN, UPWORK_API };
const evalConfig = { id, hh };

const { searchJobsAPI, searchRealSources, searchShadowNet } = initSearch(searchConfig);
const { evaluateJobs, generateProposal } = initEval(evalConfig);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


console.log(HH('🎯 Headhunter (Real-World Ops) ONLINE.'));
console.log(hh(`API Mode: ${UPWORK_TOKEN ? 'OFFICIAL API (OAuth)' : 'CLEADNET (Reddit/HN/WWR)'}`));

// ============================================================
// SEARCH CONFIGURATION
// ============================================================


const SYNDICATE_SKILLS = [
    'Node.js', 'Python', 'JavaScript', 'TypeScript',
    'LLM/GPT Integration', 'AI Agent Development',
    'Web Scraping (Puppeteer/Playwright)', 'Solana/Web3',
    'Next.js/React', 'FastAPI', 'Voice AI (Deepgram/TTS)',
    'Data Pipelines'
];

// ============================================================
// UPWORK OFFICIAL API (Primary)
// ============================================================




// ============================================================
// CLEADNET: REAL-WORLD SOURCE AGGREGATOR (Fallback)
// ============================================================


// ============================================================
// SHADOW SCRAPER: LIVE UPWORK DATA (Puppeteer - Tier 2 Fallback)
// ============================================================








// ============================================================
// AGENTSYSTEM RESEARCH MUSCLE (New Bridge)
// ============================================================
async function deepResearch(job) {
    console.log(hh(`🔍 Performing Deep Background Research for: "${job.title}"...`));

    const leadData = {
        id: job.id,
        company: job.clientInfo?.source === 'Reddit' ? job.clientInfo.author : (job.title.split('at')[1] || job.title).trim(),
        title: job.title,
        description: job.description,
        industry: job.category
    };

    return new Promise((resolve) => {
        const researchPath = path.join(__dirname, '../muscle/research_agent.py');
        execFile('python', [researchPath, JSON.stringify(leadData)], {
            timeout: 30000
        }, async (error, stdout, stderr) => {
            if (error) {
                console.log(chalk.red(`  ❌ Research Muscle failed: ${error.message}`));
                resolve(null);
                return;
            }
            try {
                // NEW: Use Summarizer Bridge if data is too large for industrial-grade processing
                if (stdout.length > 3000) {
                    console.log(hh(`🧠 Input data too large (${stdout.length} chars). Summarizing...`));
                    const summary = await summarizeResearch(stdout);
                    resolve(summary);
                } else {
                    const research = JSON.parse(stdout);
                    console.log(hh(`🧬 Deep Research Complete. Tech: ${research.technology_stack?.join(', ') || 'N/A'}`));
                    resolve(research);
                }
            } catch (e) {
                console.log(chalk.red(`  ❌ Research Muscle parse error: ${e.message}`));
                resolve(null);
            }
        });
    });
}

async function summarizeResearch(content) {
    return new Promise((resolve) => {
        const summarizerPath = path.join(__dirname, '../muscle/summarizer_bridge.py');
        const child = exec(`python ${summarizerPath}`, (err, stdout) => {
            if (err) {
                console.log(chalk.red(`  ❌ Summarization failed: ${err.message}`));
                resolve({ summary: "Summarization failed", key_signals: ["ERROR"] });
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                resolve({ summary: "Parse failed during summarization", key_signals: ["ERROR"] });
            }
        });
        child.stdin.write(JSON.stringify({ content }));
        child.stdin.end();
    });
}


// ============================================================
// AGENTSYSTEM CRM & VISIBILITY (New Bridges)
// ============================================================
async function logToHubSpot(leads) {
    if (!leads || leads.length === 0) return;
    console.log(hh(`📊 Syncing ${leads.length} leads to HubSpot...`));

    return new Promise((resolve) => {
        const hubspotPath = path.join(__dirname, '../muscle/hubspot_engine.py');
        const child = execFile('python', [hubspotPath, JSON.stringify(leads)], {
            timeout: 30000
        }, (error, stdout, stderr) => {
            if (error) {
                console.log(chalk.red(`  ❌ HubSpot Engine failed: ${error.message}`));
                resolve(null);
                return;
            }
            try {
                const results = JSON.parse(stdout);
                console.log(hh(`✅ HubSpot Sync Complete. ${results.length} records processed.`));
                resolve(results);
            } catch (e) {
                resolve(null);
            }
        });
    });
}

async function relayAlert(message, level = 'INFO') {
    return new Promise((resolve) => {
        const relayPath = path.join(__dirname, '../muscle/status_relay.py');
        execFile('python', [relayPath, JSON.stringify({ message, level })], (err) => {
            resolve(!err);
        });
    });
}

// ============================================================
// GROK AI (EVALUATION & PROPOSALS)
// ============================================================




// ============================================================
// MAIN LOOP
// ============================================================

async function executeSearchSequence() {
    let jobs = await searchJobsAPI();
    let source = 'api';

    if (!jobs || jobs.length === 0) {
        console.log(hh('⚡ Falling back to CLEADNET (Real Sources)...'));
        jobs = await searchRealSources();
        source = 'cleadnet';
    }

    // Tier 2: Shadow Scraper (Puppeteer stealth)
    if (!jobs || jobs.length === 0) {
        console.log(hh('🕶️ CLEADNET dry. Engaging Shadow Scraper...'));
        jobs = await searchShadowNet();
        source = 'shadow_scraper';
    }

    return { jobs, source };
}


async function processTargets(targetSnipes) {
    const proposals = [];

    // Parallel RESEARCH ENRICHMENT
    console.log(hh(`🚀 Parallelizing deep research for ${targetSnipes.length} targets...`));
    await Promise.all(targetSnipes.map(async (snipe) => {
        const research = await deepResearch(snipe);
        if (research) {
            snipe.research = research;
            console.log(hh(`💎 Enriched "${snipe.title}" with AgentSystem context.`));
        }
    }));

    for (const snipe of targetSnipes) {
        const proposal = await generateProposal(snipe);
        if (proposal) proposals.push({ jobTitle: snipe.title, text: proposal, research: snipe.research });
        await sleep(2000);
    }
    return proposals;
}

async function runHuntLoop() {
    try {
        console.log(HH('═══════════════════════════════════'));
        console.log(HH('🎯 HUNT CYCLE STARTING (REAL MODE)'));
        console.log(HH('═══════════════════════════════════\n'));

        const { jobs, source } = await executeSearchSequence();

        if (!jobs || jobs.length === 0) {
            console.log(chalk.yellow(`[HEADHUNTER #${id}]: ⚠️ All sources exhausted. Retrying in 5 min.`));
            setTimeout(runHuntLoop, 300000);
            return;
        }

        const evaluatedJobs = await evaluateJobs(jobs);
        const snipes = evaluatedJobs.filter(j => j.verdict === 'SNIPE');
        const targetSnipes = snipes.slice(0, 3);

        const proposals = await processTargets(targetSnipes);

        // Save & Send
        const leadsData = { timestamp: new Date().toISOString(), source, evaluated: evaluatedJobs, proposals, raw: jobs.length };
        fs.writeFileSync(LEADS_JSON, JSON.stringify(leadsData, null, 2));
        writeReport(evaluatedJobs, source, jobs.length);

        // AGENTSYSTEM CRM SYNC
        if (snipes.length > 0) {
            await logToHubSpot(snipes.map(s => ({
                id: s.id,
                first_name: "Lead",
                last_name: "Prospect",
                company: s.research?.company_info?.name || "Unknown",
                title: s.title,
                email: `lead_${s.id.slice(-6)}@syndicate.box` // Placeholder email
            })));

            await relayAlert(`🎯 Headhunter found ${snipes.length} SNIPE opportunities!`, 'SUCCESS');
        }

        if (process.send) {
            process.send({ type: 'INTEL_DATA', data: `${source.toUpperCase()}: ${jobs.length} REAL jobs found | ${snipes.length} TARGETS`, source: 'HEADHUNTER' });
            process.send({ type: 'HEADHUNTER_REPORT', data: leadsData });
            if (snipes.length > 0) {
                process.send({ type: 'SIREN_SPEAK', text: `Headhunter report. ${snipes.length} real opportunities found. ${proposals.length} proposals drafted.` });
            }
        }

    } catch (error) {
        console.error(chalk.red(`[HEADHUNTER #${id}]: Hunt cycle FAILED: ${error.message}`));
    }
    setTimeout(runHuntLoop, 1800000); // 30 min
}



// ============================================================
// REPORT WRITER
// ============================================================
function writeReport(evaluatedJobs, source, rawCount) {
    const snipes = evaluatedJobs.filter(j => j.verdict === 'SNIPE');
    const considers = evaluatedJobs.filter(j => j.verdict === 'CONSIDER');
    const ts = new Date().toLocaleString();

    let report = `\n══════════════════════════════════════════════════════════════════════\n`;
    report += `🎯 HEADHUNTER INTEL REPORT — ${ts}\n`;
    report += `══════════════════════════════════════════════════════════════════════\n\n`;
    report += `📊 SCAN: ${rawCount} jobs found | ${snipes.length} SNIPE | ${considers.length} CONSIDER\n`;
    report += `🔌 Source: ${source}\n\n`;

    if (snipes.length > 0) {
        report += `\n🎯 HIGH PRIORITY TARGETS:\n──────────────────────────────────────────────────\n`;
        snipes.forEach(j => {
            report += `  ◆ ${j.title} — Match: ${j.matchScore}/10 | $$$${j.estimatedProfit || '?'} (${j.budget?.type || 'Unknown'})\n`;
            report += `    ${j.url}\n`;
        });
    }

    if (considers.length > 0) {
        report += `\n💡 WORTH CONSIDERING:\n──────────────────────────────────────────────────\n`;
        considers.forEach(j => {
            report += `  ◆ ${j.title} — Match: ${j.matchScore}/10 | $$$${j.estimatedProfit || '?'} (${j.budget?.type || 'Unknown'})\n`;
            report += `    ${j.url}\n`;
        });
    }

    report += `\n══════════════════════════════════════════════════════════════════════\n`;
    report += `[END HEADHUNTER REPORT]\n`;

    fs.appendFileSync(REPORT_PATH, report);
    console.log(hh(`📄 Report appended to ${REPORT_PATH}`));
}

// BOOT
setTimeout(runHuntLoop, 5000);
