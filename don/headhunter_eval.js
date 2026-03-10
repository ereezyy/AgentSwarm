// don/headhunter_eval.js
const chalk = require('chalk');
const { ask } = require('./brain');

module.exports = function(config) {
    const { id, hh } = config;

async function evaluateJobs(jobs) {
    if (jobs.length === 0) return jobs.map(j => ({ ...j, matchScore: 5, verdict: 'CONSIDER', estimatedProfit: 'Unknown', difficulty: 5, strategy: '', timeEstimate: '', flags: '' }));

    try {
        console.log(hh(`🧠 Grok evaluating ${jobs.length} REAL opportunities (BOOTSTRAP MODE: Top 5)...`));
        // Throttled to 5 to save API credits
        const summaries = jobs.slice(0, 5).map((j, i) => `[${i + 1}] "${j.title}" | Source: ${j.source} | Desc: ${j.description.substring(0, 200)}...`).join('\n\n');

        const content = await ask(
            `Evaluate these jobs:\n\n${summaries}`,
            `You are 'The Headhunter', revenue ops lead. Evaluate these job listings.
Format:
---
JOB: [title]
MATCH: [1-10]
VERDICT: [SNIPE / CONSIDER / SKIP]
PROFIT: $[est]
DIFFICULTY: [1-10]
TIME: [hours]h
STRATEGY: [pitch]
FLAGS: [concerns]
---
SNIPE = match 7+, we can do it.`,
            { agentName: `HEADHUNTER #${id}` }
        );

        if (content) return parseEval(content, jobs);
    } catch (e) {
        console.error(chalk.red(`[HEADHUNTER #${id}]: Grok eval failed: ${e.message}`));
    }
    return jobs.map(j => ({ ...j, matchScore: 5, verdict: 'CONSIDER', estimatedProfit: 'Unknown' }));
}

async function generateProposal(job) {
    try {
        console.log(hh(`✍️ Drafting proposal for: "${job.title}"...`));
        const content = await ask(
            `Write proposal for: ${job.title}\nDesc: ${job.description}`,
            `You are an expert freelancer. Write a personalized, concise proposal (<200 words). No "Dear Hiring Manager". Start with value.`,
            { agentName: `HEADHUNTER #${id}` }
        );
        return content;
    } catch (e) { return null; }
}

function parseEval(evalText, originalJobs) {
    const blocks = evalText.split('---').filter(b => b.trim());
    const evaluated = [];
    for (const block of blocks) {
        const ms = block.match(/MATCH:\s*(\d+)/i);
        const verdict = block.match(/VERDICT:\s*(SNIPE|CONSIDER|SKIP)/i);
        if (ms) {
            const jt = block.match(/JOB:\s*(.+?)(?:\n|MATCH)/is);
            const title = jt ? jt[1].trim() : 'Unknown';
            // Lenient matching
            const orig = originalJobs.find(r => r.title.includes(title.substring(0, 15)) || title.includes(r.title.substring(0, 15)));

            evaluated.push({
                title,
                url: orig?.url || '',
                matchScore: parseInt(ms[1]),
                verdict: verdict ? verdict[1] : 'CONSIDER',
                estimatedProfit: (block.match(/PROFIT:\s*\$?([\d,]+)/i) || [])[1] || 'Unknown',
                difficulty: (block.match(/DIFFICULTY:\s*(\d+)/i) || [])[1] || 5,
                strategy: (block.match(/STRATEGY:\s*(.+?)(?:\n|FLAGS)/is) || [])[1] || '',
                flags: (block.match(/FLAGS:\s*(.+?)(?:\n|VERDICT)/is) || [])[1] || 'None',
                timeEstimate: (block.match(/TIME:\s*(\d+)/i) || [])[1] || 'N/A',
                source: orig?.source || 'Unknown'
            });
        }
    }
    evaluated.sort((a, b) => b.matchScore - a.matchScore);
    return evaluated;
}

    return {
        evaluateJobs,
        generateProposal
    };
};
