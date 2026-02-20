# Syndicate Trading Upgrade Plan: Operation Cannibal

## Overview
We are integrating the pro-grade trading logic from `open-sol-bot` into the Syndicate. 
Target: Enable **Pump.fun** sniping and **Raydium** routing for `sniper.js`.

## Phase 1: The "Meat Suit" (Python Executor)
Instead of rewriting complex cryptographic logic immediately, we will use a standalone Python script (`muscle/executor.py`) that acts as a child process for `sniper.js`.

### Logic Source: `open-sol-bot`
1. **Bonding Curve Math:** Found in `libs/common/solbot_common/layouts/bonding_curve_account.py`.
2. **Transaction Building:** Found in `builders/pump.py`.

### New Script: `muscle/executor.py`
*   **Input:** JSON via STDIN (Command, PrivateKey, Mint, Amount).
*   **Output:** JSON via STDOUT (Signature, Status).
*   **Dependencies:** `solana`, `solders`.
*   **Key Functionality:**
    *   Fetch Bonding Curve PDA.
    *   Decode Layout (Discriminator + Virtual Reserves).
    *   Calculate Swap Amounts (Slippage).
    *   Build & Sign Transaction.

## Phase 2: Integration
*   **The Don (`don/syndicate_logic.js`)**: Add `commandTrade(agentId, params)` that spawns the Python executor.
*   **The Sniper (`don/sniper.js`)**: 
    *   Detects `pump.fun` URL.
    *   Calls `executor.py` instead of internal generic swap.

## Data Structures (Bonding Curve)
**Layout V2 (81 bytes):**
*   Discriminator (8 bytes): `6966180631402821399`
*   Virtual Token Reserves (8 bytes: u64)
*   Virtual SOL Reserves (8 bytes: u64)
*   Real Token Reserves (8 bytes: u64)
*   Real SOL Reserves (8 bytes: u64)
*   Token Total Supply (8 bytes: u64)
*   Complete (1 byte: bool)
*   Creator (32 bytes: Pubkey)

## Next Steps
1.  Verify Python environment has `solana` and `solders`.
2.  Finish implementing `muscle/executor.py` with the layout parsing.
3.  Test with a small buy (devnet or micro-amount mainnet).
