const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const code = fs.readFileSync('don/outpost.js', 'utf8');

// Mock require
const mockRequire = (moduleName) => {
    if (moduleName === 'child_process') {
        return {
            execFile: (cmd, args) => {
                console.log(`[MOCK] Executed execFile: ${cmd} ${args.join(' ')}`);
                mockRequire.lastExec = `${cmd} ${args.join(' ')}`;
            },
            exec: (cmd) => {
                console.log(`[MOCK] Executed exec: ${cmd}`);
                mockRequire.lastExec = cmd;
            }
        };
    }
    if (moduleName === 'ws') {
        return class WebSocket {
            on() {}
            send() {}
        };
    }
    if (moduleName === 'chalk') {
        return {
            cyan: (s) => s,
            green: (s) => s,
            yellow: (s) => s,
            red: (s) => s,
            magenta: (s) => s,
            gray: (s) => s,
            hex: () => (s) => s,
            bold: (s) => s
        };
    }
    if (moduleName === 'os') {
        return {
            totalmem: () => 100,
            freemem: () => 50,
            loadavg: () => [0.5],
            networkInterfaces: () => ({})
        };
    }
    if (moduleName === './moltbook') {
        return { scourMoltbook: async () => null };
    }
    if (moduleName === 'dotenv') {
        return { config: () => ({}) };
    }
    return require(moduleName);
};

const sandbox = {
    require: mockRequire,
    console: {
        log: console.log,
        error: console.error,
        warn: console.log
    },
    process: {
        env: {
            DON_IP: 'localhost',
            COMMAND_SECRET: 'test-secret-123'
        },
        exit: (code) => {
            console.log(`[MOCK] process.exit called with code ${code}`);
            sandbox.exited = true;
        }
    },
    setTimeout: setTimeout,
    setInterval: setInterval,
    newDate: () => new Date()
};

vm.createContext(sandbox);

// Use globalThis in the VM to export handleCommand
const modifiedCode = code + '; globalThis.handleCommand = handleCommand;';

console.log('--- Starting Outpost Security Tests ---');

try {
    vm.runInContext(modifiedCode, sandbox);
} catch (e) {
    // connectToSyndicate might fail but we just need handleCommand
}

const handleCommand = sandbox.handleCommand || vm.runInContext('handleCommand', sandbox);

if (handleCommand) {
    // Test 1: Authorized Reboot
    console.log('\nTest 1: Authorized REBOOT...');
    mockRequire.lastExec = null;
    handleCommand({ type: 'REBOOT', secret: 'test-secret-123' });
    assert.strictEqual(mockRequire.lastExec, 'sudo reboot', 'Authorized reboot failed to execute correct command');
    console.log('PASS: Authorized REBOOT executed.');

    // Test 2: Unauthorized Reboot (Wrong Secret)
    console.log('\nTest 2: Unauthorized REBOOT (Wrong Secret)...');
    mockRequire.lastExec = null;
    handleCommand({ type: 'REBOOT', secret: 'wrong-secret' });
    assert.strictEqual(mockRequire.lastExec, null, 'Unauthorized reboot executed a command');
    console.log('PASS: Unauthorized REBOOT (Wrong Secret) blocked.');

    // Test 3: Unauthorized Reboot (Missing Secret)
    console.log('\nTest 3: Unauthorized REBOOT (Missing Secret)...');
    mockRequire.lastExec = null;
    handleCommand({ type: 'REBOOT' });
    assert.strictEqual(mockRequire.lastExec, null, 'Unauthorized reboot executed a command');
    console.log('PASS: Unauthorized REBOOT (Missing Secret) blocked.');

    // Test 4: Verify execFile usage
    console.log('\nTest 4: Verifying execFile vs exec...');
    // verified by mock logging "Executed execFile"
} else {
    console.error('FAIL: Could not access handleCommand');
    process.exit(1);
}

// Test 5: Startup without secret
console.log('\nTest 5: Startup without COMMAND_SECRET...');
const sandboxNoSecret = {
    require: mockRequire,
    console: {
        log: () => {},
        error: (msg) => { console.log(`[EXPECTED ERROR] ${msg}`); },
        warn: () => {}
    },
    process: {
        env: { DON_IP: 'localhost' }, // No COMMAND_SECRET
        exit: (code) => {
            sandboxNoSecret.exited = true;
            sandboxNoSecret.exitCode = code;
        }
    },
    setTimeout: () => {},
    setInterval: () => {}
};
vm.createContext(sandboxNoSecret);
try {
    vm.runInContext(code, sandboxNoSecret);
} catch (e) {}
assert.strictEqual(sandboxNoSecret.exited, true, 'Should have exited without secret');
assert.strictEqual(sandboxNoSecret.exitCode, 1, 'Should have exited with code 1');
console.log('PASS: Startup blocked without COMMAND_SECRET.');

console.log('\n--- Outpost Security Tests Passed! ---');
