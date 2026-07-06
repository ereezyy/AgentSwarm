// don/tests/shadow_media.test.js

// Define mocks before requires
const mockUploadMedia = jest.fn();
const mockTweet = jest.fn().mockResolvedValue({ data: { id: 'mock_tweet_id_456' } });
const mockReply = jest.fn();

const MockTwitterApi = jest.fn().mockImplementation(() => {
    return {
        v1: { uploadMedia: mockUploadMedia },
        readWrite: { v2: { tweet: mockTweet, reply: mockReply } }
    };
});

jest.mock('twitter-api-v2', () => ({
    TwitterApi: MockTwitterApi
}), { virtual: true });

jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });

// Robust Chalk Mock
const mockChalk = new Proxy(() => {}, {
    get: function(target, prop) {
        if (prop === 'hex' || prop === 'rgb') return () => mockChalk; // these return a builder
        return mockChalk; // chaining colors/styles
    },
    apply: function(target, thisArg, argumentsList) {
        return argumentsList[0]; // just return the string content
    }
});

jest.mock('chalk', () => mockChalk, { virtual: true });

const fs = require('fs');
jest.mock('fs');
fs.existsSync.mockReturnValue(true);

const { postTweet, setClient } = require('../shadow');

describe('Shadow Media Upload', () => {
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        setClient({
             v1: { uploadMedia: mockUploadMedia },
             readWrite: { v2: { tweet: mockTweet, reply: mockReply } }
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should upload media and post tweet with media_ids', async () => {
        const content = 'Test tweet with media';
        const mediaPath = '/path/to/media.jpg';
        mockUploadMedia.mockResolvedValueOnce('mock_media_id_123');

        await postTweet(content, mediaPath);

        expect(mockUploadMedia).toHaveBeenCalledWith(mediaPath);
        expect(mockTweet).toHaveBeenCalledWith({
            text: content,
            media: { media_ids: ['mock_media_id_123'] }
        });
    });

    test('should post text only if mediaPath is null', async () => {
        const content = 'Test tweet without media';
        await postTweet(content, null);
        expect(mockUploadMedia).not.toHaveBeenCalled();
        expect(mockTweet).toHaveBeenCalledWith({ text: content });
    });

    test('should handle media upload failure gracefully', async () => {
        const content = 'Test tweet with failed media';
        const mediaPath = '/path/to/bad_media.jpg';
        mockUploadMedia.mockRejectedValueOnce(new Error('Upload failed'));

        await postTweet(content, mediaPath);

        expect(mockUploadMedia).toHaveBeenCalledWith(mediaPath);
        expect(mockTweet).toHaveBeenCalledWith({ text: content });
    });

    test('should handle media file not found gracefully', async () => {
        const content = 'Test tweet with missing media';
        const mediaPath = '/path/to/missing_media.jpg';

        fs.existsSync.mockReturnValueOnce(false);

        await postTweet(content, mediaPath);

        expect(fs.existsSync).toHaveBeenCalledWith(mediaPath);
        expect(mockUploadMedia).not.toHaveBeenCalled();
        expect(mockTweet).toHaveBeenCalledWith({ text: content });
    });
});
