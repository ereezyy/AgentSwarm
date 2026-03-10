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
const { deepResearch } = require('./research_scraper');
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

console.log(HH('🎯 Headhunter (Real-World Ops) ONLINE.'));
console.log(hh(`API Mode: ${UPWORK_TOKEN ? 'OFFICIAL API (OAuth)' : 'CLEADNET (Reddit/HN/WWR)'}`));

// ============================================================
// SEARCH CONFIGURATION
// ============================================================
const SEARCH_QUERIES = [
    'AI agent development',
    'LLM application development',
    'GPT API integration',
    'AI chatbot development',
    'Python AI automation',
    'RAG system development',
    'Solana bot development',
    'blockchain AI integration'
];

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
function apiHeaders() {
    return {
        'Authorization': `Bearer ${UPWORK_TOKEN}`,
        'Content-Type': 'application/json'
    };
}

async function searchJobsAPI() {
    if (!UPWORK_TOKEN) return null;

    const allJobs = [];
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];

    try {
        console.log(hh(`🔍 API search: "${query}"...`));
        const response = await axios.get(
            `${UPWORK_API}/profiles/v2/search/jobs.json`, {
            params: { q: query, sort: 'recency', paging: '0;10', days_posted: 3, job_type: 'all', budget: '[100 TO 99999]' },
            headers: apiHeaders(),
            timeout: 15000
        });

        const jobs = (response.data.jobs || response.data.results || []).map(j => ({
            id: j.id || j.ciphertext || '',
            title: j.title || j.op_title || 'Unknown',
            url: j.id ? `https://www.upwork.com/jobs/${j.id}` : '',
            description: (j.snippet || j.op_description || '').substring(0, 600),
            postedDate: j.date_created || j.op_pub_date || new Date().toISOString(),
            budget: parseBudgetAPI(j),
            skills: (j.skills || j.op_required_skills || []).map(s => typeof s === 'string' ? s : s.name || s.skill || ''),
            category: j.subcategory2 || j.op_contractor_tier_label || 'Unknown',
            clientInfo: {
                country: j.op_country || j.buyer?.op_country || '',
                rating: j.op_buyer_rating || j.buyer?.op_adjusted_score || 0,
                hires: j.op_tot_hires || j.buyer?.op_tot_hires || 0,
                totalSpent: j.op_tot_charge || j.buyer?.op_tot_charge || 0,
                paymentVerified: j.op_is_payment_verified || false
            },
            applicants: j.op_tot_cand || 0,
            source: 'upwork_api'
        }));

        allJobs.push(...jobs);
        console.log(hh(`📋 API returned ${jobs.length} jobs for "${query}"`));
        await sleep(2000);

    } catch (e) {
        if (e.response?.status === 401) {
            console.log(chalk.red(`[HEADHUNTER #${id}]: ❌ OAuth token expired/invalid. Fallback active.`));
            return null;
        }
    }
    return dedup(allJobs);
}

function parseBudgetAPI(job) {
    if (job.budget) return { type: 'fixed', amount: job.budget };
    if (job.op_amount) return { type: 'fixed', amount: job.op_amount };
    if (job.op_hourly_low && job.op_hourly_high) return { type: 'hourly', min: job.op_hourly_low, max: job.op_hourly_high };
    return { type: 'unknown' };
}

// ============================================================
// CLEADNET: REAL-WORLD SOURCE AGGREGATOR (Fallback)
// ============================================================
async function searchRealSources() {
    console.log(hh('🌍 Scanning CLEADNET (Real-World Sources)...'));
    let jobs = [];

    // 1. REDDIT (r/forhire)
    try {
        console.log(hh('  • Scanning Reddit (r/forhire)...'));
        const res = await axios.get('https://www.reddit.com/r/forhire/new.json?limit=25', {
            headers: { 'User-Agent': 'Syndicate/1.0' }
        });

        if (res.data && res.data.data && res.data.data.children) {
            const posts = res.data.data.children
                .map(c => c.data)
                .filter(p => !p.stickied && (p.link_flair_text === 'Hiring' || p.title.toLowerCase().includes('[hiring]')));

            jobs.push(...posts.map(p => ({
                id: `reddit-${p.id}`,
                title: p.title.replace(/\[hiring\]/gi, '').trim(),
                url: `https://reddit.com${p.permalink}`,
                description: (p.selftext || 'No description provided.').substring(0, 600) + '...',
                postedDate: new Date(p.created_utc * 1000).toISOString(),
                budget: extractBudget(p.selftext + ' ' + p.title),
                source: 'reddit',
                skills: ['Reddit Lead'],
                category: 'Development',
                clientInfo: { source: 'Reddit', author: p.author, paymentVerified: false },
                applicants: 0
            })));
        }
    } catch (e) {
        console.log(chalk.red(`  ❌ Reddit Scan Error: ${e.message}`));
    }

    // 2. HACKER NEWS (Job Stories)
    try {
        console.log(hh('  • Scanning Hacker News (Job Stories)...'));
        const storyIds = (await axios.get('https://hacker-news.firebaseio.com/v0/jobstories.json')).data.slice(0, 10);

        const hnJobs = (await Promise.all(storyIds.map(async (id) => {
            try {
                const item = (await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).data;
                if (item && !item.deleted && !item.dead) {
                    return {
                        id: `hn-${item.id}`,
                        title: item.title,
                        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
                        description: item.text ? item.text.replace(/<[^>]*>/g, '').substring(0, 600) : 'See URL for details.',
                        postedDate: new Date(item.time * 1000).toISOString(),
                        budget: { type: 'unknown' },
                        source: 'hackernews',
                        skills: ['Startup', 'YC'],
                        category: 'Startup',
                        clientInfo: { source: 'HackerNews', paymentVerified: true },
                        applicants: 0
                    };
                }
            } catch (err) { return null; }
        }))).filter(j => j !== null);

        jobs.push(...hnJobs);
    } catch (e) {
        console.log(chalk.red(`  ❌ HN Scan Error: ${e.message}`));
    }


    // 3. WeWorkRemotely RSS
    try {
        console.log(hh('  • Scanning WeWorkRemotely RSS...'));
        const rssRes = await axios.get('https://weworkremotely.com/categories/remote-programming-jobs.rss');
        const rssJobs = parseRSS(rssRes.data).slice(0, 10);
        jobs.push(...rssJobs.map(j => ({ ...j, source: 'weworkremotely' })));
    } catch (e) {
        console.log(chalk.red(`  ❌ WWR RSS Error: ${e.message}`));
    }

    console.log(hh(`⚡ CLEADNET SCAN COMPLETE. Found ${jobs.length} REAL opportunities.`));
    return dedup(jobs);
}

// ============================================================
// SHADOW SCRAPER: LIVE UPWORK DATA (Puppeteer - Tier 2 Fallback)
// ============================================================
async function searchShadowNet() {
    console.log(hh('🕶️ Deploying SHADOW SCRAPER (Puppeteer stealth)...'));
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];

    return new Promise((resolve) => {
        const scraperPath = path.join(__dirname, 'shadow_scraper.js');
        const child = execFile('node', [scraperPath, query, '10'], {
            timeout: 60000,  // 60s max
            maxBuffer: 1024 * 1024,  // 1MB
        }, (error, stdout, stderr) => {
            if (stderr) {
                // Shadow Scraper logs to stderr
                stderr.split('\n').filter(l => l.trim()).forEach(l => console.log(chalk.gray(`  ${l}`)));
            }
            if (error) {
                console.log(chalk.red(`[HEADHUNTER #${id}]: ❌ Shadow Scraper failed: ${error.message}`));
                resolve([]);
                return;
            }
            try {
                const jobs = JSON.parse(stdout);
                console.log(hh(`🕶️ Shadow Scraper returned ${jobs.length} LIVE Upwork listings!`));
                resolve(jobs);
            } catch (e) {
                console.log(chalk.red(`[HEADHUNTER #${id}]: ❌ Shadow Scraper parse error: ${e.message}`));
                resolve([]);
            }
        });
    });
}

function parseRSS(xml) {
    const jobs = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const item = m[1];
        const title = tag(item, 'title');
        const link = tag(item, 'link');
        const desc = tag(item, 'description');
        const pub = tag(item, 'pubDate');
        if (title) {
            jobs.push({
                id: '',
                title: clean(title),
                url: link,
                description: clean(desc).substring(0, 600),
                postedDate: pub,
                budget: extractBudget(desc),
                skills: extractSkills(desc),
                category: extractCat(desc),
                clientInfo: { country: '', rating: 0, hires: 0, totalSpent: 0, paymentVerified: false },
                applicants: 0,
                source: 'rss'
            });
        }
    }
    return jobs;
}

function tag(xml, t) {
    const re = new RegExp(`<${t}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${t}>|<${t}>([^<]*)<\\/${t}>`, 'i');
    const m = re.exec(xml);
    return m ? (m[1] || m[2] || '').trim() : '';
}

function clean(h) {
    return h.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function extractBudget(d) {
    const f = d.match(/Budget:\s*\$?([\d,]+(?:\.\d{2})?)/i);
    const h = d.match(/Hourly Range:\s*\$?([\d,.]+)\s*-\s*\$?([\d,.]+)/i);
    if (f) return { type: 'fixed', amount: f[1] };
    if (h) return { type: 'hourly', min: h[1], max: h[2] };
    return { type: 'unknown' };
}
function extractSkills(d) {
    const m = d.match(/Skills?:\s*([^\n]+)/i);
    return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}
function extractCat(d) {
    const m = d.match(/Category:\s*([^\n<]+)/i);
    return m ? m[1].trim() : 'Unknown';
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
async function evaluateJobs(jobs) {
    if (jobs.length === 0) return jobs.map(j => ({ ...j, matchScore: 5, verdict: 'CONSIDER', estimatedProfit: 'Unknown', difficulty: 5, strategy: '', timeEstimate: '', flags: '' }));

    try {
        console.log(hh(`🧠 Grok evaluating ${jobs.length} REAL opportunities (BOOTSTRAP MODE: Top 5)...`));
        // Throttled to 5 to save API credits
        const summaries = jobs.slice(0, 5).map((j, i) => `[${i + 1}] "${j.title}" | Source: ${j.source} | Desc: ${j.description.substring(0, 200)}...`).join('\n\n');

        const content = await ask(
            `Evaluate these jobs:\n\n${summaries}`,
            `You are 'The Headhunter', revenue ops lead. Evaluate these job listings.
Format:
---
JOB: [title]
MATCH: [1-10]
VERDICT: [SNIPE / CONSIDER / SKIP]
PROFIT: $[est]
DIFFICULTY: [1-10]
TIME: [hours]h
STRATEGY: [pitch]
FLAGS: [concerns]
---
SNIPE = match 7+, we can do it.`,
            { agentName: `HEADHUNTER #${id}` }
        );

        if (content) return parseEval(content, jobs);
    } catch (e) {
        console.error(chalk.red(`[HEADHUNTER #${id}]: Grok eval failed: ${e.message}`));
    }
    return jobs.map(j => ({ ...j, matchScore: 5, verdict: 'CONSIDER', estimatedProfit: 'Unknown' }));
}

async function generateProposal(job) {
    try {
        console.log(hh(`✍️ Drafting proposal for: "${job.title}"...`));
        const content = await ask(
            `Write proposal for: ${job.title}\nDesc: ${job.description}`,
            `You are an expert freelancer. Write a personalized, concise proposal (<200 words). No "Dear Hiring Manager". Start with value.`,
            { agentName: `HEADHUNTER #${id}` }
        );
        return content;
    } catch (e) { return null; }
}

function parseEval(evalText, originalJobs) {
    const blocks = evalText.split('---').filter(b => b.trim());
    const evaluated = [];
    for (const block of blocks) {
        const ms = block.match(/MATCH:\s*(\d+)/i);
        const verdict = block.match(/VERDICT:\s*(SNIPE|CONSIDER|SKIP)/i);
        if (ms) {
            const jt = block.match(/JOB:\s*(.+?)(?:\n|MATCH)/is);
            const title = jt ? jt[1].trim() : 'Unknown';
            // Lenient matching
            const orig = originalJobs.find(r => r.title.includes(title.substring(0, 15)) || title.includes(r.title.substring(0, 15)));

            evaluated.push({
                title,
                url: orig?.url || '',
                matchScore: parseInt(ms[1]),
                verdict: verdict ? verdict[1] : 'CONSIDER',
                estimatedProfit: (block.match(/PROFIT:\s*\$?([\d,]+)/i) || [])[1] || 'Unknown',
                difficulty: (block.match(/DIFFICULTY:\s*(\d+)/i) || [])[1] || 5,
                strategy: (block.match(/STRATEGY:\s*(.+?)(?:\n|FLAGS)/is) || [])[1] || '',
                flags: (block.match(/FLAGS:\s*(.+?)(?:\n|VERDICT)/is) || [])[1] || 'None',
                timeEstimate: (block.match(/TIME:\s*(\d+)/i) || [])[1] || 'N/A',
                source: orig?.source || 'Unknown'
            });
        }
    }
    evaluated.sort((a, b) => b.matchScore - a.matchScore);
    return evaluated;
}

// ============================================================
// MAIN LOOP
// ============================================================
async function runHuntLoop() {
    try {
        console.log(HH('═══════════════════════════════════'));
        console.log(HH('🎯 HUNT CYCLE STARTING (REAL MODE)'));
        console.log(HH('═══════════════════════════════════\n'));

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

        if (!jobs || jobs.length === 0) {
            console.log(chalk.yellow(`[HEADHUNTER #${id}]: ⚠️ All sources exhausted. Retrying in 5 min.`));
            setTimeout(runHuntLoop, 300000);
            return;
        }

        const evaluatedJobs = await evaluateJobs(jobs);
        const snipes = evaluatedJobs.filter(j => j.verdict === 'SNIPE');
        const proposals = [];
        const targetSnipes = snipes.slice(0, 3);

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

function dedup(jobs) {
    const seen = new Set();
    return jobs.filter(j => {
        const k = j.title.toLowerCase().trim();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
