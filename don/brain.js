// don/brain.js - CENTRALIZED AI BRAIN WITH FALLBACK CHAIN
// Eliminates 429 hell by cascading: xAI → Gemini → Groq → Local (Pi5)
const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();

// ─── Provider Configs ──────────────────────────────────────
const PROVIDERS = [];

// 1. Groq - FREE (fast, high rate limit on 8b-instant)
if (process.env.GROQ_API_KEY) {
    PROVIDERS.push({
        name: 'Groq',
        type: 'openai-compat',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY,
        model: 'llama-3.1-8b-instant',
        maxRetries: 1,
        color: chalk.green
    });
}

// 2. Gemini - FREE TIER (15 RPM flash)
if (process.env.GEMINI_API_KEY) {
    PROVIDERS.push({
        name: 'Gemini',
        type: 'gemini',
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-2.0-flash',
        maxRetries: 1,
        color: chalk.blue
    });
}

// 3. xAI (Grok) - PAID (use only when free options exhausted)
if (process.env.XAI_API_KEY) {
    PROVIDERS.push({
        name: 'xAI',
        type: 'openai-compat',
        baseUrl: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
        apiKey: process.env.XAI_API_KEY,
        model: 'grok-3',
        maxRetries: 1,
        color: chalk.red
    });
}

// 4. Local Brain (Pi5 Ollama) - always available as last resort
PROVIDERS.push({
    name: 'Local (Pi5)',
    type: 'ollama',
    baseUrl: 'http://192.168.1.78:11434',
    model: 'llama3.2',
    maxRetries: 1,
    timeout: 15000,
    color: chalk.gray
});

// Track rate limit cooldowns per provider
const cooldowns = {};

function isOnCooldown(providerName) {
    const cd = cooldowns[providerName];
    if (!cd) return false;
    if (Date.now() > cd) {
        delete cooldowns[providerName];
        return false;
    }
    return true;
}

function setCooldown(providerName, durationMs = 60000) {
    cooldowns[providerName] = Date.now() + durationMs;
}

// ─── Provider-specific call implementations ────────────────

async function executeRequest(url, body, options = {}) {
    const { headers = {}, timeout = 30000 } = options;
    const response = await axios.post(url, body, {
        headers,
        timeout
    });
    return response.data;
}

async function callOpenAICompat(provider, messages, options = {}) {
    const body = {
        model: options.model || provider.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2048,
    };
    if (options.response_format) body.response_format = options.response_format;

    const data = await executeRequest(`${provider.baseUrl}/chat/completions`, body, {
        headers: { 'Authorization': `Bearer ${provider.apiKey}` },
        timeout: provider.timeout
    });
    return data.choices[0].message.content;
}

async function callGemini(provider, messages, options = {}) {
    // Convert OpenAI messages format to Gemini format
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');

    const contents = userMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    const body = {
        contents,
        generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.max_tokens ?? 2048,
        }
    };

    if (systemMsg) {
        body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    if (options.response_format?.type === 'json_object') {
        body.generationConfig.responseMimeType = 'application/json';
    }

    const model = options.model || provider.model;
    const data = await executeRequest(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${provider.apiKey}`,
        body,
        { timeout: provider.timeout }
    );

    return data.candidates[0].content.parts[0].text;
}

async function callOllama(provider, messages, options = {}) {
    const data = await executeRequest(`${provider.baseUrl}/api/chat`, {
        model: options.model || provider.model,
        messages,
        stream: false,
        options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.max_tokens ?? 2048,
        }
    }, { timeout: provider.timeout });
    return data.message.content;
}

// ─── Main Brain Function ───────────────────────────────────

/**
 * Ask the brain a question with automatic provider fallback.
 * 
 * @param {Array} messages - OpenAI-format messages [{role, content}]
 * @param {Object} options - Optional: { model, temperature, max_tokens, response_format, agentName }
 * @returns {string} The AI response content
 * @throws {Error} If all providers fail
 */
async function askBrain(messages, options = {}) {
    const agentTag = options.agentName ? `[${options.agentName}]` : '[BRAIN]';
    const errors = [];

    for (const provider of PROVIDERS) {
        if (isOnCooldown(provider.name)) {
            continue; // Skip providers on cooldown
        }

        try {
            let result;
            switch (provider.type) {
                case 'openai-compat':
                    result = await callOpenAICompat(provider, messages, options);
                    break;
                case 'gemini':
                    result = await callGemini(provider, messages, options);
                    break;
                case 'ollama':
                    result = await callOllama(provider, messages, options);
                    break;
            }

            if (result) {
                // Log which provider answered (only if it wasn't the primary)
                if (provider !== PROVIDERS[0]) {
                    console.log(provider.color(`${agentTag} Brain: ${provider.name} (fallback)`));
                }
                return result;
            }
        } catch (err) {
            const status = err.response?.status;
            const msg = err.message || 'Unknown error';

            if (status === 429) {
                // Rate limited — cooldown this provider and try next
                const cooldownTime = provider.name === 'xAI' ? 60000 : 30000;
                setCooldown(provider.name, cooldownTime);
                console.log(chalk.yellow(`${agentTag} ${provider.name} rate-limited. Falling back...`));
            } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
                // Connection failed — cooldown longer
                setCooldown(provider.name, 120000);
            } else {
                console.log(chalk.gray(`${agentTag} ${provider.name} error: ${msg.substring(0, 80)}`));
            }

            console.error('DEBUG ERROR:', err); errors.push(`${provider.name}: ${status || err.code || 'ERR'}`);
        }
    }

    throw new Error(`All brain providers failed: ${errors.join(' → ')}`);
}

// ─── Convenience Wrappers ──────────────────────────────────

/**
 * Simple prompt — wraps a single user prompt with an optional system prompt.
 */
async function ask(prompt, systemPrompt, options = {}) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    return askBrain(messages, options);
}

/**
 * JSON response — asks and parses JSON from the response.
 */
async function askJSON(prompt, systemPrompt, options = {}) {
    const result = await ask(prompt, systemPrompt, {
        ...options,
        response_format: { type: 'json_object' }
    });

    // Extract JSON from potentially messy responses
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(result);
}

// ─── Export ────────────────────────────────────────────────

module.exports = { askBrain, ask, askJSON, PROVIDERS };

// Self-test when run directly
if (require.main === module) {
    console.log(chalk.cyan('🧠 Brain Module Self-Test'));
    console.log(chalk.cyan(`   Providers online: ${PROVIDERS.map(p => p.name).join(' → ')}`));
    ask('Say "Brain online" in 5 words or less.', 'You are a test bot.', { agentName: 'SELF-TEST' })
        .then(r => console.log(chalk.green(`   ✅ Response: "${r}"`)))
        .catch(e => console.log(chalk.red(`   ❌ Failed: ${e.message}`)));
}
