const fs = require('fs');

const file = 'don/trend_hunter.js';
let content = fs.readFileSync(file, 'utf8');

const original = `async function processDexTrends(settings, callLog) {
    let newCalls = 0;
    // --- DEXSCREENER INTEGRATION ---
    console.log(th(\`🔍 Scanning DexScreener for fresh trends...\`));
    const dexTrends = await scanDexScreener();
    for (const trend of dexTrends) {
        if (callLog.calls.some(c => c.hash === trend.address)) continue;

        // Auto-Generate a "Call" from Dex Data
        const call = {
            id: \`DEX-\${Date.now().toString(36).toUpperCase()}\`,
            hash: trend.address, // Dedup by address
            caller: 'DexScreener',
            callerTier: 'S',
            text: \`Trending on DexScreener: $\${trend.ticker} | Liq: $\${trend.liquidity} | Vol: $\${trend.volume}\`,
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

        console.log(TH(\`🚨 DEXSCREENER TREND!\`));
        console.log(th(\`  Token: $\${trend.ticker}\`));
        console.log(th(\`  Address: \${trend.address}\`));
        console.log(th(\`  Liquidity: $\${trend.liquidity.toLocaleString()}\`));

        // Direct Snipe Route
        if (settings.autoSnipe && process.send) {
            console.log(th(\`  ⚡ Routing to Sniper...\`));
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
    return newCalls;
}`;

const replacement = `async function fetchDexTrends() {
    console.log(th(\`🔍 Scanning DexScreener for fresh trends...\`));
    return await scanDexScreener();
}

function normalizeDexTrendToCall(trend) {
    return {
        id: \`DEX-\${Date.now().toString(36).toUpperCase()}\`,
        hash: trend.address, // Dedup by address
        caller: 'DexScreener',
        callerTier: 'S',
        text: \`Trending on DexScreener: $\${trend.ticker} | Liq: $\${trend.liquidity} | Vol: $\${trend.volume}\`,
        addresses: [trend.address],
        analysis: { isCall: true, confidence: 0.85, urgency: 'HIGH', sentiment: 'BULLISH' },
        ageMinutes: 0,
        engagement: { likes: 0, retweets: 0 },
        timestamp: new Date().toISOString(),
        status: 'DETECTED',
    };
}

function processDexCall(trend, call, settings, callLog) {
    callLog.calls.push(call);
    callLog.stats.total++;

    console.log(TH(\`🚨 DEXSCREENER TREND!\`));
    console.log(th(\`  Token: $\${trend.ticker}\`));
    console.log(th(\`  Address: \${trend.address}\`));
    console.log(th(\`  Liquidity: $\${trend.liquidity.toLocaleString()}\`));

    // Direct Snipe Route
    if (settings.autoSnipe && process.send) {
        console.log(th(\`  ⚡ Routing to Sniper...\`));
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

async function processDexTrends(settings, callLog) {
    let newCalls = 0;
    const dexTrends = await fetchDexTrends();

    for (const trend of dexTrends) {
        if (callLog.calls.some(c => c.hash === trend.address)) continue;

        const call = normalizeDexTrendToCall(trend);
        processDexCall(trend, call, settings, callLog);
        newCalls++;
    }
    return newCalls;
}`;

if (content.includes(original)) {
    content = content.replace(original, replacement);
    fs.writeFileSync(file, content);
    console.log('Successfully patched trend_hunter.js');
} else {
    console.error('Could not find original code block to replace');
    process.exit(1);
}
