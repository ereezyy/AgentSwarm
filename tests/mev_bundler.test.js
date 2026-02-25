const { Connection, Transaction, Keypair, SystemProgram, PublicKey } = require('@solana/web3.js');

// Define mock functions first
const mockSendBundle = jest.fn();
// The searcher client function returns an object with sendBundle
const mockSearcherClientFn = jest.fn(() => ({
    sendBundle: mockSendBundle
}));
const mockBundleFn = jest.fn();

// Register mocks
jest.mock('jito-ts/dist/sdk/block-engine/searcher', () => ({
  searcherClient: mockSearcherClientFn
}), { virtual: true });

jest.mock('jito-ts/dist/sdk/block-engine/types', () => ({
  Bundle: mockBundleFn
}), { virtual: true });

jest.mock('chalk', () => ({
  blue: jest.fn(msg => msg),
  green: jest.fn(msg => msg),
  yellow: jest.fn(msg => msg),
  gray: jest.fn(msg => msg),
  red: jest.fn(msg => msg),
}), { virtual: true });

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
      sign: jest.fn(),
      serialize: jest.fn(() => Buffer.from('mock-tx')),
      add: jest.fn(), // Support adding instructions
    })),
    Keypair: {
        generate: jest.fn(() => ({ publicKey: 'mock-pubkey' }))
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
    mockConnection = new Connection('https://api.mainnet-beta.solana.com');
    mockWallet = Keypair.generate();

    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset mock implementations to default success
    mockSendBundle.mockResolvedValue('bundle-id-123');
    mockSearcherClientFn.mockClear();
    mockBundleFn.mockClear();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('should initialize client successfully', () => {
    bundler = new MevBundler(mockWallet, mockConnection);
    expect(bundler.client).toBeDefined();
    // Verify searcherClient was called
    expect(mockSearcherClientFn).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Jito Client Initialized'));
  });

  describe('sendBundle', () => {
    beforeEach(() => {
        bundler = new MevBundler(mockWallet, mockConnection);
        // Ensure client is set (it should be if init succeeded)
    });

    test('should return null if client is not initialized', async () => {
      bundler.client = null;
      const tx = new Transaction();
      const result = await bundler.sendBundle(tx);
      expect(result).toBeNull();
    });

    test('should send bundle successfully', async () => {
      const tx = new Transaction();
      const result = await bundler.sendBundle(tx);

      // Verify dependencies called
      expect(mockConnection.getLatestBlockhash).toHaveBeenCalled();
      expect(tx.sign).toHaveBeenCalledWith(mockWallet);

      // Verify Bundle creation
      expect(mockBundleFn).toHaveBeenCalledTimes(1);
      const bundleArgs = mockBundleFn.mock.calls[0];

      // Arg 0 should be array of transactions
      // Note: Current implementation only includes the user transaction,
      // it does NOT include a tip transaction despite taking tipAmount as arg.
      // This test verifies current behavior. Ideally, it should contain 2 transactions.
      expect(bundleArgs[0]).toHaveLength(1);
      expect(bundleArgs[0][0]).toBe(tx);

      // Arg 1 is limit
      expect(bundleArgs[1]).toBe(5);

      // Verify client.sendBundle called
      expect(mockSendBundle).toHaveBeenCalled();

      expect(result).toBe('bundle-id-123');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Bundle Sent'));
    });

    test('should handle execution failure', async () => {
      const tx = new Transaction();
      // Simulate error in sendBundle
      mockSendBundle.mockRejectedValue(new Error('Simulation Error'));

      const result = await bundler.sendBundle(tx);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Bundle Execution Failed'));
    });
  });
});
