import { useNavigate } from 'react-router-dom'

const colorBgMap: Record<string, string> = {
  primary: 'bg-primary/10',
  secondary: 'bg-secondary/10',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
}

function Explore() {
  const navigate = useNavigate()

  const sections = [
    { title: 'Graph Explorer', description: 'Inspect ZenDB nodes and traverse the graph.', path: '/graph-explorer', icon: '🔍', color: 'primary' },
    { title: 'Visual Graph', description: 'Interactive visualization of the node network.', path: '/visual-graph', icon: '🕸️', color: 'secondary' },
    { title: 'Network Stats', description: 'Live peers, relay performance, and resources.', path: '/stats', icon: '📊', color: 'success' },
    { title: 'IPFS Files', description: 'Manage pinned files and storage.', path: '/files', icon: '📁', color: 'warning' }
  ]

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h2 className="card-title text-2xl">🧭 Data Hub</h2>
          <p className="text-base-content/70">Central navigation for all Delay subsystems and data inspectors.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(section => (
          <div 
            key={section.path} 
            className="card bg-base-100 shadow-sm hover:shadow-md transition-all cursor-pointer hover:-translate-y-1"
            onClick={() => navigate(section.path)}
          >
            <div className="card-body flex-row items-center gap-4">
              <div className={`text-4xl p-3 rounded-xl ${colorBgMap[section.color] || 'bg-base-200'}`}>
                {section.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-bold">{section.title}</h3>
                <p className="text-sm text-base-content/60">{section.description}</p>
              </div>
              <div className="text-base-content/30">➡</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Explore

