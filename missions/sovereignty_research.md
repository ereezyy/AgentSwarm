# Research: Sovereignty & Unkillable Signing (v4.1)

## Objective
To protect the Syndicate's treasury (`SOLANA_PRIVATE_KEY`) while maintaining autonomous execution on a potentially compromised or public-facing node.

## 🛡️ Sovereign Signer (MPC vs FHE)
- **Research Update**: FHE (Zama/TFHE-rs) is excellent for confidential data BUT too slow for real-time Ed25519 signing in HFT.
- **Pivot**: Implementing **Multi-Party Computation (MPC)**. The private key is split into "shares". No single process holds the whole key.
- **Integration**: `SyndicateCore` requests a signature -> MPC nodes (isolates) generate a combined signature.

## ⚡ MEV Defense & Private Markets
- **Jito Bundles**: Atomic execution. We tip the Jito block builder to guarantee inclusion without mempool exposure.
- **Pattern**:
  ```javascript
  const bundle = new Bundle([tx1, tx2], 5); // 5 max tx
  const tipTx = createTipTx(owner, tipAmount, tipAccount); // Add bribe
  bundle.addTransactions(tipTx);
  const res = await searcher.sendBundle(bundle);
  ```
- **Private RPCs**: Routing via **Helius** or **Triton One**. Bypasses the public gossip network.
- **Status**: Ready for Core integration in `SyndicateCore.js`.

## ⛓️ Air-Gapped Fallback Chains
- **Concept**: The signing process resides on a physically isolated device (Raspberry Pi Zero/4) that only accepts transaction hashes via a narrow IPC channel (Serial/USB).
- **Architecture**:
  1. `DonCore` (Mainnet Gateway) -> generates Tx.
  2. `DonCore` -> sends hash to `Signer-Pi` (Air-gapped).
  3. `Signer-Pi` -> prompts for manual confirmation (physical button) or uses limited-permission logic.
  4. `Signer-Pi` -> returns signature.
- **Benefit**: Total isolation from the internet-facing node.

## 🐋 Real-time Propaganda Bridge (Watcher-to-Syla)
- Status: **IMPLEMENTED**
- Integration: `Watcher` detects a whale buy -> `DonCore` routes `COPY_TRADE_SIGNAL` to `Syla`.
- Syla's logic: Immediately interrupts normal post cadence to drop a "Propaganda Pivot" tweet, framing the whale movement as part of the Syndicate's architecture.

## 🛠️ Jules Swarm Scaling
- Status: **IMPLEMENTED (Memory Layer)**
- Persistence: `missions/jules_memory.json` tracks cumulative learning points (e.g., "Always use process.send for logs").
- Evolution: Every new Jules session now includes this context to prevent regressions during code mutation.
