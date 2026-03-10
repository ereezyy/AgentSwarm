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

    // 2.1 Gemini 3.1 - Experimental (v2026.2.21 update)
    PROVIDERS.push({
        name: 'Gemini 3.1',
        type: 'gemini',
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-3.1-pro-preview',
        maxRetries: 1,
        color: chalk.magenta
    });
}

// 2b. Vertex AI - Enterprise (High Rate Limits)
// Removed due to endpoint misconfiguration (Gemini AI Studio vs Vertex API) and 401 errors.

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
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://192.168.1.78:11434',
    model: 'llama3.2',
    maxRetries: 1,
    timeout: 15000,
    color: chalk.gray
});

// Track rate limit cooldowns per provider
const cooldowns = {};

// OpenClaw Port: Global reasoning configuration
let globalThinkingLevel = 'medium'; // off|minimal|low|medium|high|xhigh
const THINKING_MAP = {
    'off': { temperature: 1.0, max_tokens: 1024 },
    'minimal': { temperature: 0.9, max_tokens: 2048 },
    'low': { temperature: 0.8, max_tokens: 3072 },
    'medium': { temperature: 0.7, max_tokens: 4096 },
    'high': { temperature: 0.5, max_tokens: 8192 },
    'xhigh': { temperature: 0.3, max_tokens: 16384 }
};

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
    try {
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
    } catch (error) {
        console.error(`[Brain] Error in callOpenAICompat for provider ${provider.name}:`, error.message);
        throw error;
    }
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

// ─── Cost Arbitrage Integration ────────────────────────────
const { execSync } = require('child_process');

function getOptimalProvider(messages, strategy = 'balanced') {
    try {
        // Heuristic: If message is long or needs enterprise stability, use Vertex
        const totalLength = messages.reduce((acc, m) => m && m.content ? acc + m.content.length : acc, 0);

        if (totalLength > 2500 && process.env.GOOGLE_VERTEX_API_KEY) return 'Vertex';
        if (totalLength > 1500) return 'Gemini 3.1'; // Heavy lifting, use v3.1
        if (totalLength > 1000) return 'Gemini'; // Standard long context
        return 'Groq'; // Short, fast responses
    } catch (e) {
        return PROVIDERS[0].name;
    }
}

/**
 * Ask the brain a question with automatic provider fallback.
 * 
 * @param {Array} messages - OpenAI-format messages [{role, content}]
 * @param {Object} options - Optional: { model, temperature, max_tokens, response_format, agentName, strategy, compact }
 * @returns {string} The AI response content
 */
async function askBrain(messages, options = {}) {
    const agentTag = options.agentName ? `[${options.agentName}]` : '[BRAIN]';

    // OpenClaw Port: Automatic Context Compaction
    if (options.compact !== false) {
        const totalLength = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
        if (totalLength > 10000) {
            console.log(chalk.yellow(`${agentTag} Context high (${totalLength}). Compacting...`));
            messages = await compactContext(messages);
        }
    }

    const errors = [];

    // Apply global thinking level if not overridden
    const depth = THINKING_MAP[globalThinkingLevel];
    options.temperature = options.temperature ?? depth.temperature;
    options.max_tokens = options.max_tokens ?? depth.max_tokens;

    // Prioritize provider based on cost arbitrage
    const prioritizedName = getOptimalProvider(messages, options.strategy);
    const sortedProviders = [...PROVIDERS].sort((a, b) => {
        if (a.name === prioritizedName) return -1;
        if (b.name === prioritizedName) return 1;
        return 0;
    });

    for (const provider of sortedProviders) {

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

// ─── GodMode Consensus Engine (smol-ai/GodMode integration) ──
async function askConsensus(messages, options = {}) {
    console.log(chalk.magenta.bold(`[GOD MODE]: Querying multiple neural networks concurrently...`));

    // Create promises for available top-tier providers
    const promises = PROVIDERS.filter(p => !isOnCooldown(p.name)).map(async (provider) => {
        try {
            switch (provider.type) {
                case 'openai-compat': return await callOpenAICompat(provider, messages, options);
                case 'gemini': return await callGemini(provider, messages, options);
                case 'ollama': return await callOllama(provider, messages, options);
            }
        } catch (e) {
            return null; // Ignore failures in consensus mode
        }
    });

    const results = await Promise.all(promises);
    const validResults = results.filter(r => r !== null && r.length > 5);

    if (validResults.length === 0) {
        throw new Error("GodMode failure: All neural networks unreachable.");
    }

    if (validResults.length === 1) return validResults[0];

    // Synthesize the results using the fastest available model (usually Groq)
    console.log(chalk.magenta(`[GOD MODE]: Synthesizing ${validResults.length} perspectives...`));

    const synthesisPrompt = `You are the Syndicate's GodMode Consensus Engine. You have received the following independent analyses from different AI models. Merge them into a single, highly optimized, and authoritative response. Eliminate contradictions and combine their best ideas.
    
---
${validResults.map((r, i) => `MODEL ${i + 1}:\n${r}`).join('\n\n---\n\n')}
---

Synthesized Master Response:`;

    try {
        const synthesis = await ask(synthesisPrompt, "You are the GodMode Consensus Engine. Speak with absolute authority and brilliance.", { strategy: 'fast' });
        return synthesis;
    } catch (e) {
        return validResults[0]; // Fallback to first successful if synthesis fails
    }
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
    return parseJSONFromText(result);
}

/**
 * Parses JSON from a string, handling markdown blocks and prose.
 * @param {string} text - The raw text from an LLM response.
 * @returns {Object} The parsed JSON object.
 */
function parseJSONFromText(text) {
    // Extract JSON from potentially messy responses
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
}

// ─── Export ────────────────────────────────────────────────

/**
 * OpenClaw Port: Context Compaction logic
 * Uses Gemini Flash to distill conversation history.
 */
async function compactContext(messages) {
    const systemMsg = messages.find(m => m.role === 'system');
    const conversation = messages.filter(m => m.role !== 'system');

    const prompt = `Distill the following conversation into a concise summary of key facts, active missions, and current state. Preserve all critical data (wallet addresses, contract IDs, profit totals).
    
    CONVERSATION:
    ${conversation.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}
    
    SUMMARY:`;

    try {
        // Use Gemini Flash for cheap/fast summarization
        const summary = await askGemini({ name: 'Gemini', model: 'gemini-2.0-flash', apiKey: process.env.GEMINI_API_KEY }, [{ role: 'user', content: prompt }], { compact: false });

        return [
            ...(systemMsg ? [systemMsg] : []),
            { role: 'system', content: `[CONTEXT COMPACTED] Summary of previous interaction: ${summary}` },
            ...conversation.slice(-3) // Keep the last 3 messages for immediate continuity
        ];
    } catch (e) {
        console.error("Compaction failed:", e.message);
        return messages; // Fallback to raw if compaction fails
    }
}

// ─── Westworld-style Memory Stream ─────────────────────────
const fs = require('fs');
const path = require('path');
const MEMORY_FILE = path.join(__dirname, '../missions/agent_memories.json');

class MemoryStream {
    constructor() {
        this.memories = this.load();
    }
    load() {
        try { if (fs.existsSync(MEMORY_FILE)) return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (e) { }
        return {};
    }
    save() {
        if (!fs.existsSync(path.dirname(MEMORY_FILE))) fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.memories, null, 2));
    }
    addMemory(agentType, text, importance = 5) {
        if (!this.memories[agentType]) this.memories[agentType] = [];
        this.memories[agentType].push({
            id: `MEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: new Date().toISOString(),
            text,
            importance,
            lastAccessed: Date.now()
        });
        if (this.memories[agentType].length > 500) {
            // Keep top 500, could optionally sort by importance
            this.memories[agentType] = this.memories[agentType].slice(-500);
        }
        this.save();
    }
    getRecent(agentType, limit = 20) {
        if (!this.memories[agentType]) return [];
        return this.memories[agentType].slice(-limit);
    }

    // Westworld Reflection: Synthesize recent memories into a core lesson/parameter update
    async reflect(agentType) {
        const recent = this.getRecent(agentType, 30);
        if (recent.length < 5) return null; // Not enough data to reflect

        const memoryContext = recent.map(m => `[${m.timestamp}] (${m.importance}/10) ${m.text}`).join('\n');

        const prompt = `You are the subconscious of the ${agentType} agent. Review your recent memories and synthesize them into a concise, actionable heuristic or risk parameter adjustment for your future operations.
        
Recent Memories:
${memoryContext}

Provide a single JSON object with your reflection:
{
  "key_insight": "string, what went wrong or right",
  "actionable_heuristic": "string, a new rule to live by",
  "risk_adjustment": {
      "parameter": "string, e.g. 'rug_threshold', 'kelly_fraction'",
      "change": "string, e.g. '+0.05', '-0.10', 'none'",
      "reason": "string"
  }
}`;

        try {
            const reflection = await askJSON(prompt, "You are a master strategist AI.", { agentName: `${agentType}_SUBCONSCIOUS`, compact: false });

            // Store the reflection as a high-importance memory
            this.addMemory(agentType, `[REFLECTION] Insight: ${reflection.key_insight}. Rule: ${reflection.actionable_heuristic}. Risk tweak: ${JSON.stringify(reflection.risk_adjustment)}`, 10);

            // AUTO-ADAPT: If a valid adjustment is proposed, apply it to the config
            if (reflection.risk_adjustment && reflection.risk_adjustment.parameter !== 'none') {
                await this.adaptParameters(agentType.toLowerCase(), reflection.risk_adjustment);
            }

            return reflection;
        } catch (e) {
            console.error(`Reflection failed for ${agentType}: ${e.message}`);
            return null;
        }
    }

    async adaptParameters(agent, adjustment) {
        const configPath = path.join(__dirname, 'neural_config.json');
        try {
            if (!fs.existsSync(configPath)) return;
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            if (!config[agent]) return;

            const param = adjustment.parameter;
            const change = adjustment.change;
            if (change === 'none') return;

            const current = config[agent][param];
            if (typeof current !== 'number') return;

            const numericChange = parseFloat(change);
            if (isNaN(numericChange)) return;

            const newVal = parseFloat((current + numericChange).toFixed(4));

            // Safety bounds for auto-adjustment
            if (param === 'rug_threshold') {
                config[agent][param] = Math.max(0.3, Math.min(newVal, 0.95));
            } else if (param === 'kelly_fraction') {
                config[agent][param] = Math.max(0.05, Math.min(newVal, 0.5));
            } else {
                config[agent][param] = newVal;
            }

            config.global.last_updated = new Date().toISOString();
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log(chalk.magenta.bold(`[ADAPTIVE]: 🧠 Automatically tuned ${agent}.${param} from ${current} to ${config[agent][param]} (${adjustment.reason})`));
        } catch (e) {
            console.error(`Adaptation failed: ${e.message}`);
        }
    }
}

const GlobalMemory = new MemoryStream();

function setThinkingLevel(level) {
    if (THINKING_MAP[level]) {
        globalThinkingLevel = level;
        return true;
    }
    return false;
}

module.exports = { askBrain, askConsensus, ask, askJSON, parseJSONFromText, PROVIDERS, setThinkingLevel, compactContext, GlobalMemory };

// Self-test when run directly
if (require.main === module) {
    console.log(chalk.cyan('🧠 Brain Module Self-Test'));
    console.log(chalk.cyan(`   Providers online: ${PROVIDERS.map(p => p.name).join(' → ')}`));
    ask('Say "Brain online" in 5 words or less.', 'You are a test bot.', { agentName: 'SELF-TEST' })
        .then(r => console.log(chalk.green(`   ✅ Response: "${r}"`)))
        .catch(e => console.log(chalk.red(`   ❌ Failed: ${e.message}`)));
}
