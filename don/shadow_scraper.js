// don/shadow_scraper.js - THE SHADOW SCRAPER (V3 CLEARNET BOOSTER)
// This script scrapes remote job listings and Web3 bounties from multiple sources without anti-bot friction.
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const query = process.argv[2] || 'AI agent development';
const maxResults = parseInt(process.argv[3]) || 15;
const isBountyMode = process.argv.includes('--bounty');

const log = (msg) => process.stderr.write(`[SHADOW_SCRAPER]: ${msg}\n`);

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
    'bounty', 'bug bounty', 'grant', 'prize', 'reward', 'bountycaster'
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
    'stablecoin', 'payment', 'automation', 'bounty', 'grant'
];

function relevanceScore(title, description, isBountyMode = false) {
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

    // Bounty specific boost
    if (isBountyMode) {
        const bountyKws = ['bounty', 'grant', 'reward', 'prize', 'bug bounty'];
        for (const kw of bountyKws) {
            if (lowerTitle.includes(kw)) score += 5;
            if (lowerDesc.includes(kw)) score += 2;
        }
    }

    return score;
}

const MIN_RELEVANCE = 2;

// ============================================================
// SOURCE 1: Superteam Earn (Public API Discovery)
// ============================================================
async function scrapeSuperteamEarn() {
    log('  📡 Scanning Superteam Earn Public API...');
    try {
        // We try the "Feed" endpoint first as it's the most likely to contain live, high-signal listings
        const url = 'https://earn.superteam.fun/api/feed/home/';
        const res = await axios.get(url, {
            headers: { 'User-Agent': UA, 'Accept': 'application/json' },
            timeout: 10000,
        });

        const rawListings = res.data.listings || res.data || [];
        const jobs = rawListings
            .filter(j => relevanceScore(j.title || j.name, j.description || '', isBountyMode) >= MIN_RELEVANCE)
            .slice(0, 10)
            .map(j => ({
                id: `superteam-${j.slug || hashStr(j.title || j.name)}`,
                title: j.title || j.name,
                url: `https://earn.superteam.fun/listings/${j.slug || j.id}`,
                description: cleanHtml(j.description || '').substring(0, 600),
                postedDate: j.created_at || new Date().toISOString(),
                budget: { type: 'bounty', amount: j.reward_amount || 'Check platform', currency: j.reward_token || 'USDC' },
                skills: (j.skills || []).map(s => s.name || s),
                category: j.type || 'Bounty',
                clientInfo: {
                    company: j.sponsor?.name || 'Unknown Sponsor',
                    source: 'Superteam Earn',
                    paymentVerified: true,
                },
                source: 'superteam',
            }));

        log(`  ✅ Superteam Earn: ${jobs.length} relevant bounties`);
        return jobs;
    } catch (e) {
        // If API fails, we could fallback to a basic clearnet scrape or log failure
        log(`  ❌ Superteam Earn failed: ${e.message}`);
        return [];
    }
}

// ============================================================
// SOURCE 2: Farcaster (Neynar API Discovery)
// ============================================================
async function scrapeFarcaster() {
    log('  📡 Scanning Farcaster (Neynar API)...');
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
        log('  ⚠️ Neynar API key missing. Skipping Farcaster scrape.');
        return [];
    }

    try {
        // Searching 'bounties' channel for recent high-signal casts
        const url = `https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=parent_url&parent_url=https://farcaster.group/bounties&limit=25`;
        const res = await axios.get(url, {
            headers: { 'api_key': apiKey, 'User-Agent': UA },
            timeout: 10000,
        });

        const casts = res.data.casts || [];
        const jobs = casts
            .filter(c => relevanceScore(c.text, '', isBountyMode) >= MIN_RELEVANCE)
            .map(c => ({
                id: `farcaster-${c.hash}`,
                title: `Cast by ${c.author.display_name}: ${c.text.substring(0, 50)}...`,
                url: `https://warpcast.com/${c.author.username}/${c.hash.substring(0, 10)}`,
                description: c.text.substring(0, 600),
                postedDate: c.timestamp,
                budget: { type: 'unknown' },
                skills: [], // Hard to extract from text reliably
                category: 'Farcaster Bounty',
                clientInfo: {
                    company: c.author.display_name,
                    source: 'Farcaster',
                    paymentVerified: false,
                },
                source: 'farcaster',
            }));

        log(`  ✅ Farcaster: ${jobs.length} relevant casts`);
        return jobs;
    } catch (e) {
        log(`  ❌ Farcaster failed: ${e.message}`);
        return [];
    }
}

// ============================================================
// SOURCE 3: ImmuneFi (Bug Bounties via RSS)
// ============================================================
async function scrapeImmuneFi() {
    log('  📡 Scanning ImmuneFi Medium Feed...');
    try {
        const res = await axios.get('https://medium.com/feed/immunefi', {
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });

        const jobs = parseRSSItems(res.data, 'immunefi')
            .filter(j => relevanceScore(j.title, j.description, isBountyMode) >= MIN_RELEVANCE)
            .slice(0, 6)
            .map(j => ({ ...j, category: 'Bug Bounty', budget: { type: 'bounty', range: 'Check platform' } }));

        log(`  ✅ ImmuneFi: ${jobs.length} relevant entries`);
        return jobs;
    } catch (e) {
        log(`  ❌ ImmuneFi failed: ${e.message}`);
        return [];
    }
}

// ============================================================
// SOURCE 4: Remotive.com API (Remote dev jobs, REAL)
// ============================================================
async function scrapeRemotive() {
    log('  📡 Scanning Remotive API...');
    try {
        const res = await axios.get('https://remotive.com/api/remote-jobs?category=software-dev&limit=20', {
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });

        const jobs = (res.data.jobs || [])
            .filter(j => relevanceScore(j.title, j.description, isBountyMode) >= MIN_RELEVANCE)
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
                clientInfo: { company: j.company_name || 'Unknown', source: 'Remotive', paymentVerified: true },
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
    log(`🔍 Shadow Scraper v4 — REAL-WORLD DOMINANCE`);
    log(`   Query filter: "${query}" | Max results: ${maxResults}`);

    const allJobs = [];

    const [superteam, farcaster, immunefi, remotive] = await Promise.allSettled([
        scrapeSuperteamEarn(),
        scrapeFarcaster(),
        scrapeImmuneFi(),
        scrapeRemotive(),
    ]);

    const sources = [
        { name: 'Superteam Earn', result: superteam },
        { name: 'Farcaster', result: farcaster },
        { name: 'ImmuneFi', result: immunefi },
        { name: 'Remotive', result: remotive },
    ];

    for (const s of sources) {
        if (s.result.status === 'fulfilled' && s.result.value.length > 0) {
            allJobs.push(...s.result.value);
        }
    }

    allJobs.sort((a, b) => relevanceScore(b.title, b.description, isBountyMode) - relevanceScore(a.title, a.description, isBountyMode));

    const final = allJobs.slice(0, maxResults);

    log(`\n📊 SHADOW SCRAPER REPORT:`);
    for (const s of sources) {
        const count = s.result.status === 'fulfilled' ? s.result.value.length : 0;
        log(`   ${count > 0 ? '✅' : '❌'} ${s.name}: ${count} jobs`);
    }

    console.log(JSON.stringify(final, null, 2));
    process.exit(final.length > 0 ? 0 : 1);
})();
