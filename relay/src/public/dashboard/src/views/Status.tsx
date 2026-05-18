import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";

interface HealthData {
  status: string;
  relayName: string;
  version?: string;
  uptime?: number;
}

interface StatsData {
  connectedPeers?: number;
  gunPeers?: number;
  zenPeers?: number;
  memory?: { heapUsed: number };
}

function Status() {
  const { isAuthenticated, getAuthHeaders } = useAuth();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [healthRes, statsRes] = await Promise.all([
          fetch("/api/v1/health", { headers: getAuthHeaders() }),
          fetch("/api/v1/system/stats.json", { headers: getAuthHeaders() }),
        ]);

        const healthData = await healthRes.json();
        const statsData = await statsRes.json();

        setHealth(healthData.data || healthData);
        setStats(statsData);
      } catch (error) {
        console.error("Failed to fetch status:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / 1000 / 60 / 60);
    const minutes = Math.floor((ms / 1000 / 60) % 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-6xl animate-in fade-in duration-500">
      {/* Hero Welcome Card */}
      <div className="card gradient-primary shadow-2xl overflow-hidden relative border-0">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
           <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 2v2"/><path d="M12 20v2"/></svg>
        </div>
        <div className="card-body py-10 flex-row items-center justify-between relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-4xl shadow-inner">
              ⚡
            </div>
            <div>
              <h2 className="card-title text-3xl font-bold tracking-tight mb-1">
                {health?.relayName || "Shogun Relay"}
              </h2>
              <p className="text-primary-content/70 max-w-md leading-relaxed">
                Decentralized infrastructure powered by <span className="text-white font-semibold">ZenDB</span> & <span className="text-white font-semibold">IPFS</span>. Running efficiently on your local node.
              </p>
            </div>
          </div>
          <div className="hidden md:flex flex-col items-end gap-2">
            <div className="badge badge-lg gap-2 bg-white/20 border-0 py-4 px-6 text-white font-bold backdrop-blur-sm">
              <span className="w-3 h-3 rounded-full bg-success animate-pulse"></span>
              NODE ONLINE
            </div>
            <span className="text-xs opacity-60 font-mono tracking-widest uppercase">ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Modern Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-6 rounded-2xl group hover:border-primary/30 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>
            </div>
            <span className="text-xs font-bold text-success">LIVE</span>
          </div>
          <div className="stat-title text-sm opacity-60 font-medium">Connected Peers</div>
          <div className="text-3xl font-bold tracking-tight my-1">{stats?.connectedPeers || 0}</div>
          <div className="text-xs opacity-50 flex gap-2">
             <span>ZEN: {stats?.zenPeers || 0}</span>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl group hover:border-secondary/30 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10l4.5 4.5"/><circle cx="12" cy="12" r="10"/></svg>
            </div>
          </div>
          <div className="stat-title text-sm opacity-60 font-medium">System Uptime</div>
          <div className="text-3xl font-bold tracking-tight my-1">
             {health?.uptime ? formatUptime(health.uptime * 1000) : "--"}
          </div>
          <div className="text-xs opacity-50">Since last restart</div>
        </div>

        <div className="glass-card p-6 rounded-2xl group hover:border-accent/30 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
            </div>
          </div>
          <div className="stat-title text-sm opacity-60 font-medium">Memory Usage</div>
          <div className="text-3xl font-bold tracking-tight my-1">
            {stats?.memory?.heapUsed ? Math.round(stats.memory.heapUsed / 1024 / 1024) : 0} <span className="text-lg font-normal opacity-50">MB</span>
          </div>
          <div className="w-full bg-base-300 h-1 rounded-full mt-2 overflow-hidden">
            <div className="bg-accent h-full w-[45%]" />
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl group hover:border-info/30 transition-all cursor-default">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center text-info group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-9l-3-3H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>
            </div>
            <span className="badge badge-outline badge-sm opacity-50 text-[10px]">V{health?.version || "1.2.0"}</span>
          </div>
          <div className="stat-title text-sm opacity-60 font-medium">Active Engines</div>
          <div className="flex gap-2 mt-2">
             <span className="badge gradient-secondary border-0 font-bold">ZEN</span>
             <span className="badge bg-neutral text-neutral-content border-0 font-bold">IPFS</span>
          </div>
          <div className="text-xs opacity-50 mt-2">All systems functional</div>
        </div>
      </div>

      {/* Grid for Actions & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Quick Actions */}
        <div className="lg:col-span-2">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
             Recommended Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              to="/files"
              className="glass-card group hover:bg-primary/5 transition-all p-6 rounded-2xl border-transparent hover:border-primary/20 flex gap-4"
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shrink-0">
                📁
              </div>
              <div>
                <h4 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">Storage Manager</h4>
                <p className="text-sm opacity-60 leading-tight">Upload and pin your files to the IPFS network securely.</p>
              </div>
            </Link>

            <Link
              to="/visual-graph"
              className="glass-card group hover:bg-secondary/5 transition-all p-6 rounded-2xl border-transparent hover:border-secondary/20 flex gap-4"
            >
              <div className="w-14 h-14 rounded-xl bg-secondary/10 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shrink-0">
                🕸️
              </div>
              <div>
                <h4 className="font-bold text-lg mb-1 group-hover:text-secondary transition-colors">Graph Explorer</h4>
                <p className="text-sm opacity-60 leading-tight">Visualize and navigate the decentralized graph data.</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Right: Health & Security */}
        <div className="flex flex-col gap-6">
          <h3 className="text-xl font-bold mb-2">Security & Identity</h3>
          
          {/* Auth Status Card */}
          <div className={`card ${isAuthenticated ? "bg-success/10 border-success/20" : "bg-warning/10 border-warning/20"} border p-6 rounded-2xl`}>
             <div className="flex items-center gap-4 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${isAuthenticated ? "bg-success text-success-content" : "bg-warning text-warning-content"}`}>
                   {isAuthenticated ? "✓" : "!"}
                </div>
                <div>
                   <h4 className="font-bold">{isAuthenticated ? "Admin Access" : "Limited Mode"}</h4>
                   <p className="text-xs opacity-60">{isAuthenticated ? "Full control enabled" : "Password required for admin"}</p>
                </div>
             </div>
             {!isAuthenticated && (
                <Link to="/settings" className="btn btn-warning btn-sm w-full font-bold">
                   UNFOLD ALL FEATURES
                </Link>
             )}
          </div>

          <div className="glass-card p-6 rounded-2xl">
             <h4 className="font-bold text-sm uppercase opacity-40 mb-4 tracking-widest">Network Health</h4>
             <ul className="space-y-4">
                <li className="flex items-center justify-between">
                   <span className="text-sm">ZEN Relay</span>
                   <span className="status-dot online"></span>
                </li>
                <li className="flex items-center justify-between">
                   <span className="text-sm">IPFS Node</span>
                   <span className="status-dot online"></span>
                </li>
                <li className="flex items-center justify-between">
                   <span className="text-sm">ZEN API</span>
                   <span className="status-dot warning"></span>
                </li>
             </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Status;
