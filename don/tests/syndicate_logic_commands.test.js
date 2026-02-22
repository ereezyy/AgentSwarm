process.env.NODE_ENV = 'test';

// Mocks must be defined before require
const fs = require('fs');
const { fork, exec } = require('child_process');

jest.mock('fs', () => ({
    writeFileSync: jest.fn(),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue('[]')
}));

jest.mock('child_process', () => ({
    fork: jest.fn(),
    exec: jest.fn()
}));

// Mock chalk as virtual module
jest.mock('chalk', () => ({
    red: { bold: jest.fn(msg => msg) },
    yellow: { bold: jest.fn(msg => msg) },
    cyan: { bold: jest.fn(msg => msg) },
    blue: jest.fn(msg => msg),
    bold: jest.fn(msg => msg)
}), { virtual: true });

// Mock ws as virtual module
jest.mock('ws', () => ({
    Server: class {
        constructor() { this.clients = []; this.on = jest.fn(); }
    }
}), { virtual: true });

// Mock @solana/web3.js as virtual module
jest.mock('@solana/web3.js', () => ({}), { virtual: true });

const don = require('../syndicate_logic');

describe('DonCore.handleCommand', () => {
    let consoleSpy;
    let broadcastSpy;

    beforeEach(() => {
        // Use fake timers to prevent open handles from spawnSoldier setTimeout
        jest.useFakeTimers();

        // Clear all mocks
        jest.clearAllMocks();

        // Reset internal state
        don.processes = {};
        don.crew = [];
        don.profit = 0;
        don.activeMissions = [];
        don.agentComms = [];
        don.restartState = {};
        don.agentHealth = {};

        // Spy on console.log
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        // Mock broadcast method
        broadcastSpy = jest.spyOn(don, 'broadcast').mockImplementation(() => {});

        // Ensure wss is mocked
        if (!don.wss) {
            don.wss = { clients: [], on: jest.fn() };
        } else {
            don.wss.clients = [];
        }
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        broadcastSpy.mockRestore();

        // Clear timers
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test('SPAWN command spawns a soldier', () => {
        const mockChild = {
            on: jest.fn(),
            send: jest.fn(),
            stderr: { on: jest.fn() },
            stdout: { on: jest.fn() },
            connected: true
        };
        // Setup fork mock to return our mock child
        require('child_process').fork.mockReturnValue(mockChild);

        don.handleCommand({ type: 'SPAWN', agent: 'SNIPER' });

        expect(require('child_process').fork).toHaveBeenCalled();
        expect(don.processes['SNIPER']).toBe(mockChild);

        expect(consoleSpy).toHaveBeenCalled();
    });

    test('USER_CHAT broadcasts and forwards to agents', () => {
        // Setup a mock process
        const mockProc = { send: jest.fn(), connected: true };
        don.processes['SNIPER'] = mockProc;

        const cmd = { type: 'USER_CHAT', msg: 'Hello Agents' };
        don.handleCommand(cmd);

        // Verify broadcast
        expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'AGENT_COMMS',
            msg: 'Hello Agents',
            from: 'THE DON'
        }));

        // Verify forwarding to agent
        expect(mockProc.send).toHaveBeenCalledWith(expect.objectContaining({
            type: 'USER_CHAT',
            msg: 'Hello Agents',
            from: 'THE DON'
        }));
    });

    test('EVOLVE command sends request to ARCHITECT', () => {
        const mockArchitect = { send: jest.fn(), connected: true };
        don.processes['ARCHITECT'] = mockArchitect;

        don.handleCommand({ type: 'EVOLVE', agent: 'SNIPER' });

        expect(mockArchitect.send).toHaveBeenCalledWith({
            type: 'EVOLVE_REQUEST',
            agentType: 'SNIPER'
        });
    });

    test('HUNT command triggers HEADHUNTER', () => {
        const mockHeadhunter = { send: jest.fn(), connected: true };
        don.processes['HEADHUNTER'] = mockHeadhunter;

        don.handleCommand({ type: 'HUNT' });

        expect(mockHeadhunter.send).toHaveBeenCalledWith({ type: 'HUNT_NOW' });
    });

    test('RECON command triggers GHOST', () => {
        const mockGhost = { send: jest.fn(), connected: true };
        don.processes['GHOST'] = mockGhost;

        don.handleCommand({ type: 'RECON' });

        expect(mockGhost.send).toHaveBeenCalledWith({ type: 'RECON_NOW' });
    });

    test('TWEET command triggers SHADOW', () => {
        const mockShadow = { send: jest.fn(), connected: true };
        don.processes['SHADOW'] = mockShadow;

        const cmd = { type: 'TWEET', text: 'Hello World' };
        don.handleCommand(cmd);

        expect(mockShadow.send).toHaveBeenCalledWith({
            type: 'POST_TWEET',
            text: 'Hello World'
        });
    });

    test('COUNCIL_MEETING command broadcasts and alerts agents', () => {
        const mockProc1 = { send: jest.fn(), connected: true };
        const mockProc2 = { send: jest.fn(), connected: true };
        don.processes['A1'] = mockProc1;
        don.processes['A2'] = mockProc2;

        const topic = 'Emergency Strategy';
        don.handleCommand({ type: 'COUNCIL_MEETING', topic });

        // Verify log
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('COUNCIL MEETING CALLED'));

        // Verify broadcast
        expect(broadcastSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'AGENT_COMMS',
            msg: expect.stringContaining(topic)
        }));

        // Verify alert to agents
        expect(mockProc1.send).toHaveBeenCalledWith(expect.objectContaining({
            type: 'MEETING_START',
            topic,
            from: 'THE DON'
        }));
        expect(mockProc2.send).toHaveBeenCalledWith(expect.objectContaining({
            type: 'MEETING_START',
            topic,
            from: 'THE DON'
        }));
    });
});
