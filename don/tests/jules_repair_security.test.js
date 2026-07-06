const fs = require('fs');
const path = require('path');

// Mock missing modules
jest.mock('axios', () => ({
    post: jest.fn(),
    get: jest.fn()
}), { virtual: true });

jest.mock('chalk', () => {
    const fn = (s) => s;
    fn.bold = (s) => s;
    return {
        cyan: fn,
        green: fn,
        red: fn,
        gray: fn,
        blue: fn
    };
}, { virtual: true });

jest.mock('fs');

describe('JulesHealer Security', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        process.env.JULES_API_KEY = 'test-api-key';

        // Mock fs methods to avoid side effects
        fs.existsSync.mockReturnValue(true);
        fs.appendFileSync.mockReturnValue(undefined);
        fs.writeFileSync.mockReturnValue(undefined);
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('should use JULES_API_KEY from environment variables in repairFile', async () => {
        const julesHealer = require('../jules_repair');
        const axios = require('axios');
        axios.post.mockResolvedValue({ data: { id: 'session-123' } });

        await julesHealer.repairFile('test.js', 'error', 'stack');

        expect(axios.post).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'X-Goog-Api-Key': 'test-api-key'
                })
            })
        );
    });

    test('should use JULES_API_KEY in checkSessionStatus', async () => {
        const julesHealer = require('../jules_repair');
        const axios = require('axios');
        axios.get.mockResolvedValue({ data: { status: 'COMPLETE' } });

        await julesHealer.checkSessionStatus('session-123');

        expect(axios.get).toHaveBeenCalledWith(
            expect.stringContaining('session-123'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'X-Goog-Api-Key': 'test-api-key'
                })
            })
        );
    });
});
