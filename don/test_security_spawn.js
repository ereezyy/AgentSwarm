process.env.NODE_ENV = 'test';
const don = require('./syndicate_logic');
const assert = require('assert');

// Mock log to capture output
const logs = [];
don.log = (msg, type) => {
    logs.push({ msg, type });
    console.log(`[MOCK LOG] ${type}: ${msg}`);
};

// Override broadcast to avoid errors if any
don.broadcast = () => {};

console.log('--- Testing Vulnerability Fix ---');

const maliciousType = '../evil';

// Ensure clean state
if (don.processes[maliciousType]) delete don.processes[maliciousType];

try {
    don.spawnSoldier(maliciousType);
} catch (e) {
    console.log('spawnSoldier threw error:', e);
}

// Check results
const securityAlert = logs.find(l => l.msg.includes('Security Alert') || l.msg.includes('Invalid agent type'));
const processSpawned = don.processes[maliciousType];

if (securityAlert) {
    console.log('PASS: Security alert detected.');
} else {
    console.log('FAIL: No security alert detected.');
}

if (processSpawned) {
    console.log('FAIL: Process was spawned (vulnerability present).');
    // Cleanup if it's a real process object
    if (processSpawned.kill) processSpawned.kill();
} else {
    console.log('PASS: Process was NOT spawned.');
}

if (securityAlert && !processSpawned) {
    console.log('SUCCESS: Vulnerability is fixed.');
    process.exit(0);
} else {
    console.log('FAILURE: Vulnerability is still present.');
    process.exit(1);
}
