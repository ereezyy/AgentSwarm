const chalk = require('chalk');
const path = require('path');
const { execFile } = require('child_process');

const id = process.argv[2] || 'Headhunter';
const hh = (msg) => chalk.hex('#FF6600')(`[HEADHUNTER #${id}]: ${msg}`);

async function deepResearch(job) {
    console.log(hh(`🔍 Performing Deep Background Research for: "${job.title}"...`));

    const leadData = {
        id: job.id,
        company: job.clientInfo?.source === 'Reddit' ? job.clientInfo.author : (job.title.split('at')[1] || job.title).trim(),
        title: job.title,
        description: job.description,
        industry: job.category
    };

    return new Promise((resolve) => {
        const researchPath = path.join(__dirname, '../muscle/research_agent.py');
        execFile('python', [researchPath, JSON.stringify(leadData)], {
            timeout: 30000
        }, async (error, stdout, stderr) => {
            if (error) {
                console.log(chalk.red(`  ❌ Research Muscle failed: ${error.message}`));
                resolve(null);
                return;
            }
            try {
                // NEW: Use Summarizer Bridge if data is too large for industrial-grade processing
                if (stdout.length > 3000) {
                    console.log(hh(`🧠 Input data too large (${stdout.length} chars). Summarizing...`));
                    const summary = await summarizeResearch(stdout);
                    resolve(summary);
                } else {
                    const research = JSON.parse(stdout);
                    console.log(hh(`🧬 Deep Research Complete. Tech: ${research.technology_stack?.join(', ') || 'N/A'}`));
                    resolve(research);
                }
            } catch (e) {
                console.log(chalk.red(`  ❌ Research Muscle parse error: ${e.message}`));
                resolve(null);
            }
        });
    });
}

async function summarizeResearch(content) {
    return new Promise((resolve) => {
        const summarizerPath = path.join(__dirname, '../muscle/summarizer_bridge.py');
        const child = execFile('python', [summarizerPath], (err, stdout) => {
            if (err) {
                console.log(chalk.red(`  ❌ Summarization failed: ${err.message}`));
                resolve({ summary: "Summarization failed", key_signals: ["ERROR"] });
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                resolve({ summary: "Parse failed during summarization", key_signals: ["ERROR"] });
            }
        });
        child.stdin.write(JSON.stringify({ content }));
        child.stdin.end();
    });
}

module.exports = { deepResearch };
