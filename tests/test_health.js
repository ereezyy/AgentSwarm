// tests/test_health.js - Test script for Syndicate Health Audit
const health = require('../skills/syndicate/healthcheck');

async function testHealth() {
    console.log("Starting Swarm Health Audit...");
    const report = await health.audit();
    console.log("Audit Report:", JSON.stringify(report, null, 2));
    process.exit(0);
}

testHealth();
