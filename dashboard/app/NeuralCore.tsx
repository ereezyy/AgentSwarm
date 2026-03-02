"use client";

import React, { useEffect, useRef, useState } from "react";
import { LogEntry, CrewMember } from "./page";

interface NeuralCoreProps {
    logs: LogEntry[];
    crew: CrewMember[];
}

interface Node {
    id: number;
    x: number;
    y: number;
    baseX: number;
    baseY: number;
    vx: number;
    vy: number;
    radius: number;
    color: string;
    isCore?: boolean;
    agentType?: string;
    agentId?: number;
}

interface Packet {
    id: number;
    fromId: number;
    toId: number;
    progress: number; // 0 to 1
    speed: number;
    color: string;
}

export default function NeuralCore({ logs, crew }: NeuralCoreProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number>(null);

    // State heavily driven by refs to avoid constant re-renders during rAF
    const nodes = useRef<Node[]>([]);
    const packets = useRef<Packet[]>([]);
    const pulseIntensity = useRef(0);
    const lastLogCount = useRef(logs.length);
    const [currentGifIndex, setCurrentGifIndex] = useState(0);

    // Cycle GIFs
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentGifIndex((prev) => (prev + 1) % gifs.length);
        }, 10000); // Change gif every 10 seconds
        return () => clearInterval(interval);
    }, []);

    // Colors: Deep reds, magentas, flesh
    const colors = ["#ff1744", "#d500f9", "#f50057", "#ff4081", "#c51162"];
    const gifs = [
        "/gifs/strip.gif",
        "/gifs/sext.gif",
        "/gifs/playful_girls_03.gif",
        "/gifs/giphy.gif",
        "/gifs/d9pmeum-bbf6bb44-43c7-4b2e-99ff-fc441b50fe58.gif"
    ];

    // Handle Log spikes (Drive the heartbeat)
    useEffect(() => {
        if (logs.length > lastLogCount.current) {
            const newLogs = logs.length - lastLogCount.current;
            pulseIntensity.current = Math.min(pulseIntensity.current + (newLogs * 0.2), 2.5); // Max intensity cap

            // Check latest logs for agent activity
            if (nodes.current.length > 1) {
                const latestLogs = logs.slice(lastLogCount.current);

                // Keep performance capped if logs spike super hard
                const logsToVisualze = latestLogs.slice(-10);

                logsToVisualze.forEach(log => {
                    let originNode = null;
                    // Attempt to extract the [AGENT_NAME #... ] format tag from the log message string
                    const tagMatch = log.msg.match(/\[([A-Z_]+)(?: #\w+)?\]/);

                    if (tagMatch) {
                        const type = tagMatch[1];
                        originNode = nodes.current.find(n => n.agentType && n.agentType.includes(type));
                    }

                    // If we can't map this log to a real node, do NOT fake it.
                    if (!originNode) return;

                    // Dynamically map packet color to severity/importance
                    let pColor = colors[Math.floor(Math.random() * colors.length)];
                    if (log.level === 'MONEY') pColor = "#ffd600"; // gold
                    else if (log.level === 'ERROR') pColor = "#ff1744"; // red
                    else if (log.level === 'CRYPTO') pColor = "#00e676"; // green
                    else if (originNode && originNode.color) pColor = originNode.color;

                    packets.current.push({
                        id: Date.now() + Math.random(),
                        fromId: originNode.id,
                        toId: 0, // Core
                        progress: 0,
                        speed: 0.015 + (Math.random() * 0.03), // Slightly slower to read
                        color: pColor
                    });
                });

                lastLogCount.current = logs.length;
            } // Close if (nodes.current.length > 1)
        } // Close if (logs.length > lastLogCount.current)
    }, [logs]);

    // Init Nodes
    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;

        canvasRef.current.width = cw;
        canvasRef.current.height = ch;

        // Center Core
        const core: Node = {
            id: 0,
            x: cw / 2,
            y: ch / 2,
            baseX: cw / 2,
            baseY: ch / 2,
            vx: 0,
            vy: 0,
            radius: 40,
            color: "#ff1744",
            isCore: true
        };

        const initialNodes: Node[] = [core];

        // Map 1:1 to crew members
        crew.forEach((agent, index) => {
            const angle = (index / Math.max(crew.length, 1)) * Math.PI * 2;
            const dist = 140 + Math.random() * 80; // Orbit distance

            // Assign color based on agent type
            let color = "#ff4081"; // default magenta
            if (agent.type === "WATCHER") color = "#00e676"; // green
            else if (agent.type.includes("SNIPER")) color = "#ff1744"; // red
            else if (agent.type === "BANKER") color = "#ffd600"; // gold
            else if (agent.type === "ARCHITECT") color = "#d500f9"; // deep purple
            else if (agent.type === "CALLER") color = "#00b0ff"; // blue

            initialNodes.push({
                id: agent.id,
                x: core.x + Math.cos(angle) * dist,
                y: core.y + Math.sin(angle) * dist,
                baseX: core.x + Math.cos(angle) * dist,
                baseY: core.y + Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: 10 + Math.random() * 4,
                color: color,
                agentType: agent.type,
                agentId: agent.id
            });
        });


        nodes.current = initialNodes;

    }, [crew]);

    const draw = () => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;

        const cw = canvasRef.current.width;
        const ch = canvasRef.current.height;

        // Dark, fade-out background for motion blur trails
        ctx.fillStyle = "rgba(5, 10, 14, 0.25)";
        ctx.fillRect(0, 0, cw, ch);

        const time = Date.now() / 1000;

        // Decay pulse
        if (pulseIntensity.current > 0) {
            pulseIntensity.current *= 0.95;
            if (pulseIntensity.current < 0.01) pulseIntensity.current = 0;
        }

        const core = nodes.current[0];
        if (!core) return;

        // 1. Draw web tethers (Shibari style constraints)
        ctx.lineWidth = 1.5;
        for (let i = 1; i < nodes.current.length; i++) {
            const n = nodes.current[i];

            // Jiggle nodes slightly
            n.x += Math.cos(time + i) * 0.5;
            n.y += Math.sin(time + i) * 0.5;

            // Draw tentacle/web to core
            ctx.beginPath();
            ctx.moveTo(core.x, core.y);
            // Quadratic bezier to make it look fleshy/curved
            const cpX = (core.x + n.x) / 2 + Math.cos(time * 2 + i) * 40;
            const cpY = (core.y + n.y) / 2 + Math.sin(time * 2 + i) * 40;
            ctx.quadraticCurveTo(cpX, cpY, n.x, n.y);

            // Throb opacity based on global intensity
            const tetherOp = 0.2 + (pulseIntensity.current * 0.2);
            ctx.strokeStyle = `rgba(213, 0, 249, ${Math.min(tetherOp, 0.8)})`;
            ctx.stroke();

            // Cross-connect nodes occasionally for a web look
            if (i > 1 && i % 3 === 0) {
                const prev = nodes.current[i - 1];
                ctx.beginPath();
                ctx.moveTo(n.x, n.y);
                ctx.lineTo(prev.x, prev.y);
                ctx.strokeStyle = `rgba(255, 23, 68, ${Math.min(0.1 + pulseIntensity.current * 0.1, 0.4)})`;
                ctx.stroke();
            }
        }

        // 2. Draw packets traveling along the tethers
        for (let i = packets.current.length - 1; i >= 0; i--) {
            const p = packets.current[i];
            const fromNode = nodes.current.find(n => n.id === p.fromId);
            const toNode = nodes.current[0]; // always core

            if (!fromNode) { packets.current.splice(i, 1); continue; }

            p.progress += p.speed;

            if (p.progress >= 1) {
                packets.current.splice(i, 1);
                // Little hit flash on core
                pulseIntensity.current = Math.min(pulseIntensity.current + 0.1, 2);
                continue;
            }

            // Interpolate along the same bezier curve
            const cpX = (fromNode.x + toNode.x) / 2 + Math.cos(time * 2 + p.fromId) * 40;
            const cpY = (fromNode.y + toNode.y) / 2 + Math.sin(time * 2 + p.fromId) * 40;

            const t = p.progress;
            const px = (1 - t) * (1 - t) * fromNode.x + 2 * (1 - t) * t * cpX + t * t * toNode.x;
            const py = (1 - t) * (1 - t) * fromNode.y + 2 * (1 - t) * t * cpY + t * t * toNode.y;

            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = p.color;

            // Packet glow
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
            ctx.fill();
            ctx.shadowBlur = 0; // reset
        }

        // 3. Draw Nodes (Agents)
        for (let i = 1; i < nodes.current.length; i++) {
            const n = nodes.current[i];
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
            ctx.fillStyle = n.color;

            ctx.shadowBlur = 15;
            ctx.shadowColor = n.color;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Inner darker core for nodes
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fill();

            // Render Agent Name Label
            if (n.agentType && n.agentType !== "GHOST") {
                ctx.font = "bold 8px monospace";
                ctx.fillStyle = n.color;
                ctx.textAlign = "center";
                // Shorten agent type if too long (e.g. MEV_PREDATOR -> MEV)
                const shortLabel = n.agentType.split('_')[0];
                ctx.fillText(shortLabel, n.x, n.y + n.radius + 12);
            }
        }

        // 4. Draw The Heart / Core
        const beatPhase = (Math.sin(time * (3 + pulseIntensity.current)) + 1) / 2; // 0 to 1
        const currentRadius = core.radius + (beatPhase * 15) + (pulseIntensity.current * 10);

        ctx.beginPath();
        ctx.arc(core.x, core.y, currentRadius, 0, Math.PI * 2);

        // Core Flesh Gradient
        const grad = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, currentRadius);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.2, "#ff4081");
        grad.addColorStop(0.8, "#ff1744");
        grad.addColorStop(1, "rgba(213, 0, 249, 0)");

        ctx.fillStyle = grad;
        ctx.shadowBlur = 40 + (pulseIntensity.current * 20);
        ctx.shadowColor = "#ff1744";
        ctx.fill();
        ctx.shadowBlur = 0;

        // Core central black hole
        ctx.beginPath();
        ctx.arc(core.x, core.y, currentRadius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10, 5, 5, 0.9)";
        ctx.fill();

        animationRef.current = requestAnimationFrame(draw);
    };

    useEffect(() => {
        animationRef.current = requestAnimationFrame(draw);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    return (
        <div className="w-full h-full min-h-[500px] border border-red-900/30 rounded-xl overflow-hidden relative bg-black flex flex-col">
            <div className="absolute top-0 left-0 w-full px-4 py-3 border-b border-red-900/40 z-30 bg-black/40 backdrop-blur-md flex justify-between items-center">
                <h2 className="text-[10px] font-black tracking-[0.3em] text-red-500 uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse glow-pulse" />
                    Swarm Neural Core
                </h2>
                <span className="text-[9px] text-fuchsia-400 font-mono tracking-widest">{nodes.current.length} NODES LINKED</span>
            </div>

            {/* SEXY HOLOGRAM BACKGROUND */}
            <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-40 mix-blend-screen transition-all duration-[3000ms]">
                <img
                    src={gifs[currentGifIndex]}
                    className="w-full h-full object-cover grayscale mix-blend-screen"
                    style={{
                        filter: "contrast(1.2) brightness(1.2)"
                    }}
                    alt="Neural Hub"
                />
            </div>

            <div ref={containerRef} className="flex-1 relative w-full h-full z-10 mix-blend-screen">
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            </div>

            {/* Overlay vignette to make it dirty */}
            <div className="absolute inset-0 pointer-events-none z-20" style={{
                background: 'radial-gradient(circle, transparent 40%, rgba(5,0,10,0.85) 100%)'
            }} />
        </div>
    );
}
