jest.mock("axios", () => ({}), { virtual: true });
jest.mock('chalk', () => {
    const chalkMock = Object.assign(jest.fn(text => text), {
        bold: jest.fn(text => text),
        yellow: Object.assign(jest.fn(text => text), { bold: jest.fn(text => text) }),
        red: Object.assign(jest.fn(text => text), { bold: jest.fn(text => text) }),
        cyan: Object.assign(jest.fn(text => text), { bold: jest.fn(text => text) }),
        green: Object.assign(jest.fn(text => text), { bold: jest.fn(text => text) }),
        blue: Object.assign(jest.fn(text => text), { bold: jest.fn(text => text) }),
        magenta: Object.assign(jest.fn(text => text), { bold: jest.fn(text => text) })
    });
    return chalkMock;
}, { virtual: true });
jest.mock("dotenv", () => ({ config: jest.fn() }), { virtual: true });
// don/tests/syndicate_logic_commands.test.js

// 1. Set NODE_ENV to test to avoid starting the real WebSocket server
process.env.NODE_ENV = 'test';

// 2. Mock external dependencies
const mockFork = jest.fn();
const mockExec = jest.fn();
jest.mock('child_process', () => ({
    fork: mockFork,
    exec: mockExec
}));

const mockWriteFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockReadFileSync = jest.fn();
jest.mock('fs', () => ({
    writeFileSync: mockWriteFileSync,
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readFileSync: mockReadFileSync
}));

const mockWebSocketServer = jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    clients: []
}));
jest.mock('ws', () => ({
    Server: mockWebSocketServer
}), { virtual: true });

// 3. Import the module under test
const don = require('../syndicate_logic');

describe('DonCore.handleCommand', () => {
    let consoleSpy;

    beforeEach(() => {
        // Reset mocks
        mockFork.mockClear();
        mockExec.mockClear();
        mockWriteFileSync.mockClear();
        mockExistsSync.mockClear();
        mockMkdirSync.mockClear();
        mockReadFileSync.mockClear();

        // Reset don state
        don.processes = {};
        don.crew = [];
        don.activeMissions = [];

        // Spy on console.log/error to keep output clean and verify logging
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        // Mock broadcast method
        don.broadcast = jest.fn();
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    test('SPAWN command spawns a soldier', () => {
        const mockProcess = {
            on: jest.fn(),
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            connected: true,
            send: jest.fn(),
            kill: jest.fn()
        };
        mockFork.mockReturnValue(mockProcess);

        don.handleCommand({ type: 'SPAWN', agent: 'SNIPER' });

        expect(mockFork).toHaveBeenCalled();
        expect(don.processes['SNIPER']).toBeDefined();
        // spawnSoldier calls broadcast multiple times (CREW_UPDATE, AGENT_COMMS)
        // We verify at least one broadcast happened
        expect(don.broadcast).toHaveBeenCalled();
    });

    test('USER_CHAT command broadcasts message', () => {
        const msg = 'Hello World';
        don.handleCommand({ type: 'USER_CHAT', msg });

        expect(don.broadcast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'AGENT_COMMS',
            msg,
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

    test('HUNT command sends request to HEADHUNTER', () => {
        const mockHeadhunter = { send: jest.fn(), connected: true };
        don.processes['HEADHUNTER'] = mockHeadhunter;

        don.handleCommand({ type: 'HUNT' });

        expect(mockHeadhunter.send).toHaveBeenCalledWith({ type: 'HUNT_NOW' });
    });

    test('RECON command sends request to GHOST', () => {
        const mockGhost = { send: jest.fn(), connected: true };
        don.processes['GHOST'] = mockGhost;

        don.handleCommand({ type: 'RECON' });

        expect(mockGhost.send).toHaveBeenCalledWith({ type: 'RECON_NOW' });
    });

    test('TWEET command sends request to SHADOW', () => {
        const mockShadow = { send: jest.fn(), connected: true };
        don.processes['SHADOW'] = mockShadow;
        const text = 'Hello Twitter';

        don.handleCommand({ type: 'TWEET', text });

        expect(mockShadow.send).toHaveBeenCalledWith({ type: 'POST_TWEET', text });
    });

    test('COUNCIL_MEETING command broadcasts meeting start', () => {
        const topic = 'Emergency';
        const mockAgent = { send: jest.fn(), connected: true };
        don.processes['SNIPER'] = mockAgent;

        don.handleCommand({ type: 'COUNCIL_MEETING', topic });

        expect(don.broadcast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'AGENT_COMMS',
            msg: expect.stringContaining('REPORT TO THE COUNCIL')
        }));

        expect(mockAgent.send).toHaveBeenCalledWith({
            type: 'MEETING_START',
            topic,
            from: 'THE DON'
        });
    });
});
