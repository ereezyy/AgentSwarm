// Mock out external dependencies heavily before requiring pumpsniper
jest.mock('ws', () => {
    return class WebSocket {
        constructor() {
            this.on = jest.fn();
            this.send = jest.fn();
        }
    };
}, { virtual: true });
jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn()
}), { virtual: true });
jest.mock('chalk', () => {
    const chalkMock = new Proxy(() => {}, {
        get: function(target, prop) {
            return chalkMock;
        },
        apply: function(target, thisArg, argumentsList) {
            return argumentsList[0];
        }
    });
    return chalkMock;
}, { virtual: true });

jest.mock('@solana/web3.js', () => ({
    Connection: jest.fn(),
    PublicKey: jest.fn(),
    Keypair: { fromSecretKey: jest.fn() },
    VersionedTransaction: jest.fn(),
    Transaction: jest.fn(),
    SystemProgram: jest.fn()
}), { virtual: true });
jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });
jest.mock('bs58', () => ({ decode: jest.fn() }), { virtual: true });
jest.mock('jito-ts/dist/sdk/block-engine/searcher', () => ({ searcherClient: jest.fn() }), { virtual: true });
jest.mock('jito-ts/dist/sdk/block-engine/types', () => ({ Bundle: jest.fn() }), { virtual: true });

// Mock fs to intercept loadTrades and loadNeuralConfig
jest.mock('fs', () => {
    const originalModule = jest.requireActual('fs');
    return {
        ...originalModule,
        existsSync: jest.fn(() => false),
        readFileSync: jest.fn(() => '[]'),
        writeFileSync: jest.fn()
    };
});

// Since the file contains `setInterval` that might run indefinitely, we need to mock timers
jest.useFakeTimers();

const { calculateKellyBet, neuralConfig } = require('../pumpsniper');

describe('calculateKellyBet', () => {
    let originalConfig;

    beforeEach(() => {
        originalConfig = { ...neuralConfig };

        neuralConfig.rug_threshold = 0.70;
        neuralConfig.kelly_fraction = 0.20;
        neuralConfig.min_bet = 0.005;
        neuralConfig.max_bet = 0.05;
    });

    afterEach(() => {
        Object.assign(neuralConfig, originalConfig);
    });

    test('returns 0 when balance is below 0.05 SOL', () => {
        expect(calculateKellyBet(0.049, 0)).toBe(0);
        expect(calculateKellyBet(0, 0)).toBe(0);
        expect(calculateKellyBet(-1, 0)).toBe(0);
    });

    test('calculates correct bet with 0% rug probability', () => {
        expect(calculateKellyBet(1.0, 0)).toBe(0.05);
    });

    test('respects exposure limit (5% of balance)', () => {
        expect(calculateKellyBet(0.5, 0)).toBe(0.025);
    });

    test('applies min_bet floor correctly', () => {
        neuralConfig.min_bet = 0.01;
        expect(calculateKellyBet(0.1, 0.6)).toBe(0.01);
    });

    test('returns min_bet when kelly suggests negative (high rug prob)', () => {
        expect(calculateKellyBet(1.0, 0.99)).toBe(0.005);
    });

    test('returns exact calculated value when between bounds', () => {
        neuralConfig.min_bet = 0.001;
        neuralConfig.max_bet = 0.1;
        expect(calculateKellyBet(2.0, 0.6)).toBe(0.04);
    });

    test('respects fraction config setting', () => {
        neuralConfig.kelly_fraction = 0.50;
        neuralConfig.max_bet = 10.0;
        expect(calculateKellyBet(10.0, 0)).toBe(0.5);
    });
});
