import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface MetricPoint {
  ts: number;
  v: number;
}

function Charts() {
  const { isAuthenticated, getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, any>>({});
  
  // Local history for metrics not historically tracked by backend
  const [localHistory, setLocalHistory] = useState<any[]>([]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/system/stats.json", { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setStats(data);

        setLocalHistory((prev) => {
          const now = new Date().toLocaleTimeString();
          const newPoint = {
            time: now,
            memory: (data.memory?.heapUsed || 0) / 1024 / 1024,
            peers: data.connectedPeers || 0,
            totalMsgs: data.totalMessages || 0,
          };
          const newHistory = [...prev, newPoint];
          return newHistory.slice(-30);
        });
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isAuthenticated) {
      loadStats();
      const interval = setInterval(loadStats, 2000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, loadStats]);

  const formatBytes = (bytes: number) => {
    if (!bytes && bytes !== 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatUptime = (ms: number) => {
    if (!ms) return "-";
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  if (loading && localHistory.length === 0) {
    return (
      <div className="flex justify-center p-8">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  // Map backend history into chart-friendly formats
  const msgHistoryData = (stats.msgHistory || []).map((pt: any) => ({
    time: new Date(pt.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    Total: pt.v,
    Gun: pt.gun || 0,
    Zen: pt.zen || 0
  }));

  const byteHistoryData = (stats.byteHistory || []).map((pt: any) => ({
    time: new Date(pt.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    Total: pt.v,
    Gun: pt.gun || 0,
    Zen: pt.zen || 0
  }));

  const opMixData = [
    { name: 'PUT', value: stats.putCount || 0 },
    { name: 'GET', value: stats.getCount || 0 },
    { name: 'ACK', value: stats.ackCount || 0 },
    { name: 'ERR', value: stats.errorCount || 0 },
  ];
  const COLORS = ['#00ffe5', '#00b4ff', '#00ff8c', '#ff3a5c'];

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Header */}
      <div className="card bg-base-100 shadow">
        <div className="card-body flex-row items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="card-title text-2xl">📊 Live Telemetry Charts</h2>
            <p className="text-base-content/70">Real-time ZenDB protocol monitoring</p>
          </div>
          <div className="flex gap-2">
            <span className="badge badge-ghost">{new Date().toLocaleTimeString()}</span>
            <span className="badge badge-success">Status: Online</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats stats-vertical lg:stats-horizontal shadow w-full">
        <div className="stat">
          <div className="stat-title">Uptime</div>
          <div className="stat-value text-lg">{formatUptime(stats.uptime)}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Heap Used</div>
          <div className="stat-value text-lg">{formatBytes(stats.memory?.heapUsed)}</div>
        </div>
        <div className="stat">
          <div className="stat-title">CPU System</div>
          <div className="stat-value text-lg">
            {stats.cpu?.system ? (stats.cpu.system / 1000000).toFixed(2) + "s" : "-"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Total Messages</div>
          <div className="stat-value text-lg text-primary">{stats.totalMessages?.toLocaleString() || 0}</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Rate Chart */}
        <div className="card bg-base-100 shadow border border-primary/20">
          <div className="card-body">
            <h3 className="card-title text-lg text-primary">⚡ Message Rate (msg/s)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={msgHistoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                  <XAxis dataKey="time" stroke="#888" fontSize={10} tick={{fill: '#2a6070'}} />
                  <YAxis stroke="#888" fontSize={10} tick={{fill: '#2a6070'}} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#050f14", border: "1px solid #00ffe5", borderRadius: "4px" }}
                    itemStyle={{ color: "#7ecfdf" }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Area type="monotone" dataKey="Total" stroke="#00ffe5" fill="#00ffe5" fillOpacity={0.1} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Zen" stroke="#ff00e5" fill="#ff00e5" fillOpacity={0.4} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Bandwidth Chart */}
        <div className="card bg-base-100 shadow border border-secondary/20">
          <div className="card-body">
            <h3 className="card-title text-lg text-secondary">🌊 Bandwidth (bytes/s)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={byteHistoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                  <XAxis dataKey="time" stroke="#888" fontSize={10} tick={{fill: '#2a6070'}} />
                  <YAxis stroke="#888" fontSize={10} tick={{fill: '#2a6070'}} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#050f14", border: "1px solid #00b4ff", borderRadius: "4px" }}
                    itemStyle={{ color: "#7ecfdf" }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Area type="monotone" dataKey="Total" stroke="#00b4ff" fill="#00b4ff" fillOpacity={0.1} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Zen" stroke="#ff00e5" fill="#ff00e5" fillOpacity={0.4} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Peers Chart */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h3 className="card-title text-lg">👥 Connected Peers Trend</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={localHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" opacity={0.3} />
                  <XAxis dataKey="time" stroke="#888" fontSize={10} />
                  <YAxis allowDecimals={false} stroke="#888" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#050f14", border: "1px solid #00ff8c", borderRadius: "4px" }}
                    itemStyle={{ color: "#7ecfdf" }}
                  />
                  <Line type="stepAfter" dataKey="peers" stroke="#00ff8c" strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Operation Mix (Doughnut) */}
        <div className="card bg-base-100 shadow">
          <div className="card-body items-center">
            <h3 className="card-title text-lg w-full text-left">🔄 Operation Mix</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={opMixData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {opMixData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#050f14", border: "1px solid #333", borderRadius: "4px" }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}

export default Charts;
