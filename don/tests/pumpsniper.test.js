process.env.NODE_ENV = 'test';
process.env.SOLANA_PRIVATE_KEY = '0'.repeat(128);
process.env.SOLANA_RPC_URL = 'http://localhost';

jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn()
}), { virtual: true });
jest.mock('chalk', () => ({
    magenta: Object.assign(jest.fn((str) => str), { bold: jest.fn((str) => str) }),
    red: Object.assign(jest.fn((str) => str), { bold: jest.fn((str) => str) }),
    green: Object.assign(jest.fn((str) => str), { bold: jest.fn((str) => str) }),
    yellow: Object.assign(jest.fn((str) => str), { bold: jest.fn((str) => str) }),
    cyan: Object.assign(jest.fn((str) => str), { bold: jest.fn((str) => str) }),
    gray: Object.assign(jest.fn((str) => str), { bold: jest.fn((str) => str) })
}), { virtual: true });
jest.mock('@solana/web3.js', () => ({
    Connection: jest.fn(() => ({
        sendRawTransaction: jest.fn(() => Promise.resolve('mock_signature')),
        getRecentPrioritizationFees: jest.fn(() => Promise.resolve([{ prioritizationFee: 100000 }]))
    })),
    PublicKey: jest.fn(),
    Keypair: {
        fromSecretKey: jest.fn(() => ({
            publicKey: { toString: () => 'mock_public_key' }
        }))
    },
    VersionedTransaction: {
        deserialize: jest.fn(() => ({
            sign: jest.fn(),
            serialize: jest.fn(() => Buffer.from('mock_tx')),
            signatures: [Buffer.from('mock_sig')]
        }))
    }
}), { virtual: true });
jest.mock('bs58', () => ({
    decode: jest.fn(() => Buffer.from(new Array(64).fill(0))),
    encode: jest.fn(() => 'mock_encoded_sig')
}), { virtual: true });
jest.mock('ws', () => jest.fn(), { virtual: true });

// We need a variable we can manipulate to mock bundler.sendBundle
let mockSendBundle = jest.fn(() => Promise.resolve('mock_bundle_id'));

jest.mock('../mev_bundler', () => {
    return jest.fn().mockImplementation(() => {
        return {
            client: true,
            sendBundle: mockSendBundle
        };
    });
}, { virtual: true });

const { executeJupiterSwap } = require('../pumpsniper.js');
const axios = require('axios');
const bs58 = require('bs58');
const { Connection, VersionedTransaction } = require('@solana/web3.js');

describe('executeJupiterSwap', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSendBundle.mockClear();
        mockSendBundle.mockResolvedValue('mock_bundle_id');
    });

    test('should execute a Jupiter swap successfully with MEV protection', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                outAmount: '1000000'
            }
        });

        axios.post.mockResolvedValueOnce({
            data: {
                swapTransaction: Buffer.from('mock_swap_tx').toString('base64')
            }
        });

        const result = await executeJupiterSwap('input_mint', 'output_mint', 1000000);

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
        expect(result.mevProtected).toBe(true);
        expect(result.sig).toBe('mock_encoded_sig');
    });

    test('should fallback to public mempool if MEV bundle fails', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                outAmount: '1000000'
            }
        });

        axios.post.mockResolvedValueOnce({
            data: {
                swapTransaction: Buffer.from('mock_swap_tx').toString('base64')
            }
        });

        mockSendBundle.mockResolvedValueOnce(null);

        const result = await executeJupiterSwap('input_mint', 'output_mint', 1000000);

        expect(result.success).toBe(true);
        expect(result.mevProtected).toBe(false);
        expect(result.sig).toBe('mock_signature');
    });

    test('should retry on rate limit for quote API', async () => {
        const rateLimitError = new Error('Rate Limit');
        rateLimitError.response = { status: 429 };

        axios.get.mockRejectedValueOnce(rateLimitError)
                 .mockResolvedValueOnce({ data: { outAmount: '1000000' } });

        axios.post.mockResolvedValueOnce({
            data: {
                swapTransaction: Buffer.from('mock_swap_tx').toString('base64')
            }
        });

        const result = await executeJupiterSwap('input_mint', 'output_mint', 1000000);

        expect(axios.get).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
    });

    test('should fail if quote API fails after retries', async () => {
        const rateLimitError = new Error('Rate Limit');
        rateLimitError.response = { status: 429 };

        axios.get.mockRejectedValue(rateLimitError);

        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

        await executeJupiterSwap('input_mint', 'output_mint', 1000000);

        expect(axios.get).toHaveBeenCalledTimes(3);
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockRestore();
    });

    test('should retry on rate limit for swap API', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                outAmount: '1000000'
            }
        });

        const rateLimitError = new Error('Rate Limit');
        rateLimitError.response = { status: 429 };

        axios.post.mockRejectedValueOnce(rateLimitError)
                 .mockResolvedValueOnce({
            data: {
                swapTransaction: Buffer.from('mock_swap_tx').toString('base64')
            }
        });

        const result = await executeJupiterSwap('input_mint', 'output_mint', 1000000);

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
    });

    test('should fail if swap API fails after retries', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                outAmount: '1000000'
            }
        });

        const rateLimitError = new Error('Rate Limit');
        rateLimitError.response = { status: 429 };

        axios.post.mockRejectedValue(rateLimitError);

        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

        await executeJupiterSwap('input_mint', 'output_mint', 1000000);

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(axios.post).toHaveBeenCalledTimes(3);
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockRestore();
    });
});
