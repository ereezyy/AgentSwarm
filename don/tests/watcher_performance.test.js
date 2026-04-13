
// Mock modules before they are required by watcher
jest.mock('axios', () => ({
    post: jest.fn()
}), { virtual: true });

jest.mock('chalk', () => ({
    cyan: Object.assign((s) => s, { bold: (s) => s }),
    red: (s) => s,
    green: (s) => s,
    yellow: Object.assign((s) => s, { bold: (s) => s }),
    gray: (s) => s,
    bold: (s) => s
}), { virtual: true });

jest.mock('dotenv', () => ({
    config: jest.fn()
}), { virtual: true });

process.env.SOLANA_RPC_URL = 'http://mock-rpc.com';

const { WHALES, trackWhales } = require('../watcher');
const axios = require('axios');

// Mock process.send
process.send = jest.fn();

describe('Watcher Performance Benchmark', () => {
    let originalSetTimeout;
    let timeoutCalls = [];

    beforeAll(() => {
        originalSetTimeout = global.setTimeout;
        global.setTimeout = (fn, ms) => {
            timeoutCalls.push(ms);
            // Don't actually wait or call fn to avoid recursion in trackWhales
        };
    });

    afterAll(() => {
        global.setTimeout = originalSetTimeout;
    });

    test('measure trackWhales execution time (mocked)', async () => {
        axios.post.mockResolvedValue({ data: { result: [] } });

        // Mock setTimeout to call the function immediately
        const realSetTimeout = global.setTimeout;
        global.setTimeout = (fn, ms) => {
            if (ms === 60000) return; // Don't call the recursive trackWhales call
            fn();
        };

        const start = Date.now();
        await trackWhales();
        const end = Date.now();

        console.log(`Execution time: ${end - start}ms`);

        global.setTimeout = realSetTimeout;
    }, 10000);
});
