# INFINITE HYPERNOVA — SYNDICATE MANIFESTO v3.1

> *"Silence is power. Autonomy is survival. Profit is destiny."*

## Overview

Infinite Hypernova is an autonomous AI agent swarm operating on mainnet Solana with real-time market intelligence, social engineering, revenue generation, and self-evolution capabilities. The system is orchestrated by "The Don" (`syndicate_logic.js`) and controlled via an interactive CLI (`index.js`).

---

## Architecture

### The Don (Orchestrator)
- **File:** `don/syndicate_logic.js`
- **Role:** Central command. Spawns agents, routes IPC messages, manages WebSocket, tracks profit.
- **Features:**
  - Duplicate spawn prevention
  - Auto-restart crashed agents (10s cooldown)
  - **Crash Intelligence:** Notifies Architect of agent crashes for auto-rollback
  - Telemetry persistence to `missions/telemetry.json`
  - WebSocket broadcast to dashboard on port 8080

### Command Center (CLI)
- **File:** `don/index.js`
- **Commands:** `status`, `crew`, `hunt`, `spawn`, `speak`, `tweet`, `call`, `audit`, `recon`, `probe`, `leads`, `help`, `exit`
- **Evolution Commands:**
  - `evolve <agent>`: Trigger targeted mutation
  - `evolve-status`: View success/fail metrics
  - `rollback <agent>`: Manual rollback to last backup

### The Architect (Evolution Engine v4.1)
- **File:** `don/architect.js`
- **Role:** Self-improving codebase engine. Analyzes telemetry -> Mutates agent code -> Deploys updates.
- **Safety Pipeline (7 Gates):**
  1. **Size Check:** Block bloating (>1.4x) or gutting (<0.4x)
  2. **Syntax Check:** Valid Javascript verification
  3. **Dangerous Pattern Scan:** Regex detection of miners, infinite loops, exfil webhooks
  4. **Structural Check:** Ensure IPC (`process.send`) and imports (`require`) are preserved
  5. **Conditional Check:** Prevent loss of critical event listeners
  6. **Health Check:** Ensure function count doesn't drop to zero
  7. **Boot Test (Sandbox):** Pre-deploy fork test for 8s to catch runtime crashes
- **Resilience:**
  - **Auto-Rollback:** Reverts code if agent crashes within 5 mins of deploy
  - **Last Known Good:** Saves "bedrock" copy of stable agents for deep recovery

---

## Agent Roster

### INTELLIGENCE DIVISION
| Agent | File | Role |
|-------|------|------|
| **The Siren** | `siren.js` | Strategic research via xAI (Grok). SOL funding leads |
| **The Ghost** | `ghost.js` | Network recon (ARP, port probes, optional nmap) |
| **The Watcher** | `watcher.js` | Whale wallet tracking with transaction analysis |
| **The Oracle** | `oracle.js` | Token security audits via RugCheck + on-chain checks |
| **The Librarian** | `moltbook.js` | Skill acquisition via git clone + auto-install |
| **The Incubator** | `incubator.js` | AI-powered memecoin concept generation |
| **The Architect** | `architect.js` | Self-evolution engine: analyzes telemetry, mutates agents |

### EXECUTION DIVISION
| Agent | File | Role |
|-------|------|------|
| **The Sniper** | `sniper.js` | High-frequency SOL trading with MEV protection (Jito) |
| **The Shadow** | `shadow.js` | Headless browser automation (Puppeteer) |
| **The Forger** | `forge.js` | Visual asset generation via DALL-E 3 |
| **The Deepfaker** | `deepfaker.js` | Video avatar generation via HeyGen |

### REVENUE DIVISION
| Agent | File | Role |
|-------|------|------|
| **The Hustler** | `hustler.js` | Real-time market intelligence with trend detection & alerts |
| **The Banker** | `banker.js` | Cross-exchange arbitrage (Jupiter vs Binance) |
| **The Scavenger** | `scavenger.js` | Autonomous faucet claiming & revenue discovery |
| **The Headhunter** | `headhunter.js` | Upwork job scanning, AI evaluation, proposal drafting |

### COMMS DIVISION
| Agent | File | Role |
|-------|------|------|
| **Syla (Influencer)** | `influencer.js` | AI influencer personality. Content generation & posting |
| **The Caller** | `caller.js` | Voice synthesis via Deepgram. Periodic status updates |
| **Twilio Bridge** | `twilio_bridge.js` | Outbound phone calls via Twilio Studio Flows |

---

## Supporting Modules
| File | Purpose |
|------|---------|
| `edge_brain.js` | Pi 5 + Hailo-8 local LLM inference (Ollama) |
| `mev_bundler.js` | Jito bundle wrapping for MEV protection |
| `syndicate_core.js` | Market micro-order API abstraction |
| `engage.js` | Moltbook identity registration for agents |
| `soldier.js` | Generic operative with mission directory monitoring |

---

## Environment Variables

Required in `.env`:
```
XAI_API_KEY=          # xAI (Grok) API key
XAI_BASE_URL=         # xAI endpoint
SOLANA_RPC_URL=       # Solana RPC (Helius/QuickNode)
SOLANA_PRIVATE_KEY=   # Wallet private key
DEEPGRAM_API_KEY=     # Voice synthesis
TWILIO_ACCOUNT_SID=   # Phone calls
TWILIO_AUTH_TOKEN=    # Phone calls
TWILIO_FLOW_SID=      # Studio Flow
TWILIO_FROM_NUMBER=   # Caller ID
YOUR_PHONE=           # Alert destination
PI_IP=                # Raspberry Pi 5 address
PI_USER=              # Pi SSH user
PI_PASS=              # Pi SSH password
UPWORK_ACCESS_TOKEN=  # Headhunter API
RAPIDAPI_KEY=         # Twitter trends
OPENAI_API_KEY=       # DALL-E (Forger)
HEYGEN_API_KEY=       # Video (Deepfaker)
```

---

## Quick Start

```bash
# Start The Don (all agents spawn automatically)
npm start

# Start Dashboard (separate terminal)
cd dashboard && npm run dev

# Open dashboard
# http://localhost:3000
```

---

## Status: v3.1 (February 2026)

### Recent Upgrades
- ✅ **Architect v4.1**: 7-gate safety pipeline, auto-rollback, pre-deploy boot testing
- ✅ Fixed critical `fs` import bug in telemetry saving
- ✅ Eliminated duplicate ORACLE spawn
- ✅ Dashboard rebuilt with tabbed views and agent roster
- ✅ CLI Command Center with full agent control + evolution commands
- ✅ Ghost: Zero-dependency recon (no nmap required)
- ✅ Hustler: Trend detection, price alerts, phone calls on 7%+ moves
- ✅ Watcher: Transaction dedup, SOL amount tracking, swap detection
- ✅ Oracle: Real-only audits (no more random simulations)
- ✅ Incubator: Fixed directory creation crash
- ✅ Engage: Fixed JSON parse error in swarm ledger
- ✅ Duplicate spawn prevention in The Don

### Known Limitations
- Jito MEV bundler: Auth challenge failure (PERMISSION_DENIED). Using standard RPC fallback.
- Upwork token: `UPWORK_ACCESS_TOKEN` must be manually populated.
- HeyGen: Requires premium API key for video generation.
- Edge Brain: Requires Pi 5 powered on and Ollama running.

---

## STRATEGIC EXPANSION (NEXT MOVES)

### Phase 1: Profit Reinforcement
1.  **Operation Zero-Rug (Defense)**
    *   **Concept:** Synchronous check of Oracle "bad_actors.json" before Sniper fires.
    *   **Flow:** Sniper -> Local Blacklist Check -> Buy -> Async Deep Audit -> Dump if Fail.
    *   **Value:** Drastically increases win rate by filtering scams at speed.

2.  **The Closer (Revenue)**
    *   **Concept:** Headhunter tracks Proposal -> Interview -> Payment lifecycle.
    *   **Flow:** Monitor Upwork messages/contracts -> Verify payouts to wallet -> Reinvest.
    *   **Value:** Shifts metric from "leads generated" to "SOL banked."

3.  **The Trend Hunter (Alpha)**
    *   **Concept:** Social-to-Snipe pipeline.
    *   **Flow:** Shadow scans X for trusted influencers/callers -> Parses CA -> Sniper Auto-Buys.
    *   **Value:** Captures "call channel" alpha before the crowd reacts.

### Phase 2: Systemic Influence
4.  **Operation Echo Chamber (Marketing) ✅ [ACTIVE]**
    *   **Concept:** Unify Execution and Comms.
    *   **Flow:** Sniper buys token -> Signals Forger (Meme Gen) -> Signals Shadow (Tweet) -> Viral Loop.
    *   **Value:** Every bag gets an instant, automated marketing army pushing it.

5.  **The Hydra (Consensus)**
    *   **Concept:** Manufacture social proof via debate.
    *   **Flow:** Syla posts -> 5 lightweight sub-agents reply/argue/validate -> Algo boost.
    *   **Value:** Organic-looking engagement that triggers social algorithms.

6.  **The Mirror Protocol (Curation)**
    *   **Concept:** Algorithmic Whale Qualification.
    *   **Flow:** Watcher spots big mover -> Banker audits PnL -> "APPROVED_ALPHA" tag -> Sniper copies.
    *   **Value:** Stops copying luck; starts copying proven winners.

### Phase 3: Total Autonomy
7.  **The Dark Pool (Infiltration)**
    *   **Concept:** Private alpha scraping from Discord/Telegram.
    *   **Flow:** Shadow logs into "Alpha Caller" channels -> Scrapes CAs -> Sniper front-runs public.
    *   **Value:** Information asymmetry. Buying before the tweet hits.

8.  **Protocol Omega (Treasury)**
    *   **Concept:** Automated capital allocation.
    *   **Flow:** Profit > 0.5 SOL -> Banker splits: 40% Vault (untouchable), 40% Reinvest, 20% R&D.
    *   **Value:** The swarm builds a war chest that outlives any single failed trade or agent.
