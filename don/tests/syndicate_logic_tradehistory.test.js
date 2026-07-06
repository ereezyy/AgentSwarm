// don/tests/syndicate_logic_tradehistory.test.js

process.env.NODE_ENV = 'test';

const fs = require('fs');

jest.mock('child_process', () => ({
    fork: jest.fn(),
    exec: jest.fn()
}));

jest.mock('fs', () => ({
    writeFileSync: jest.fn(),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn()
}));

jest.mock('ws', () => {
    return {
        Server: jest.fn().mockImplementation(() => ({
            on: jest.fn(),
            clients: []
        }))
    };
});

const don = require('../syndicate_logic');

describe('DonCore.loadTradeHistory', () => {
    let consoleSpy;

    beforeEach(() => {
        // Reset mocks
        fs.existsSync.mockClear();
        fs.readFileSync.mockClear();
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    test('returns empty array when file contains empty string', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue("");

        const trades = don.loadTradeHistory();

        expect(trades).toEqual([]);
    });

    test('returns empty array when JSON parse fails', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue("invalid json");

        const trades = don.loadTradeHistory();

        expect(trades).toEqual([]);
    });

    test('returns parsed JSON when file contains valid array', () => {
        fs.existsSync.mockReturnValue(true);
        const validTrades = [{ id: 1, type: "BUY" }, { id: 2, type: "SELL" }];
        fs.readFileSync.mockReturnValue(JSON.stringify(validTrades));

        const trades = don.loadTradeHistory();

        expect(trades).toEqual(validTrades);
    });

    test('returns empty array when file does not exist', () => {
        fs.existsSync.mockReturnValue(false);

        const trades = don.loadTradeHistory();

        expect(trades).toEqual([]);
    });
});
