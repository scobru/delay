import { spawn } from "child_process";
import { dirname, join } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const zenPath = join(dirname(require.resolve("zen")), "script", "server.js");
const peers = process.env.GUN_PEERS || process.env.RELAY_PEERS || "";

const env = { ...process.env, PEERS: peers };
const child = spawn("node", [zenPath], {
  stdio: "inherit",
  env: env
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
