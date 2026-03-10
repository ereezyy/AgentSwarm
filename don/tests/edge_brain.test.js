const axios = require('axios');

const createChalkMock = () => {
    const fn = (str) => str;
    fn.bold = fn;
    fn.red = fn;
    fn.magenta = fn;
    fn.green = fn;
    fn.cyan = fn;
    return fn;
};

jest.mock('chalk', () => {
    const mock = createChalkMock();
    return {
        red: mock,
        magenta: mock,
        green: mock,
        cyan: mock,
        bold: mock
    };
}, { virtual: true });

jest.mock('axios', () => ({
    post: jest.fn()
}), { virtual: true });

jest.mock('ssh2', () => {
    return {
        Client: jest.fn().mockImplementation(() => {
            const client = {
                on: jest.fn().mockReturnThis(),
                connect: jest.fn().mockReturnThis(),
                exec: jest.fn()
            };
            return client;
        })
    };
}, { virtual: true });

describe('Edge Brain', () => {
    let queryLocalBrain;
    let consoleLogSpy;
    let consoleErrorSpy;

    beforeAll(() => {
        // Suppress console output for cleaner test runs
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        process.env.PI_IP = '127.0.0.1';
        process.env.PI_PORT = '11434';

        const edgeBrain = require('../edge_brain');
        queryLocalBrain = edgeBrain.queryLocalBrain;
    });

    afterAll(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should successfully query the local brain and return the response', async () => {
        const mockResponse = { data: { response: 'Hello from local brain!' } };
        axios.post.mockResolvedValueOnce(mockResponse);

        const result = await queryLocalBrain('Say hello', 'You are a test AI');

        expect(result).toBe('Hello from local brain!');
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(axios.post).toHaveBeenCalledWith(
            'http://127.0.0.1:11434/api/generate',
            {
                model: 'llama3',
                prompt: 'You are a test AI\n\nSay hello',
                stream: false
            },
            { timeout: 60000 }
        );
    });

    it('should handle missing system message and use default', async () => {
        const mockResponse = { data: { response: 'Default sys msg response' } };
        axios.post.mockResolvedValueOnce(mockResponse);

        const result = await queryLocalBrain('Say hello');

        expect(result).toBe('Default sys msg response');
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(axios.post).toHaveBeenCalledWith(
            'http://127.0.0.1:11434/api/generate',
            expect.objectContaining({
                prompt: 'You are a helpful AI.\n\nSay hello'
            }),
            expect.any(Object)
        );
    });

    it('should handle API errors gracefully and return null', async () => {
        axios.post.mockRejectedValueOnce(new Error('Connection refused'));

        const result = await queryLocalBrain('Say hello');

        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Inference Severed: Connection refused'));
    });
});
