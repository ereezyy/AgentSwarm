jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
jest.mock('chalk', () => {
    const chalkMock = Object.assign(jest.fn(text => text), {
        bold: jest.fn(text => text)
    });
    return {
        red: chalkMock,
        cyan: chalkMock,
        yellow: chalkMock,
        blue: chalkMock
    };
}, { virtual: true });

jest.mock('@solana/web3.js', () => ({
    Connection: jest.fn(),
    Keypair: { fromSecretKey: jest.fn() },
    Transaction: jest.fn(),
    SystemProgram: { transfer: jest.fn() },
    PublicKey: jest.fn()
}), { virtual: true });

jest.mock('jito-ts/dist/sdk/block-engine/searcher', () => ({
    searcherClient: jest.fn()
}), { virtual: true });

jest.mock('jito-ts/dist/sdk/block-engine/types', () => ({
    Bundle: jest.fn()
}), { virtual: true });

const { SyndicateCore } = require('../SyndicateCore');

describe('SyndicateCore.executeTransaction', () => {
    let core;
    let originalEnv;
    let consoleSpy;

    beforeEach(() => {
        originalEnv = process.env.LIVE_MODE;
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        core = new SyndicateCore();
        core.log = jest.fn();
        core.sendJitoBundle = jest.fn().mockResolvedValue({ success: true, bundleId: 'test-bundle' });
    });

    afterEach(() => {
        process.env.LIVE_MODE = originalEnv;
        consoleSpy.mockRestore();
    });

    test('should return { success: true, profit: 0 } when transactions array is empty', async () => {
        const result = await core.executeTransaction({ transactions: [] });
        expect(result).toEqual({ success: true, profit: 0 });
    });

    test('should return { success: true, profit: 0 } when transactions are omitted', async () => {
        const result = await core.executeTransaction({});
        expect(result).toEqual({ success: true, profit: 0 });
    });

    test('should return { success: true, profit: 0 } when transactions array is empty and liveMode is true', async () => {
        process.env.LIVE_MODE = 'true';
        const result = await core.executeTransaction({ transactions: [] });
        expect(result).toEqual({ success: true, profit: 0 });
    });

    test('should execute live mode normally when transactions are provided and jito is false', async () => {
        process.env.LIVE_MODE = 'true';
        const result = await core.executeTransaction({ type: 'SWAP', channel: 'jupiter', transactions: [{}] });
        expect(core.log).toHaveBeenCalledWith('Live execution: SWAP on jupiter', 'CRYPTO');
        expect(result).toEqual({ success: true, profit: 0 });
    });

    test('should call sendJitoBundle when liveMode is true, transactions are provided, and jito is true', async () => {
        process.env.LIVE_MODE = 'true';
        const txs = [{ id: 1 }];
        const result = await core.executeTransaction({ type: 'SWAP', jito: true, transactions: txs, tipAmount: 10000 });
        expect(core.sendJitoBundle).toHaveBeenCalledWith(txs, 10000);
        expect(result).toEqual({ success: true, bundleId: 'test-bundle' });
    });
});
