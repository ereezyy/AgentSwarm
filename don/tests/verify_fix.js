const { nmapScan } = require('../ghost.js');
const chalk = require('chalk');

async function testFix() {
    console.log(chalk.blue("Testing don/ghost.js nmapScan fix..."));

    // 1. Test Valid Input (Localhost IP)
    // Note: nmapScan returns stdout or null.
    // If nmap is installed, it should return stdout. If not, null.
    // We assume nmap is installed (verified earlier).
    try {
        console.log(chalk.gray("Testing valid IP: 127.0.0.1"));
        const validResult = await nmapScan('127.0.0.1');
        if (validResult !== null) {
            console.log(chalk.green("✅ Valid IP scan succeeded."));
        } else {
            console.log(chalk.yellow("⚠️ Valid IP scan returned null (nmap might not be working, but that's okay as long as it didn't crash)."));
        }
    } catch (e) {
        console.error(chalk.red("❌ Valid IP scan threw error:"), e);
    }

    // 2. Test Invalid Input (Should fail validation)
    try {
        console.log(chalk.gray("Testing invalid input: 'invalid-host'"));
        const invalidResult = await nmapScan('invalid-host');
        if (invalidResult === null) {
            console.log(chalk.green("✅ Invalid input correctly rejected (returned null)."));
        } else {
            console.error(chalk.red("❌ Invalid input was NOT rejected. Result:"), invalidResult);
        }
    } catch (e) {
        console.error(chalk.red("❌ Invalid input threw error:"), e);
    }

    // 3. Test Command Injection Payload
    try {
        console.log(chalk.gray("Testing injection payload: '127.0.0.1; echo HACKED'"));
        const injectionResult = await nmapScan('127.0.0.1; echo HACKED');

        // It should return null because validation regex won't match "127.0.0.1; echo HACKED"
        if (injectionResult === null) {
             console.log(chalk.green("✅ Injection payload rejected by validation."));
        } else if (!injectionResult.includes('HACKED')) {
             console.log(chalk.green("✅ Injection payload executed but 'HACKED' not found (execFile handled args safely)."));
        } else {
             console.error(chalk.red("❌ VULNERABILITY DETECTED: 'HACKED' found in output!"));
             process.exit(1);
        }

    } catch (e) {
        console.error(chalk.red("❌ Injection test threw error:"), e);
    }

    // 4. Test Valid CIDR
    try {
        console.log(chalk.gray("Testing valid CIDR: 127.0.0.1/32"));
        const cidrResult = await nmapScan('127.0.0.1/32');
        if (cidrResult !== null) {
            console.log(chalk.green("✅ Valid CIDR scan succeeded."));
        } else {
            console.log(chalk.yellow("⚠️ Valid CIDR scan returned null."));
        }
    } catch (e) {
        console.error(chalk.red("❌ Valid CIDR scan threw error:"), e);
    }

    console.log(chalk.blue("Verification complete."));
}

testFix();
