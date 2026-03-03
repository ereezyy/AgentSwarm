const { Keypair } = require('@solana/web3.js');
const secretKeyStr = process.env.SOLANA_PRIVATE_KEY;

if (!secretKeyStr) {
  console.log("No private key provided. Wallet guard should trigger.");
  process.exit(0);
}

let secretKey;
try {
    secretKey = Buffer.from(JSON.parse(secretKeyStr));
} catch (e) {
    secretKey = Buffer.from(secretKeyStr, 'hex');
}
try {
  const keypair = Keypair.fromSecretKey(secretKey);
  console.log(keypair.publicKey.toString());
} catch (e) {
  console.error("Invalid secret key format:", e.message);
}
