# 🐋 AgentSwarm Dashboard
Real-time blockchain monitoring with AI-driven whale tracking on Solana (Frontend)

## Purpose
This dashboard provides a real-time web interface for the AgentSwarm system. It visualizes the activities of the swarm, tracks blockchain transactions, and allows users to monitor the status and performance of different AI agents ("The Crew") coordinated by "The Don".

## Tech Stack
- **Framework**: Next.js (React 19)
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Installation
Ensure you have Node.js installed, then install the dependencies specifically within the `dashboard` directory:

`npm ci`

## Quick Start
Run the Next.js development server:

`npm run dev`

Open `http://localhost:3000` with your browser to see the live tracking dashboard.

## Examples
The `app/page.tsx` file provides the main entry point to the web interface. You can modify this and other components to visualize specific WebSocket streams or REST API endpoints exposed by the main AgentSwarm server.

---
*Part of the larger AgentSwarm ecosystem. For core blockchain orchestration, see the main repository.*
