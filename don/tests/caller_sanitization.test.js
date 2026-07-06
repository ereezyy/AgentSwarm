const { sanitizeTTS } = require('../caller');

// Virtual mocks for uninstalled or environment-dependent dependencies
jest.mock('elevenlabs-node', () => ({ ElevenLabsClient: jest.fn() }), { virtual: true });
jest.mock('@deepgram/sdk', () => ({ createClient: jest.fn() }), { virtual: true });
jest.mock('play-sound', () => () => ({ play: jest.fn() }), { virtual: true });
jest.mock('axios', () => ({}), { virtual: true });
jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
jest.mock('chalk', () => ({
    red: { bold: jest.fn(t => t) },
    green: jest.fn(t => t),
    yellow: jest.fn(t => t),
    white: jest.fn(t => t),
    gray: jest.fn(t => t),
    cyan: jest.fn(t => t)
}), { virtual: true });
jest.mock('../brain', () => ({ ask: jest.fn() }), { virtual: true });

describe('Caller TTS Sanitization', () => {
    test('should remove stars from text', () => {
        const input = 'The mission target is *Alpha* One. Proceed to *Sector* 7.';
        const expected = 'The mission target is Alpha One. Proceed to Sector 7.';
        expect(sanitizeTTS(input)).toBe(expected);
    });

    test('should collapse multiple spaces', () => {
        const input = 'This   has   too many    spaces.';
        const expected = 'This has too many spaces.';
        expect(sanitizeTTS(input)).toBe(expected);
    });

    test('should trim leading and trailing spaces', () => {
        const input = '   Trim me please   ';
        const expected = 'Trim me please';
        expect(sanitizeTTS(input)).toBe(expected);
    });

    test('should handle empty or null input', () => {
        expect(sanitizeTTS('')).toBe('');
        expect(sanitizeTTS(null)).toBe('');
        expect(sanitizeTTS(undefined)).toBe('');
    });

    test('should handle combined cases', () => {
        const input = '  *Target*   acquired!  Proceed to   *extraction* point.  ';
        const expected = 'Target acquired! Proceed to extraction point.';
        expect(sanitizeTTS(input)).toBe(expected);
    });
});
