"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Terminal, Shield, DollarSign, Brain, Skull, Activity,
  Signal, GraduationCap, Wifi, WifiOff, Crosshair, Eye,
  Zap, Bot, Mic, Phone, Code, Search, Flame, TrendingUp,
  AlertTriangle, Check, Clock, Target, Volume2, Globe, FileText,
  MessageSquare, Smartphone, Layers, Bell, BellOff, Wallet, Coins
} from "lucide-react";

// ─── Type Definitions ────────────────────────────────────────
interface LogEntry {
  type: string;
  msg: string;
  level: string;
  timestamp: string;
}

interface CrewMember {
  id: number;
  type: string;
  status: string;
}

interface MissionEntry {
  id: string;
  desc: string;
  status: string;
}

interface HeadhunterLead {
  title: string;
  url?: string;
  matchScore: number;
  verdict: string;
  estimatedProfit: string;
  difficulty: number;
  strategy: string;
  timeEstimate: string;
  flags: string;
}

interface HeadhunterReport {
  timestamp: string;
  source: string;
  totalFound: number;
  evaluated: HeadhunterLead[];
  proposals: { jobTitle: string; text: string }[];
}

interface CommsEntry {
  from: string;
  msg: string;
  timestamp: string;
}

interface MarketState {
  solana: { price: number; change24h: number; trend: number };
  bitcoin: { price: number; change24h: number; trend: number };
  ethereum: { price: number; change24h: number; trend: number };
  timestamp: string;
}

// ─── Agent Metadata ──────────────────────────────────────────
const AGENT_META: Record<string, { icon: typeof Terminal; color: string; division: string; title: string }> = {
  SNIPER: { icon: Crosshair, color: "text-red-400", division: "EXECUTION", title: "The Sniper" },
  CRYPTO: { icon: DollarSign, color: "text-emerald-400", division: "REVENUE", title: "The Hustler" },
  SIREN: { icon: Brain, color: "text-pink-400", division: "INTELLIGENCE", title: "The Siren" },
  GHOST: { icon: Skull, color: "text-gray-300", division: "INTELLIGENCE", title: "The Ghost" },
  INFLUENCER: { icon: Globe, color: "text-fuchsia-400", division: "COMMS", title: "Syla" },
  SCAVENGER: { icon: Search, color: "text-lime-400", division: "REVENUE", title: "The Scavenger" },
  FORGER: { icon: Flame, color: "text-purple-400", division: "EXECUTION", title: "The Forger" },
  SHADOW: { icon: Eye, color: "text-slate-400", division: "EXECUTION", title: "The Shadow" },
  WATCHER: { icon: Activity, color: "text-cyan-400", division: "INTELLIGENCE", title: "The Watcher" },
  ORACLE: { icon: Shield, color: "text-amber-400", division: "INTELLIGENCE", title: "The Oracle" },
  BANKER: { icon: TrendingUp, color: "text-yellow-400", division: "REVENUE", title: "The Banker" },
  LIBRARIAN: { icon: GraduationCap, color: "text-blue-400", division: "INTELLIGENCE", title: "The Librarian" },
  CALLER: { icon: Volume2, color: "text-sky-400", division: "COMMS", title: "The Caller" },
  TWILIO: { icon: Phone, color: "text-teal-400", division: "COMMS", title: "Twilio Bridge" },
  INCUBATOR: { icon: Zap, color: "text-orange-400", division: "INTELLIGENCE", title: "The Incubator" },
  DEEPFAKER: { icon: Bot, color: "text-violet-400", division: "EXECUTION", title: "The Deepfaker" },
  ARCHITECT: { icon: Code, color: "text-emerald-300", division: "INTELLIGENCE", title: "The Architect" },
  HEADHUNTER: { icon: Target, color: "text-orange-500", division: "REVENUE", title: "The Headhunter" },
  SEED_FUND_AGENT: { icon: Zap, color: "text-amber-500", division: "REVENUE", title: "The Seed Funder" },
  CAPITAL_GEN: { icon: DollarSign, color: "text-emerald-500", division: "REVENUE", title: "Capital Gen" },
  JULES: { icon: Brain, color: "text-blue-500", division: "EVOLUTION", title: "Jules Swarm" },
  FARM: { icon: Wifi, color: "text-gray-400", division: "EXECUTION", title: "Swarm Controller" },
};

const DIVISION_COLORS: Record<string, string> = {
  INTELLIGENCE: "border-blue-500/30 bg-blue-500/5",
  EXECUTION: "border-red-500/30 bg-red-500/5",
  REVENUE: "border-yellow-500/30 bg-yellow-500/5",
  COMMS: "border-sky-500/30 bg-sky-500/5",
  EVOLUTION: "border-blue-600/30 bg-blue-600/5",
};

interface TradeEntry {
  mint: string;
  entryPrice: string;
  exitPrice?: string;
  entryTime: string;
  pnl?: string;
  status: string;
}

interface WalletHolding {
  mint: string;
  symbol: string;
  balance: number;
  usdValue: number;
  priceUsd?: number;
}

interface WalletState {
  sol: { balance: number; usdValue: number; price: number };
  tokens: WalletHolding[];
  totalUsd: number;
  timestamp: string;
}

// ─── Main Component ──────────────────────────────────────────
export default function SyndicateDashboard() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [profit, setProfit] = useState(0);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [missions, setMissions] = useState<MissionEntry[]>([]);
  const [trades, setTrades] = useState<TradeEntry[]>([]); // New Trade State
  const [connected, setConnected] = useState(false);
  const [uptime, setUptime] = useState(0);
  const [headhunterData, setHeadhunterData] = useState<HeadhunterReport | null>(null);
  const [marketData, setMarketData] = useState<MarketState | null>(null);
  const [miningData, setMiningData] = useState<Record<string, any>>({});
  const [farmData, setFarmData] = useState<any>(null);
  const [agentComms, setAgentComms] = useState<CommsEntry[]>([]);
  const [time, setTime] = useState(new Date());
  const [alarmTime, setAlarmTime] = useState("");
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"feed" | "headhunter" | "missions" | "comms" | "swarm" | "raw" | "wallet">("feed");
  const [rawSignals, setRawSignals] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [walletData, setWalletData] = useState<WalletState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const commsRef = useRef<HTMLDivElement>(null);
  const rawScrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Clock logic
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Alarm check
  useEffect(() => {
    if (alarmEnabled && alarmTime) {
      const nowStr = time.getHours().toString().padStart(2, '0') + ":" +
        time.getMinutes().toString().padStart(2, '0');
      if (nowStr === alarmTime && !isRinging) {
        setIsRinging(true);
        if (window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance("SYNDICATE ALARM: ATTENTION REQUIRED.");
          window.speechSynthesis.speak(u);
        }
      } else if (nowStr !== alarmTime && isRinging) {
        setIsRinging(false);
      }
    }
  }, [time, alarmEnabled, alarmTime, isRinging]);

  // WebSocket connection
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      // Prevent multiple connections
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

      const ws = new WebSocket("ws://localhost:8080");
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        if (window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance("Syndicate Neural Interface: Online.");
          u.rate = 1.1; u.pitch = 0.9;
          window.speechSynthesis.speak(u);
        }
      };

      ws.onmessage = (event) => {
        // Capture raw data stream
        setRawSignals(prev => [...prev.slice(-199), event.data]);

        try {
          const data = JSON.parse(event.data);

          // Audio cues for big events
          if (data.type === 'KICK_UP' && window.speechSynthesis) {
            const u = new SpeechSynthesisUtterance(`Profit Registered: $${data.amount}`);
            window.speechSynthesis.speak(u);
          }

          switch (data.type) {
            case "INIT":
              setProfit(data.profit || 0);
              setCrew(data.crew || []);
              if (data.agentComms) setAgentComms(data.agentComms);
              if (data.trades) setTrades(data.trades);
              break;
            case "LOG":
              setLogs(prev => [...prev.slice(-99), data]);
              break;
            case "KICK_UP":
              setProfit(data.profit || 0);
              if (data.trades) setTrades(data.trades);
              // Removed redundant log insertion, since REAL PROFIT is sent as a native LOG.
              break;
            case "CREW_UPDATE":
              setCrew(data.crew || []);
              break;
            case "MISSION_UPDATE":
              setMissions(data.missions || []);
              break;
            case "HEADHUNTER_REPORT":
              setHeadhunterData(data.data);
              break;
            case "MARKET_DATA":
              setMarketData(data.data);
              break;
            case "MINING_UPDATE":
              setMiningData(prev => ({ ...prev, [data.coin]: data }));
              break;
            case "UPGRADE":
              setLogs(prev => [...prev.slice(-99), {
                type: "LOG", level: "POWER", timestamp: new Date().toISOString(),
                msg: `⚡ UPGRADE: ${data.agent} → ${data.protocol}`
              }]);
              break;
            case "AGENT_COMMS":
              setAgentComms(prev => [...prev.slice(-199), { from: data.from, msg: data.msg, timestamp: data.timestamp }]);
              break;
            case "STATUS_REPORT":
              if (data.metrics) setFarmData((prev: any) => ({ ...prev, ...data.metrics }));
              break;
            case "WALLET_HOLDINGS":
              setWalletData({
                sol: data.sol,
                tokens: data.tokens || [],
                totalUsd: data.totalUsd || 0,
                timestamp: data.timestamp,
              });
              break;
            case "FARM_STATUS":
              setFarmData((prev: any) => ({ ...prev, devices: data.devices, active: true }));
              break;
          }
        } catch (e) { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimeout = setTimeout(connect, 3000); // auto-reconnect
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect loop on unmount
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Uptime timer
  useEffect(() => {
    const t = setInterval(() => setUptime(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Auto-scroll comms
  useEffect(() => {
    if (commsRef.current) {
      commsRef.current.scrollTop = commsRef.current.scrollHeight;
    }
  }, [agentComms]);

  // Auto-scroll Raw Feed
  useEffect(() => {
    if (rawScrollRef.current) {
      rawScrollRef.current.scrollTop = rawScrollRef.current.scrollHeight;
    }
  }, [rawSignals]);

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case "ERROR": return "text-red-400";
      case "MONEY": return "text-yellow-300";
      case "POWER": return "text-purple-400";
      case "CRYPTO": return "text-cyan-400";
      default: return "text-emerald-600";
    }
  };

  // Group crew by division
  const groupedCrew = crew.reduce<Record<string, CrewMember[]>>((acc, member) => {
    const div = AGENT_META[member.type]?.division || "OTHER";
    if (!acc[div]) acc[div] = [];
    acc[div].push(member);
    return acc;
  }, {});

  const snipeCount = headhunterData?.evaluated?.filter(j => j.verdict === "SNIPE").length || 0;

  return (
    <div className="min-h-screen text-green-400 font-mono grid-bg scanlines">
      {/* ─── TOP BAR ──────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/80 border-b border-green-900/40">
        <div className="px-6 py-3 flex items-center justify-between">
          {/* Left: Brand */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-900/20 border border-green-500/30 flex items-center justify-center glow-pulse">
              <Terminal className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-[0.25em] text-white glitch-text" data-text="INFINITE HYPERNOVA">
                INFINITE <span className="text-green-400 text-glow">HYPERNOVA</span>
              </h1>
              <p className="text-[9px] text-green-800 tracking-[0.3em] uppercase">
                Autonomous Syndicate Network v2.5.0 // Sovereign Entity
              </p>
            </div>
          </div>

          {/* Right: Status Bar */}
          <div className="flex items-center gap-6">
            {/* Uptime */}
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[9px] text-gray-600 uppercase tracking-wider">Session Uptime</span>
              <span className="text-sm font-bold text-green-500 tabular-nums">{formatUptime(uptime)}</span>
            </div>

            {/* Crew Count */}
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[9px] text-gray-600 uppercase tracking-wider">Active Agents</span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">{crew.length}</span>
            </div>

            {/* Clock & Alarm */}
            <div className="hidden lg:flex flex-col items-center bg-black/40 border border-green-900/20 rounded-lg px-3 py-1 gap-1">
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-green-500" />
                <span className="text-xs font-bold text-white tabular-nums">
                  {time.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <div className="flex items-center gap-2 border-t border-green-900/40 pt-1 w-full justify-center">
                <input
                  type="time"
                  value={alarmTime}
                  onChange={(e) => setAlarmTime(e.target.value)}
                  className="bg-transparent text-[8px] text-green-400 focus:outline-none border-none w-10 p-0"
                />
                <button
                  onClick={() => {
                    setAlarmEnabled(!alarmEnabled);
                    if (isRinging) setIsRinging(false);
                  }}
                  className={`p-0.5 rounded transition-all ${alarmEnabled ? (isRinging ? 'bg-red-500 animate-pulse' : 'bg-green-500/20 text-green-400') : 'bg-gray-800 text-gray-600'}`}
                  title={alarmEnabled ? "Disable Alarm" : "Enable Alarm"}
                >
                  {alarmEnabled ? <Bell className="w-2.5 h-2.5" /> : <BellOff className="w-2.5 h-2.5" />}
                </button>
              </div>
            </div>

            {/* Connection */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full status-dot ${connected
                ? "bg-green-400 shadow-[0_0_8px_rgba(0,255,65,0.6)]"
                : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                }`} />
              <span className="text-[10px] font-bold tracking-widest">
                {connected ? <span className="text-green-400">LIVE</span> : <span className="text-red-400">OFFLINE</span>}
              </span>
            </div>

            {/* War Chest */}
            <div className="bg-black/60 border border-green-900/30 rounded-lg px-5 py-2 glow-pulse">
              <span className="text-[8px] text-gray-600 uppercase tracking-widest block">War Chest</span>
              <span className="text-2xl font-black text-white tabular-nums profit-flash">
                ${profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Data stream bar */}
        <div className="h-[1px] data-stream-bar" />
      </header>

      {/* ─── MAIN LAYOUT ──────────────────────────────────── */}
      <main className="p-4 grid grid-cols-1 xl:grid-cols-5 gap-4 max-w-[1920px] mx-auto">

        {/* ─── LEFT: AGENT ROSTER ─────────────────────────── */}
        <aside className="xl:col-span-1 space-y-4">
          <div className="border border-green-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-green-900/20 flex items-center justify-between">
              <h2 className="text-[10px] font-bold tracking-[0.2em] text-green-700 uppercase flex items-center gap-2">
                <Shield className="w-3 h-3" /> Swarm Roster
              </h2>
              <span className="text-[9px] bg-green-900/30 text-green-500 px-2 py-0.5 rounded-full font-bold">
                {crew.length} ACTIVE
              </span>
            </div>
            <div className="p-3 space-y-4 max-h-[calc(100vh-180px)] overflow-y-auto">
              {Object.entries(groupedCrew).map(([division, members]) => (
                <div key={division}>
                  <div className={`text-[8px] font-black tracking-[0.3em] uppercase mb-2 px-2 py-1 rounded border ${DIVISION_COLORS[division] || "border-gray-700/30 bg-gray-700/5"}`}>
                    {division}
                  </div>
                  <div className="space-y-1">
                    {members.map(agent => {
                      const meta = AGENT_META[agent.type];
                      const IconComponent = meta?.icon || Shield;
                      return (
                        <div key={agent.id} className="agent-card flex items-center gap-3 px-3 py-2 rounded-lg cursor-default">
                          <div className={`p-1.5 rounded bg-black/60 border border-green-900/20`}>
                            <IconComponent className={`w-3.5 h-3.5 ${meta?.color || "text-gray-400"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-gray-200 truncate">{meta?.title || agent.type}</div>
                            <div className="text-[8px] text-green-900 font-mono">#{agent.id}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {crew.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mb-3" />
                  <span className="text-[10px] text-gray-600 italic">Recruiting agents...</span>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ─── CENTER: MAIN CONTENT ───────────────────────── */}
        <section className="xl:col-span-4 space-y-4">

          {/* Tab Selector */}
          <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 border border-green-900/20 w-fit flex-wrap">
            {([
              { key: "feed" as const, label: "INTEL FEED", icon: Signal },
              { key: "raw" as const, label: "RAW INTEL", icon: Terminal },
              { key: "wallet" as const, label: `WALLET${walletData ? ` ($${walletData.totalUsd.toFixed(0)})` : ""}`, icon: Wallet },
              { key: "comms" as const, label: `CO-LAB${agentComms.length > 0 ? ` (${agentComms.length})` : ""}`, icon: MessageSquare },
              { key: "headhunter" as const, label: `HEADHUNTER${snipeCount > 0 ? ` (${snipeCount})` : ""}`, icon: Target },
              { key: "missions" as const, label: "OPERATIONS", icon: Zap },
              { key: "swarm" as const, label: "SWARM", icon: Wifi },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setSelectedTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-[10px] font-bold tracking-widest uppercase transition-all ${selectedTab === tab.key
                  ? "bg-green-900/30 text-green-400 shadow-[0_0_10px_rgba(0,255,65,0.1)]"
                  : "text-gray-600 hover:text-gray-400 hover:bg-white/5"
                  }`}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ─── INTEL FEED TAB ───────────────────────────── */}
          {selectedTab === "feed" && (
            <div className="border border-green-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-green-900/20 flex items-center justify-between">
                <h2 className="text-[10px] font-bold tracking-[0.2em] text-green-700 uppercase flex items-center gap-2">
                  <Signal className="w-3 h-3" /> Live Intelligence Stream
                </h2>
                <span className="text-[9px] text-gray-600 tabular-nums">{logs.length} entries</span>
              </div>
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-1 max-h-[calc(100vh-280px)] min-h-[500px]"
              >
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3 group hover:bg-white/[0.02] py-0.5 px-2 rounded transition-colors">
                    <span className="text-[10px] text-gray-700 shrink-0 tabular-nums font-bold">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span className={`text-[10px] shrink-0 font-black w-12 ${getLogColor(log.level)}`}>
                      {log.level}
                    </span>
                    <span className="text-[11px] text-gray-400 group-hover:text-gray-200 transition-colors break-all">
                      {log.msg}
                    </span>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="flex items-center gap-2 text-gray-600 italic text-xs mt-20 justify-center">
                    <span className="cursor-blink">Awaiting swarm transmissions</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── RAW INTEL TAB ────────────────────────────── */}
          {selectedTab === "raw" && (
            <div className="border border-green-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-green-900/20 flex items-center justify-between">
                <h2 className="text-[10px] font-bold tracking-[0.2em] text-green-700 uppercase flex items-center gap-2">
                  <Terminal className="w-3 h-3" /> Unparsed Neural Traffic
                </h2>
                <span className="text-[9px] text-gray-600 tabular-nums">{rawSignals.length} packets</span>
              </div>
              <div
                ref={rawScrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-1 max-h-[calc(100vh-280px)] min-h-[500px] bg-black/80 font-mono text-[9px]"
              >
                {rawSignals.map((sig, i) => (
                  <div key={i} className="text-green-500/60 border-b border-green-900/10 pb-1 break-all hover:text-green-400 transition-colors">
                    <span className="text-green-800 mr-2 shrink-0">[{i.toString().padStart(3, '0')}]</span>
                    {sig}
                  </div>
                ))}
                {rawSignals.length === 0 && (
                  <div className="flex items-center gap-2 text-gray-600 italic text-xs mt-20 justify-center">
                    <span className="cursor-blink">Listening for raw packet drift...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── WALLET TAB ─────────────────────────────── */}
          {selectedTab === "wallet" && (
            <div className="border border-yellow-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-yellow-900/20 flex items-center justify-between">
                <h2 className="text-[10px] font-bold tracking-[0.2em] text-yellow-600 uppercase flex items-center gap-2">
                  <Wallet className="w-3 h-3" /> Live Wallet Holdings
                </h2>
                <span className="text-[9px] text-gray-600 tabular-nums">
                  {walletData ? `Updated ${new Date(walletData.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" })}` : "Awaiting banker scan..."}
                </span>
              </div>
              <div className="p-4 max-h-[calc(100vh-280px)] overflow-y-auto">
                {walletData ? (
                  <div className="space-y-4">
                    {/* Total Portfolio Value */}
                    <div className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3">
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Total Portfolio</span>
                      <span className="text-2xl font-black text-yellow-300 tabular-nums">
                        ${walletData.totalUsd.toFixed(2)}
                      </span>
                    </div>

                    {/* Holdings Table */}
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[9px] text-gray-600 uppercase tracking-wider border-b border-gray-800">
                          <th className="pb-2 pl-2">Asset</th>
                          <th className="pb-2">Balance</th>
                          <th className="pb-2">PnL</th>
                          <th className="pb-2">Signal</th>
                          <th className="pb-2 text-right pr-2">Value</th>
                        </tr>
                      </thead>
                      <tbody className="text-[10px] font-mono">
                        {/* SOL row always first */}
                        <tr className="group hover:bg-white/5 border-b border-gray-800/20 transition-colors">
                          <td className="py-2 pl-2">
                            <span className="font-black text-yellow-300">◎ SOL</span>
                            <span className="text-[8px] text-gray-600 block">${walletData.sol.price.toFixed(2)}/SOL</span>
                          </td>
                          <td className="py-2 text-gray-300">{walletData.sol.balance.toFixed(4)}</td>
                          <td className="py-2 text-gray-500">—</td>
                          <td className="py-2"><span className="text-[8px] bg-gray-800/60 text-gray-500 px-1.5 py-0.5 rounded">BASE</span></td>
                          <td className="py-2 pr-2 text-right font-bold text-yellow-300">
                            ${walletData.sol.usdValue.toFixed(2)}
                          </td>
                        </tr>
                        {/* SPL tokens with exit signals */}
                        {walletData.tokens.map((token: any, i: number) => {
                          const sig = token.exitSignal;
                          const signalColor = {
                            STRONG_SELL: 'bg-green-500/20 text-green-300 border-green-500/30',
                            TAKE_PROFIT: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
                            WATCH: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
                            STOP_LOSS: 'bg-red-500/20 text-red-400 border-red-500/30',
                            DUMP: 'bg-red-600/30 text-red-300 border-red-600/40',
                            HOLD: 'bg-gray-800/40 text-gray-500 border-gray-700/30',
                          }[sig?.signal] || 'bg-gray-800/40 text-gray-500 border-gray-700/30';
                          const rowGlow = sig?.signal === 'STRONG_SELL' || sig?.signal === 'TAKE_PROFIT'
                            ? 'bg-green-500/[0.03]' : sig?.signal === 'DUMP' || sig?.signal === 'STOP_LOSS'
                              ? 'bg-red-500/[0.03]' : '';
                          const pnl = sig?.pnl;
                          const momentum5m = token.priceChange5m;

                          return (
                            <tr key={i} className={`group hover:bg-white/5 border-b border-gray-800/10 last:border-0 transition-colors ${rowGlow}`}>
                              <td className="py-2 pl-2">
                                <span className="font-bold text-gray-200">{token.symbol}</span>
                                <span className="text-[8px] text-gray-700 block font-mono">{token.mint?.slice(0, 8)}...{token.mint?.slice(-4)}</span>
                              </td>
                              <td className="py-2 text-gray-400">
                                {token.balance?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                {momentum5m != null && (
                                  <span className={`ml-1 text-[8px] ${momentum5m > 0 ? 'text-green-400' : momentum5m < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                                    {momentum5m > 0 ? '▲' : momentum5m < 0 ? '▼' : '→'}{Math.abs(momentum5m).toFixed(1)}%
                                  </span>
                                )}
                              </td>
                              <td className="py-2">
                                {pnl != null ? (
                                  <span className={`font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                                  </span>
                                ) : <span className="text-gray-600 italic text-[8px]">no entry</span>}
                              </td>
                              <td className="py-2">
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${signalColor}`} title={sig?.reason}>
                                  {sig?.signal || 'HOLD'}
                                </span>
                              </td>
                              <td className={`py-2 pr-2 text-right font-bold ${token.usdValue > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
                                {token.usdValue > 0 ? `$${token.usdValue.toFixed(2)}` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                        {walletData.tokens.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-gray-600 text-xs italic">No SPL tokens found in wallet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500" />
                    <span className="text-[10px] text-gray-600 italic">Banker scanning wallet... (updates every 60s)</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedTab === "comms" && (
            <div className="border border-green-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden flex flex-col h-[calc(100vh-140px)]">
              <div className="px-4 py-3 border-b border-green-900/20 flex items-center justify-between shrink-0">
                <h2 className="text-[10px] font-bold tracking-[0.2em] text-green-700 uppercase flex items-center gap-2">
                  <MessageSquare className="w-3 h-3" /> Syndicate Co-Lab
                </h2>
                <span className="text-[9px] text-gray-600 tabular-nums">{agentComms.length} messages</span>
              </div>

              {/* Messages Area */}
              <div
                ref={commsRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
              >
                {agentComms.map((entry, i) => {
                  const agentKey = entry.from?.split(' ')[0]?.replace('#', '');
                  const meta = AGENT_META[agentKey] || null;
                  const IconComponent = meta?.icon || Bot;
                  const isUser = entry.from === 'THE DON';

                  return (
                    <div key={i} className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
                      {!isUser && (
                        <div className={`p-1.5 rounded bg-black/60 border border-green-900/20 shrink-0 h-fit`}>
                          <IconComponent className={`w-3.5 h-3.5 ${meta?.color || "text-gray-500"}`} />
                        </div>
                      )}

                      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[80%]`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-black ${isUser ? 'text-green-400' : (meta?.color || "text-gray-400")}`}>
                            {entry.from || 'UNKNOWN'}
                          </span>
                          <span className="text-[8px] text-gray-700 tabular-nums">
                            {new Date(entry.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </div>
                        <div className={`p-3 rounded-lg text-[11px] leading-relaxed break-words ${isUser
                          ? "bg-green-900/20 border border-green-500/20 text-gray-200"
                          : "bg-gray-900/40 border border-gray-800/30 text-gray-300"
                          }`}>
                          {entry.msg}
                        </div>
                      </div>

                      {isUser && (
                        <div className={`p-1.5 rounded bg-green-500/10 border border-green-500/30 shrink-0 h-fit`}>
                          <Bot className="w-3.5 h-3.5 text-green-400" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-green-900/20 bg-black/60 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatInput.trim()) return;
                    wsRef.current?.send(JSON.stringify({ type: 'USER_CHAT', msg: chatInput }));
                    setChatInput("");
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Strategies, orders, or chatter..."
                    className="flex-1 bg-black/50 border border-green-900/30 rounded-lg px-4 py-2 text-sm text-green-400 placeholder-green-900/50 focus:outline-none focus:border-green-500/50 transition-all font-mono"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-900/20 hover:bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg transition-all font-bold text-xs uppercase tracking-wider"
                  >
                    Send
                  </button>
                </form>
              </div>
            </div>
          )}


          {/* ─── FREELANCE OPS TAB (Ex-Headhunter) ────────── */}
          {selectedTab === "headhunter" && (
            <div className="border border-green-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-green-900/20 flex items-center justify-between">
                <h2 className="text-[10px] font-bold tracking-[0.2em] text-green-700 uppercase flex items-center gap-2">
                  <Target className="w-3 h-3" /> Freelance Ops (Headhunter)
                </h2>
                {headhunterData && (
                  <span className="text-[9px] text-gray-600">
                    Last scan: {new Date(headhunterData.timestamp).toLocaleString()} • Source: {headhunterData.source}
                  </span>
                )}
              </div>
              <div className="p-4 max-h-[calc(100vh-280px)] overflow-y-auto space-y-3">
                {headhunterData?.evaluated?.map((lead, i) => (
                  <div
                    key={i}
                    className={`border rounded-lg p-4 transition-all hover:scale-[1.005] ${lead.verdict === "SNIPE"
                      ? "border-red-500/40 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.05)]"
                      : lead.verdict === "CONSIDER"
                        ? "border-yellow-500/30 bg-yellow-500/5"
                        : "border-gray-800/30 bg-gray-800/5"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${lead.verdict === "SNIPE" ? "bg-red-500/20 text-red-400" :
                            lead.verdict === "CONSIDER" ? "bg-yellow-500/20 text-yellow-400" :
                              "bg-gray-700/20 text-gray-500"
                            }`}>
                            {lead.verdict === "SNIPE" ? "🔫" : lead.verdict === "CONSIDER" ? "💡" : "⏭️"} {lead.verdict}
                          </span>
                          <span className="text-[9px] text-gray-600">Match: {lead.matchScore}/10</span>
                        </div>
                        <h3 className="text-sm font-bold text-gray-200 mb-2">{lead.title}</h3>
                        {lead.strategy && (
                          <p className="text-[10px] text-gray-500 mb-2 italic">"{lead.strategy}"</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-black text-emerald-400">${lead.estimatedProfit}</div>
                        <div className="text-[9px] text-gray-600">Difficulty: {lead.difficulty}/10</div>
                        <div className="text-[9px] text-gray-600">{lead.timeEstimate}</div>
                      </div>
                    </div>
                    {lead.flags && lead.flags !== "None" && (
                      <div className="mt-2 flex items-center gap-1.5 text-[9px] text-amber-500">
                        <AlertTriangle className="w-3 h-3" /> {lead.flags}
                      </div>
                    )}
                    {lead.url && (
                      <a href={lead.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400 hover:underline mt-1 block">
                        {lead.url}
                      </a>
                    )}

                    {/* PROPOSAL PREVIEW */}
                    {headhunterData?.proposals?.find((p: any) => p.jobTitle === lead.title) && (
                      <div className="mt-3 p-3 bg-green-900/10 rounded border border-green-500/20 text-[10px] font-mono text-gray-300">
                        <div className="flex items-center gap-2 mb-2 text-green-400 font-bold uppercase tracking-wider">
                          <FileText className="w-3 h-3" /> Auto-Drafted Proposal
                        </div>
                        <div className="whitespace-pre-wrap pl-2 border-l border-green-500/30 text-gray-400 italic">
                          "{headhunterData?.proposals?.find((p: any) => p.jobTitle === lead.title)?.text.substring(0, 250)}..."
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {(!headhunterData || !headhunterData.evaluated?.length) && (
                  <div className="text-center py-20 text-gray-600 text-xs italic">
                    No headhunter data yet. The Headhunter scans every 15 minutes.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── FACTORY TAB (Incubator) ──────────────────────── */}
          {selectedTab === "comms" && (
            <div className="border border-green-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden p-6 text-center">
              <h2 className="text-xl font-bold text-green-500 mb-4">THE FACTORY (MEMECOIN LAUNCHPAD)</h2>
              <p className="text-gray-400 text-sm mb-6">Incubator Concepts ready for deployment.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* MOCK CONCEPT FOR UI (Real data maps from incubator) */}
                <div className="bg-gray-900/50 border border-purple-500/30 p-4 rounded-xl text-left hover:border-purple-400 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-purple-300 text-lg">$SYLA</h3>
                      <p className="text-xs text-purple-400">The Systems Librarian</p>
                    </div>
                    <span className="bg-purple-900/40 text-purple-300 text-[10px] px-2 py-1 rounded border border-purple-500/30">READY</span>
                  </div>
                  <p className="text-gray-400 text-xs mb-4">"An AI that organizes the chaos of the blockchain. 100% Autonomous."</p>
                  <button
                    onClick={() => wsRef.current?.send(JSON.stringify({
                      type: 'LAUNCH_TOKEN',
                      concept: { name: 'Syla', symbol: 'SYLA', uri: 'https://example.com/syla.json', snipeAmount: 0.1 }
                    }))}
                    className="w-full py-2 bg-gradient-to-r from-purple-700 to-pink-700 rounded text-white font-bold text-xs hover:scale-[1.02] transition-transform shadow-lg shadow-purple-900/50"
                  >
                    🚀 LAUNCH ON PUMP.FUN (0.02 SOL)
                  </button>
                </div>

                <div className="border-2 border-dashed border-gray-800 rounded-xl flex items-center justify-center p-8 text-gray-600 text-xs">
                  Waiting for Incubator to generate new concepts...
                </div>
              </div>
            </div>
          )}

          {/* ─── MISSIONS TAB ─────────────────────────────── */}
          {/* ─── OPERATIONS TAB ───────────────────────────── */}

          {/* ─── REVENUE & OPS TAB ────────────────────────── */}
          {selectedTab === "missions" && (
            <div className="space-y-4">

              {/* 1. REALIZED REVENUE (TRADES) */}
              <div className="border border-green-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-green-900/20 flex justify-between items-center">
                  <h2 className="text-[10px] font-bold tracking-[0.2em] text-green-700 uppercase flex items-center gap-2">
                    <DollarSign className="w-3 h-3" /> Realized Trades
                  </h2>
                  <span className="text-[9px] text-gray-600">{trades.length} closed positions</span>
                </div>
                <div className="p-4 max-h-[300px] overflow-y-auto space-y-2">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[9px] text-gray-600 uppercase tracking-wider border-b border-gray-800">
                        <th className="pb-2 pl-2">Token</th>
                        <th className="pb-2">Entry</th>
                        <th className="pb-2">Exit</th>
                        <th className="pb-2 text-right pr-2">PnL</th>
                      </tr>
                    </thead>
                    <tbody className="text-[10px] font-mono">
                      {trades.map((t, i) => (
                        <tr key={i} className="group hover:bg-white/5 border-b border-gray-800/20 last:border-0 transition-colors">
                          <td className="py-2 pl-2 font-bold text-gray-300">
                            {t.mint.substring(0, 6)}...
                            <span className="text-[8px] text-gray-600 block">{new Date(t.entryTime).toLocaleTimeString()}</span>
                          </td>
                          <td className="py-2 text-gray-400">${parseFloat(t.entryPrice).toFixed(6)}</td>
                          <td className="py-2 text-gray-400">
                            {t.exitPrice ? `$${parseFloat(t.exitPrice).toFixed(6)}` : <span className="text-amber-500 animate-pulse">HOLDING</span>}
                          </td>
                          <td className={`py-2 pr-2 text-right font-bold ${parseFloat(t.pnl) >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {t.pnl ? `${parseFloat(t.pnl) > 0 ? "+" : ""}${t.pnl}%` : "---"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {trades.length === 0 && (
                    <div className="text-center py-8 text-gray-600 text-xs italic">
                      No realized trades yet. Sniper is hunting.
                    </div>
                  )}
                </div>
              </div>

              {/* 2. MINING OPERATIONS (WALLET INTELLIGENCE) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['DOGE', 'ZEC'].map(coin => {
                  const info = miningData[coin];
                  return (
                    <div key={coin} className="bg-black/40 border border-yellow-800/30 rounded-xl p-4 flex items-center justify-between glow-pulse hover:border-yellow-500/30 transition-colors">
                      <div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-1 font-bold flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${info ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]' : 'bg-gray-600'}`} />
                          {coin} MINING
                        </div>
                        <div className="text-2xl font-black text-white tabular-nums">
                          {info ? info.balance : "SCANNING..."} <span className="text-[10px] text-gray-600 font-normal">{coin}</span>
                        </div>
                        <div className="text-[8px] text-gray-600 font-mono mt-1">
                          {info ? (info.address as string).substring(0, 12) + "..." : "Connecting to Node..."}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[8px] text-gray-600 uppercase tracking-wider mb-1">NETWORK</div>
                        <div className="text-[10px] font-bold text-yellow-600">{info?.source || '---'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 3. ACTIVE MISSIONS LIST */}
              <div className="border border-green-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-green-900/20 flex justify-between items-center">
                  <h2 className="text-[10px] font-bold tracking-[0.2em] text-green-700 uppercase flex items-center gap-2">
                    <Zap className="w-3 h-3" /> Mission Log
                  </h2>
                  <span className="text-[9px] text-gray-600">{missions.length} active</span>
                </div>
                <div className="p-4 max-h-[200px] overflow-y-auto space-y-2">
                  {missions.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-green-900/10 bg-black/20">
                      <div className={`w-1.5 h-1.5 rounded-full ${m.status === "Complete" ? "bg-green-500" : "bg-amber-500 animate-pulse"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold text-gray-300 truncate">{m.desc}</div>
                        <div className="text-[8px] text-gray-600 font-mono">{m.id}</div>
                      </div>
                      <span className={`text-[9px] font-bold ${m.status === "Complete" ? "text-green-500" : "text-amber-500"}`}>
                        {m.status}
                      </span>
                    </div>
                  ))}
                  {missions.length === 0 && (
                    <div className="space-y-6 flex flex-col items-center py-6">
                      <div className="text-center text-gray-600 text-xs italic opacity-60">
                        No active missions. Standing by...
                      </div>

                      {/* X Post Ticker */}
                      <div className="w-full max-w-2xl bg-black/60 border border-green-900/20 rounded-lg h-10 flex items-center overflow-hidden relative group">
                        <div className="absolute left-0 top-0 bottom-0 bg-green-900/20 px-3 flex items-center border-r border-green-900/40 z-10">
                          <Signal className="w-3 h-3 text-green-500" />
                          <span className="ml-2 text-[8px] font-black text-green-700 tracking-tighter">X-FEED</span>
                        </div>
                        <div className="whitespace-nowrap flex animate-ticker py-2">
                          {agentComms.filter(c => c.from === 'SYLA' || c.from === 'SHADOW' || c.msg.toUpperCase().includes('X') || c.msg.toUpperCase().includes('POST')).length > 0 ? (
                            agentComms.filter(c => c.from === 'SYLA' || c.from === 'SHADOW' || c.msg.toUpperCase().includes('X') || c.msg.toUpperCase().includes('POST')).map((c, i) => (
                              <span key={i} className="mx-8 text-[10px] text-emerald-500/80 font-mono">
                                <span className="text-white font-bold opacity-50">[{c.from}]</span> {c.msg}
                                <span className="ml-2 text-green-900 text-[8px]">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </span>
                            ))
                          ) : (
                            <span className="mx-8 text-[9px] text-gray-700 uppercase tracking-widest">Awaiting neural broadcasts from the swarm...</span>
                          )}
                          {/* Duplicate for seamless loop if content is short */}
                          <span className="mx-8 text-[9px] text-gray-700/20 uppercase tracking-widest">/// SYNDICATE ENCRYPTION ACTIVE ///</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedTab === "swarm" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-black/40 border border-green-900/30 rounded-xl p-5 backdrop-blur-sm">
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Smartphone className="w-3 h-3" /> Hardware Swarm
                  </div>
                  <div className="text-3xl font-black text-white tabular-nums">
                    {farmData?.devices || 0} <span className="text-[10px] text-gray-600 font-normal">DEVICES</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded bg-green-500/20 text-green-500 text-[8px] font-bold">ADB TUNNEL ACTIVE</div>
                    <div className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-500 text-[8px] font-bold">PARALLEL SYMBOLIC</div>
                  </div>
                </div>

                <div className="bg-black/40 border border-green-900/30 rounded-xl p-5 backdrop-blur-sm">
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Activity className="w-3 h-3" /> Engagement Velocity
                  </div>
                  <div className="text-3xl font-black text-white tabular-nums">
                    {farmData?.engagementTotal || 0} <span className="text-[10px] text-gray-600 font-normal">OPS/HOUR</span>
                  </div>
                  <div className="mt-2 h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 animate-pulse" style={{ width: '45%' }} />
                  </div>
                </div>

                <div className="bg-black/40 border border-green-900/30 rounded-xl p-5 backdrop-blur-sm">
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Globe className="w-3 h-3" /> Platform Latency
                  </div>
                  <div className="text-3xl font-black text-white tabular-nums">
                    <span className="text-emerald-400">OPTIMAL</span>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-600 font-mono">
                    US-EAST EDGE // ROTATING PROXIES
                  </div>
                </div>
              </div>

              <div className="border border-green-900/30 rounded-xl bg-black/40 backdrop-blur-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-green-900/20 flex items-center justify-between">
                  <h2 className="text-[10px] font-bold tracking-[0.2em] text-green-700 uppercase flex items-center gap-2">
                    <Layers className="w-3 h-3" /> Social Injection Heatmap
                  </h2>
                  <div className="flex gap-2">
                    <button className="px-3 py-1 rounded bg-green-900/20 text-green-500 text-[9px] hover:bg-green-500/20 transition-all font-bold">FORCE SCAN</button>
                    <button className="px-3 py-1 rounded bg-red-900/20 text-red-500 text-[9px] hover:bg-red-500/20 transition-all font-bold">KILL ALL</button>
                  </div>
                </div>
                <div className="p-10 text-center">
                  <div className="relative inline-block">
                    <div className="w-32 h-32 rounded-full border-4 border-green-500/20 border-t-green-500 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Signal className="w-8 h-8 text-green-500/40" />
                    </div>
                  </div>
                  <p className="mt-6 text-gray-500 text-xs italic">Mapping physical device telemetry...</p>
                </div>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* ─── FOOTER ───────────────────────────────────────── */}
      <footer className="mt-4 px-6 py-3 flex items-center justify-between border-t border-green-900/20 bg-black/40">
        <div className="flex items-center gap-4 text-[8px] font-bold tracking-[0.3em] text-green-900 uppercase">
          <span>Sovereign Entity</span>
          <span className="w-1 h-1 bg-green-900/50 rounded-full" />
          <span>Infinite Hypernova v2.5.0</span>
          <span className="w-1 h-1 bg-green-900/50 rounded-full" />
          <span>Distributed Autonomy</span>
        </div>
        <div className="text-[8px] text-gray-700 tracking-widest">
          ENCRYPTED // EST. 2026 // {connected ? "LINK: SECURE" : "LINK: SEVERED"}
        </div>
      </footer>
      <style jsx global>{`
        @keyframes ticker {
          0% { transform: translateX(50%); }
          100% { transform: translateX(-150%); }
        }
        .animate-ticker {
          display: inline-flex;
          animation: ticker 25s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
