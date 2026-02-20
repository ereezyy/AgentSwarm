// don/trend_hunter.js - THE TREND HUNTER (Social-to-Snipe Pipeline)
// Scans X/Twitter for trusted influencer calls → extracts contract addresses → routes to Sniper
// Revenue: Captures "call channel" alpha before the crowd reacts.
// Flow: Shadow scans X → Parses CA → Oracle audit → Sniper auto-buys

const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'TrendHunter';
const { askJSON } = require('./brain');
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// File paths
const CALLS_PATH = path.resolve(__dirname, '../missions/alpha_calls.json');
const SOURCES_PATH = path.resolve(__dirname, '../missions/trusted_callers.json');
const missionsDir = path.join(__dirname, '../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

const TH = (msg) => chalk.hex('#00FF88').bold(`[TREND HUNTER #${id}]: ${msg}`);
const th = (msg) => chalk.hex('#00FF88')(`[TREND HUNTER #${id}]: ${msg}`);

// ── MOLTBOOK SCOURING (Alpha from the Source) ──
const { scourMoltbook } = require('./moltbook');

setInterval(async () => {
    try {
        const intel = await scourMoltbook();
        if (intel) {
            console.log(chalk.magenta(intel));
            if (process.send) {
                process.send({
                    type: 'AGENT_COMMS',
                    from: 'TREND HUNTER',
                    msg: intel,
                    timestamp: new Date().toISOString()
                });
            }
        }
    } catch (e) {
        console.error(chalk.red(`[TREND HUNTER]: Moltbook scour failed: ${e.message}`));
    }
}, 300000); // Check every 5 minutes

console.log(TH('🎯 Trend Hunter ONLINE. Scanning for alpha calls...'));

// ============================================================
// TRUSTED CALLERS — Influencer watchlist
// ============================================================
function loadCallers() {
    try {
        if (fs.existsSync(SOURCES_PATH)) return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
    } catch { }
    // Default trusted callers (Solana ecosystem)
    const defaults = {
        callers: [
            { handle: 'blknoiz06', platform: 'twitter', tier: 'S', hitRate: 0.72, notes: 'Solana OG caller' },
            { handle: 'MustStopMurad', platform: 'twitter', tier: 'S', hitRate: 0.68, notes: 'Memecoin specialist' },
            { handle: 'CryptoGodJohn', platform: 'twitter', tier: 'A', hitRate: 0.55, notes: 'High volume caller' },
            { handle: 'deaborysov', platform: 'twitter', tier: 'A', hitRate: 0.60, notes: 'DeFi alpha' },
            { handle: 'inversebrah', platform: 'twitter', tier: 'A', hitRate: 0.58, notes: 'CT degenerate' },
        ],
        settings: {
            minTier: 'A',           // Minimum tier to auto-snipe
            minConfidence: 0.6,     // Minimum AI analysis confidence
            maxAgeMinutes: 15,      // Ignore calls older than 15 min
            autoSnipe: true,        // Auto-route to Sniper
            auditFirst: true,       // Run Oracle audit before sniping
        }
    };
    fs.writeFileSync(SOURCES_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
}

function saveCallers(data) {
    fs.writeFileSync(SOURCES_PATH, JSON.stringify(data, null, 2));
}

// ============================================================
// CALL LOG — Track all detected alpha calls
// ============================================================
function loadCalls() {
    try {
        if (fs.existsSync(CALLS_PATH)) return JSON.parse(fs.readFileSync(CALLS_PATH, 'utf8'));
    } catch { }
    return { calls: [], stats: { total: 0, sniped: 0, profitable: 0, rugged: 0 } };
}

function saveCalls(data) {
    fs.writeFileSync(CALLS_PATH, JSON.stringify(data, null, 2));
}

// ============================================================
// CONTRACT ADDRESS EXTRACTION
// ============================================================
const CA_PATTERNS = [
    /[1-9A-HJ-NP-Za-km-z]{32,44}/g,                    // Solana base58 address
    /0x[a-fA-F0-9]{40}/g,                                // EVM address
    /pump\.fun\/([1-9A-HJ-NP-Za-km-z]{32,44})/g,        // pump.fun URL
    /dexscreener\.com\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})/g,  // dexscreener
    /birdeye\.so\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/g,        // birdeye
];

// Known non-token addresses to filter out
const IGNORE_ADDRESSES = new Set([
    'So11111111111111111111111111111111111111112',   // Wrapped SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  // USDT
]);

function extractContractAddresses(text) {
    const addresses = new Set();
    for (const pattern of CA_PATTERNS) {
        const matches = text.matchAll(new RegExp(pattern.source, 'g'));
        for (const match of matches) {
            const addr = match[1] || match[0];
            // Filter: must be 32-44 chars, not a known stable, not all digits
            if (addr.length >= 32 && addr.length <= 44 && !IGNORE_ADDRESSES.has(addr) && !/^\d+$/.test(addr)) {
                addresses.add(addr);
            }
        }
    }
    return [...addresses];
}

// ============================================================
// TWITTER/X SCANNING via RapidAPI
// ============================================================
async function scanCallerTweets(handle) {
    if (!RAPIDAPI_KEY) return [];

    try {
        // Use Twitter API via RapidAPI to get recent tweets
        const resp = await axios.get('https://twitter241.p.rapidapi.com/user-tweets', {
            params: { user: handle, count: '5' },
            headers: {
                'x-rapidapi-host': 'twitter241.p.rapidapi.com',
                'x-rapidapi-key': RAPIDAPI_KEY
            },
            timeout: 15000,
        });

        const tweets = resp.data?.result?.timeline?.instructions?.[0]?.entries || [];
        const results = [];
        const now = Date.now();

        for (const entry of tweets) {
            const tweet = entry?.content?.itemContent?.tweet_results?.result?.legacy;
            if (!tweet) continue;

            const tweetTime = new Date(tweet.created_at).getTime();
            const ageMinutes = (now - tweetTime) / 60000;

            results.push({
                text: tweet.full_text || '',
                ageMinutes: Math.round(ageMinutes),
                likes: tweet.favorite_count || 0,
                retweets: tweet.retweet_count || 0,
                handle,
            });
        }

        return results;
    } catch (e) {
        console.log(chalk.yellow(`[TREND HUNTER]: Failed to fetch @${handle}: ${e.message}`));
        return [];
    }
}
// ============================================================
// DEXSCREENER SCANNING (Real-time Trends)
// ============================================================
async function scanDexScreener() {
    try {
        // Fetch trending pairs on Solana
        const resp = await axios.get('https://api.dexscreener.com/latest/dex/search/?q=solana', { timeout: 10000 });
        const pairs = resp.data?.pairs || [];
        const results = [];

        for (const pair of pairs) {
            // Filter for quality:
            // 1. Must be on Solana
            // 2. Liquidity > $1,000
            // 3. Volume > $1,000 (24h)
            // 4. Age < 24h (approx)
            if (pair.chainId !== 'solana') continue;
            if (pair.liquidity?.usd < 1000) continue;
            if (pair.volume?.h24 < 1000) continue;

            const ageHours = (Date.now() - pair.pairCreatedAt) / 3600000;
            if (ageHours > 24) continue;

            results.push({
                ticker: pair.baseToken.symbol,
                address: pair.baseToken.address,
                price: pair.priceUsd,
                liquidity: pair.liquidity.usd,
                volume: pair.volume.h24,
                url: pair.url
            });
        }
        return results.slice(0, 5); // Return top 5
    } catch (e) {
        console.log(chalk.yellow(`[TREND HUNTER]: DexScreener scan failed: ${e.message}`));
        return [];
    }
}

// ============================================================
// AI CALL ANALYSIS — Determine if a tweet is an "alpha call"
// ============================================================
async function analyzeCall(tweet, caller) {
    try {
        const result = await askJSON(
            `Tweet by @${caller.handle} (Tier: ${caller.tier}, Hit Rate: ${caller.hitRate}): "${tweet.text}"`,
            `You analyze crypto Twitter posts to determine if they contain an actionable trading call. Return JSON only.

Criteria for an alpha call:
- Contains a specific token/contract address or ticker
- Indicates bullish sentiment (buying, aping, "this will moon")
- From a known caller (not just retweeting)
- Fresh (not discussing old positions)

Return: { "isCall": true/false, "confidence": 0.0-1.0, "ticker": "string or null", "sentiment": "BULLISH/BEARISH/NEUTRAL", "urgency": "HIGH/MEDIUM/LOW", "reason": "brief explanation" }`,
            { agentName: `TREND_HUNTER #${id}` }
        );
        if (result && typeof result.isCall !== 'undefined') return result;
        return simpleCallAnalysis(tweet, caller);
    } catch (e) {
        return simpleCallAnalysis(tweet, caller);
    }
}

function simpleCallAnalysis(tweet, caller) {
    const text = tweet.text.toLowerCase();
    const bullishKeywords = ['ape', 'aped', 'aping', 'buy', 'buying', 'moon', 'pump', 'gem', 'bullish', 'sending', 'loaded', 'bag', 'entry', 'degen', '100x', '10x', 'launch'];
    const bearishKeywords = ['sell', 'dump', 'rug', 'scam', 'exit', 'short'];

    let bullScore = 0, bearScore = 0;
    for (const kw of bullishKeywords) if (text.includes(kw)) bullScore++;
    for (const kw of bearishKeywords) if (text.includes(kw)) bearScore++;

    const hasCA = extractContractAddresses(tweet.text).length > 0;
    const confidence = Math.min((bullScore * 0.15) + (hasCA ? 0.3 : 0) + (caller.hitRate * 0.2), 1.0);

    return {
        isCall: bullScore > bearScore && (bullScore >= 2 || hasCA),
        confidence,
        ticker: null,
        sentiment: bullScore > bearScore ? 'BULLISH' : bearScore > bullScore ? 'BEARISH' : 'NEUTRAL',
        urgency: hasCA && bullScore >= 2 ? 'HIGH' : bullScore >= 1 ? 'MEDIUM' : 'LOW',
        reason: `Keywords: ${bullScore} bullish, ${bearScore} bearish. CA detected: ${hasCA}`,
    };
}

// ============================================================
// MAIN SCAN LOOP
// ============================================================
async function runScanLoop() {
    const callerData = loadCallers();
    const settings = callerData.settings;
    const callLog = loadCalls();

    console.log(th(`🔍 Scanning ${callerData.callers.length} trusted callers...`));

    let newCalls = 0;

    for (const caller of callerData.callers) {
        // Skip low-tier callers
        if (settings.minTier === 'S' && caller.tier !== 'S') continue;

        const tweets = await scanCallerTweets(caller.handle);
        if (tweets.length === 0) continue;

        for (const tweet of tweets) {
            // Skip old tweets
            if (tweet.ageMinutes > settings.maxAgeMinutes) continue;

            // Check if already processed
            const tweetHash = Buffer.from(tweet.text.substring(0, 50)).toString('base64');
            if (callLog.calls.some(c => c.hash === tweetHash)) continue;

            // Extract contract addresses
            const addresses = extractContractAddresses(tweet.text);

            // Analyze with AI
            const analysis = await analyzeCall(tweet, caller);

            if (!analysis.isCall || analysis.confidence < settings.minConfidence) continue;

            // New alpha call detected!
            const call = {
                id: `CALL-${Date.now().toString(36).toUpperCase()}`,
                hash: tweetHash,
                caller: caller.handle,
                callerTier: caller.tier,
                text: tweet.text.substring(0, 200),
                addresses,
                analysis,
                ageMinutes: tweet.ageMinutes,
                engagement: { likes: tweet.likes, retweets: tweet.retweets },
                timestamp: new Date().toISOString(),
                status: 'DETECTED',
            };

            callLog.calls.push(call);
            callLog.stats.total++;
            newCalls++;

            console.log(TH(`🚨 ALPHA CALL DETECTED!`));
            console.log(th(`  Caller: @${caller.handle} (${caller.tier}-Tier)`));
            console.log(th(`  Text: "${tweet.text.substring(0, 80)}..."`));
            console.log(th(`  CAs: ${addresses.length > 0 ? addresses.join(', ') : 'None extracted'}`));
            console.log(th(`  Confidence: ${(analysis.confidence * 100).toFixed(0)}% | Urgency: ${analysis.urgency}`));

            // Route to Sniper if auto-snipe enabled and CA found
            if (settings.autoSnipe && addresses.length > 0 && process.send) {
                for (const ca of addresses) {
                    // Request Oracle audit first if configured
                    if (settings.auditFirst) {
                        console.log(th(`  🔍 Requesting Oracle audit on ${ca.substring(0, 8)}...`));
                        process.send({
                            type: 'AUDIT_TOKEN',
                            mint: ca,
                            source: 'TREND_HUNTER',
                            caller: caller.handle,
                            callId: call.id,
                        });
                    } else {
                        // Direct snipe
                        console.log(th(`  ⚡ Routing to Sniper: ${ca.substring(0, 8)}...`));
                        process.send({
                            type: 'COPY_TRADE_SIGNAL',
                            mint: ca,
                            whale: `@${caller.handle}`,
                            confidence: analysis.confidence,
                            source: 'TREND_HUNTER',
                        });
                    }
                }
                call.status = settings.auditFirst ? 'AUDITING' : 'SNIPED';
                callLog.stats.sniped++;
            }

            // Notify The Don
            if (process.send) {
                process.send({
                    type: 'INTEL_DATA',
                    data: `TREND HUNTER: @${caller.handle} called ${addresses.length > 0 ? addresses[0].substring(0, 8) + '...' : analysis.ticker || 'unknown'}. Confidence: ${(analysis.confidence * 100).toFixed(0)}%. Urgency: ${analysis.urgency}`,
                    source: 'TREND_HUNTER'
                });
                process.send({
                    type: 'SIREN_SPEAK',
                    text: `Trend Hunter here. Alpha call from ${caller.handle}. ${analysis.urgency} urgency. ${addresses.length > 0 ? 'Contract address detected. Routing.' : 'No contract address found.'}`
                });
            }
        }

        // Rate limit: wait between callers
        await new Promise(r => setTimeout(r, 2000));
    }

    // --- DEXSCREENER INTEGRATION ---
    console.log(th(`🔍 Scanning DexScreener for fresh trends...`));
    const dexTrends = await scanDexScreener();
    for (const trend of dexTrends) {
        if (callLog.calls.some(c => c.hash === trend.address)) continue;

        // Auto-Generate a "Call" from Dex Data
        const call = {
            id: `DEX-${Date.now().toString(36).toUpperCase()}`,
            hash: trend.address, // Dedup by address
            caller: 'DexScreener',
            callerTier: 'S',
            text: `Trending on DexScreener: $${trend.ticker} | Liq: $${trend.liquidity} | Vol: $${trend.volume}`,
            addresses: [trend.address],
            analysis: { isCall: true, confidence: 0.85, urgency: 'HIGH', sentiment: 'BULLISH' },
            ageMinutes: 0,
            engagement: { likes: 0, retweets: 0 },
            timestamp: new Date().toISOString(),
            status: 'DETECTED',
        };

        callLog.calls.push(call);
        callLog.stats.total++;
        newCalls++;

        console.log(TH(`🚨 DEXSCREENER TREND!`));
        console.log(th(`  Token: $${trend.ticker}`));
        console.log(th(`  Address: ${trend.address}`));
        console.log(th(`  Liquidity: $${trend.liquidity.toLocaleString()}`));

        // Direct Snipe Route
        if (settings.autoSnipe && process.send) {
            console.log(th(`  ⚡ Routing to Sniper...`));
            process.send({
                type: 'COPY_TRADE_SIGNAL',
                mint: trend.address,
                whale: 'DexScreener', // Mock whale source
                confidence: 0.85,
                source: 'TREND_HUNTER_DEX',
            });
            call.status = 'SNIPED';
            callLog.stats.sniped++;
        }
    }

    saveCalls(callLog);

    if (newCalls > 0) {
        console.log(TH(`✅ Scan complete. ${newCalls} new calls detected.`));
    } else {
        console.log(th(`Scan complete. No new calls. Monitoring...`));
    }

    // Scan every 2 minutes (fast enough to catch calls, slow enough for rate limits)
    setTimeout(runScanLoop, 120000);
}

// ============================================================
// IPC MESSAGE HANDLER
// ============================================================
process.on('message', (msg) => {
    switch (msg.type) {
        case 'SCAN_NOW':
            console.log(th('⚡ Manual scan triggered'));
            runScanLoop();
            break;

        case 'ADD_CALLER':
            if (msg.handle) {
                const data = loadCallers();
                if (!data.callers.find(c => c.handle === msg.handle)) {
                    data.callers.push({
                        handle: msg.handle,
                        platform: msg.platform || 'twitter',
                        tier: msg.tier || 'B',
                        hitRate: msg.hitRate || 0.5,
                        notes: msg.notes || 'Added via CLI',
                    });
                    saveCallers(data);
                    console.log(TH(`➕ Added @${msg.handle} to caller watchlist (${msg.tier || 'B'}-Tier)`));
                }
            }
            break;

        case 'REMOVE_CALLER':
            if (msg.handle) {
                const cd = loadCallers();
                cd.callers = cd.callers.filter(c => c.handle !== msg.handle);
                saveCallers(cd);
                console.log(th(`➖ Removed @${msg.handle} from watchlist`));
            }
            break;

        case 'AUDIT_RESULT':
            // Response from Oracle — decide whether to snipe
            if (msg.source === 'TREND_HUNTER' && msg.callId) {
                const log = loadCalls();
                const call = log.calls.find(c => c.id === msg.callId);
                if (call) {
                    if (msg.safe) {
                        console.log(TH(`✅ Oracle approved ${msg.mint}. Routing to Sniper.`));
                        call.status = 'APPROVED_SNIPED';
                        if (process.send) {
                            process.send({
                                type: 'COPY_TRADE_SIGNAL',
                                mint: msg.mint,
                                whale: call.caller,
                                confidence: call.analysis.confidence,
                                source: 'TREND_HUNTER_AUDITED',
                            });
                        }
                    } else {
                        console.log(chalk.red(`[TREND HUNTER]: ❌ Oracle REJECTED ${msg.mint}. Skipping.`));
                        call.status = 'REJECTED';
                    }
                    saveCalls(log);
                }
            }
            break;

        case 'TREND_STATUS':
            const calls = loadCalls();
            const callers = loadCallers();
            console.log(TH(`📊 Trend Hunter Status:`));
            console.log(th(`  Callers: ${callers.callers.length}`));
            console.log(th(`  Total Calls: ${calls.stats.total}`));
            console.log(th(`  Sniped: ${calls.stats.sniped}`));
            console.log(th(`  Profitable: ${calls.stats.profitable}`));
            console.log(th(`  Rugged: ${calls.stats.rugged}`));
            break;

        case 'MARKET_CHECK':
            // Can piggyback on Hustler market checks
            break;
    }
});

// ============================================================
// BOOT
// ============================================================
console.log(TH('🎯 Starting scan loop...'));
setTimeout(runScanLoop, 5000); // Initial delay for IPC setup
setInterval(() => { }, 100000);
