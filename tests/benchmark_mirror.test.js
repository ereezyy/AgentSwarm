const axios = require('axios');
const path = require('path');
const fs = require('fs');

// We need to set the RPC URL env var for the module to pick it up,
// though we mock axios so it doesn't matter much.
process.env.SOLANA_RPC_URL = 'http://mock-rpc';

// Mock fs to avoid reading real scorecard
jest.mock('fs');
fs.existsSync.mockReturnValue(false);
fs.readFileSync.mockReturnValue('{}');
fs.writeFileSync.mockImplementation(() => {});
fs.mkdirSync.mockImplementation(() => {});
fs.resolve = path.resolve;
fs.join = path.join;

// Mock axios
jest.mock('axios');

// Import the module under test
const mirrorProtocol = require('../don/mirror_protocol');

describe('Mirror Protocol Performance', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset fs mocks if needed, though they are static here
        fs.existsSync.mockReturnValue(false);
    });

    test('analyzeWalletPnL execution time baseline', async () => {
        // Setup Axios Mock
        axios.post.mockImplementation(async (url, data) => {
            await new Promise(r => setTimeout(r, 50)); // 50ms latency

            if (data.method === 'getSignaturesForAddress') {
                return {
                    data: {
                        result: Array(10).fill(0).map((_, i) => ({
                            signature: `sig${i}`.padEnd(88, '0'),
                            blockTime: Date.now() / 1000
                        }))
                    }
                };
            }

            if (data.method === 'getTransaction') {
                 return {
                    data: {
                        result: {
                            meta: {
                                preBalances: [1000000000],
                                postBalances: [1050000000] // +0.05 SOL
                            },
                            transaction: {
                                message: {
                                    accountKeys: [{ pubkey: 'whaleAddress' }]
                                }
                            }
                        }
                    }
                };
            }

            // Handle batch request (for future)
            if (Array.isArray(data)) {
                return {
                    data: data.map(req => ({
                        id: req.id,
                        result: {
                             meta: {
                                preBalances: [1000000000],
                                postBalances: [1050000000]
                            },
                            transaction: {
                                message: {
                                    accountKeys: [{ pubkey: 'whaleAddress' }]
                                }
                            }
                        }
                    }))
                };
            }

            return { data: { result: {} } };
        });

        console.log('Starting benchmark...');
        const start = Date.now();
        await mirrorProtocol.analyzeWalletPnL('whaleAddress');
        const duration = Date.now() - start;

        console.log(`Execution time: ${duration}ms`);

        // Assertions to ensure logic ran
        expect(axios.post).toHaveBeenCalled();
    });
});
