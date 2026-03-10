require('dotenv').config();
// Quick Ollama sanity test + Pi5 activity visualization
const { Client } = require('ssh2');
const axios = require('axios');
const chalk = require('chalk');

const PI_IP = process.env.PI_HOST || '192.168.1.78';
const PI_PORT = parseInt(process.env.PI_PORT || '22', 10);
const PI_USER = process.env.PI_USER || 'ed';
const PI_PASSWORD = process.env.PI_PASSWORD;

if (!PI_PASSWORD) {
    console.error(chalk.red('❌ Error: PI_PASSWORD environment variable is not set.'));
    process.exit(1);
}

const OLLAMA_URL = `http://127.0.0.1:11434`;

async function main() {
    console.log(chalk.hex('#FF6600').bold('\n=== PI5 OLLAMA QUICK TEST ===\n'));

    // Step 1: Start a visual indicator on the Pi via SSH
    console.log(chalk.cyan('📡 Setting up Pi5 activity visualization...'));
    const sshConn = new Client();

    await new Promise((resolve, reject) => {
        sshConn.on('ready', () => {
            console.log(chalk.green('SSH connected'));

            // Launch a background visual indicator on the Pi's terminal
            sshConn.exec(
                'echo "🧠 [$(date)] INFERENCE REQUEST INCOMING FROM LAPTOP" | wall 2>/dev/null; ' +
                'echo "🧠 SYNDICATE INFERENCE ACTIVE" > /tmp/syndicate_active; ' +
                'echo "Activity indicator set"',
                (err, stream) => {
                    if (err) { console.log('SSH exec err:', err.message); }
                    let out = '';
                    stream.on('data', d => out += d.toString());
                    stream.on('close', () => {
                        console.log(chalk.green('   Pi5 notified: ' + out.trim()));
                        resolve();
                    });
                }
            );
        }).on('keyboard-interactive', (n, i, l, p, f) => {
            f([PI_PASSWORD]);
        }).on('error', e => {
            console.log(chalk.red('SSH error:', e.message));
            resolve(); // Continue anyway
        }).connect({
            host: PI_IP, port: PI_PORT,
            username: PI_USER, password: PI_PASSWORD,
            tryKeyboard: true, readyTimeout: 15000
        });
    });

    // Step 2: Quick inference test with TINY prompt
    console.log(chalk.cyan('\n🧠 Sending tiny test prompt to gemma2:2b...'));
    const start = Date.now();

    try {
        const resp = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: 'gemma2:2b-instruct-q4_0',
            prompt: 'Rate this job 1-10 for an AI developer: "Build a GPT chatbot". Reply with just a number and one sentence.',
            stream: false,
            options: {
                temperature: 0.3,
                num_predict: 100  // Very short response
            }
        }, { timeout: 300000 }); // 5 min timeout

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(chalk.green(`\n✅ RESPONSE in ${elapsed}s:`));
        console.log(chalk.white(resp.data.response));
        console.log(chalk.gray(`\n   Tokens generated: ${resp.data.eval_count || 'N/A'}`));
        if (resp.data.eval_count && resp.data.eval_duration) {
            const tps = (resp.data.eval_count / (resp.data.eval_duration / 1e9)).toFixed(1);
            console.log(chalk.gray(`   Speed: ${tps} tokens/sec`));
        }

    } catch (e) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(chalk.red(`❌ Failed after ${elapsed}s: ${e.message}`));
    }

    // Step 3: Clear activity indicator on Pi
    sshConn.exec('rm -f /tmp/syndicate_active; echo "🧠 [$(date)] INFERENCE COMPLETE" | wall 2>/dev/null', (err) => {
        sshConn.end();
    });

    console.log(chalk.hex('#FF6600').bold('\n=== TEST COMPLETE ===\n'));
}

main().catch(e => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
