const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock Axios
const mockAxios = {
    post: async (url, data) => {
        // Simulate network latency (50ms)
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
            data: {
                result: [
                    { signature: 'sig' + Math.random() } // Return random sig
                ]
            }
        };
    }
};

// Mock Chalk
const mockChalk = {
    red: (msg) => msg,
    cyan: (msg) => msg,
    yellow: (msg) => msg,
    green: (msg) => msg,
    gray: (msg) => msg,
    bold: (msg) => msg,
};
mockChalk.cyan.bold = (msg) => msg;
mockChalk.yellow.bold = (msg) => msg;

// Mock dependencies
Module.prototype.require = function(path) {
    if (path === 'axios') return mockAxios;
    if (path === 'dotenv') return { config: () => {} };
    if (path === 'chalk') return mockChalk;
    return originalRequire.apply(this, arguments);
};

// Set env var required by watcher
process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

// Capture console output to keep it clean
const originalLog = console.log;
console.log = () => {};

// Import Watcher
let watcher;
try {
    watcher = require('../don/watcher.js');
} catch (e) {
    // If require fails, print error
    originalLog('Error requiring watcher:', e);
    process.exit(1);
}

// Restore console
console.log = originalLog;

// Add more whales for benchmarking to see impact
if (watcher && watcher.WHALES) {
    for (let i = 0; i < 47; i++) {
        watcher.WHALES.push({ address: `WhaleFake${i}`.padEnd(44, 'x'), name: `Fake Whale ${i}` });
    }
} else {
    console.error("Could not access watcher.WHALES");
    process.exit(1);
}

async function runBenchmark() {
    console.log(`Starting benchmark with ${watcher.WHALES.length} whales...`);

    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (cb, delay) => {
        if (delay === 30000) {
            // Ignore the recursive loop call
            return;
        }
        return originalSetTimeout(cb, delay);
    };

    const start = process.hrtime();
    try {
        await watcher.trackWhales();
    } catch (e) {
        console.error("Error during benchmark:", e);
    }
    const end = process.hrtime(start);

    const durationInSeconds = end[0] + end[1] / 1e9;
    console.log(`Benchmark completed in ${durationInSeconds.toFixed(3)} seconds.`);

    // Restore setTimeout
    global.setTimeout = originalSetTimeout;
}

runBenchmark();
