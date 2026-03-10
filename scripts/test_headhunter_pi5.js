require('dotenv').config();
// Deploy Pi5 activity monitor and run the full Headhunter pipeline
const { Client } = require('ssh2');
const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const PI_IP = process.env.PI_HOST || '192.168.1.78';
const PI_PORT = parseInt(process.env.PI_PORT || '22', 10);
const PI_USER = process.env.PI_USER || 'ed';
const PI_PASSWORD = process.env.PI_PASSWORD;

if (!PI_PASSWORD) {
    console.error(chalk.red('❌ Error: PI_PASSWORD environment variable is not set.'));
    process.exit(1);
}

const OLLAMA_URL = `http://${PI_IP}:11434`;
const MONITOR_URL = `http://${PI_IP}:8888`;
const REPORT_PATH = path.resolve(__dirname, '../missions/upwork_leads_pi5_test.md');

const SYNDICATE_SKILLS = 'Node.js, Python, AI/ML, LLM Integration, Web3/Solana, React/Next.js, FastAPI, Voice AI, Browser Automation, RAG Systems';

// ============================================================
// DEPLOY & START MONITOR ON PI5
// ============================================================
async function deployMonitor() {
    console.log(chalk.cyan('📡 [DEPLOY] Uploading activity monitor to Pi5...'));

    const monitorCode = fs.readFileSync(
        path.resolve(__dirname, 'pi_activity_monitor.js'), 'utf8'
    );

    return new Promise((resolve) => {
        const conn = new Client();
        conn.on('ready', () => {
            // Kill any existing monitor, write the new one, start it
            const commands = [
                'pkill -f pi_activity_monitor.js 2>/dev/null; sleep 1',
                `cat > /home/ed/pi_activity_monitor.js << \'ENDOFFILE\'
${monitorCode}
ENDOFFILE`,
                'nohup node /home/ed/pi_activity_monitor.js > /home/ed/monitor.log 2>&1 &',
                'sleep 2',
                'curl -s http://localhost:8888/status 2>/dev/null || echo "monitor failed to start"',
            ];

            conn.exec(commands.join(' && '), (err, stream) => {
                if (err) { console.log('Deploy err:', err.message); conn.end(); resolve(false); return; }
                let out = '';
                stream.on('data', d => out += d.toString());
                stream.stderr.on('data', d => out += d.toString());
                stream.on('close', () => {
                    if (out.includes('totalRequests') || out.includes('MONITOR_ONLINE')) {
                        console.log(chalk.green('   ✅ Monitor deployed & running on Pi5:8888'));
                        console.log(chalk.green(`   🖥️  Dashboard: http://${PI_IP}:8888/dashboard\n`));
                        resolve(true);
                    } else {
                        console.log(chalk.yellow('   ⚠️ Monitor may not have started: ' + out.substring(0, 200)));
                        resolve(false);
                    }
                    conn.end();
                });
            });
        }).on('keyboard-interactive', (n, i, l, p, f) => {
            f([PI_PASSWORD]);
        }).on('error', e => {
            console.log(chalk.red('   SSH error:', e.message));
            resolve(false);
        }).connect({
            host: PI_IP, port: PI_PORT,
            username: PI_USER, password: PI_PASSWORD,
            tryKeyboard: true, readyTimeout: 15000
        });
    });
}

// ============================================================
// NOTIFY MONITOR
// ============================================================
async function notifyStart(model) {
    try { await axios.get(`${MONITOR_URL}/start?from=laptop&model=${encodeURIComponent(model)}`, { timeout: 3000 }); }
    catch (e) { /* monitor offline, no problem */ }
}
async function notifyStop(elapsed) {
    try { await axios.get(`${MONITOR_URL}/stop?elapsed=${elapsed}`, { timeout: 3000 }); }
    catch (e) { /* monitor offline */ }
}

// ============================================================
// EVALUATE JOBS ONE AT A TIME (avoid timeout)
// ============================================================
async function evaluateJob(job, index, model) {
    const prompt = `Our skills: ${SYNDICATE_SKILLS}

Rate this Upwork job for our team:
"${job.title}" — ${job.description.substring(0, 200)}

Reply with ONLY this format:
MATCH: X/10 | VERDICT: SNIPE or CONSIDER or SKIP | WHY: one sentence`;

    const start = Date.now();
    await notifyStart(model);

    try {
        const resp = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: model,
            prompt: prompt,
            stream: false,
            options: { temperature: 0.3, num_predict: 80 }
        }, { timeout: 60000 }); // 60s per job

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        await notifyStop(elapsed);

        const tps = resp.data.eval_count && resp.data.eval_duration
            ? (resp.data.eval_count / (resp.data.eval_duration / 1e9)).toFixed(1)
            : '?';

        console.log(chalk.green(`   [${index}] ✅ ${elapsed}s (${tps} tok/s): ${resp.data.response.trim().substring(0, 100)}`));
        return { job, eval: resp.data.response.trim(), elapsed, tps };

    } catch (e) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        await notifyStop(elapsed);
        console.log(chalk.red(`   [${index}] ❌ Failed after ${elapsed}s: ${e.message.substring(0, 50)}`));
        return { job, eval: 'EVAL FAILED', elapsed, tps: 0 };
    }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log(chalk.hex('#FF6600').bold('\n══════════════════════════════════════════'));
    console.log(chalk.hex('#FF6600').bold('  HEADHUNTER PI5 FULL PIPELINE v2'));
    console.log(chalk.hex('#FF6600').bold('  Deploy Monitor → Scan → Evaluate → Report'));
    console.log(chalk.hex('#FF6600').bold('══════════════════════════════════════════\n'));

    // Step 0: Deploy monitor
    await deployMonitor();

    // Step 1: Check Ollama
    console.log(chalk.cyan('🔌 [STEP 1] Checking Ollama...'));
    let selectedModel;
    try {
        const resp = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 10000 });
        const models = resp.data.models || [];
        const model = models.find(m => m.name.includes('gemma')) || models[0];
        console.log(chalk.green(`   ✅ Using: ${model.name}\n`));
        selectedModel = model.name;
    } catch (e) {
        console.log(chalk.red(`   ❌ Ollama down: ${e.message}`));
        return;
    }

    // Step 2: Test jobs (RSS is 410, using synthetic data)
    console.log(chalk.cyan('🔍 [STEP 2] Loading test jobs...\n'));
    const jobs = [
        { title: 'Build AI chatbot with GPT-4 API', description: 'Looking for a developer to build a customer service chatbot using OpenAI GPT-4 API. Must have experience with Node.js and React. Budget $2000.' },
        { title: 'Python ML pipeline for sales data', description: 'Need a machine learning pipeline built in Python for analyzing sales data. Must know pandas, scikit-learn, and FastAPI. $1500 fixed.' },
        { title: 'Solana trading bot development', description: 'Looking for developer experienced with Solana Web3.js to build an automated trading bot. Must understand DEX protocols. $3000.' },
        { title: 'LangChain RAG system for legal docs', description: 'Build a Retrieval Augmented Generation system using LangChain to search and analyze legal documents. Vector DB experience required. $4000.' },
        { title: 'WordPress blog migration', description: 'Need to migrate a WordPress blog from one hosting provider to another. Simple migration, no custom code needed. $200.' },
    ];

    // Step 3: Evaluate each job individually
    console.log(chalk.cyan(`🧠 [STEP 3] Evaluating ${jobs.length} jobs via Pi5 (${selectedModel})...\n`));
    const results = await Promise.all(
        jobs.map((job, i) => evaluateJob(job, i + 1, selectedModel))
    );

    // Step 4: Generate report
    console.log(chalk.cyan('\n📝 [STEP 4] Generating report...\n'));

    const ts = new Date().toLocaleString();
    let report = `${'═'.repeat(60)}\n`;
    report += `🎯 HEADHUNTER PI5 REPORT — ${ts}\n`;
    report += `${'═'.repeat(60)}\n\n`;
    report += `🔌 Model: ${selectedModel}\n`;
    report += `📊 Jobs Evaluated: ${results.length}\n`;
    report += `⏱️ Total Time: ${results.reduce((s, r) => s + parseFloat(r.elapsed || 0), 0).toFixed(1)}s\n\n`;

    results.forEach((r, i) => {
        report += `${'─'.repeat(50)}\n`;
        report += `[${i + 1}] ${r.job.title}\n`;
        report += `    ${r.job.description.substring(0, 100)}...\n`;
        report += `    🤖 ${r.eval}\n`;
        report += `    ⏱️ ${r.elapsed}s | ${r.tps} tok/s\n\n`;
    });

    report += `${'═'.repeat(60)}\n[END REPORT]\n`;

    fs.writeFileSync(REPORT_PATH, report);
    console.log(chalk.green(`   ✅ Report saved → missions/upwork_leads_pi5_test.md`));
    console.log(chalk.hex('#FF6600').bold(`\n   🖥️  Pi5 Dashboard: http://${PI_IP}:8888/dashboard\n`));

    // Print results
    console.log(chalk.hex('#FF6600').bold('══════════ RESULTS ══════════'));
    console.log(report);
}

main().catch(e => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
