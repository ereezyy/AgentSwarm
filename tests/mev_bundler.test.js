const axios = require('axios');
const chalk = require('chalk');
const { Connection, Transaction, Keypair, PublicKey } = require('@solana/web3.js');
const MevBundler = require('../don/mev_bundler');

jest.mock('axios');
jest.mock('chalk', () => ({
  green: jest.fn(msg => msg),
  red: jest.fn(msg => msg),
  yellow: jest.fn(msg => msg),
  magenta: jest.fn(msg => msg),
  blue: jest.fn(msg => msg),
  bold: jest.fn(msg => msg),
}), { virtual: true });

jest.mock('@solana/web3.js', () => {
  return {
    Connection: jest.fn().mockImplementation(() => ({
      getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: 'mock-blockhash' }),
    })),
    Transaction: jest.fn().mockImplementation(() => {
      const tx = {
        recentBlockhash: null,
        sign: jest.fn(),
        serialize: jest.fn(() => Buffer.from('mock-tx')),
        compileMessage: jest.fn().mockReturnValue({
            serialize: jest.fn(() => Buffer.from('mock-msg'))
        })
      };
      tx.add = jest.fn(() => tx); // Chainable
      return tx;
    }),
            VersionedTransaction: jest.fn().mockImplementation(() => {
      return {
        sign: jest.fn(),
        serialize: jest.fn(() => Buffer.from('mock-ver-tx'))
      }
    }),
    SystemProgram: {
      transfer: jest.fn().mockReturnValue({}),
    },
    Keypair: {
      generate: jest.fn()
    },
    PublicKey: jest.fn()
  };
});

describe('MevBundler', () => {
  let bundler;
  let mockWallet;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWallet = { publicKey: 'mock-pubkey', signTransaction: jest.fn() };
    mockConnection = new Connection();
    console.log = jest.fn();
    console.error = jest.fn();
  });

  test('should initialize successfully', () => {
    bundler = new MevBundler(mockWallet, mockConnection);
    expect(bundler.wallet).toBe(mockWallet);
    expect(bundler.connection).toBe(mockConnection);
  });

  test('sendBundle should construct and execute bundle via REST', async () => {
    bundler = new MevBundler(mockWallet, mockConnection);
    const tx = new Transaction();
    axios.post.mockResolvedValueOnce({ data: { result: 'bundle-id-123' } });

    const result = await bundler.sendBundle(tx);

    expect(axios.post).toHaveBeenCalled();
  });

  test('sendBundle should handle execution failure gracefully', async () => {
    bundler = new MevBundler(mockWallet, mockConnection);
    const tx = new Transaction();
    axios.post.mockRejectedValueOnce(new Error('Network error'));

    const result = await bundler.sendBundle(tx);
    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('REST Request failed'));
  });
});
