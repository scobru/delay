import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { ZEN_PATHS } from "../utils/zen-paths";

interface NodeData {
  [key: string]: any;
}

function GraphExplorer() {
  const { isAuthenticated, getAuthHeaders } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>(ZEN_PATHS.SHOGUN);
  const [data, setData] = useState<NodeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [writing, setWriting] = useState(false);


  // New features
  const [newPeer, setNewPeer] = useState("");
  const [peerStatus, setPeerStatus] = useState("");

  useEffect(() => {
    fetchNodeData(currentPath);
  }, [currentPath]);

  const fetchNodeData = async (path: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/system/zen/node/${encodeURIComponent(path)}`, {
        headers: getAuthHeaders(),
      });

      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || "Failed to fetch node data");
        setData(null);
      }
    } catch (err: any) {
      setError(err.message || "Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (key: string) => {
    const nextPath = currentPath ? `${currentPath}/${key}` : key;
    setCurrentPath(nextPath);
  };

  const handleJumpToRoot = () => {
    setCurrentPath(ZEN_PATHS.SHOGUN);
  };

  const handleBack = () => {
    if (!currentPath || currentPath === ZEN_PATHS.SHOGUN) return;
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.join("/") || ZEN_PATHS.SHOGUN);
  };

  const handleWrite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey || !newValue) return;

    setWriting(true);
    try {
      const payload = {
        data: {
          [newKey]: parseValue(newValue),
        },
      };

      const response = await fetch(`/api/v1/system/zen/node/${encodeURIComponent(currentPath)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setNewKey("");
        setNewValue("");
        fetchNodeData(currentPath); // Refresh
      } else {
        alert("Error: " + result.error);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to write data");
    } finally {
      setWriting(false);
    }
  };

  const handleAddPeer = async () => {
    if (!newPeer) return;
    setPeerStatus("Adding peer...");
    try {
      await fetch("/api/v1/system/peers/add", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ peerUrl: newPeer }),
      }).catch((e) => console.warn("API add peer failed, might not be implemented"));

      setPeerStatus(`✅ Added peer request sent: ${newPeer}`);
      setNewPeer("");
    } catch (e) {
      setPeerStatus("❌ Failed to add peer");
    }
  };

  const handleSnapshot = () => {
    const element = document.createElement("a");
    const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    element.href = URL.createObjectURL(file);
    element.download = `delay-snapshot-${Date.now()}.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const parseValue = (val: string) => {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  const renderValue = (value: any, onNavigateToLink?: (path: string) => void) => {
    if (value === null) return <span className="opacity-50 italic">null</span>;
    if (typeof value === "object") {
      if (value && "#" in value) {
        return (
          <span
            className="text-primary cursor-pointer hover:underline"
            onClick={() => onNavigateToLink && onNavigateToLink(value["#"])}
          >
            Link to: {value["#"]}
          </span>
        );
      }
      return (
        <span className="font-mono text-xs" title={JSON.stringify(value, null, 2)}>
          {JSON.stringify(value).substring(0, 50) +
            (JSON.stringify(value).length > 50 ? "..." : "")}
        </span>
      );
    }
    return <span className="font-mono text-secondary">{String(value)}</span>;
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      {/* Header & Path */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="card-title text-2xl">🔍 Graph Explorer</h2>
              <p className="text-base-content/70">Inspect ZenDB nodes and properties</p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="badge badge-secondary gap-2 py-3 px-4 font-bold text-xs mr-2">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                ZEN ACTIVE
              </div>
              <button
                className="btn btn-neutral btn-sm"
                onClick={handleBack}
                disabled={currentPath === ZEN_PATHS.SHOGUN}
              >
                ⬅ Back
              </button>
              <button className="btn btn-neutral btn-sm" onClick={handleJumpToRoot}>
                🏠 Root
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-base-200 p-4 rounded-lg">
            <span className="font-bold">Path:</span>
            <form
              className="flex-1 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                fetchNodeData(currentPath);
              }}
            >
              <input
                type="text"
                className="input input-bordered input-sm flex-1 font-mono"
                value={currentPath}
                onChange={(e) => setCurrentPath(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Go
              </button>
            </form>
          </div>

          {/* Quick Paths */}
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <span className="text-xs font-bold opacity-60 uppercase tracking-wider">
              Quick Load:
            </span>
            <button
              className="btn btn-xs btn-outline"
              onClick={() => setCurrentPath(ZEN_PATHS.SHOGUN)}
            >
              Root
            </button>
            <button
              className="btn btn-xs btn-outline"
              onClick={() => setCurrentPath(ZEN_PATHS.RELAYS)}
            >
              Relays
            </button>
            <button
              className="btn btn-xs btn-outline"
              onClick={() => setCurrentPath(ZEN_PATHS.SHOGUN_WORMHOLE)}
            >
              Wormhole
            </button>
            <button
              className="btn btn-xs btn-outline"
              onClick={() => setCurrentPath(ZEN_PATHS.SHOGUN_INDEX)}
            >
              Index
            </button>
            <button
              className="btn btn-xs btn-outline"
              onClick={() => setCurrentPath(ZEN_PATHS.ANNAS_ARCHIVE)}
            >
              Anna's Archive
            </button>
          </div>
        </div>
      </div>

      {/* Controls Row */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body flex-row justify-between items-center flex-wrap gap-4">
          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="text"
              className="input input-bordered input-sm w-full max-w-xs"
              placeholder="Add Zen Peer (wss://...)"
              value={newPeer}
              onChange={(e) => setNewPeer(e.target.value)}
            />
            <button className="btn btn-sm btn-secondary" onClick={handleAddPeer}>
              Add Peer
            </button>
            {peerStatus && <span className="text-sm ml-2">{peerStatus}</span>}
          </div>
          <div>
            <button className="btn btn-sm btn-outline" onClick={handleSnapshot}>
              ⬇ Export Snapshot
            </button>
          </div>
        </div>
      </div>

      {/* Content Explorer */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          {loading ? (
            <div className="flex justify-center p-8">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          ) : error ? (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          ) : !data || Object.keys(data).length === 0 ? (
            <div className="text-center p-8 text-base-content/50">
              <p>This node is empty or not found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra table-sm">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                    <th className="w-20">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data)
                    .filter(([key]) => key !== "_")
                    .sort()
                    .map(([key, value]) => {
                      const isObject = typeof value === "object" && value !== null;
                      return (
                        <tr key={key}>
                          <td className="font-bold font-mono text-primary">{key}</td>
                          <td className="max-w-md truncate">
                            {renderValue(value, (path) => setCurrentPath(path))}
                          </td>
                          <td>
                            {isObject && !value["#"] && (
                              <button
                                className="btn btn-xs btn-ghost"
                                onClick={() => handleNavigate(key)}
                              >
                                Explore ➡
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Write Panel */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h3 className="card-title text-lg">✏ Write Operations</h3>
          <form onSubmit={handleWrite} className="flex flex-wrap gap-4 items-end mt-2">
            <div className="form-control flex-1 min-w-[200px]">
              <label className="label">
                <span className="label-text">Key</span>
              </label>
              <input
                type="text"
                placeholder="Key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="input input-bordered input-sm"
              />
            </div>
            <div className="form-control flex-[2] min-w-[300px]">
              <label className="label">
                <span className="label-text">Value (JSON or string)</span>
              </label>
              <input
                type="text"
                placeholder='Value ("string" or {"json": true})'
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="input input-bordered input-sm font-mono"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-sm mb-1"
              disabled={writing || !isAuthenticated}
            >
              {writing ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                "Update Node"
              )}
            </button>
          </form>
          {!isAuthenticated && (
            <div className="alert alert-warning mt-4 py-2">
              <span className="text-sm">Authentication required to write.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GraphExplorer;
