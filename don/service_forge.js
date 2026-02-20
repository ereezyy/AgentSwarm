// don/service_forge.js - AI AGENT-AS-A-SERVICE (Service Catalog & Auto-Quoter)
// Productizes the Syndicate's bot-building capabilities into sellable services.
// Features: Service catalog, AI-powered quote generation, portfolio showcase, order tracking.
// Revenue: $200-$2,000 per custom bot/agent sold.

const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const id = process.argv[2] || 'ServiceForge';
const { askJSON } = require('./brain');

// File paths
const CATALOG_PATH = path.resolve(__dirname, '../missions/service_catalog.json');
const ORDERS_PATH = path.resolve(__dirname, '../missions/service_orders.json');
const PORTFOLIO_PATH = path.resolve(__dirname, '../missions/portfolio.md');
const QUOTE_PATH = path.resolve(__dirname, '../missions/quotes.json');
const missionsDir = path.join(__dirname, '../missions');
if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir);

const SF = (msg) => chalk.hex('#FF69B4').bold(`[SERVICE FORGE #${id}]: ${msg}`);
const sf = (msg) => chalk.hex('#FF69B4')(`[SERVICE FORGE #${id}]: ${msg}`);

console.log(SF('🏭 Service Forge ONLINE. AI Agent-as-a-Service ready.'));

// ============================================================
// SERVICE CATALOG — What we sell
// ============================================================
const SERVICE_CATALOG = {
    services: [
        {
            id: 'telegram-bot',
            name: 'Custom Telegram Bot',
            description: 'Fully featured Telegram bot with commands, inline queries, webhooks, and AI integration. Deployed and hosted.',
            basePrice: 250,
            deliveryDays: 3,
            features: ['Custom commands', 'AI-powered responses', 'Database integration', 'Admin dashboard', 'Webhook support'],
            complexity: 'MEDIUM',
            techStack: ['Node.js', 'Telegraf/Grammy', 'MongoDB/SQLite'],
        },
        {
            id: 'discord-bot',
            name: 'Custom Discord Bot',
            description: 'Feature-rich Discord bot with slash commands, moderation, auto-roles, and custom integrations.',
            basePrice: 300,
            deliveryDays: 4,
            features: ['Slash commands', 'Moderation tools', 'Auto-roles', 'Music/audio', 'Custom embeds', 'Database'],
            complexity: 'MEDIUM',
            techStack: ['Node.js', 'Discord.js v14', 'MongoDB'],
        },
        {
            id: 'web-scraper',
            name: 'Custom Web Scraper / Data Pipeline',
            description: 'Automated web scraper with anti-detection, data extraction, scheduling, and export to CSV/JSON/database.',
            basePrice: 350,
            deliveryDays: 4,
            features: ['Anti-bot detection bypass', 'Scheduled scraping', 'Data cleaning', 'CSV/JSON/DB export', 'Proxy rotation'],
            complexity: 'MEDIUM',
            techStack: ['Node.js/Python', 'Puppeteer/Playwright', 'Cheerio'],
        },
        {
            id: 'trading-bot',
            name: 'Crypto Trading Bot',
            description: 'Automated trading bot with strategy configuration, risk management, and real-time monitoring. Supports multiple DEXs.',
            basePrice: 800,
            deliveryDays: 7,
            features: ['Multi-DEX support', 'Custom strategies', 'Risk management', 'Real-time alerts', 'PnL tracking', 'Copy-trading'],
            complexity: 'HIGH',
            techStack: ['Node.js', 'Solana/EVM Web3', 'Jupiter/Raydium APIs'],
        },
        {
            id: 'ai-agent',
            name: 'Custom AI Agent / LLM App',
            description: 'AI-powered agent with tool use, RAG, memory, and custom integrations. Can be deployed as API, CLI, or chat interface.',
            basePrice: 600,
            deliveryDays: 5,
            features: ['LLM integration (GPT/Claude/Grok)', 'Tool calling', 'RAG with vector DB', 'Memory/context', 'API endpoints'],
            complexity: 'HIGH',
            techStack: ['Python/Node.js', 'LangChain/OpenAI', 'Pinecone/ChromaDB'],
        },
        {
            id: 'automation-script',
            name: 'Custom Automation Script',
            description: 'Task automation: social media posting, email sequences, data entry, file processing, API integrations.',
            basePrice: 150,
            deliveryDays: 2,
            features: ['Scheduled execution', 'API integrations', 'Error handling', 'Logging', 'Email notifications'],
            complexity: 'LOW',
            techStack: ['Node.js/Python', 'cron/PM2'],
        },
        {
            id: 'monitoring-dashboard',
            name: 'Real-Time Monitoring Dashboard',
            description: 'Live dashboard with WebSocket updates, charts, alerts, and multi-source data aggregation.',
            basePrice: 500,
            deliveryDays: 5,
            features: ['Real-time WebSocket', 'Interactive charts', 'Alert rules', 'Multi-source data', 'Mobile responsive'],
            complexity: 'MEDIUM',
            techStack: ['React/Next.js', 'Chart.js/D3', 'WebSocket', 'Node.js API'],
        },
        // ── SHOWCASE AGENTS (Demo/Portfolio pieces) ──
        {
            id: 'lead-scraper',
            name: '🎯 Lead Scraper Agent [SHOWCASE]',
            description: 'Scrapes LinkedIn/Twitter for keywords, identifies decision-makers, and writes personalized intros. Perfect for agencies & sales teams.',
            basePrice: 400,
            deliveryDays: 4,
            features: ['Keyword-based prospecting', 'Personalized AI intros', 'CSV/CRM export', 'Scheduled runs', 'Dedup & enrichment'],
            complexity: 'MEDIUM',
            techStack: ['Node.js', 'Puppeteer', 'OpenAI/Grok', 'LinkedIn Sales Nav'],
            showcase: true,
        },
        {
            id: 'support-agent',
            name: '🤖 AI Support Agent [SHOWCASE]',
            description: 'Bot trained on your docs/manuals that answers questions perfectly. Reduces support tickets by 80%. Deploys to Slack, Discord, or web widget.',
            basePrice: 500,
            deliveryDays: 5,
            features: ['RAG on your docs', 'Multi-channel deploy', 'Conversation memory', 'Escalation to human', 'Analytics dashboard'],
            complexity: 'HIGH',
            techStack: ['Python', 'LangChain', 'ChromaDB/Pinecone', 'FastAPI'],
            showcase: true,
        },
        {
            id: 'content-agent',
            name: '📝 Content Repurposing Agent [SHOWCASE]',
            description: 'Takes a YouTube URL and generates a blog post, 5 tweets, and a LinkedIn update. Saves 5+ hours per video.',
            basePrice: 350,
            deliveryDays: 3,
            features: ['YouTube transcript extraction', 'Blog post generation', 'Twitter thread (5 tweets)', 'LinkedIn post', 'SEO-optimized output'],
            complexity: 'MEDIUM',
            techStack: ['Node.js/Python', 'YouTube API', 'OpenAI/Grok', 'Markdown output'],
            showcase: true,
        },
    ],
    addons: [
        { id: 'hosting', name: 'Cloud Hosting (1 month)', price: 25 },
        { id: 'maintenance', name: 'Monthly Maintenance', price: 50 },
        { id: 'rush', name: 'Rush Delivery (50% faster)', priceMultiplier: 1.5 },
        { id: 'source', name: 'Full Source Code Ownership', price: 100 },
        { id: 'docs', name: 'Technical Documentation', price: 75 },
    ],
    // ── OUTREACH TEMPLATES (The "Fixer" Approach) ──
    outreach: {
        fixerScript: "I saw your team is doing [Manual Task]. I built an AI agent that does that in 3 seconds for $0.05. Want to see the demo?",
        closeFrame: "Don't sell 'AI.' Sell 'Time.' Instead of 'I build bots,' say 'I give your team 20 hours back every week.'",
        freeHook: "Free 15-minute Automation Audit — I'll find 3 tasks your team can automate this week.",
        targetNiches: ['Marketing agencies', 'Real estate firms', 'Recruiting agencies', 'E-commerce stores', 'SaaS companies'],
        platformKeywords: ['AI Automation', 'Custom AI Bot', 'Agentic Workflow', 'AI Agent Development', 'LLM Integration'],
    }
};

// Save catalog on boot
fs.writeFileSync(CATALOG_PATH, JSON.stringify(SERVICE_CATALOG, null, 2));
console.log(sf(`📋 Service catalog loaded: ${SERVICE_CATALOG.services.length} services, ${SERVICE_CATALOG.addons.length} add-ons`));

// ============================================================
// ORDERS & QUOTES
// ============================================================
function loadOrders() {
    try {
        if (fs.existsSync(ORDERS_PATH)) return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8'));
    } catch { }
    return { orders: [], stats: { totalOrders: 0, totalRevenue: 0, completedOrders: 0 } };
}

function saveOrders(orders) {
    fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2));
}

function loadQuotes() {
    try {
        if (fs.existsSync(QUOTE_PATH)) return JSON.parse(fs.readFileSync(QUOTE_PATH, 'utf8'));
    } catch { }
    return { quotes: [] };
}

function saveQuotes(quotes) {
    fs.writeFileSync(QUOTE_PATH, JSON.stringify(quotes, null, 2));
}

// ============================================================
// AI-POWERED QUOTE GENERATOR
// ============================================================
async function generateQuote(request) {
    console.log(sf(`💡 Generating quote for: "${request.substring(0, 60)}..."`));

    // Match to catalog services
    const matched = matchService(request);

    try {
        const quote = await askJSON(
            `Client request: ${request}`,
            `You are The Service Forge, a sales agent for a premium AI/automation agency. Generate a professional quote based on the client's request.

Our Service Catalog:
${SERVICE_CATALOG.services.map(s => `- ${s.name}: $${s.basePrice} (${s.deliveryDays} days) — ${s.description}`).join('\n')}

Add-ons: ${SERVICE_CATALOG.addons.map(a => `${a.name}: $${a.price || 'varies'}`).join(', ')}

Sales approach: ${SERVICE_CATALOG.outreach.closeFrame}

Rules:
- Always provide clear scope, deliverables, and timeline
- Include recommended add-ons when useful
- Frame value in TIME SAVED, not technology used
- Be professional but confident
- Quote in USD
- If custom work needed, estimate based on similar services
- Output JSON with: { serviceName, scope, deliverables[], price, deliveryDays, addons[], notes, timeSaved }`,
            { agentName: `SERVICE_FORGE #${id}` }
        );

        if (quote && quote.serviceName) {
            quote.id = `Q-${Date.now().toString(36).toUpperCase()}`;
            quote.createdAt = new Date().toISOString();
            quote.status = 'PENDING';
            quote.clientRequest = request;

            const quotes = loadQuotes();
            quotes.quotes.push(quote);
            saveQuotes(quotes);

            console.log(sf(`✅ Quote generated: ${quote.serviceName} — $${quote.price}`));
            return quote;
        }

        return buildQuoteFromMatch(matched, request);
    } catch (e) {
        console.log(chalk.red(`[SERVICE FORGE]: Quote generation failed: ${e.message}`));
        return buildQuoteFromMatch(matched, request);
    }
}

function matchService(request) {
    const lower = request.toLowerCase();
    const scores = SERVICE_CATALOG.services.map(s => {
        let score = 0;
        const words = [...s.name.toLowerCase().split(' '), ...s.techStack.map(t => t.toLowerCase()), ...s.features.map(f => f.toLowerCase().split(' ')).flat()];
        for (const word of words) {
            if (lower.includes(word) && word.length > 2) score++;
        }
        if (lower.includes(s.id.replace('-', ' '))) score += 5;
        return { service: s, score };
    }).sort((a, b) => b.score - a.score);

    return scores[0]?.service || SERVICE_CATALOG.services[0];
}

function buildQuoteFromMatch(service, request) {
    return {
        id: `Q-${Date.now().toString(36).toUpperCase()}`,
        serviceName: service.name,
        scope: request,
        deliverables: service.features.slice(0, 4),
        price: service.basePrice,
        deliveryDays: service.deliveryDays,
        addons: ['Full Source Code Ownership'],
        notes: 'Custom requirements may adjust pricing.',
        createdAt: new Date().toISOString(),
        status: 'PENDING',
        clientRequest: request,
    };
}

// ============================================================
// PORTFOLIO GENERATOR
// ============================================================
function generatePortfolio() {
    console.log(sf('📂 Generating service portfolio...'));

    let portfolio = `# 🏭 The Syndicate — AI Agent & Bot Services\n\n`;
    portfolio += `> *We don't sell AI. We give your team 20 hours back every week.*\n\n`;
    portfolio += `**🎁 Free 15-Minute Automation Audit** — We'll find 3 tasks your team can automate this week.\n\n`;
    portfolio += `---\n\n`;

    // Showcase agents first (the proof)
    const showcases = SERVICE_CATALOG.services.filter(s => s.showcase);
    if (showcases.length > 0) {
        portfolio += `## 🌟 Live Demos (Try Before You Buy)\n\n`;
        for (const service of showcases) {
            portfolio += `### ${service.name} — $${service.basePrice}+\n`;
            portfolio += `${service.description}\n\n`;
            portfolio += `**Features:** ${service.features.join(' • ')}\n\n`;
            portfolio += `---\n\n`;
        }
    }

    // Core services
    const core = SERVICE_CATALOG.services.filter(s => !s.showcase);
    portfolio += `## 🤖 Core Services\n\n`;
    for (const service of core) {
        const stars = service.complexity === 'HIGH' ? '⭐⭐⭐' : service.complexity === 'MEDIUM' ? '⭐⭐' : '⭐';
        portfolio += `### ${service.name} — $${service.basePrice}+\n`;
        portfolio += `${service.description}\n\n`;
        portfolio += `**Delivery:** ${service.deliveryDays} days | **Complexity:** ${stars}\n\n`;
        portfolio += `**Features:**\n`;
        for (const feat of service.features) {
            portfolio += `- ✅ ${feat}\n`;
        }
        portfolio += `\n**Tech:** ${service.techStack.join(' • ')}\n\n`;
        portfolio += `---\n\n`;
    }

    portfolio += `## ➕ Add-Ons\n\n`;
    portfolio += `| Add-On | Price |\n|---|---|\n`;
    for (const addon of SERVICE_CATALOG.addons) {
        const price = addon.price ? `$${addon.price}` : `${((addon.priceMultiplier - 1) * 100).toFixed(0)}% surcharge`;
        portfolio += `| ${addon.name} | ${price} |\n`;
    }

    portfolio += `\n## 📊 Track Record\n\n`;
    const orders = loadOrders();
    portfolio += `- **Orders Completed:** ${orders.stats.completedOrders}\n`;
    portfolio += `- **Total Revenue:** $${orders.stats.totalRevenue.toFixed(2)}\n`;
    portfolio += `- **Client Satisfaction:** ⭐⭐⭐⭐⭐\n\n`;

    portfolio += `## 📞 Get Started\n\n`;
    portfolio += `1. **DM us** your automation challenge\n`;
    portfolio += `2. **Free 15-min audit** — we find 3 quick wins\n`;
    portfolio += `3. **Quote in 24h** — clear scope, flat pricing, no surprises\n\n`;
    portfolio += `---\n*Powered by The Syndicate AI Infrastructure*\n`;

    fs.writeFileSync(PORTFOLIO_PATH, portfolio);
    console.log(sf(`📂 Portfolio saved to ${PORTFOLIO_PATH}`));
    return portfolio;
}

// ============================================================
// ORDER MANAGEMENT
// ============================================================
function createOrder(serviceId, clientName, customNotes = '') {
    const service = SERVICE_CATALOG.services.find(s => s.id === serviceId);
    if (!service) return null;

    const orders = loadOrders();
    const order = {
        id: `ORD-${Date.now().toString(36).toUpperCase()}`,
        serviceId: service.id,
        serviceName: service.name,
        client: clientName,
        price: service.basePrice,
        deliveryDays: service.deliveryDays,
        status: 'RECEIVED',
        customNotes,
        createdAt: new Date().toISOString(),
        completedAt: null,
        history: [{ status: 'RECEIVED', timestamp: new Date().toISOString() }],
    };

    orders.orders.push(order);
    orders.stats.totalOrders++;
    saveOrders(orders);

    console.log(SF(`📦 New order: ${service.name} for ${clientName} — $${service.basePrice}`));

    if (process.send) {
        process.send({
            type: 'SIREN_SPEAK',
            text: `New service order received. ${service.name} for ${clientName}. ${service.basePrice} dollars. Starting build.`
        });
        process.send({
            type: 'INTEL_DATA',
            data: `SERVICE FORGE: New order — ${service.name} for ${clientName} ($${service.basePrice})`
        });
    }

    return order;
}

function advanceOrder(orderId, newStatus) {
    const orders = loadOrders();
    const order = orders.orders.find(o => o.id === orderId);
    if (!order) return null;

    order.status = newStatus;
    order.history.push({ status: newStatus, timestamp: new Date().toISOString() });

    if (newStatus === 'DELIVERED') {
        order.completedAt = new Date().toISOString();
        orders.stats.completedOrders++;
        orders.stats.totalRevenue += order.price;

        if (process.send) {
            process.send({ type: 'KICK_UP', amount: order.price * 0.15, source: 'SERVICE_FORGE' });
            process.send({
                type: 'SIREN_SPEAK',
                text: `Service order delivered. ${order.serviceName}. ${order.price} dollars earned.`
            });
        }
    }

    saveOrders(orders);
    console.log(sf(`📦 Order ${orderId}: ${newStatus}`));
    return order;
}

// ============================================================
// IPC MESSAGE HANDLER
// ============================================================
process.on('message', async (msg) => {
    switch (msg.type) {
        case 'GENERATE_QUOTE':
            if (msg.request) {
                const quote = await generateQuote(msg.request);
                console.log(sf(`📋 Quote: ${quote.serviceName} — $${quote.price} (${quote.deliveryDays} days)`));
                if (process.send) {
                    process.send({
                        type: 'INTEL_DATA',
                        data: `SERVICE FORGE QUOTE: ${quote.serviceName} — $${quote.price} | ${quote.deliveryDays} days | ID: ${quote.id}`
                    });
                }
            }
            break;

        case 'CREATE_ORDER':
            if (msg.serviceId && msg.client) {
                createOrder(msg.serviceId, msg.client, msg.notes || '');
            }
            break;

        case 'ADVANCE_ORDER':
            if (msg.orderId && msg.status) {
                advanceOrder(msg.orderId, msg.status);
            }
            break;

        case 'GENERATE_PORTFOLIO':
            generatePortfolio();
            break;

        case 'SERVICE_STATUS':
            const orders = loadOrders();
            const activeOrders = orders.orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status));
            console.log(SF(`📊 Service Forge Status:`));
            console.log(sf(`  Services: ${SERVICE_CATALOG.services.length}`));
            console.log(sf(`  Active Orders: ${activeOrders.length}`));
            console.log(sf(`  Total Revenue: $${orders.stats.totalRevenue.toFixed(2)}`));
            console.log(sf(`  Completed: ${orders.stats.completedOrders}`));

            if (process.send) {
                process.send({
                    type: 'INTEL_DATA',
                    data: `SERVICE FORGE: ${SERVICE_CATALOG.services.length} services | ${activeOrders.length} active orders | $${orders.stats.totalRevenue.toFixed(2)} revenue`
                });
            }
            break;
    }
});

// ============================================================
// BOOT
// ============================================================
generatePortfolio();
console.log(SF('🏭 Service Forge ready. Awaiting client requests.'));
setInterval(() => { }, 100000); // Keep alive
