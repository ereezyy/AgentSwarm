// Mock dotenv as it's not installed and we don't want it to run
jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });

// We use { virtual: true } because @solana/web3.js is not installed in the environment
const mockGetSignaturesForAddress = jest.fn();
jest.mock('@solana/web3.js', () => {
    return {
        Connection: jest.fn().mockImplementation(() => {
            return {
                getSignaturesForAddress: mockGetSignaturesForAddress
            };
        }),
        PublicKey: jest.fn().mockImplementation((val) => val)
    };
}, { virtual: true });

// Require after mocking
const { fetchWalletAgeDays } = require('../data/scraper');
const { Connection: MockConnection } = require('@solana/web3.js');

describe('fetchWalletAgeDays', () => {

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    it('returns 0 if no signatures are found', async () => {
        mockGetSignaturesForAddress.mockResolvedValueOnce([]);

        const age = await fetchWalletAgeDays('some-wallet-address');

        expect(mockGetSignaturesForAddress).toHaveBeenCalledWith('some-wallet-address', { limit: 1000 });
        expect(age).toBe(0);
    });

    it('returns 0 if the oldest signature has no blockTime', async () => {
        mockGetSignaturesForAddress.mockResolvedValueOnce([
            { signature: 'sig1', blockTime: 1000 },
            { signature: 'sig2' } // oldest signature without blockTime
        ]);

        const age = await fetchWalletAgeDays('some-wallet-address');

        expect(age).toBe(0);
    });

    it('returns 0 if an error is thrown', async () => {
        mockGetSignaturesForAddress.mockRejectedValueOnce(new Error('RPC Error'));

        const age = await fetchWalletAgeDays('some-wallet-address');

        expect(age).toBe(0);
    });

    it('correctly calculates and returns the wallet age in days', async () => {
        // Mock Date.now to return a specific timestamp for deterministic testing
        const now = 1672531200000; // Jan 1 2023, 00:00:00 UTC
        jest.spyOn(Date, 'now').mockReturnValue(now);

        const nowSeconds = Math.floor(now / 1000);
        const ageInDays = 5;
        const blockTime = nowSeconds - (ageInDays * 24 * 60 * 60);

        mockGetSignaturesForAddress.mockResolvedValueOnce([
            { signature: 'sig1', blockTime: nowSeconds },
            { signature: 'sig2', blockTime: blockTime } // oldest signature
        ]);

        const age = await fetchWalletAgeDays('some-wallet-address');

        expect(age).toBe(ageInDays);

        // Restore Date.now
        jest.restoreAllMocks();
    });
});
