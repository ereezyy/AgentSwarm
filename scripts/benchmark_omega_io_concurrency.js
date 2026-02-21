const fs = require('fs');
const path = require('path');

const TREASURY_PATH = path.resolve(__dirname, 'temp_treasury_benchmark.json');

// Setup dummy treasury (same as before)
const dummyData = {
    balances: { vault: 1000.5, reinvest: 500.25, rnd: 200.1, pending: 50.0 },
    history: Array(2000).fill({ id: 'ALLOC-TEST', timestamp: new Date().toISOString() }) // Larger file
};
fs.writeFileSync(TREASURY_PATH, JSON.stringify(dummyData, null, 2));

function loadTreasurySync() {
    try {
        if (fs.existsSync(TREASURY_PATH)) return JSON.parse(fs.readFileSync(TREASURY_PATH, 'utf8'));
    } catch { }
    return {};
}

async function loadTreasuryAsync() {
    try {
        const data = await fs.promises.readFile(TREASURY_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    return {};
}

function startHeartbeat() {
    let beats = 0;
    const interval = setInterval(() => {
        beats++;
    }, 1); // Very fast interval to catch blocking
    return {
        stop: () => {
            clearInterval(interval);
            return beats;
        }
    };
}

async function runBenchmark() {
    const iterations = 50;

    console.log('--- Synchronous Test ---');
    const syncHeart = startHeartbeat();
    const startSync = Date.now();
    for (let i = 0; i < iterations; i++) {
        loadTreasurySync();
    }
    const endSync = Date.now();
    const syncBeats = syncHeart.stop();
    console.log(`Sync Duration: ${endSync - startSync}ms`);
    console.log(`Heartbeats during Sync: ${syncBeats}`);

    // Give the event loop a breath
    await new Promise(r => setTimeout(r, 100));

    console.log('\n--- Asynchronous Test ---');
    const asyncHeart = startHeartbeat();
    const startAsync = Date.now();
    for (let i = 0; i < iterations; i++) {
        await loadTreasuryAsync();
    }
    const endAsync = Date.now();
    const asyncBeats = asyncHeart.stop();
    console.log(`Async Duration: ${endAsync - startAsync}ms`);
    console.log(`Heartbeats during Async: ${asyncBeats}`);

    // Cleanup
    if (fs.existsSync(TREASURY_PATH)) fs.unlinkSync(TREASURY_PATH);
}

runBenchmark();
