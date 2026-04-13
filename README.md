# 🐋 AgentSwarm
Real-time blockchain monitoring with AI-driven whale tracking on Solana

## Purpose
AgentSwarm is an autonomous recursive gangster swarm ("The Syndicate") designed to monitor blockchain activity, track whales on Solana in real-time, and execute automated actions like MEV and arbitrage. It uses sub-agents ("The Crew") orchestrated by a central intelligence ("The Don") to identify and act on profitable opportunities across decentralized exchanges.

## Tech Stack
- **Core Node**: Node.js (The Don)
- **AI/LLM**: Google Gemini API, OpenAI, Anthropic, Groq
- **Blockchain**: Solana Web3.js, SPL Token, Jito MEV Bundles
- **Swarm Elements**: Python (The Enforcer / self-operating-computer)
- **Frontend Dashboard**: Next.js (React)

## Installation

### 1. The Don (Core Setup)
Install root dependencies:
`npm ci`

### 2. The Muscle (Python AI Actions)
Install Python components (optional, but needed for 'The Enforcer'):
`pip install self-operating-computer`

### 3. The Dashboard (Frontend UI)
Install Next.js dependencies:
`cd dashboard`
`npm ci`

### 4. Configuration
Rename `.env.example` to `.env` and fill in your keys:
`cp .env.example .env`

## Quick Start

Start the main orchestrator (The Don):
`npm run start`

Start the interactive terminal (OpenClaw):
`powershell ./scripts/run_gemini_cli.ps1`

Start the Dashboard (UI):
`cd dashboard`
`npm run dev`

## Examples
- Run `node don/check_balance.js` to view current balances and Solana metrics.
- Agent scripts automatically identify tokens and compute arbitrage or MEV extraction using Jito tips and Jupiter swaps.

---
*Note: GitHub repository descriptions are maintained through GitHub repository settings. We encourage configuring the description to: `Real-time blockchain monitoring with AI-driven whale tracking on Solana`*
