// Use virtual mock since @solana/web3.js isn't installed
jest.mock('@solana/web3.js', () => {
    return {
        Connection: jest.fn().mockImplementation(() => {
            return {
                getSignaturesForAddress: jest.fn(),
                getBalance: jest.fn(),
                getTransaction: jest.fn(),
                getTokenSupply: jest.fn(),
                getParsedAccountInfo: jest.fn()
            };
        }),
        PublicKey: jest.fn().mockImplementation((key) => key)
    };
}, { virtual: true });

jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });

const { Connection, PublicKey } = require('@solana/web3.js');
const scraper = require('../scraper.js');

describe('scraper.js fetchWalletAgeDays', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('fetchWalletAgeDays should return 0 when connection.getSignaturesForAddress throws an error', async () => {
        // Mock getSignaturesForAddress on the exported connection object
        scraper.connection.getSignaturesForAddress.mockRejectedValue(new Error('Mocked RPC Error'));

        const fakePubkey = new PublicKey('11111111111111111111111111111111');

        const result = await scraper.fetchWalletAgeDays(fakePubkey);

        expect(scraper.connection.getSignaturesForAddress).toHaveBeenCalledTimes(1);
        expect(result).toBe(0);
    });
});
