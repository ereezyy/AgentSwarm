// don/tests/test_hustler_concurrency.js
const assert = require('assert');
const Module = require('module');

// Mock axios
const originalRequire = Module.prototype.require;
let getCallCount = 0;
Module.prototype.require = function(path) {
    if (path === 'axios') {
        return {
            get: async () => {
                getCallCount++;
                // Simulate network delay
                await new Promise(resolve => setTimeout(resolve, 100));
                return {
                    data: {
                        solana: { usd: 100, usd_24h_change: 0 },
                        bitcoin: { usd: 50000, usd_24h_change: 0 },
                        ethereum: { usd: 3000, usd_24h_change: 0 }
                    }
                };
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

// Silence console logs during test
const originalLog = console.log;
const originalError = console.error;
// console.log = () => {};
// console.error = () => {};

// Load hustler
const hustler = require('../hustler.js');

// Restore logs
// console.log = originalLog;
// console.error = originalError;

(async () => {
    console.log('Testing watchMarkets concurrency...');

    // Call watchMarkets twice rapidly
    const p1 = hustler.watchMarkets();
    // Small delay to ensure p1 starts but hasn't finished (delay inside mock is 100ms)
    await new Promise(resolve => setTimeout(resolve, 10));
    const p2 = hustler.watchMarkets();

    await Promise.all([p1, p2]);

    console.log(`Axios called ${getCallCount} times.`);

    if (getCallCount === 1) {
        console.log('PASS: Concurrency handled correctly (single execution).');
        process.exit(0);
    } else {
        console.error(`FAIL: Multiple calls executed concurrently (${getCallCount}).`);
        process.exit(1);
    }
})();
