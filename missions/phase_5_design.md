# Mission: Phase 5 - Deep Social Injection (The Phone Farm Swarm)

## Objective
To weaponize the physical phone farm for viral growth by integrating it with Syla's narrative core. This creates an unblockable engagement loop that bypasses digital shadowban heuristics.

## Components

### 1. Farm Agent (`don/farm_agent.js`)
A dedicated agent that wraps `muscle/farm_bridge.js`.
- **Function**: Manages the registry of physical Android devices.
- **Workflow**: 
    1. Receives `FARM_BOOST` or `FARM_POST` from The Don.
    2. Parallelizes execution across all connected devices via ADB.
    3. Simulates human-like dwell time, scrolling, and interaction (likes/reposts).

### 2. Syla Integration (`don/influencer.js`)
- **Upgrade**: Syla now triggers a `FARM_BOOST` message for every tweet she makes.
- **Logic**: Syla generates a "Hype Target" (the URL of her new tweet) and sends it to the swarm for immediate engagement.

### 3. Viral Hype Loop (The Don)
- **Coordination**: `syndicate_logic.js` acts as the traffic controller, routing Syla's posts to the `Farm Agent`.

## Verification Plan
1. **Physical Link**: Run `adb devices` to confirm connection to the farm.
2. **Signal Test**: Manually trigger a `FARM_BOOST` command and observe device activity.
3. **Loop Test**: Observe automated posting -> automated farm engagement cycle.
