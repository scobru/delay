import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

interface PeerStats {
  id: string
  addr: string
  engine: "gun" | "zen"
  connectedAt: number
  msgCount: number
  bytesSent: number
  uptime: number
}

interface SystemStats {
  version?: string
  uptime?: number
  timestamp?: number
  memory?: { heapUsed: number; heapTotal: number; external: number; rss: number }
  cpu?: { user: number; system: number }
  peers?: PeerStats[] | any
  connectedPeers?: number
  gunPeers?: number
  zenPeers?: number
  peakPeers?: number
  totalMessages?: number
  totalBytes?: number
  putCount?: number
  getCount?: number
  ackCount?: number
  errorCount?: number
  dam?: { in?: { rate: number }, out?: { rate: number } }
}

interface RelayInfo {
  host: string
  endpoint: string | null
  lastSeen: number
  uptime: number
  connections: { active: number }
  ipfs?: { repoSize: number; numPins: number }
}

function LiveStats() {
  const { isAuthenticated, getAuthHeaders } = useAuth()
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [relays, setRelays] = useState<RelayInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [newPeerUrl, setNewPeerUrl] = useState('')
  const [addingPeer, setAddingPeer] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/v1/system/stats.json')
        const data = await response.json()
        setStats(data)
        setLastUpdated(new Date())

        if (isAuthenticated) {
          try {
            // Use /api/v1/system/peers - same endpoint as legacy stats.html
            const peersRes = await fetch('/api/v1/system/peers', { headers: getAuthHeaders() })
            const peersData = await peersRes.json()
            if (peersData.success && peersData.peers && peersData.peers.length > 0) {
              const peerRelays: RelayInfo[] = peersData.peers.map((peer: string) => ({
                host: peer,
                endpoint: peer,
                lastSeen: Date.now(),
                uptime: 0,
                connections: { active: 0 },
                ipfs: undefined
              }))
              setRelays(peerRelays)
            }
            
            // Also try to get discovered relays from network
            try {
              const relaysRes = await fetch('/api/v1/network/relays', { headers: getAuthHeaders() })
              const relaysData = await relaysRes.json()
              if (relaysData.success && relaysData.relays && relaysData.relays.length > 0) {
                setRelays((prev: RelayInfo[]) => {
                  const existingHosts = new Set(prev.map((r: RelayInfo) => r.host))
                  const newRelays = relaysData.relays.filter((r: RelayInfo) => !existingHosts.has(r.host))
                  return [...prev, ...newRelays]
                })
              }
            } catch { /* ignore network relay discovery errors */ }
          } catch (error) { console.error('Failed to fetch peers:', error) }
        }
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 1000)
    return () => clearInterval(interval)
  }, [isAuthenticated, getAuthHeaders])

  const handleAddPeer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPeerUrl) return
    setAddingPeer(true)
    try {
      const res = await fetch('/api/v1/system/peers/add', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer: newPeerUrl })
      })
      if (res.ok) { alert('Peer added!'); setNewPeerUrl('') }
      else alert('Failed to add peer')
    } catch { alert('Network error') }
    finally { setAddingPeer(false) }
  }

  const formatBytes = (bytes: number) => {
    if (!bytes && bytes !== 0) return '--'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(2) + ' MB'
  }
  
  const formatUptime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4">
         <span className="loading loading-spinner loading-lg text-secondary"></span>
         <span className="text-[10px] font-black tracking-widest opacity-30 uppercase">Syncing Real-time Telemetry</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 max-w-6xl animate-in fade-in duration-500">
      {/* Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-2">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
            </div>
            <div>
               <h2 className="text-2xl font-black tracking-tight leading-none mb-1">Live Telemetry</h2>
               <p className="text-[10px] font-black opacity-30 uppercase tracking-[0.2em]">P2P Network Performance & System Health</p>
            </div>
         </div>
         {lastUpdated && (
           <div className="badge bg-base-300/50 border-0 py-3 px-4 gap-2 font-mono text-[10px] opacity-60">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              SYNCED: {lastUpdated.toLocaleTimeString()}
           </div>
         )}
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-6 rounded-2xl relative overflow-hidden group">
          <div className="stat-title text-[10px] font-black opacity-30 uppercase tracking-[0.15em] mb-1">Active Peers</div>
          <div className="text-4xl font-black tracking-tighter text-primary">{stats?.connectedPeers || 0}</div>
          <div className="text-[10px] font-bold opacity-40 mt-2 uppercase tracking-wide">
             ZEN: <span className="text-secondary">{stats?.zenPeers || 0}</span>
          </div>
          <div className="absolute -right-2 -bottom-2 opacity-5 scale-150 rotate-12 group-hover:rotate-0 transition-transform duration-500">
             <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl relative overflow-hidden group border-secondary/10">
          <div className="stat-title text-[10px] font-black opacity-30 uppercase tracking-[0.15em] mb-1">Message Rate</div>
          <div className="text-4xl font-black tracking-tighter text-secondary">{stats?.dam?.in?.rate || 0}</div>
          <div className="text-[10px] font-bold opacity-40 mt-2 uppercase tracking-wide">Messages per second</div>
          <div className="absolute -right-2 -bottom-2 opacity-5 scale-150 group-hover:scale-[1.7] transition-transform duration-500">
             <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 11-8-8-8 8"/><path d="m19 21-8-8-8 8"/></svg>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl relative overflow-hidden group border-accent/10">
          <div className="stat-title text-[10px] font-black opacity-30 uppercase tracking-[0.15em] mb-1">Ingested Data</div>
          <div className="text-4xl font-black tracking-tighter text-accent">{formatBytes(stats?.totalBytes || 0)}</div>
          <div className="text-[10px] font-bold opacity-40 mt-2 uppercase tracking-wide">Across all sessions</div>
          <div className="absolute -right-2 -bottom-2 opacity-5 scale-150 group-hover:translate-x-2 transition-transform duration-500">
             <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl relative overflow-hidden group border-info/10">
          <div className="stat-title text-[10px] font-black opacity-30 uppercase tracking-[0.15em] mb-1">Relay Uptime</div>
          <div className="text-2xl font-black tracking-tight text-info mt-2">{stats?.uptime ? formatUptime(stats.uptime) : '--'}</div>
          <div className="text-[10px] font-bold opacity-40 mt-3 uppercase tracking-wide">Continuous uptime</div>
          <div className="absolute -right-2 -bottom-2 opacity-5 scale-150 group-hover:rotate-45 transition-transform duration-500">
             <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
        </div>
      </div>

      {/* Protocol Operations & Memory */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Operations Chart/Stats */}
         <div className="lg:col-span-2 glass-card rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-base-content/5 flex items-center justify-between">
               <h3 className="font-black text-xs uppercase tracking-widest opacity-50">Protocol Operations</h3>
               <div className="badge badge-outline border-base-content/10 font-mono text-[10px] tracking-tight">V{stats?.version || "1.2.0"}</div>
            </div>
            <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-8">
               <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">PUT OPS</span>
                  <span className="text-2xl font-black tracking-tight">{stats?.putCount?.toLocaleString() || 0}</span>
                  <div className="w-full bg-base-300 h-1 rounded-full mt-2 overflow-hidden">
                     <div className="bg-primary h-full w-[65%]" />
                  </div>
               </div>
               <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">GET OPS</span>
                  <span className="text-2xl font-black tracking-tight">{stats?.getCount?.toLocaleString() || 0}</span>
                  <div className="w-full bg-base-300 h-1 rounded-full mt-2 overflow-hidden">
                     <div className="bg-secondary h-full w-[40%]" />
                  </div>
               </div>
               <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">ACK RATE</span>
                  <span className="text-2xl font-black tracking-tight">{stats?.ackCount?.toLocaleString() || 0}</span>
                  <div className="w-full bg-base-300 h-1 rounded-full mt-2 overflow-hidden">
                     <div className="bg-success h-full w-[85%]" />
                  </div>
               </div>
               <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">ERRORS</span>
                  <span className={`text-2xl font-black tracking-tight ${stats?.errorCount && stats.errorCount > 0 ? 'text-error' : ''}`}>{stats?.errorCount?.toLocaleString() || 0}</span>
                  <div className="w-full bg-base-300 h-1 rounded-full mt-2 overflow-hidden">
                     <div className={`h-full w-[5%] ${stats?.errorCount && stats.errorCount > 0 ? 'bg-error' : 'bg-base-content/10'}`} />
                  </div>
               </div>
            </div>
         </div>

         {/* Memory Usage */}
         <div className="glass-card rounded-3xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-base-content/5">
               <h3 className="font-black text-xs uppercase tracking-widest opacity-50">Memory Footprint</h3>
            </div>
            <div className="p-8 flex-1 flex flex-col justify-center">
               <div className="flex items-end justify-between mb-4">
                  <div className="text-4xl font-black tracking-tighter">
                     {stats?.memory?.heapUsed ? Math.round(stats.memory.heapUsed / 1024 / 1024) : 0}
                     <span className="text-sm font-bold opacity-30 ml-2">MB</span>
                  </div>
                  <div className="text-[10px] font-black opacity-30 uppercase tracking-widest mb-1">HEAP USED</div>
               </div>
               <div className="w-full h-8 bg-base-300 rounded-xl overflow-hidden p-1 shadow-inner flex">
                  <div className="bg-primary h-full rounded-lg shadow-lg animate-pulse-slow" style={{ width: stats?.memory?.heapUsed && stats?.memory?.heapTotal ? `${(stats.memory.heapUsed / stats.memory.heapTotal) * 100}%` : '40%' }} />
               </div>
               <div className="flex justify-between mt-4 text-[10px] font-bold opacity-30 uppercase tracking-widest">
                  <span>RSS: {stats?.memory?.rss ? Math.round(stats.memory.rss / 1024 / 1024) : 0}MB</span>
                  <span>TOTAL: {stats?.memory?.heapTotal ? Math.round(stats.memory.heapTotal / 1024 / 1024) : 0}MB</span>
               </div>
            </div>
         </div>
      </div>

      {/* Peer Wire Stats Table */}
      {isAuthenticated && stats?.peers && Array.isArray(stats.peers) && (
         <div className="glass-card rounded-3xl overflow-hidden border-0">
           <div className="p-8 bg-base-200/50 border-b border-base-content/5 flex items-center justify-between">
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-sm font-bold shadow-sm">P</div>
                <h3 className="font-black text-lg tracking-tight">Active Wire Peers</h3>
             </div>
             <div className="badge bg-primary text-primary-content border-0 font-black px-4">{stats.peers.length} NODES</div>
           </div>
           <div className="overflow-x-auto">
             <table className="table table-md w-full border-collapse">
               <thead>
                 <tr className="bg-base-300/30 text-[10px] font-black uppercase tracking-widest opacity-40">
                   <th className="px-8 py-4">Node Identity</th>
                   <th className="py-4">Engine</th>
                   <th className="py-4">Status</th>
                   <th className="py-4 text-right">Messages</th>
                   <th className="py-4 text-right">Traffic</th>
                   <th className="px-8 py-4 text-right">Uptime</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-base-content/5">
                 {stats.peers.length === 0 && (
                   <tr><td colSpan={6} className="text-center py-20 text-xs font-black opacity-20 uppercase tracking-widest">No active wire connections.</td></tr>
                 )}
                 {stats.peers.map((p: PeerStats, i: number) => (
                   <tr key={i} className="hover:bg-primary/5 transition-colors group">
                     <td className="px-8 py-4">
                        <div className="flex flex-col">
                           <span className="font-mono text-xs font-bold truncate max-w-xs group-hover:text-primary transition-colors">{p.addr || p.id}</span>
                           <span className="text-[10px] opacity-30 font-black uppercase tracking-tighter">Verified Node</span>
                        </div>
                     </td>
                     <td className="py-4">
                        <span className="badge badge-sm border-0 font-black px-3 bg-secondary/10 text-secondary">
                          ZEN
                        </span>
                      </td>
                     <td className="py-4">
                        <div className="flex items-center gap-2">
                           <span className="w-2 h-2 rounded-full bg-success"></span>
                           <span className="text-[10px] font-black opacity-60">STABLE</span>
                        </div>
                     </td>
                     <td className="py-4 text-right font-mono text-xs font-bold">{(p.msgCount || 0).toLocaleString()}</td>
                     <td className="py-4 text-right font-mono text-xs font-bold text-primary">{formatBytes(p.bytesSent || 0)}</td>
                     <td className="px-8 py-4 text-right font-mono text-xs font-bold opacity-60">{formatUptime(p.uptime || 0)}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         </div>
      )}

      {/* Network Relays Configuration */}
      {isAuthenticated && (
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="p-8 border-b border-base-content/5 flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-lg bg-secondary/20 flex items-center justify-center text-secondary text-sm font-bold shadow-sm">N</div>
               <h3 className="font-black text-lg tracking-tight">Discovered Network Relays</h3>
            </div>
            <form onSubmit={handleAddPeer} className="flex gap-2">
              <input 
                type="text" 
                className="input input-bordered bg-base-100/50 border-base-content/10 w-full md:w-80 rounded-2xl text-sm"
                placeholder="Relay Entrypoint (http://...)" 
                value={newPeerUrl}
                onChange={e => setNewPeerUrl(e.target.value)}
              />
              <button className="btn gradient-secondary border-0 rounded-2xl px-6 font-black tracking-widest text-xs" disabled={addingPeer}>
                {addingPeer ? <span className="loading loading-spinner loading-xs"></span> : 'CONNECT'}
              </button>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="table table-md w-full border-collapse">
              <thead>
                <tr className="bg-base-300/30 text-[10px] font-black uppercase tracking-widest opacity-40">
                  <th className="px-8 py-4">Relay Host / Public Key</th>
                  <th className="py-4">Endpoint Path</th>
                  <th className="px-8 py-4 text-right">Synchronization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-content/5">
                {relays.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-20 text-xs font-black opacity-20 uppercase tracking-widest">No network relays discovered.</td></tr>
                )}
                {relays.map((relay: RelayInfo, i: number) => (
                  <tr key={i} className="hover:bg-secondary/5 transition-colors group">
                    <td className="px-8 py-4">
                       <span className="font-mono text-xs font-bold opacity-60 group-hover:opacity-100 transition-opacity truncate block max-w-md">{relay.host}</span>
                    </td>
                    <td className="py-4">
                       <span className="text-xs font-bold opacity-40">{relay.endpoint || '/zen'}</span>
                    </td>
                    <td className="px-8 py-4 text-right">
                       <span className="text-[10px] font-black px-2 py-1 rounded bg-base-300 opacity-60 uppercase tracking-widest">
                          {new Date(relay.lastSeen).toLocaleTimeString()}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default LiveStats
