// tests/test_a2a.js - Test script for Syndicate A2A communication
const don = require('../don/syndicate_logic');
const SessionManager = require('../don/sessions');

async function testA2A() {
    console.log("Starting A2A Test...");

    // Mock processes
    don.processes['TEST_SENDER'] = { connected: true, send: (m) => console.log("SENDER RECEIVED:", m) };
    don.processes['TEST_RECEIVER'] = { connected: true, send: (m) => console.log("RECEIVER RECEIVED:", m) };

    const sessions = new SessionManager(don);

    console.log("List:", sessions.list());

    console.log("Sending message...");
    const success = sessions.send('TEST_SENDER', 'TEST_RECEIVER', '[PROPOSAL] Attack the exchange.');
    console.log("Send Success:", success);

    console.log("History:", sessions.history('TEST_RECEIVER'));

    process.exit(0);
}

testA2A();
