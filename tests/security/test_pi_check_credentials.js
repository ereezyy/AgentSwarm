const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Static Analysis: Ensure hardcoded password is gone
const scriptPath = path.join(__dirname, '../../scripts/pi_check.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

if (scriptContent.includes('1234qwer')) {
    console.error('FAIL: Hardcoded password "1234qwer" found in scripts/pi_check.js');
    process.exit(1);
} else {
    console.log('PASS: No hardcoded password found.');
}

// 2. Dynamic Analysis: Mock ssh2 and check credentials
const { checkPi } = require('../../scripts/pi_check.js');

class MockClient {
    constructor() {
        this.handlers = {};
    }

    on(event, callback) {
        this.handlers[event] = callback;
        return this;
    }

    connect(config) {
        console.log('MockClient connect called with:', { ...config, password: '***' });

        // Check password in connect config
        try {
            assert.strictEqual(config.password, process.env.PI_PASSWORD, 'Connect config password mismatch');
            console.log('PASS: Connect config uses env password.');
        } catch (e) {
            console.error(e);
            process.exit(1);
        }

        // Check password in keyboard-interactive
        if (this.handlers['keyboard-interactive']) {
            this.handlers['keyboard-interactive'](
                'name', 'instr', 'lang', [],
                (responses) => {
                    try {
                        assert.strictEqual(responses[0], process.env.PI_PASSWORD, 'Keyboard-interactive password mismatch');
                        console.log('PASS: Keyboard-interactive uses env password.');
                    } catch (e) {
                        console.error(e);
                        process.exit(1);
                    }
                }
            );
        } else {
            console.error('FAIL: No keyboard-interactive handler registered.');
            process.exit(1);
        }
    }

    exec() {}
    end() {}
}

// Set env var for test
process.env.PI_PASSWORD = 'test_secret_password_123';
process.env.NODE_ENV = 'test';

try {
    console.log('Running checkPi with MockClient...');
    checkPi(MockClient);
    console.log('All tests passed!');
} catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
}
