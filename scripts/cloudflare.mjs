/** Provision this shop's services and deploy without exposing secret values. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const files = [".env", ".env.local", ".env.resend", ".env.turnstile", ".env.asaas", ".env.betterauth", ".env.supabase", ".env.cloudflare"];
export function loadEnv() {
  const result = {};
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      result[match[1]] = value;
    }
  }
  return { ...result, ...process.env };
}
let env = loadEnv();
env.WRANGLER_LOG_PATH ||= path.join(root, ".tmp", "wrangler.log");
env.WRANGLER_SEND_METRICS ||= "false";
function save(values) {
  const target = ".env.local";
  let text = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n]/.test(value)) throw new Error(`Cannot save multiline setting ${key}`);
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(target, text, { mode: 0o600 });
  env = { ...env, ...values };
}
async function api(service, endpoint, method = "GET", body) {
  const cf = service === "cloudflare";
  const base = cf ? "https://api.cloudflare.com/client/v4" : "https://api.resend.com";
  const token = cf ? env.CLOUDFLARE_API_TOKEN : env.RESEND_API_KEY;
  if (!token) throw new Error(`${cf ? "CLOUDFLARE_API_TOKEN" : "RESEND_API_KEY"} is missing`);
  const response = await fetch(base + endpoint, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000), redirect: "error",
  });
  const data = await response.json();
  if (!response.ok || data.success === false) {
    // Provider responses can contain request details; report only error codes.
    throw new Error(`${service} ${method} ${endpoint.split("?")[0]} failed (${response.status}; ${data.errors?.map(x => x.code).join(",") || data.name || "provider error"})`);
  }
  return cf ? data.result : data;
}
async function resendDomain(hostname, create = false) {
  const domains = await api("resend", "/domains");
  let domain = domains.data.find(x => x.name === hostname);
  if (!domain && create) domain = await api("resend", "/domains", "POST", { name: hostname, region: "sa-east-1" });
  if (!domain) throw new Error(`Resend has no sending domain for ${hostname}; run npm run setup:services`);
  return api("resend", `/domains/${domain.id}`);
}
async function setup() {
  const hostname = new URL(env.PUBLIC_BASE_URL || "https://mamyatelie.com").hostname;
  const defaults = {
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL || `https://${hostname}`,
    MAIL_FROM: env.MAIL_FROM || `oi@${hostname}`, MAIL_FROM_NAME: env.MAIL_FROM_NAME || "Mamy Ateliê",
    CUSTOMER_SESSION_SECRET: env.CUSTOMER_SESSION_SECRET || randomBytes(48).toString("base64url"),
    ADMIN_PASSWORD: env.ADMIN_PASSWORD || `Mamy1-${randomBytes(24).toString("base64url")}`,
  };
  save(defaults);
  console.log("Application settings saved to gitignored .env.local (values hidden).");
  let domain;
  if (env.RESEND_API_KEY) {
    domain = await resendDomain(hostname, true);
    console.log(`Resend domain ${hostname}: ${domain.status}`);
  }
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    console.log("Cloudflare provisioning pending: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are missing.");
    if (domain) console.log("Required sending DNS records:", JSON.stringify(domain.records.filter(x => x.record !== "Receiving"), null, 2));
    return;
  }
  await api("cloudflare", "/user/tokens/verify");
  const zones = await api("cloudflare", `/zones?name=${encodeURIComponent(hostname)}&account.id=${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}`);
  const zone = zones[0] || await api("cloudflare", "/zones", "POST", { name: hostname, account: { id: env.CLOUDFLARE_ACCOUNT_ID }, type: "full" });
  save({ CLOUDFLARE_ZONE_ID: zone.id });
  console.log(`Cloudflare zone ${zone.name}: ${zone.status}; nameservers: ${zone.name_servers.join(", ")}`);
  console.log("Creating a zone does not register or purchase a domain; its registrar must delegate to these nameservers.");
  if (domain) {
    for (const record of domain.records.filter(x => x.record !== "Receiving")) {
      const name = record.name === "@" ? hostname : record.name.endsWith(hostname) ? record.name : `${record.name}.${hostname}`;
      const existing = await api("cloudflare", `/zones/${zone.id}/dns_records?type=${record.type}&name=${encodeURIComponent(name)}`);
      if (existing.some(x => x.content === record.value && (record.type !== "MX" || x.priority === record.priority))) continue;
      if (existing.length) throw new Error(`Existing ${record.type} record for ${name} differs; reconcile it before continuing`);
      await api("cloudflare", `/zones/${zone.id}/dns_records`, "POST", {
        type: record.type, name, content: record.value, ttl: 1,
        ...(record.type === "MX" ? { priority: record.priority ?? 10 } : {}),
      });
    }
    await api("resend", `/domains/${domain.id}/verify`, "POST");
    console.log("Resend sending DNS installed; verification requested.");
  }
  const widgets = await api("cloudflare", `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/challenges/widgets`);
  let widget = widgets.find(x => x.name === "mamyat-storefront");
  const domains = [hostname, `www.${hostname}`];
  if (!widget) {
    widget = await api("cloudflare", `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/challenges/widgets`, "POST", { name: "mamyat-storefront", domains, mode: "managed" });
  } else if (!env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SITE_KEY !== widget.sitekey) {
    widget = await api("cloudflare", `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/challenges/widgets/${widget.sitekey}`);
  }
  if (!widget.secret && !env.TURNSTILE_SECRET_KEY) throw new Error("Existing Turnstile widget secret is unavailable; add it to .env.local");
  save({ TURNSTILE_SITE_KEY: widget.sitekey, TURNSTILE_SECRET_KEY: widget.secret || env.TURNSTILE_SECRET_KEY,
    TURNSTILE_HOSTNAMES: domains.join(",") });
  console.log("Managed Turnstile widget configured; keys saved privately.");
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", ...options });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.error?.code || result.status})`);
}
const wrangler = args => run(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...args]);
async function check() {
  let failed = false;
  const required = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "DATABASE_URL", "RESEND_API_KEY", "MAIL_FROM", "PUBLIC_BASE_URL",
    "CUSTOMER_SESSION_SECRET", "ADMIN_PASSWORD", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_HOSTNAMES"];
  for (const key of required) {
    const present = Boolean(env[key]);
    console.log(`${present ? "OK" : "MISSING"} ${key}`);
    if (!present) failed = true;
  }
  const docker = spawnSync("docker", ["info"], { encoding: "utf8", timeout: 15000 });
  console.log(`${docker.status === 0 ? "OK" : "MISSING"} Docker engine`);
  if (docker.status !== 0) failed = true;
  if (env.RESEND_API_KEY) {
    try {
      const domain = await resendDomain(new URL(env.PUBLIC_BASE_URL || "https://mamyatelie.com").hostname);
      console.log(`Resend domain: ${domain.status}`);
      if (domain.status !== "verified") failed = true;
    } catch (error) { console.log(error.message); failed = true; }
  }
  if (failed) throw new Error("Deployment prerequisites are incomplete. No deployment was attempted.");
  // Validate startup configuration and DB access without creating an App/admin.
  run(env.PYTHON || "python", ["-c", "import os; from api.configuration import validate_production; validate_production(dict(os.environ)); from api.db import _engine; from sqlalchemy import text; c=_engine(os.environ['DATABASE_URL']).connect(); c.execute(text('select 1')); c.close(); print('Supabase connection OK')"], { env: { ...env, APP_ENV: "production" } });
  await api("cloudflare", "/user/tokens/verify");
  const zone = await api("cloudflare", `/zones/${env.CLOUDFLARE_ZONE_ID || "missing"}`);
  if (zone.status !== "active") throw new Error("Cloudflare zone is not active; finish registrar nameserver delegation");
  console.log("Deployment prerequisites OK.");
}
async function deploy() {
  await check();
  // Apply the security migration before the app can create tables on boot.
  run(env.PYTHON || "python", ["-c", "import os; from pathlib import Path; from api.db import _engine; e=_engine(os.environ['DATABASE_URL']); c=e.raw_connection(); cur=c.cursor(); cur.execute(Path('supabase/migrations/20261020000000_mamyat.sql').read_text()); c.commit(); cur.close(); c.close(); print('Supabase migration applied')"]);
  // Upload secrets with the application version so first deploy needs no
  // placeholder Worker and secret updates cannot activate the old version.
  const keys = ["DATABASE_URL", "ADMIN_USERNAME", "ADMIN_PASSWORD", "CUSTOMER_SESSION_SECRET", "RESEND_API_KEY", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "PUBLIC_BASE_URL", "MAIL_FROM", "MAIL_FROM_NAME", "TURNSTILE_HOSTNAMES", "ASAAS_API_KEY", "ASAAS_CUSTOMER_ID", "ASAAS_WEBHOOK_SECRET", "ASAAS_BASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_BRIDGE_SECRET", "BETTER_AUTH_URL", "BETTER_AUTH_TRUSTED_ORIGINS", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET", "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"];
  const secrets = Object.fromEntries(keys.filter(key => env[key]).map(key => [key, env[key]]));
  fs.mkdirSync(".tmp", { recursive: true });
  const secretsFile = path.join(".tmp", `deploy-secrets-${randomBytes(8).toString("hex")}.json`);
  fs.writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600, flag: "wx" });
  try { wrangler(["deploy", "--secrets-file", secretsFile]); }
  finally { fs.rmSync(secretsFile, { force: true }); }
  const origin = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  let healthy = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(15000) });
      const health = await response.json();
      if (response.ok && health.ok && health.storage === "postgres" && health.mail === "resend" && health.captcha === "turnstile") { healthy = true; break; }
    } catch { /* First container provisioning may take several minutes. */ }
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  if (!healthy) throw new Error("Deployment submitted, but production health is not verified; inspect Wrangler/container logs");
  console.log(`Live and healthy: ${origin}`);
}

// Importing helpers does not execute provisioning or deployment.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2] || "check";
    if (command === "setup") await setup();
    else if (command === "check") await check();
    else if (command === "deploy") await deploy();
    else throw new Error("Usage: node scripts/cloudflare.mjs [setup|check|deploy]");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
