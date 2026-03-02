const { Keypair } = require('@solana/web3.js');
const kp = Keypair.generate();
process.env.SOLANA_RPC_URL = 'http://localhost:8899';
process.env.SOLANA_PRIVATE_KEY = Buffer.from(kp.secretKey).toString('hex');
require('./don/sniper.js');
