import { useState, useEffect, useRef } from "react";
import Graph from "../components/Graph";
import { useAuth } from "../context/AuthContext";

interface GraphNode {
  id: string;
  label: string;
  group?: string;
  title?: string;
  value?: number;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  arrows?: string;
}

function VisualGraph() {
  const { isAuthenticated, getAuthHeaders } = useAuth();
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState<string>("");
  const [peerUrl, setPeerUrl] = useState("");

  const [nodeCount, setNodeCount] = useState(0);

  // Graph options
  const options = {
    layout: {
      hierarchical: false,
    },
    edges: {
      color: "#000000",
      smooth: {
        type: "continuous",
      },
    },
    nodes: {
      shape: "dot",
      size: 10,
      font: {
        size: 12,
        color: "#333333",
      },
      borderWidth: 2,
    },
    physics: {
      stabilization: false,
      barnesHut: {
        gravitationalConstant: -8000,
        springConstant: 0.04,
        springLength: 95,
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
    },
    height: "600px",
  };

  const exploreData = async (nodePath: string) => {
    if (!nodePath) return;
    setLoading(true);

    try {
      // Use the generic node endpoint
      const response = await fetch(`/api/v1/system/zen/node/${encodeURIComponent(nodePath)}`, {
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (data.success && data.data) {
        processGraphData(nodePath, data.data);
      }
    } catch (error) {
      console.error("Failed to fetch graph data:", error);
    } finally {
      setLoading(false);
    }
  };

  const processGraphData = (rootPath: string, data: any) => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const processedNodes = new Set<string>();

    // Add root node
    nodes.push({
      id: rootPath,
      label: rootPath,
      group: "root",
      value: 20,
      title: `Path: ${rootPath}`,
    });
    processedNodes.add(rootPath);

    // Process children
    if (typeof data === "object" && data !== null) {
      Object.entries(data).forEach(([key, value]) => {
        // Skip metadata
        if (key === "_") return;

        const nodeId = `${rootPath}/${key}`;
        const isObject = typeof value === "object" && value !== null;

        // Add node
        if (!processedNodes.has(nodeId)) {
          nodes.push({
            id: nodeId,
            label: key,
            group: isObject ? "object" : "value",
            value: isObject ? 15 : 10,
            title: `Value: ${isObject ? JSON.stringify(value).substring(0, 50) + "..." : String(value)}`,
          });
          processedNodes.add(nodeId);
        }

        // Add edge
        edges.push({
          from: rootPath,
          to: nodeId,
          arrows: "to",
        });
      });
    }

    setGraphData({ nodes, edges });
    setNodeCount(nodes.length);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    exploreData(path);
  };

  const handleAddPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peerUrl) return;

    try {
      const response = await fetch("/api/v1/system/peers/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ peer: peerUrl }),
      });

      if (response.ok) {
        alert("Peer added successfully");
        setPeerUrl("");
      }
    } catch (error) {
      console.error("Failed to add peer:", error);
    }
  };

  // No auto-load of presets on mount

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h2 className="card-title text-2xl">🕸️ Visual Graph Explorer</h2>
              <p className="text-base-content/70">
                Visualize and explore ZenDB nodes interactively
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="badge badge-secondary gap-2 py-3 px-4 font-bold text-xs">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                ZEN ACTIVE
              </div>
              <div className="flex gap-2">
                <span className="badge badge-lg">Nodes: {nodeCount}</span>
                <span className="badge badge-lg badge-outline">Path: {path}</span>
              </div>
            </div>
          </div>

          <div className="divider my-2"></div>

          <div className="flex flex-wrap gap-4 justify-between items-end">
            <form onSubmit={handleSearch} className="join w-full max-w-md">
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="Enter ZenDB path (e.g. delay/relays)"
                className="input input-bordered join-item w-full"
              />
              <button type="submit" className="btn btn-primary join-item" disabled={loading}>
                {loading ? <span className="loading loading-spinner loading-xs"></span> : "Explore"}
              </button>
            </form>

            <form onSubmit={handleAddPeer} className="join">
              <input
                type="text"
                value={peerUrl}
                onChange={(e) => setPeerUrl(e.target.value)}
                placeholder="Add Peer URL"
                className="input input-bordered join-item"
              />
              <button type="submit" className="btn btn-secondary join-item">
                ➕ Add
              </button>
            </form>
          </div>

          {/* No Quick Paths preset */}
        </div>
      </div>

      <div className="card bg-base-100 shadow h-[650px]">
        <div className="card-body p-0 overflow-hidden rounded-xl">
          {nodeCount === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-base-content/50 gap-2">
              <span className="text-4xl">🕸️</span>
              <p className="font-medium text-lg">Enter a ZenDB node path above to visualize the graph</p>
              <p className="text-sm opacity-75">For example: shogun, shogun/network/relays, or any custom path.</p>
            </div>
          ) : (
            <Graph
              graph={graphData}
              options={options}
              events={{
                select: (event: any) => {
                  const { nodes } = event;
                  if (nodes.length > 0) {
                    const nodeId = nodes[0];
                    // If clicking a child node that is effectively a path, explore it
                    if (nodeId.includes("/") && nodeId !== path) {
                      setPath(nodeId);
                      exploreData(nodeId);
                    }
                  }
                },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default VisualGraph;
