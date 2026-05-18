import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

interface StorageStats {
  total: { formatted: string; mb: number; gb: number };
  data: { formatted: string; files: number };
  radata: { formatted: string; files: number; description: string };
  breakdown: {
    ipfs: { formatted: string; files: number };
    gundb: { formatted: string; files: number };
    zen: { formatted: string; files: number };
  };
}



interface ConfigItem {
  key: string;
  value: string | undefined;
  source: "runtime" | "env" | "default";
  hotReloadable: boolean;
  category: string;
}

type ConfigData = Record<string, ConfigItem[]>;

function Settings() {
  const { isAuthenticated, login, logout, getAuthHeaders } = useAuth();
  const { theme, setTheme } = useTheme();
  const [newPassword, setNewPassword] = useState("");



  // Storage Stats State
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);

  // Configuration State
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configTab, setConfigTab] = useState<"hot" | "advanced">("hot");
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);



  const fetchStorageStats = useCallback(async () => {
    setLoadingStorage(true);
    try {
      const res = await fetch("/api/v1/admin/storage-stats", { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) setStorageStats(data.storage);
    } catch (e) {
      console.error("Failed to fetch storage stats:", e);
    } finally {
      setLoadingStorage(false);
    }
  }, [getAuthHeaders]);

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch("/api/v1/admin/config", { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) setConfig(data.config);
    } catch (e) {
      console.error("Failed to fetch config:", e);
    } finally {
      setLoadingConfig(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStorageStats();
      fetchConfig();
    }
  }, [isAuthenticated, fetchStorageStats, fetchConfig]);

  const copyToClipboard = async (text: string, keyName: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };



  const handleLogin = () => {
    if (newPassword.trim()) {
      login(newPassword.trim());
      setNewPassword("");
    }
  };

  const handleConfigChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  };

  const saveHotReloadConfig = async () => {
    if (Object.keys(editedValues).length === 0) return;

    setSavingConfig(true);
    setConfigMessage(null);
    try {
      const res = await fetch("/api/v1/admin/config", {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(editedValues),
      });
      const data = await res.json();
      if (data.success) {
        setConfigMessage({ type: "success", text: `✅ ${data.message}` });
        setEditedValues({});
        fetchConfig();
      } else {
        setConfigMessage({ type: "error", text: `❌ ${data.error || "Failed to save"}` });
      }
    } catch (e) {
      setConfigMessage({ type: "error", text: "❌ Failed to save configuration" });
    } finally {
      setSavingConfig(false);
    }
  };

  const saveEnvConfig = async () => {
    if (Object.keys(editedValues).length === 0) return;

    setSavingConfig(true);
    setConfigMessage(null);
    try {
      const res = await fetch("/api/v1/admin/config/env", {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(editedValues),
      });
      const data = await res.json();
      if (data.success) {
        const msg = data.restartRequired
          ? `⚠️ .env updated. Restart required for: ${data.restartRequiredKeys.join(", ")}`
          : "✅ .env file updated";
        setConfigMessage({ type: data.restartRequired ? "warning" : "success", text: msg });
        setEditedValues({});
        fetchConfig();
      } else {
        setConfigMessage({ type: "error", text: `❌ ${data.error || "Failed to save"}` });
      }
    } catch (e) {
      setConfigMessage({ type: "error", text: "❌ Failed to save .env file" });
    } finally {
      setSavingConfig(false);
    }
  };

  const getHotReloadableCategories = () => {
    if (!config) return {};
    const filtered: ConfigData = {};
    for (const [cat, items] of Object.entries(config)) {
      const hotItems = items.filter((i) => i.hotReloadable);
      if (hotItems.length > 0) filtered[cat] = hotItems;
    }
    return filtered;
  };

  const getAdvancedCategories = () => {
    if (!config) return {};
    const filtered: ConfigData = {};
    for (const [cat, items] of Object.entries(config)) {
      const advItems = items.filter((i) => !i.hotReloadable);
      if (advItems.length > 0) filtered[cat] = advItems;
    }
    return filtered;
  };

  const renderConfigSection = (categories: ConfigData, isAdvanced: boolean) => (
    <div className="flex flex-col gap-4">
      {Object.entries(categories).map(([category, items]) => (
        <div key={category} className="collapse collapse-arrow bg-base-200">
          <input type="checkbox" />
          <div className="collapse-title font-medium">
            {category} <span className="badge badge-sm ml-2">{items.length}</span>
          </div>
          <div className="collapse-content">
            <div className="flex flex-col gap-2 pt-2">
              {items.map((item) => (
                <div key={item.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-base-content/70">{item.key}</span>
                    {item.source === "runtime" && (
                      <span className="badge badge-xs badge-info">runtime</span>
                    )}
                    {isAdvanced && (
                      <span className="badge badge-xs badge-warning">restart required</span>
                    )}
                  </div>
                  <input
                    type={
                      item.key.includes("PASSWORD") ||
                      item.key.includes("KEY") ||
                      item.key.includes("TOKEN")
                        ? "password"
                        : "text"
                    }
                    className="input input-sm input-bordered w-full font-mono text-xs"
                    value={editedValues[item.key] ?? (item.value || "")}
                    onChange={(e) => handleConfigChange(item.key, e.target.value)}
                    placeholder={item.value === undefined ? "(not set)" : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Authentication */}
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h3 className="card-title">🔐 Authentication</h3>
          {isAuthenticated ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="badge badge-success gap-2">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                  Authenticated
                </div>
              </div>
              <p className="text-base-content/70">
                You have full access to all dashboard features.
              </p>
              <button className="btn btn-outline btn-error w-fit" onClick={logout}>
                🔓 Logout
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-base-content/70">Enter admin password to unlock all features:</p>
              <div className="join w-full">
                <input
                  type="password"
                  className="input input-bordered join-item flex-1"
                  placeholder="Admin password"
                  aria-label="Admin password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleLogin()}
                />
                <button className="btn btn-primary join-item" onClick={handleLogin}>
                  🔑 Authenticate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Configuration (Only when authenticated) */}
      {isAuthenticated && (
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h3 className="card-title">⚙️ Configuration</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={fetchConfig}
                disabled={loadingConfig}
              >
                {loadingConfig ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  "🔄"
                )}
              </button>
            </div>

            {/* Tabs */}
            <div role="tablist" className="tabs tabs-boxed">
              <button
                className={`tab ${configTab === "hot" ? "tab-active" : ""}`}
                onClick={() => {
                  setConfigTab("hot");
                  setEditedValues({});
                }}
              >
                🟢 Hot-Reload
              </button>
              <button
                className={`tab ${configTab === "advanced" ? "tab-active" : ""}`}
                onClick={() => {
                  setConfigTab("advanced");
                  setEditedValues({});
                }}
              >
                🔴 Advanced (.env)
              </button>
            </div>

            {/* Message */}
            {configMessage && (
              <div
                className={`alert ${configMessage.type === "success" ? "alert-success" : configMessage.type === "warning" ? "alert-warning" : "alert-error"}`}
              >
                <span>{configMessage.text}</span>
              </div>
            )}

            {loadingConfig ? (
              <div className="flex justify-center p-4">
                <span className="loading loading-spinner"></span>
              </div>
            ) : config ? (
              <div className="mt-2">
                {configTab === "hot" ? (
                  <>
                    <p className="text-sm text-base-content/60 mb-3">
                      These values can be changed without restarting the server.
                    </p>
                    {renderConfigSection(getHotReloadableCategories(), false)}
                    {Object.keys(editedValues).length > 0 && (
                      <button
                        className="btn btn-primary btn-sm mt-4"
                        onClick={saveHotReloadConfig}
                        disabled={savingConfig}
                      >
                        {savingConfig ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          "💾 Apply Changes"
                        )}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="alert alert-warning mb-3">
                      <span>⚠️ Changes here require server restart to take effect.</span>
                    </div>
                    {renderConfigSection(getAdvancedCategories(), true)}
                    {Object.keys(editedValues).length > 0 && (
                      <button
                        className="btn btn-warning btn-sm mt-4"
                        onClick={saveEnvConfig}
                        disabled={savingConfig}
                      >
                        {savingConfig ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          "💾 Save to .env (Restart Required)"
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-base-content/50 text-sm">Failed to load configuration</p>
            )}
          </div>
        </div>
      )}



      {/* Storage Overview (Only when authenticated) */}
      {isAuthenticated && (
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h3 className="card-title">💾 Storage Overview</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={fetchStorageStats}
                disabled={loadingStorage}
              >
                {loadingStorage ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  "🔄"
                )}
              </button>
            </div>

            {loadingStorage ? (
              <div className="flex justify-center p-4">
                <span className="loading loading-spinner"></span>
              </div>
            ) : storageStats ? (
              <div className="flex flex-col gap-4 mt-2">
                {/* Total Storage */}
                <div className="stats shadow bg-base-200">
                  <div className="stat">
                    <div className="stat-title">Total Storage Used</div>
                    <div className="stat-value text-primary">{storageStats.total.formatted}</div>
                    <div className="stat-desc">
                      {storageStats.total.mb.toFixed(0)} MB across all volumes
                    </div>
                  </div>
                </div>

                {/* Breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-base-200 p-3 rounded-lg">
                    <div className="text-sm font-medium">📁 Data</div>
                    <div className="text-lg font-bold">{storageStats.data.formatted}</div>
                    <div className="text-xs text-base-content/60">
                      {storageStats.data.files} files
                    </div>
                  </div>
                  <div className="bg-base-200 p-3 rounded-lg">
                    <div className="text-sm font-medium">📌 IPFS</div>
                    <div className="text-lg font-bold">{storageStats.breakdown.ipfs.formatted}</div>
                    <div className="text-xs text-base-content/60">
                      {storageStats.breakdown.ipfs.files} files
                    </div>
                  </div>
                  <div className="bg-base-200 p-3 rounded-lg">
                    <div className="text-sm font-medium">🌊 ZEN (database)</div>
                    <div className="text-lg font-bold">
                      {storageStats.breakdown.gundb.formatted}
                    </div>
                    <div className="text-xs text-base-content/60">
                      {storageStats.breakdown.gundb.files} records/files
                    </div>
                  </div>
                  <div className="bg-base-200 p-3 rounded-lg">
                    <div className="text-sm font-medium">🌊 ZEN (radata)</div>
                    <div className="text-lg font-bold">
                      {storageStats.breakdown.zen.formatted}
                    </div>
                    <div className="text-xs text-base-content/60">
                      {storageStats.breakdown.zen.files} files
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-base-content/50 text-sm">Failed to load storage stats</p>
            )}
          </div>
        </div>
      )}

      {/* Theme */}
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h3 className="card-title">🎨 Appearance</h3>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Theme</span>
            </label>
            <div className="join">
              <button
                className={`btn join-item ${theme === "light" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setTheme("light")}
              >
                ☀️ Light
              </button>
              <button
                className={`btn join-item ${theme === "dark" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setTheme("dark")}
              >
                🌙 Dark
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h3 className="card-title">ℹ️ About</h3>
          <p className="text-base-content/70">
            Delay Dashboard — Part of the{" "}
            <a
              href="https://github.com/scobru/shogun"
              target="_blank"
              rel="noopener noreferrer"
              className="link link-primary"
            >
              Shogun Project
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Settings;
