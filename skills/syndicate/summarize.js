// skills/syndicate/summarize.js - PORTED FROM OPENCLAW
// Logic for high-speed content summarization using Gemini Flash.

const { ask } = require('../../don/brain');

async function summarizeContent(content, focus = 'General') {
    const prompt = `Summarize the following content with a focus on "${focus}". 
    Extract key entities, dates, and actionable intelligence.
    
    CONTENT:
    ${content}`;

    return ask(prompt, 'You are an elite intelligence analyst for the Syndicate.');
}

module.exports = { summarizeContent };
