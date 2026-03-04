process.env.NODE_ENV = 'test';

const chalk = require('chalk');

jest.mock('chalk', () => ({
    cyan: Object.assign(jest.fn((text) => text), { bold: jest.fn((text) => text) }),
    magenta: jest.fn((text) => text),
    green: jest.fn((text) => text),
    yellow: jest.fn((text) => text),
    red: jest.fn((text) => text)
}), { virtual: true });

jest.mock('dotenv', () => ({
    config: jest.fn()
}), { virtual: true });

jest.mock('child_process', () => ({
    exec: jest.fn()
}), { virtual: true });

jest.mock('axios', () => ({
    get: jest.fn()
}), { virtual: true });

describe('Multichain Sniper', () => {
    jest.useFakeTimers();
    let originalConsoleLog;
    let originalConsoleError;
    let originalProcessSend;
    let originalProcessOn;
    let originalProcessArgv;
    let mockProcessOnHandlers = {};

    beforeAll(() => {
        originalConsoleLog = console.log;
        originalConsoleError = console.error;
        originalProcessSend = process.send;
        originalProcessOn = process.on;
        originalProcessArgv = process.argv;

        console.log = jest.fn();
        console.error = jest.fn();

        process.send = jest.fn();
        process.argv = ['node', 'multichain_sniper.js', 'testId'];

        // Mock process.on properly
        process.on = jest.fn((event, handler) => {
            mockProcessOnHandlers[event] = handler;
        });

        // Now require the module so the above mocks are used
        require('../multichain_sniper.js');
    });

    afterAll(() => {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        process.send = originalProcessSend;
        process.on = originalProcessOn;
        process.argv = originalProcessArgv;
        jest.resetModules();
    });

    beforeEach(() => {
        console.log.mockClear();
        console.error.mockClear();
        process.send.mockClear();
    });

    // Helper to send IPC messages
    const sendIpcMessage = (msg) => {
        if (mockProcessOnHandlers['message']) {
            mockProcessOnHandlers['message'](msg);
        }
    };

    it('executes PancakeSwap snipe on Aptos', async () => {
        sendIpcMessage({ type: 'COPY_TRADE_SIGNAL', chain: 'aptos', mint: '0xaptos_token' });

        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Executing Cross-Chain Snipe on [APTOS]')
        );

        // Wait for 800ms stub
        await jest.advanceTimersByTimeAsync(850);

        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('PancakeSwap Aptos Trade Executed')
        );

        expect(process.send).toHaveBeenCalledWith({
            type: 'SNIPE_SUCCESS',
            mint: '0xaptos_token',
            chain: 'aptos'
        });
    });

    it('skips snipe if trade is already active', async () => {
        sendIpcMessage({ type: 'COPY_TRADE_SIGNAL', chain: 'aptos', mint: '0xaptos_token_2' });
        await jest.advanceTimersByTimeAsync(850);

        console.log.mockClear();
        process.send.mockClear();

        sendIpcMessage({ type: 'COPY_TRADE_SIGNAL', chain: 'aptos', mint: '0xaptos_token_2' });

        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Trade already active for 0xaptos_token_2. Skipping.')
        );
        expect(process.send).not.toHaveBeenCalled();
    });

    it('liquidates on EMERGENCY_SELL', async () => {
        sendIpcMessage({ type: 'COPY_TRADE_SIGNAL', chain: 'aptos', mint: '0xaptos_token_3' });
        await jest.advanceTimersByTimeAsync(850);

        console.log.mockClear();

        sendIpcMessage({ type: 'EMERGENCY_SELL', mint: '0xaptos_token_3' });

        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Emergency sell received for 0xaptos_token_3. Liquidating...')
        );

        console.log.mockClear();
        process.send.mockClear();

        sendIpcMessage({ type: 'COPY_TRADE_SIGNAL', chain: 'aptos', mint: '0xaptos_token_3' });
        await jest.advanceTimersByTimeAsync(850);

        expect(process.send).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'SNIPE_SUCCESS' })
        );
    });

    it('executes Cetus snipe on Sui with default fallback', async () => {
        sendIpcMessage({ type: 'MULTICHAIN_TARGET', token: '0xsui_token' });

        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Executing Cross-Chain Snipe on [SUI]')
        );

        await jest.advanceTimersByTimeAsync(650);

        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Cetus Sui Trade Executed')
        );

        expect(process.send).toHaveBeenCalledWith({
            type: 'SNIPE_SUCCESS',
            mint: '0xsui_token',
            chain: 'sui'
        });
    });

    it('executes StonFi snipe on TON', async () => {
        sendIpcMessage({ type: 'COPY_TRADE_SIGNAL', chain: 'ton', mint: 'EQton_token' });

        await jest.advanceTimersByTimeAsync(1250);

        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('Ston.fi TON Trade Executed')
        );

        expect(process.send).toHaveBeenCalledWith({
            type: 'SNIPE_SUCCESS',
            mint: 'EQton_token',
            chain: 'ton'
        });
    });

    it('fails gracefully on unsupported chain', async () => {
        sendIpcMessage({ type: 'COPY_TRADE_SIGNAL', chain: 'solana', mint: 'sol_token' });

        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Unsupported chain: solana')
        );

        expect(process.send).not.toHaveBeenCalled();
    });
});
