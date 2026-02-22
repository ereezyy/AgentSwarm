// Mock dependencies first
const mockAxios = { post: jest.fn(), get: jest.fn() };
jest.mock('axios', () => mockAxios, { virtual: true });

const mockChalk = {
    red: jest.fn(m => m),
    yellow: jest.fn(m => m),
    green: jest.fn(m => m),
    blue: jest.fn(m => m),
    gray: jest.fn(m => m),
    cyan: jest.fn(m => m),
};
jest.mock('chalk', () => mockChalk, { virtual: true });
jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
jest.mock('child_process', () => ({ execSync: jest.fn() }));

// Now import the module under test
const { parseJSONFromText } = require('../brain.js');

describe('parseJSONFromText', () => {
    test('parses clean JSON', () => {
        const input = '{"foo": "bar"}';
        const expected = { foo: 'bar' };
        expect(parseJSONFromText(input)).toEqual(expected);
    });

    test('parses JSON wrapped in markdown', () => {
        const input = '```json\n{"foo": "bar"}\n```';
        const expected = { foo: 'bar' };
        expect(parseJSONFromText(input)).toEqual(expected);
    });

    test('parses JSON with prose prefix', () => {
        const input = 'Here is the JSON: {"foo": "bar"}';
        const expected = { foo: 'bar' };
        expect(parseJSONFromText(input)).toEqual(expected);
    });

    test('parses JSON with prose suffix', () => {
        const input = '{"foo": "bar"} is the result';
        const expected = { foo: 'bar' };
        expect(parseJSONFromText(input)).toEqual(expected);
    });

    test('parses JSON with nested braces', () => {
        const input = '{"foo": {"bar": "baz"}}';
        const expected = { foo: { bar: 'baz' } };
        expect(parseJSONFromText(input)).toEqual(expected);
    });

    test('parses pure JSON arrays (fallback mechanism)', () => {
        const input = '[1, 2, 3]';
        const expected = [1, 2, 3];
        expect(parseJSONFromText(input)).toEqual(expected);
    });

    test('throws on invalid JSON', () => {
        const input = 'This is not JSON';
        expect(() => parseJSONFromText(input)).toThrow(SyntaxError);
    });

    test('fails on multiple JSON blocks (Greedy match limitation)', () => {
        const input = '{"a": 1} and {"b": 2}';
        expect(() => parseJSONFromText(input)).toThrow(SyntaxError);
    });
});
