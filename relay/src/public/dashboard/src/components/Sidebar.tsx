import { NavLink } from "react-router-dom";
import logoSvg from "./logo.svg";

// SVG Icons for a professional look
const Icons = {
  status: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  ),
  stats: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  ),
  files: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5L4.5 5.5c-.3.3-.5.7-.5 1.1V20c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6.5L15.5 2z" />
      <path d="M15 2v5h5" />
    </svg>
  ),
  apiKeys: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
      <path d="m21 2-9.6 9.6" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </svg>
  ),
  charts: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
  visualGraph: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  graphExplorer: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  apiDocs: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M8 7h6" />
      <path d="M8 11h8" />
    </svg>
  ),
  settings: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

interface NavItem {
  path: string;
  icon: JSX.Element;
  label: string;
  group?: string;
}

const navItems: NavItem[] = [
  { path: "/", icon: Icons.status, label: "Status", group: "main" },
  { path: "/stats", icon: Icons.stats, label: "Live Stats", group: "main" },
  { path: "/files", icon: Icons.files, label: "Files", group: "storage" },
  { path: "/api-keys", icon: Icons.apiKeys, label: "API Keys", group: "tools" },
  { path: "/charts", icon: Icons.charts, label: "Charts", group: "tools" },
  { path: "/visual-graph", icon: Icons.visualGraph, label: "Visual Graph", group: "tools" },
  { path: "/graph-explorer", icon: Icons.graphExplorer, label: "Graph Explorer", group: "tools" },
  { path: "/api-docs", icon: Icons.apiDocs, label: "API Docs", group: "tools" },
  { path: "/settings", icon: Icons.settings, label: "Settings", group: "system" },
];

const groupLabels: Record<string, string> = {
  main: "DASHBOARD",
  storage: "STORAGE",
  tools: "TOOLS",
  system: "SYSTEM",
};

function Sidebar() {
  const groups = ["main", "storage", "tools", "system"];

  return (
    <div className="drawer-side z-40">
      <label htmlFor="main-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
      <aside className="bg-base-200 min-h-screen w-64 flex flex-col border-r border-base-300">
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 bg-base-300">
          <img src={logoSvg} alt="Delay" className="w-10 h-10 delay-logo" />
          <div>
            <span className="font-bold text-lg">Delay</span>
            <p className="text-xs text-base-content/60">Relay Dashboard v1.3.1</p>
          </div>
        </div>

        {/* Navigation */}
        <ul className="menu menu-sm flex-1 p-2 gap-1 overflow-y-auto">
          {groups.map((group) => (
            <li key={group} className="mt-4 first:mt-0">
              <h2 className="menu-title text-[10px] uppercase tracking-[0.15em] opacity-40 font-bold mb-1">
                {groupLabels[group]}
              </h2>
              <ul className="ml-0 gap-0.5">
                {navItems
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        className={({ isActive }: { isActive: boolean }) =>
                          `flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200 ${isActive ? "bg-primary text-primary-content font-semibold shadow-md translate-x-1" : "hover:bg-base-300 text-base-content/70 hover:text-base-content"}`
                        }
                        end={item.path === "/"}
                      >
                        <span className="w-5 h-5 flex items-center justify-center">
                          {item.icon}
                        </span>
                        <span className="text-sm">{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="p-4 border-t border-base-300 bg-base-300/30">
          <a
            href="https://github.com/scobru/delay"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm w-full gap-2 border-base-content/10 hover:border-primary hover:bg-primary/10 hover:text-primary transition-all"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-4.51-2-7-2" />
            </svg>
            <span className="text-xs font-semibold">Source Code</span>
          </a>
        </div>
      </aside>
    </div>
  );
}

export default Sidebar;
