# OPERATION: IRONCLAD SYNDICATE
## Objective: Elevate the Syndicate to a Robust, Industrial-Grade Trading Swarm.

The user has demanded a "robust, strong, powerful program." The current iteration is functional but fragile. We will implement structural hardening across the entire stack.

---

### PHASE 1: STABILIZATION (The Concrete Foundation)
**Goal:** Eliminate crash loops and ensure 100% uptime permanence.

- [ ] **Agent Supervisor (The Capo):**
    - [ ] Create `don/capo.js`: A specialized process manager that wraps all agents.
    - [ ] replaces naive `fork()` calls with a monitor that captures `stderr`, implements exponential backoff for restarts (stops the 10s spawn/die loop), and reports "Agent Health" to the dashboard.
- [ ] **Fix "The Influencer" (Syla):**
    - [ ] Diagnose the persistent crash in `don/influencer.js`.
    - [ ] Implement a "Safe Mode" boot where she validates API keys (XAI, RAPIDAPI) before attempting to run, preventing immediate exits.
- [ ] **Wallet Watchdog:**
    - [ ] Create a dedicated reliable background check for SOL balance.
    - [ ] Fix the "Balance: 0" false negatives by using a robust RPC retry loop.

### PHASE 2: LETHALITY (The Trading Engine)
**Goal:** Faster execution, smarter connections, dynamic fees.

- [ ] **WebSocket Hardening (Sniper & Watcher):**
    - [ ] Implement `KeepAlive` and `Auto-Reconnect` logic for the Solana connection.
    - [ ] If the mainnet stream drops, the agent should effectively "hold breath" and reconnect immediately, logging a distinct warning.
- [ ] **Dynamic Gas (Jito+):**
    - [ ] detailed gas strategy. instead of flat 150k lamports, query recent priorization fees and bid `median + 10%`.
- [ ] **The "One Shot" Guarantee:**
    - [ ] Add a `dry_run` flag to the Python executor to verify the transaction *would* succeed before sending, reducing failed tx fees.

### PHASE 3: OMNISCIENCE (The Dashboard V2)
**Goal:** The user must *see* the power.

- [ ] **Real-Time Telemetry:**
    - [ ] The dashboard should show "Connection Quality" (Latency to RPC).
    - [ ] Visual "Heartbeat" for each agent (Green pulse = running logic, Red = stalled).
- [ ] **Event Stream Clarity:**
    - [ ] Color-coded events: 
        - 🟢 **PROFIT/TRADE**
        - 🔵 **SOCIAL ACTION**
        - 🔴 **CRITICAL ERROR**
        - 🟡 **WARNING/RETRY**

---

### EXECUTION ORDER
1. **Analyze:** Read `don/influencer.js` and `don/syndicate_logic.js` to identify the crash root cause.
2. **Architect:** Build `don/capo.js` (The Supervisor).
3. **Refine:** Upgrade `sniper.js` with the new connection logic.
