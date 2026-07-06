const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Static Analysis: Ensure hardcoded password is gone
const scriptPath = path.join(__dirname, '../../scripts/pi_ollama_expose.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

if (scriptContent.includes('1234qwer') || scriptContent.includes("password: '1234qwer'")) {
    console.error('FAIL: Hardcoded password "1234qwer" found in scripts/pi_ollama_expose.js');
    process.exit(1);
} else {
    console.log('PASS: No hardcoded password found in scripts/pi_ollama_expose.js.');
}

// Ensure the variables 'username' and 'password' are used in the connection config
if (!scriptContent.includes('username, password,')) {
    console.error('FAIL: "username, password," not found in connect method of scripts/pi_ollama_expose.js');
    process.exit(1);
} else {
    console.log('PASS: Correct variables are passed to connect() in scripts/pi_ollama_expose.js.');
}
