import { useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

const pageTitles: Record<string, { title: string; description: string }> = {
  "/": { title: "Relay Status", description: "Global network health and node metrics" },
  "/stats": { title: "Live Metrics", description: "Real-time performance monitoring" },
  "/files": { title: "Storage Manager", description: "IPFS pin management and cloud uploads" },
  "/explore": { title: "Data Explorer", description: "Deep dive into ZenDB graph structures" },
  "/network": { title: "Peer Network", description: "P2P connection statistics and topology" },
  "/settings": { title: "Configuration", description: "Security keys and system preferences" },
  "/api-keys": { title: "Access Tokens", description: "Manage your API authentication keys" },
  "/charts": { title: "Analytics", description: "Historical data and usage trends" },
  "/visual-graph": { title: "Network Graph", description: "Interactive 3D graph visualization" },
  "/graph-explorer": { title: "Graph Navigator", description: "Explore nodes and relations" },
  "/api-docs": { title: "API Reference", description: "Documentation for Shogun Relay API" },
};

function Header() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, logout } = useAuth();

  const pageInfo = pageTitles[location.pathname] || { title: "Dashboard", description: "Shogun Infrastructure" };

  return (
    <header className="navbar bg-base-100/80 backdrop-blur-lg border-b border-base-300 px-6 h-20 sticky top-0 z-30 transition-all duration-300">
      {/* Mobile menu button */}
      <div className="flex-none lg:hidden">
        <label htmlFor="main-drawer" aria-label="Open sidebar" className="btn btn-square btn-ghost">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            className="inline-block w-6 h-6 stroke-current"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16"
            ></path>
          </svg>
        </label>
      </div>

      {/* Page title with animation */}
      <div className="flex-1 px-2 animate-in slide-in-from-left-4 duration-300">
        <div>
          <h1 className="text-xl font-black tracking-tight text-base-content">{pageInfo.title}</h1>
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary/60 opacity-80">{pageInfo.description}</p>
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex-none flex items-center gap-4">
        {/* Search placeholder - modern look */}
        <div className="hidden sm:flex items-center bg-base-200/50 border border-base-300 rounded-full px-4 py-1.5 gap-3 hover:bg-base-200 transition-colors cursor-pointer group">
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40 group-hover:opacity-100 transition-opacity"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
           <span className="text-xs opacity-40 font-semibold tracking-wide">Quick search...</span>
           <span className="kbd kbd-xs bg-base-100 border-base-300 opacity-30">⌘K</span>
        </div>

        <div className="divider divider-horizontal mx-1 opacity-20 hidden md:flex"></div>

        {/* Theme toggle refined */}
        <button 
           onClick={toggleTheme}
           className="btn btn-ghost btn-circle hover:bg-primary/10 hover:text-primary transition-all duration-300"
           aria-label="Toggle theme"
        >
          {theme === "dark" ? (
             <svg className="fill-current w-5 h-5 animate-in zoom-in spin-in-90 duration-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/></svg>
          ) : (
             <svg className="fill-current w-5 h-5 animate-in zoom-in spin-in-90 duration-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"/></svg>
          )}
        </button>

        {/* Auth button with tooltips */}
        {isAuthenticated ? (
          <button
            className="btn btn-ghost btn-circle hover:bg-error/10 hover:text-error transition-all"
            onClick={logout}
            title="Secure Logout"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        ) : (
          <div className="badge badge-warning py-3 px-4 gap-2 font-bold text-[10px] uppercase tracking-tighter shadow-sm border-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Guest Mode
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
