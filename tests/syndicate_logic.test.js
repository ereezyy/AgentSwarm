const path = require('path');

jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    create: jest.fn().mockReturnThis(),
}), { virtual: true });

// Create specific mocks
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();

// Mock fs module with singleton mock object
jest.mock('fs', () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
}));

// Mock chalk
jest.mock('chalk', () => {
    const boldFn = jest.fn(s => s);
    const colorFn = Object.assign(jest.fn(s => s), { bold: boldFn });
    return {
        red: colorFn,
        yellow: colorFn,
        cyan: colorFn,
        blue: colorFn,
        bold: boldFn,
    };
}, { virtual: true });

// Mock ws
jest.mock('ws', () => {
    return {
        Server: class {
            constructor() {
                this.on = jest.fn();
            }
        }
    };
}, { virtual: true });

// Mock child_process
jest.mock('child_process', () => ({
    exec: jest.fn(),
    fork: jest.fn()
}));

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => ({}), { virtual: true });

describe('DonCore.loadTradeHistory', () => {
    let don;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Reset specific mock implementations
        mockExistsSync.mockReset();
        mockReadFileSync.mockReset();
        mockMkdirSync.mockReset();
        mockWriteFileSync.mockReset();

        // Default behavior
        mockExistsSync.mockReturnValue(false);
        mockReadFileSync.mockReturnValue('[]');

        don = require('../don/syndicate_logic');
    });

    test('should return parsed JSON when file exists and is valid', () => {
        const mockData = [{ id: 1, asset: 'SOL', profit: 10 }];
        // Set up mock for loadTradeHistory call
        // Note: constructor also calls existsSync. We need to handle that.
        // Constructor checks if 'missions' directory exists.
        // If we make existsSync return false generally, constructor tries to mkdir.
        // We can make it smart based on path argument or just let mkdir be called.

        mockExistsSync.mockImplementation((p) => {
            if (p.includes('active_trades.json')) return true;
            return false;
        });

        mockReadFileSync.mockReturnValue(JSON.stringify(mockData));

        const result = don.loadTradeHistory();

        expect(result).toEqual(mockData);
        expect(mockExistsSync).toHaveBeenCalled();
        expect(mockReadFileSync).toHaveBeenCalled();
    });

    test('should return empty array when file does not exist', () => {
        mockExistsSync.mockReturnValue(false);

        const result = don.loadTradeHistory();

        expect(result).toEqual([]);
        expect(mockExistsSync).toHaveBeenCalled();
        expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    test('should return empty array when file content is invalid JSON', () => {
        mockExistsSync.mockImplementation((p) => {
             if (p.includes('active_trades.json')) return true;
             return false;
        });
        mockReadFileSync.mockReturnValue('invalid-json');

        const result = don.loadTradeHistory();

        expect(result).toEqual([]);
        expect(mockExistsSync).toHaveBeenCalled();
        expect(mockReadFileSync).toHaveBeenCalled();
    });

    test('should return empty array when readFileSync throws an error', () => {
        mockExistsSync.mockImplementation((p) => {
             if (p.includes('active_trades.json')) return true;
             return false;
        });
        mockReadFileSync.mockImplementation(() => {
            throw new Error('Read error');
        });

        const result = don.loadTradeHistory();

        expect(result).toEqual([]);
        expect(mockExistsSync).toHaveBeenCalled();
        expect(mockReadFileSync).toHaveBeenCalled();
    });
});
