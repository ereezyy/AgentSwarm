const { SyndicateAPI } = require('../don/syndicate_core');

describe('SyndicateAPI', () => {
    let api;
    let originalConsoleLog;
    let consoleOutput = [];

    beforeEach(() => {
        api = new SyndicateAPI();
        // Mock console.log to suppress output during tests and verify calls
        originalConsoleLog = console.log;
        consoleOutput = [];
        console.log = (msg) => consoleOutput.push(msg);
    });

    afterEach(() => {
        console.log = originalConsoleLog;
    });

    test('connect() should return true and log connection message', async () => {
        const result = await api.connect();
        expect(result).toBe(true);
        expect(consoleOutput.some(msg => msg.includes('Connected to Syndicate Backbone'))).toBe(true);
    });

    test('scanMicroMarkets() should return an array of opportunities', async () => {
        const opportunities = await api.scanMicroMarkets();
        expect(Array.isArray(opportunities)).toBe(true);
        expect(opportunities.length).toBeGreaterThan(0);

        const firstOp = opportunities[0];
        expect(firstOp).toHaveProperty('asset');
        expect(firstOp).toHaveProperty('buyPrice');
        expect(firstOp).toHaveProperty('sellPrice');
        expect(firstOp).toHaveProperty('profitMargin');
        expect(firstOp).toHaveProperty('riskFactor');
    });

    test('placeMicroOrder() should return success and profit', async () => {
        const asset = 'SOL/USDC';
        const buy = 100;
        const sell = 110;
        const result = await api.placeMicroOrder(asset, buy, sell);

        expect(result.success).toBe(true);
        expect(result.profit).toBeCloseTo((sell - buy) * 0.1);
        expect(consoleOutput.some(msg => msg.includes(`Executing micro-flip on ${asset}`))).toBe(true);
    });

    test('reportBalance() should send message if process.send exists', async () => {
        const originalProcessSend = process.send;
        const mockSend = jest.fn();
        process.send = mockSend;

        await api.reportBalance(100);

        expect(mockSend).toHaveBeenCalledWith({
            type: 'KICK_UP',
            amount: 0.01,
            source: 'ARCHITECT_GEN'
        });

        // Restore process.send
        if (originalProcessSend) {
            process.send = originalProcessSend;
        } else {
            delete process.send;
        }
    });

    test('transferFunds() should return true and log transfer', async () => {
        const target = 'wallet123';
        const amount = 500;
        const result = await api.transferFunds(target, amount);

        expect(result).toBe(true);
        expect(consoleOutput.some(msg => msg.includes(`Transferring ${amount} to ${target}`))).toBe(true);
    });
});
