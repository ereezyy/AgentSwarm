// don/headhunter_search.js
const axios = require('axios');
const chalk = require('chalk');
const path = require('path');
const { execFile } = require('child_process');

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = function(config) {
    const { id, hh, UPWORK_TOKEN, UPWORK_API } = config;

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

function dedup(jobs) {
    const seen = new Set();
    return jobs.filter(j => {
        const k = j.title.toLowerCase().trim();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

    return {
        searchJobsAPI,
        searchRealSources,
        searchShadowNet
    };
};
