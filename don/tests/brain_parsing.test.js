jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
jest.mock('chalk', () => ({ red: jest.fn(), green: jest.fn(), yellow: jest.fn(), cyan: jest.fn() }), { virtual: true });
jest.mock('axios', () => ({ post: jest.fn() }), { virtual: true });
const assert = require('node:assert');
const { parseJSONFromText } = require('../brain.js');

test('parseJSONFromText parses clean JSON', () => {
    const input = '{"foo": "bar"}';
    const expected = { foo: 'bar' };
    assert.deepStrictEqual(parseJSONFromText(input), expected);
});

test('parseJSONFromText parses JSON wrapped in markdown', () => {
    const input = '```json\n{"foo": "bar"}\n```';
    const expected = { foo: 'bar' };
    assert.deepStrictEqual(parseJSONFromText(input), expected);
});

test('parseJSONFromText parses JSON with prose prefix', () => {
    const input = 'Here is the JSON: {"foo": "bar"}';
    const expected = { foo: 'bar' };
    assert.deepStrictEqual(parseJSONFromText(input), expected);
});

test('parseJSONFromText parses JSON with prose suffix', () => {
    const input = '{"foo": "bar"} is the result';
    const expected = { foo: 'bar' };
    assert.deepStrictEqual(parseJSONFromText(input), expected);
});

test('parseJSONFromText parses JSON with nested braces', () => {
    const input = '{"foo": {"bar": "baz"}}';
    const expected = { foo: { bar: 'baz' } };
    assert.deepStrictEqual(parseJSONFromText(input), expected);
});

test('parseJSONFromText parses pure JSON arrays (fallback mechanism)', () => {
    // Current regex is \{[\s\S]*\} so it expects an object.
    // If input is purely an array [1, 2], it fails the regex match,
    // then falls back to JSON.parse(text) which should succeed.
    const input = '[1, 2, 3]';
    const expected = [1, 2, 3];
    assert.deepStrictEqual(parseJSONFromText(input), expected);
});

test('parseJSONFromText throws on invalid JSON', () => {
    const input = 'This is not JSON';
    assert.throws(() => parseJSONFromText(input), SyntaxError);
});

test('parseJSONFromText fails on multiple JSON blocks (Greedy match limitation)', () => {
    // Documenting current limitation: multiple JSON blocks cause SyntaxError due to greedy regex
    const input = '{"a": 1} and {"b": 2}';
    assert.throws(() => parseJSONFromText(input), SyntaxError);
});
