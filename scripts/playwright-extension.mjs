// Keep browser access credentials in an ignored file, outside MCP config.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filename = path.join(root, ".env.playwright");
const match = fs.existsSync(filename)
  ? fs.readFileSync(filename, "utf8").match(/^PLAYWRIGHT_MCP_EXTENSION_TOKEN=(.+)$/m)
  : null;
const token = process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN || match?.[1]?.trim();
if (!token) throw new Error("Missing PLAYWRIGHT_MCP_EXTENSION_TOKEN in .env.playwright");
const help = process.argv.includes("--help");
const windows = process.platform === "win32";
const args = windows
  ? ["/d", "/s", "/c", `npx.cmd -y @playwright/mcp@latest --extension${help ? " --help" : ""}`]
  : ["-y", "@playwright/mcp@latest", "--extension", ...(help ? ["--help"] : [])];
const child = spawn(windows ? (process.env.ComSpec || "cmd.exe") : "npx", args, {
    cwd: root, stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_MCP_EXTENSION_TOKEN: token,
      npm_config_cache: path.join(root, ".tmp", "npm-cache") },
  });
child.on("error", error => { console.error(error.code || "MCP launch failed"); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
