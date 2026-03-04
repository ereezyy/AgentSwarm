const { summarizeContent } = require('./summarize');
const brain = require('../../don/brain');

jest.mock('../../don/brain', () => ({
    ask: jest.fn()
}));

describe('summarizeContent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should call ask with default focus', async () => {
        const content = 'This is a test content.';
        const expectedPrompt = `Summarize the following content with a focus on "General". \n    Extract key entities, dates, and actionable intelligence.\n    \n    CONTENT:\n    ${content}`;
        const mockResponse = 'Mocked summary';

        brain.ask.mockResolvedValue(mockResponse);

        const result = await summarizeContent(content);

        expect(brain.ask).toHaveBeenCalledTimes(1);
        expect(brain.ask).toHaveBeenCalledWith(expectedPrompt, 'You are an elite intelligence analyst for the Syndicate.');
        expect(result).toBe(mockResponse);
    });

    it('should call ask with specific focus', async () => {
        const content = 'This is a test content about finances.';
        const focus = 'Financial Data';
        const expectedPrompt = `Summarize the following content with a focus on "${focus}". \n    Extract key entities, dates, and actionable intelligence.\n    \n    CONTENT:\n    ${content}`;
        const mockResponse = 'Mocked financial summary';

        brain.ask.mockResolvedValue(mockResponse);

        const result = await summarizeContent(content, focus);

        expect(brain.ask).toHaveBeenCalledTimes(1);
        expect(brain.ask).toHaveBeenCalledWith(expectedPrompt, 'You are an elite intelligence analyst for the Syndicate.');
        expect(result).toBe(mockResponse);
    });
});
