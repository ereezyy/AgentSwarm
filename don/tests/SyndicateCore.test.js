// don/tests/SyndicateCore.test.js

// Mock dependencies
jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
jest.mock('chalk', () => {
    const chalkMock = jest.fn(x => x);
    chalkMock.red = Object.assign(jest.fn(x => x), { bold: jest.fn(x => x) });
    chalkMock.cyan = Object.assign(jest.fn(x => x), { bold: jest.fn(x => x) });
    chalkMock.yellow = Object.assign(jest.fn(x => x), { bold: jest.fn(x => x) });
    chalkMock.blue = Object.assign(jest.fn(x => x), { bold: jest.fn(x => x) });
    return chalkMock;
}, { virtual: true });

jest.mock('@solana/web3.js', () => ({
    Connection: jest.fn().mockImplementation(() => ({})),
    Keypair: {},
    Transaction: {},
    SystemProgram: {},
    PublicKey: jest.fn()
}), { virtual: true });

jest.mock('jito-ts/dist/sdk/block-engine/searcher', () => ({
    searcherClient: jest.fn()
}), { virtual: true });

jest.mock('jito-ts/dist/sdk/block-engine/types', () => ({
    Bundle: jest.fn()
}), { virtual: true });

const { SyndicateCore } = require('../SyndicateCore.js');

describe('SyndicateCore', () => {
    let core;
    let consoleLogSpy;

    beforeEach(() => {
        // Suppress console.log output during test execution
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        // Reset any mocks if necessary and instantiate a new SyndicateCore
        core = new SyndicateCore();
        // Mock reportStatus to avoid any side effects during testing
        core.reportStatus = jest.fn();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe('connectToDarkNetMarkets', () => {
        test('should establish tunnel and return true', async () => {
            const result = await core.connectToDarkNetMarkets();

            // Verify the status was reported
            expect(core.reportStatus).toHaveBeenCalledWith('CONNECTING', 'Establishing obfuscated tunnel...');

            // Verify the function returns true
            expect(result).toBe(true);
        });
    });
});
