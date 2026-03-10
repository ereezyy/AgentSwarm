const { Connection, Transaction, Keypair, SystemProgram, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const axios = require('axios');

// We use process.env.JITO_BLOCK_ENGINE_URL for the environment variable instead of hardcoding.
const JITO_BLOCK_ENGINE_URL = process.env.JITO_BLOCK_ENGINE_URL || 'https://mainnet.block-engine.jito.wtf/api/v1';

// Define mock functions first
const mockSendBundle = jest.fn();
// The searcher client function returns an object with sendBundle
const mockSearcherClientFn = jest.fn(() => ({
    sendBundle: mockSendBundle,
    url: JITO_BLOCK_ENGINE_URL
}));
const mockBundleFn = jest.fn();

jest.mock('axios', () => ({
  post: jest.fn()
}), { virtual: true });

// Register mocks
jest.mock('jito-ts/dist/sdk/block-engine/searcher', () => ({
  searcherClient: mockSearcherClientFn
}), { virtual: true });

jest.mock('jito-ts/dist/sdk/block-engine/types', () => ({
  Bundle: mockBundleFn
}), { virtual: true });

jest.mock('chalk', () => {
  const chalkMock = jest.fn(msg => msg);
  chalkMock.bold = jest.fn(msg => msg);
  return {
    blue: chalkMock,
    green: chalkMock,
    yellow: chalkMock,
    gray: chalkMock,
    magenta: chalkMock,
    red: chalkMock,
  };
}, { virtual: true });

jest.mock('dotenv', () => ({
  config: jest.fn(),
}), { virtual: true });

// Robust mock for @solana/web3.js including SystemProgram and PublicKey
jest.mock('@solana/web3.js', () => {
  return {
    Connection: jest.fn().mockImplementation(() => ({
      getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'mock-blockhash' }),
    })),
    Transaction: jest.fn().mockImplementation(() => ({
      recentBlockhash: null,
      feePayer: null,
      sign: jest.fn(),
      serialize: jest.fn(() => Buffer.from('mock-tx')),
      add: jest.fn().mockReturnThis(), // Support adding instructions
      compileMessage: jest.fn(() => ({})),
    })),
    VersionedTransaction: jest.fn().mockImplementation(() => ({
      sign: jest.fn(),
      serialize: jest.fn(() => Buffer.from('mock-vtx')),
    })),
    Keypair: {
        generate: jest.fn(() => ({ publicKey: { toString: () => 'mock-pubkey' } }))
    },
    PublicKey: jest.fn().mockImplementation((val) => ({ toString: () => val || 'mock-pubkey' })), // Mock constructor
    SystemProgram: {
        transfer: jest.fn().mockReturnValue({ keys: [], programId: 'system-program', data: Buffer.from([]) })
    }
  };
}, { virtual: true });

// Require the module under test AFTER mocks are configured and variables initialized
const MevBundler = require('../don/mev_bundler');

describe('MevBundler', () => {
  let bundler;
  let mockConnection;
  let mockWallet;
  let consoleSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock connection and wallet
    // Note: Connection and Keypair are mocked above, so we get mock instances
    // Use environment variable instead of hardcoding
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    mockConnection = new Connection(rpcUrl);
    mockWallet = Keypair.generate();

    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset mock implementations
    axios.post.mockResolvedValue({ data: { result: 'bundle-id-123' } });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('should initialize client successfully', () => {
    bundler = new MevBundler(mockWallet, mockConnection);
    expect(bundler.wallet).toBeDefined();
    expect(bundler.connection).toBeDefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Jito REST Client Initialized'));
  });

  describe('sendBundle', () => {
    beforeEach(() => {
        bundler = new MevBundler(mockWallet, mockConnection);
    });

    test('should return null if wallet is not available', async () => {
      bundler.wallet = null;
      const tx = new Transaction();
      const result = await bundler.sendBundle(tx);
      expect(result).toBeNull();
    });

    test('should send bundle successfully', async () => {
      const tx = new Transaction();
      const result = await bundler.sendBundle(tx);

      // Verify dependencies called
      expect(mockConnection.getLatestBlockhash).toHaveBeenCalled();

      // Verify axios.post called
      expect(axios.post).toHaveBeenCalled();

      expect(result).toBe('bundle-id-123');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('BUNDLE SENT!'));
    });

    test('should handle execution failure', async () => {
      const tx = new Transaction();
      // Simulate error in sendBundle
      axios.post.mockRejectedValue(new Error('Simulation Error'));

      const result = await bundler.sendBundle(tx);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('REST Request failed: Simulation Error'));
    });
  });
});
