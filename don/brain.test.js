jest.mock('axios');

describe('askBrain', () => {
    let askBrain;
    let PROVIDERS;
    let axios;

    beforeEach(() => {
        jest.resetModules();

        // Re-require axios to ensure we are configuring the same instance as the module under test
        axios = require('axios');

        // Uncomment to silence logs during successful tests
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        const brainModule = require('./brain');
        askBrain = brainModule.askBrain;
        PROVIDERS = brainModule.PROVIDERS;

        PROVIDERS.length = 0;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // Helper to create mock provider
    const createProvider = (name, id, color = (s) => s) => ({
        name,
        type: 'openai-compat',
        baseUrl: `http://${id}.com`,
        apiKey: id,
        model: id,
        color
    });

    test('should succeed with the first provider', async () => {
        PROVIDERS.push(createProvider('Provider1', 'provider1'));

        axios.post.mockResolvedValueOnce({
            data: {
                choices: [{ message: { content: 'Response from Provider1' } }]
            }
        });

        const response = await askBrain([{ role: 'user', content: 'hello' }]);
        expect(response).toBe('Response from Provider1');
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('should fallback to second provider on 500 error', async () => {
        PROVIDERS.push(createProvider('Provider1', 'provider1'));
        PROVIDERS.push(createProvider('Provider2', 'provider2'));

        axios.post.mockRejectedValueOnce({
            response: { status: 500 }
        });
        axios.post.mockResolvedValueOnce({
            data: {
                choices: [{ message: { content: 'Response from Provider2' } }]
            }
        });

        const response = await askBrain([{ role: 'user', content: 'hello' }]);
        expect(response).toBe('Response from Provider2');
        expect(axios.post).toHaveBeenCalledTimes(2);
    });

    test('should cooldown provider on 429 and skip in subsequent call', async () => {
        PROVIDERS.push(createProvider('Provider1', 'provider1'));
        PROVIDERS.push(createProvider('Provider2', 'provider2'));

        // First call: Provider1 429, Provider2 200
        axios.post.mockRejectedValueOnce({
            response: { status: 429 }
        });
        axios.post.mockResolvedValueOnce({
            data: {
                choices: [{ message: { content: 'Response from Provider2' } }]
            }
        });

        const response1 = await askBrain([{ role: 'user', content: 'hello' }]);
        expect(response1).toBe('Response from Provider2');
        expect(axios.post).toHaveBeenCalledTimes(2);

        // Second call: Provider1 should be skipped, so mock only one response
        axios.post.mockResolvedValueOnce({
            data: {
                choices: [{ message: { content: 'Response from Provider2 again' } }]
            }
        });

        const response2 = await askBrain([{ role: 'user', content: 'hello' }]);
        expect(response2).toBe('Response from Provider2 again');
        expect(axios.post).toHaveBeenCalledTimes(3);
    });

    test('should cooldown provider on connection error', async () => {
        PROVIDERS.push(createProvider('Provider1', 'provider1'));
        PROVIDERS.push(createProvider('Provider2', 'provider2'));

        const err = new Error('Connection refused');
        err.code = 'ECONNREFUSED';
        axios.post.mockRejectedValueOnce(err);

        axios.post.mockResolvedValueOnce({
            data: {
                choices: [{ message: { content: 'Response from Provider2' } }]
            }
        });

        const response1 = await askBrain([{ role: 'user', content: 'hello' }]);
        expect(response1).toBe('Response from Provider2');
        expect(axios.post).toHaveBeenCalledTimes(2);

        axios.post.mockResolvedValueOnce({
            data: {
                choices: [{ message: { content: 'Response from Provider2 again' } }]
            }
        });

        const response2 = await askBrain([{ role: 'user', content: 'hello' }]);
        expect(response2).toBe('Response from Provider2 again');
        expect(axios.post).toHaveBeenCalledTimes(3);
    });

    test('should throw error if all providers fail', async () => {
        PROVIDERS.push(createProvider('Provider1', 'provider1'));

        axios.post.mockRejectedValueOnce({
            response: { status: 500 }
        });

        await expect(askBrain([{ role: 'user', content: 'hello' }]))
            .rejects.toThrow('All brain providers failed');
    });
});
