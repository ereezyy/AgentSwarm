const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const keypair = Keypair.generate();
console.log(bs58.encode(keypair.secretKey));
