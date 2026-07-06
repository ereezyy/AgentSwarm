jest.mock('axios', () => ({
    get: jest.fn()
}), { virtual: true });

jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });

jest.mock('chalk', () => ({
    cyan: Object.assign(jest.fn(text => text), { bold: jest.fn(text => text) }),
    red: jest.fn(text => text),
    yellow: jest.fn(text => text),
    green: jest.fn(text => text),
    magenta: jest.fn(text => text),
    gray: jest.fn(text => text)
}), { virtual: true });

jest.mock('../brain', () => ({
    ask: jest.fn(),
    GlobalMemory: {
        addMemory: jest.fn(),
        reflect: jest.fn()
    }
}), { virtual: true });

describe('Hustler Market Intelligence', () => {
    let hustler;
    let originalSend;
    let axiosMock;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
        originalSend = process.send;
        process.send = jest.fn();

        axiosMock = require('axios');
        axiosMock.get.mockClear();

        hustler = require('../hustler.js');
    });

    afterEach(() => {
        process.send = originalSend;
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('should lock watchMarkets to prevent concurrent executions', async () => {
        axiosMock.get.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({
            data: {
                solana: { usd: 100, usd_24h_change: 1 },
                bitcoin: { usd: 50000, usd_24h_change: 2 },
                ethereum: { usd: 3000, usd_24h_change: 3 }
            }
        }), 100)));

        const p1 = hustler.watchMarkets();
        const p2 = hustler.watchMarkets(); // Should exit early because isWatching = true

        jest.advanceTimersByTime(100);
        await Promise.all([p1, p2]);

        expect(axiosMock.get).toHaveBeenCalledTimes(1);
    });

    it('should trigger process.send with INTEL_DATA and MARKET_DATA on successful API call', async () => {
        axiosMock.get.mockResolvedValue({
            data: {
                solana: { usd: 105, usd_24h_change: 5 },
                bitcoin: { usd: 51000, usd_24h_change: 2 },
                ethereum: { usd: 3100, usd_24h_change: 3 }
            }
        });

        await hustler.watchMarkets();

        expect(process.send).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'INTEL_DATA',
                source: 'HUSTLER_MARKET'
            })
        );

        expect(process.send).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'MARKET_DATA',
                data: expect.objectContaining({
                    solana: expect.objectContaining({ price: 105, change24h: 5 }),
                    bitcoin: expect.objectContaining({ price: 51000, change24h: 2 }),
                    ethereum: expect.objectContaining({ price: 3100 })
                })
            })
        );
    });

    it('should calculate short-term trends after enough sequential calls', async () => {
        const prices = [100, 102, 105, 110, 120];

        // Populate the history to reach length of 5
        for (let i = 0; i < prices.length; i++) {
            axiosMock.get.mockResolvedValueOnce({
                data: {
                    solana: { usd: prices[i], usd_24h_change: 1 },
                    bitcoin: { usd: 50000, usd_24h_change: 1 },
                    ethereum: { usd: 3000, usd_24h_change: 1 }
                }
            });
            await hustler.watchMarkets();
            // Need to clear the watch timeout to call it again without overlapping
            jest.clearAllTimers();
        }

        // On the 5th call, trend should be calculated (120 - 100) / 100 * 100 = 20
        expect(process.send).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'MARKET_DATA',
                data: expect.objectContaining({
                    solana: expect.objectContaining({ price: 120, change24h: 1, trend: 20 })
                })
            })
        );
    });

    it('should handle rate limit errors and increase backoffMs', async () => {
        // Force a 429 error
        const error429 = new Error('Rate Limited');
        error429.response = { status: 429 };
        axiosMock.get.mockRejectedValueOnce(error429);

        // DexScreener fallback should work
        axiosMock.get.mockResolvedValueOnce({
            data: [{ priceUsd: '110', priceChange: { h24: 10 }, volume: { h24: 1000000 } }]
        });

        await hustler.watchMarkets();

        // Should have called CoinGecko then DexScreener
        expect(axiosMock.get).toHaveBeenCalledTimes(2);

        // Check if INTEL_DATA was sent from the fallback
        expect(process.send).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'INTEL_DATA',
                source: 'HUSTLER_MARKET'
            })
        );

        // Advance timers by backoff (which is INITIAL = 60000 ms)
        axiosMock.get.mockResolvedValueOnce({
            data: {
                solana: { usd: 115, usd_24h_change: 5 },
                bitcoin: { usd: 52000, usd_24h_change: 2 },
                ethereum: { usd: 3200, usd_24h_change: 3 }
            }
        });

        await jest.advanceTimersByTimeAsync(60000);

        // Next watchMarkets call should happen
        expect(axiosMock.get).toHaveBeenCalledTimes(3);
    });
});
