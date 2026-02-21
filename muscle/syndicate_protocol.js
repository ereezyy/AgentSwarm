/**
 * SyndicateProtocol — Standardized messaging for the Syndicate Swarm.
 * Inspired by A2A (Agent-to-Agent) and Agent Communication Protocol (ACP).
 * 
 * Message Structure:
 * {
 *   protocol: "syndicate-v1",
 *   id: uuid,
 *   type: "REQUEST" | "RESPONSE" | "EVENT",
 *   from: agentName,
 *   to: targetAgentName | "BROADCAST",
 *   action: string,
 *   payload: { ... },
 *   context: { conversationId, priority, ttl },
 *   timestamp: iso8601
 * }
 */

const { v4: uuidv4 } = require('uuid');

class SyndicateProtocol {
    static wrap(from, action, payload = {}, type = 'EVENT', context = {}) {
        return {
            protocol: "syndicate-v1",
            id: uuidv4(),
            type,
            from,
            to: context.to || "BROADCAST",
            action,
            payload,
            context: {
                priority: context.priority || 'NORMAL',
                ttl: context.ttl || 5,
                ...context
            },
            timestamp: new Date().toISOString()
        };
    }

    static parse(message) {
        if (typeof message === 'string') {
            try {
                return JSON.parse(message);
            } catch (e) {
                return null;
            }
        }
        return message;
    }

    // Validation against A2A-like principles
    static isValid(msg) {
        return msg && msg.protocol === "syndicate-v1" && msg.from && msg.action;
    }
}

module.exports = SyndicateProtocol;
