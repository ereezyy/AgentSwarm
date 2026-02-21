process.env.TEST_MODE = 'true';
const { DonCore } = require('../syndicate_logic');
const assert = require('assert');

// Mock console.log to avoid clutter
const logs = [];
const originalLog = console.log;
console.log = (...args) => logs.push(args.join(' '));
console.error = (...args) => logs.push('[ERROR] ' + args.join(' '));

const don = new DonCore();

// Mock dependencies
don.telemetry = {
    profits: {},
    errors: {}
};
don.saveTelemetry = () => {};
don.broadcast = (msg) => {
    don.lastBroadcast = msg;
};
don.log = (msg, level) => {
    don.lastLog = { msg, level };
};
don.spawnSoldier = (type) => {
    don.lastSpawn = type;
};
don.processKickUp = (amount, id, source) => {
    don.lastKickUp = { amount, id, source };
};

// Mock processes
const mockProcess = (name) => {
    return {
        connected: true,
        send: (msg) => {
            if (!don.sentMessages) don.sentMessages = {};
            if (!don.sentMessages[name]) don.sentMessages[name] = [];
            don.sentMessages[name].push(msg);
        }
    };
};

don.processes = {
    'SNIPER': mockProcess('SNIPER'),
    'SIGNAL_BOT': mockProcess('SIGNAL_BOT'),
    'CALLER': mockProcess('CALLER'),
    'FORGER': mockProcess('FORGER'),
    'ECHO_CHAMBER': mockProcess('ECHO_CHAMBER'),
    'SHADOW': mockProcess('SHADOW'),
    'HYDRA': mockProcess('HYDRA'),
    'TWILIO': mockProcess('TWILIO'),
    'ARCHITECT': mockProcess('ARCHITECT'),
    'ORACLE': mockProcess('ORACLE'),
    'DEEPFAKER': mockProcess('DEEPFAKER'),
    'HEADHUNTER': mockProcess('HEADHUNTER'),
    'CLOSER': mockProcess('CLOSER'),
    'SERVICE_FORGE': mockProcess('SERVICE_FORGE'),
    'TREND_HUNTER': mockProcess('TREND_HUNTER'),
    'OMEGA': mockProcess('OMEGA'),
    'ZERO_RUG': mockProcess('ZERO_RUG'),
    'MIRROR': mockProcess('MIRROR'),
    'DEFI_FARMER': mockProcess('DEFI_FARMER'),
    'GHOST': mockProcess('GHOST')
};

// Helper to reset state
const reset = () => {
    don.lastBroadcast = null;
    don.lastLog = null;
    don.lastSpawn = null;
    don.lastKickUp = null;
    don.sentMessages = {};
    don.telemetry.profits = {};
    don.agentComms = [];
};

async function runTests() {
    originalLog('Running tests...');

    if (typeof don.handleAgentMessage !== 'function') {
        throw new Error('handleAgentMessage is not defined on DonCore');
    }

    // Test 1: KICK_UP
    reset();
    const kickUpMsg = { type: 'KICK_UP', amount: 100, source: 'TEST_SOURCE' };
    don.handleAgentMessage(kickUpMsg, 'TEST_AGENT', 1234);
    assert.deepStrictEqual(don.lastKickUp, { amount: 100, id: 1234, source: 'TEST_SOURCE' });
    assert.strictEqual(don.telemetry.profits['TEST_AGENT'], 100);
    assert.strictEqual(don.sentMessages['OMEGA'], undefined, 'KICK_UP should not go to OMEGA (legacy behavior)');

    // Test 2: MARKET_DATA
    reset();
    const marketMsg = { type: 'MARKET_DATA', data: { price: 100 } };
    don.handleAgentMessage(marketMsg, 'TEST_AGENT', 1234);
    assert.deepStrictEqual(don.lastBroadcast, { type: 'MARKET_DATA', data: { price: 100 } });

    // Test 3: INTEL_DATA
    reset();
    const intelMsg = { type: 'INTEL_DATA', data: 'Secret Intel', source: 'WATCHER_SURVEILLANCE' };
    don.handleAgentMessage(intelMsg, 'TEST_AGENT', 1234);
    assert.strictEqual(don.lastBroadcast.type, 'LOG');
    assert.ok(don.lastBroadcast.msg.includes('Secret Intel'));
    assert.strictEqual(don.sentMessages['SIGNAL_BOT'].length, 1);

    // Test 4: SNIPE_SUCCESS
    reset();
    const snipeMsg = { type: 'SNIPE_SUCCESS', mint: 'TOKEN123' };
    don.handleAgentMessage(snipeMsg, 'TEST_AGENT', 1234);
    assert.strictEqual(don.sentMessages['ECHO_CHAMBER'].length, 1);
    assert.strictEqual(don.sentMessages['SIGNAL_BOT'].length, 1);

    // Test 5: BLACKLIST_REQUEST
    reset();
    const blacklistMsg = { type: 'BLACKLIST_REQUEST', target: 'BAD_GUY' };
    don.handleAgentMessage(blacklistMsg, 'TEST_AGENT', 1234);
    assert.strictEqual(don.sentMessages['SNIPER'].length, 1);
    assert.strictEqual(don.sentMessages['ZERO_RUG'], undefined);

    // Test 6: AGENT_COMMS
    reset();
    const commsMsg = { type: 'AGENT_COMMS', msg: 'Hello World' };
    don.handleAgentMessage(commsMsg, 'TEST_AGENT', 1234);
    assert.strictEqual(don.agentComms.length, 1);
    assert.strictEqual(don.lastBroadcast.type, 'AGENT_COMMS');

    originalLog('All tests passed!');
}

try {
    runTests();
} catch (e) {
    originalLog('Test failed: ' + e.message);
    process.exit(1);
}
