// don/shadow_scraper.js - THE SHADOW SCRAPER v3
// CLEARNET BOOSTER: Aggregates jobs from multiple open sources
// that DON'T have Cloudflare anti-bot protection.
// Outputs JSON array to stdout.
// Usage: node don/shadow_scraper.js "search query" [maxResults]

const axios = require('axios');

const query = process.argv[2] || 'AI agent development';
const maxResults = parseInt(process.argv[3]) || 15;

const log = (msg) => process.stderr.write(`[SHADOW_SCRAPER]: ${msg}\n`);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Keywords that signal Syndicate-relevant work (weighted)
const TITLE_KEYWORDS = [
    'ai', 'llm', 'gpt', 'chatbot', 'agent', 'openai',
    'python', 'node.js', 'nodejs', 'javascript', 'typescript', 'react', 'next.js', 'nextjs',
    'solana', 'blockchain', 'web3', 'crypto', 'defi', 'smart contract',
    'scraping', 'puppeteer', 'playwright',
    'fastapi', 'data pipeline', 'data engineer',
    'machine learning', 'nlp', 'rag',
    'full stack', 'fullstack', 'backend', 'frontend',
    'automation', 'devops', 'cloud',
];

const DESC_KEYWORDS = [
    'ai', 'llm', 'gpt', 'openai', 'langchain', 'embedding',
    'python', 'node', 'javascript', 'typescript', 'react',
    'solana', 'ethereum', 'blockchain', 'web3', 'defi', 'nft',
    'scraping', 'puppeteer', 'selenium',
    'fastapi', 'django', 'flask', 'express',
    'machine learning', 'deep learning', 'neural',
    'rust', 'go', 'golang',
    'docker', 'kubernetes', 'aws', 'gcp', 'azure',
    'api integration', 'microservice',
];

function relevanceScore(title, description) {
    const lowerTitle = (title || '').toLowerCase();
    const lowerDesc = (description || '').toLowerCase();
    let score = 0;
    // Title matches are worth 2x
    for (const kw of TITLE_KEYWORDS) {
        if (lowerTitle.includes(kw)) score += 2;
    }
    // Description matches are worth 1x
    for (const kw of DESC_KEYWORDS) {
        if (lowerDesc.includes(kw)) score += 1;
    }
    return score;
}

const MIN_RELEVANCE = 2;  // Must match at least 1 title keyword or 2 desc keywords

// ============================================================
// SOURCE 1: Remotive.com API (Remote dev jobs, free, no auth)
// ============================================================
async function scrapeRemotive() {
    log('  📡 Scanning Remotive API...');
    try {
        const res = await axios.get('https://remotive.com/api/remote-jobs?category=software-dev&limit=20', {
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });

        const jobs = (res.data.jobs || [])
            .filter(j => relevanceScore(j.title, j.description) >= MIN_RELEVANCE)
            .slice(0, 8)
            .map(j => ({
                id: `remotive-${j.id}`,
                title: j.title,
                url: j.url,
                description: cleanHtml(j.description || '').substring(0, 600),
                postedDate: j.publication_date || new Date().toISOString(),
                budget: { type: 'salary', range: j.salary || 'Not listed' },
                skills: (j.tags || []).slice(0, 6),
                category: j.category || 'Development',
                clientInfo: {
                    company: j.company_name || 'Unknown',
                    source: 'Remotive',
                    paymentVerified: true,
                },
                applicants: j.candidate_required_location || 'Worldwide',
                source: 'remotive',
            }));

        log(`  ✅ Remotive: ${jobs.length} relevant jobs`);
        return jobs;
    } catch (e) {
        log(`  ❌ Remotive failed: ${e.message}`);
        return [];
    }
}

// ============================================================
// SOURCE 2: Crypto Jobs List (Crypto/Web3 specific)
// ============================================================
async function scrapeCryptoJobs() {
    log('  📡 Scanning CryptoJobsList RSS...');
    try {
        const res = await axios.get('https://cryptojobslist.com/rss', {
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });

        const jobs = parseRSSItems(res.data, 'cryptojobs')
            .filter(j => relevanceScore(j.title, j.description) >= MIN_RELEVANCE)
            .slice(0, 6);

        log(`  ✅ CryptoJobsList: ${jobs.length} relevant jobs`);
        return jobs;
    } catch (e) {
        log(`  ❌ CryptoJobsList failed: ${e.message}`);
        return [];
    }
}

// ============================================================
// SOURCE 3: Arbeitnow (Remote Jobs API, free)
// ============================================================
async function scrapeArbeitnow() {
    log('  📡 Scanning Arbeitnow API...');
    try {
        const res = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });

        const jobs = (res.data.data || [])
            .filter(j => j.remote && relevanceScore(j.title + ' ' + (j.description || '')) >= MIN_RELEVANCE)
            .slice(0, 6)
            .map(j => ({
                id: `arbeitnow-${j.slug}`,
                title: j.title,
                url: j.url,
                description: cleanHtml(j.description || '').substring(0, 600),
                postedDate: j.created_at ? new Date(j.created_at * 1000).toISOString() : new Date().toISOString(),
                budget: { type: 'unknown' },
                skills: (j.tags || []).slice(0, 6),
                category: j.job_types ? j.job_types.join(', ') : 'Development',
                clientInfo: {
                    company: j.company_name || 'Unknown',
                    source: 'Arbeitnow',
                    paymentVerified: true,
                    country: j.location || 'Remote',
                },
                applicants: 0,
                source: 'arbeitnow',
            }));

        log(`  ✅ Arbeitnow: ${jobs.length} relevant jobs`);
        return jobs;
    } catch (e) {
        log(`  ❌ Arbeitnow failed: ${e.message}`);
        return [];
    }
}

// ============================================================
// SOURCE 4: Web3 Career (Blockchain/Web3 jobs)
// ============================================================
async function scrapeWeb3Career() {
    log('  📡 Scanning Web3.career RSS...');
    try {
        const res = await axios.get('https://web3.career/rss', {
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });

        const jobs = parseRSSItems(res.data, 'web3career')
            .filter(j => relevanceScore(j.title, j.description) >= MIN_RELEVANCE)
            .slice(0, 6);

        log(`  ✅ Web3.career: ${jobs.length} relevant jobs`);
        return jobs;
    } catch (e) {
        log(`  ❌ Web3.career failed: ${e.message}`);
        return [];
    }
}

// ============================================================
// SOURCE 5: Remote OK (Remote jobs, JSON API)
// ============================================================
async function scrapeRemoteOK() {
    log('  📡 Scanning RemoteOK API...');
    try {
        const res = await axios.get('https://remoteok.com/api', {
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });

        // First element is metadata, rest are jobs
        const rawJobs = Array.isArray(res.data) ? res.data.slice(1) : [];

        const jobs = rawJobs
            .filter(j => j.position && relevanceScore(j.position + ' ' + (j.description || '') + ' ' + (j.tags || []).join(' ')) >= MIN_RELEVANCE)
            .slice(0, 6)
            .map(j => ({
                id: `remoteok-${j.id || j.slug}`,
                title: j.position || j.company,
                url: j.url || `https://remoteok.com/remote-jobs/${j.slug}`,
                description: cleanHtml(j.description || '').substring(0, 600),
                postedDate: j.date || new Date().toISOString(),
                budget: j.salary_min ? { type: 'salary', range: `$${j.salary_min}-$${j.salary_max}` } : { type: 'unknown' },
                skills: (j.tags || []).slice(0, 6),
                category: 'Development',
                clientInfo: {
                    company: j.company || 'Unknown',
                    source: 'RemoteOK',
                    paymentVerified: true,
                    country: j.location || 'Remote',
                },
                applicants: 0,
                source: 'remoteok',
            }));

        log(`  ✅ RemoteOK: ${jobs.length} relevant jobs`);
        return jobs;
    } catch (e) {
        log(`  ❌ RemoteOK failed: ${e.message}`);
        return [];
    }
}


// ============================================================
// UTILITIES
// ============================================================
function parseRSSItems(xml, sourceId) {
    const jobs = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const item = m[1];
        const title = extractTag(item, 'title');
        const link = extractTag(item, 'link');
        const desc = extractTag(item, 'description');
        const pub = extractTag(item, 'pubDate');

        if (title) {
            jobs.push({
                id: `${sourceId}-${hashStr(title)}`,
                title: cleanHtml(title),
                url: link,
                description: cleanHtml(desc).substring(0, 600),
                postedDate: pub || new Date().toISOString(),
                budget: extractBudget(desc),
                skills: extractSkills(desc),
                category: 'Development',
                clientInfo: { source: sourceId, paymentVerified: false },
                applicants: 0,
                source: sourceId,
            });
        }
    }
    return jobs;
}

function extractTag(xml, t) {
    const re = new RegExp(`<${t}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${t}>|<${t}[^>]*>([^<]*)<\\/${t}>`, 'i');
    const m = re.exec(xml);
    return m ? (m[1] || m[2] || '').trim() : '';
}

function cleanHtml(h) {
    if (!h) return '';
    return h.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim();
}

function extractBudget(d) {
    if (!d) return { type: 'unknown' };
    const f = d.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
    if (f) return { type: 'fixed', amount: f[1] };
    return { type: 'unknown' };
}

function extractSkills(d) {
    if (!d) return [];
    const m = d.match(/Skills?:\s*([^\n<]+)/i);
    return m ? m[1].split(',').map(s => s.trim()).filter(Boolean).slice(0, 8) : [];
}

function hashStr(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}


// ============================================================
// MAIN: Aggregate all sources
// ============================================================
(async () => {
    log(`🔍 Shadow Scraper v3 — CLEARNET BOOSTER`);
    log(`   Query filter: "${query}" | Max results: ${maxResults}`);

    const allJobs = [];

    // Run all sources in parallel for speed
    const [remotive, cryptoJobs, arbeitnow, web3Career, remoteOK] = await Promise.allSettled([
        scrapeRemotive(),
        scrapeCryptoJobs(),
        scrapeArbeitnow(),
        scrapeWeb3Career(),
        scrapeRemoteOK(),
    ]);

    const sources = [
        { name: 'Remotive', result: remotive },
        { name: 'CryptoJobs', result: cryptoJobs },
        { name: 'Arbeitnow', result: arbeitnow },
        { name: 'Web3Career', result: web3Career },
        { name: 'RemoteOK', result: remoteOK },
    ];

    for (const s of sources) {
        if (s.result.status === 'fulfilled' && s.result.value.length > 0) {
            allJobs.push(...s.result.value);
        }
    }

    // Sort by relevance
    allJobs.sort((a, b) => relevanceScore(b.title, b.description) - relevanceScore(a.title, a.description));

    const final = allJobs.slice(0, maxResults);

    log(`\n📊 SHADOW SCRAPER REPORT:`);
    for (const s of sources) {
        const count = s.result.status === 'fulfilled' ? s.result.value.length : 0;
        log(`   ${count > 0 ? '✅' : '❌'} ${s.name}: ${count} jobs`);
    }
    log(`   🎯 Total: ${final.length} jobs (sorted by relevance)`);

    // Output clean JSON to stdout
    console.log(JSON.stringify(final, null, 2));

    process.exit(final.length > 0 ? 0 : 1);
})();
