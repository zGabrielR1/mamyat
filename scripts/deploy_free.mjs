/** Free Workers static assets + private Supabase Edge API. No domain purchase.
 * Publishes two workers from one build: the storefront and a dedicated admin
 * origin, so the back office never shares the shop's public address.
 */
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {loadEnv} from "./cloudflare.mjs";

const env = {...loadEnv(), CLOUDFLARE_FREE_BUILD:"1"};
env.XDG_CONFIG_HOME ||= path.resolve(".tmp/xdg");
env.WRANGLER_LOG_PATH ||= path.resolve(".tmp/wrangler.log");
env.WRANGLER_SEND_METRICS = "false";
const storefrontUrl = (env.PUBLIC_BASE_URL || "https://mamyat.henriquealveslohrayne.workers.dev").replace(/\/$/, "");
env.NEXT_PUBLIC_SITE_URL = storefrontUrl;
env.NEXT_PUBLIC_STOREFRONT_URL = storefrontUrl;

/** `mamyat.<account>.workers.dev` -> `mamyat-admin.<account>.workers.dev`. */
function defaultAdminUrl(storefront) {
  const url = new URL(storefront);
  if (url.hostname.endsWith(".workers.dev") && url.hostname.split(".").length >= 4) {
    return `${url.protocol}//mamyat-admin.${url.hostname.split(".").slice(1).join(".")}`;
  }
  return `${url.protocol}//admin.${url.hostname}`;
}
const adminUrl = (env.ADMIN_BASE_URL || defaultAdminUrl(storefrontUrl)).replace(/\/$/, "");
env.NEXT_PUBLIC_ADMIN_URL = adminUrl;

function run(args, cwd=process.cwd()) {
  const r=spawnSync(process.execPath,args,{cwd,env,stdio:"inherit"});
  if(r.status!==0) throw new Error(`Command failed (${r.status}): ${args[0]}`);
}
function freeConfig(file) {
  const config=JSON.parse(fs.readFileSync(file,"utf8"));
  if(config.containers || config.routes || !config.workers_dev) throw new Error(`Expected free workers.dev configuration in ${file}`);
  return config;
}
function wrangler(args) {
  run(["node_modules/wrangler/bin/wrangler.js",...args]);
}
try {
  freeConfig("wrangler.free.jsonc");
  freeConfig("wrangler.admin.jsonc");
  if(!env.SHOP_ORIGIN_SECRET) throw new Error("SHOP_ORIGIN_SECRET missing in private environment");
  run(["node_modules/typescript/bin/tsc","--noEmit"]);
  run(["node_modules/next/dist/bin/next","build"],path.resolve("web"));
  // Next's Windows export writes segment-prefetch dots as directories. Publish
  // the URL-shaped aliases expected by its browser router as well.
  function aliases(directory) {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      const filename=path.join(directory,entry.name);
      if(!entry.isDirectory()) continue;
      if(entry.name.startsWith("__next.")) {
        function flatten(current,parts=[]) {
          for(const child of fs.readdirSync(current,{withFileTypes:true})) {
            const source=path.join(current,child.name), segments=[...parts,child.name];
            if(child.isDirectory()) flatten(source,segments);
            else fs.copyFileSync(source,path.join(directory,[entry.name,...segments].join(".")));
          }
        }
        flatten(filename);
      } else aliases(filename);
    }
  }
  aliases("web/out");
  const common = ["deploy","--no-autoconfig"];
  const storefrontArgs = [...common,"-c","wrangler.free.jsonc","--var",`ADMIN_URL:${adminUrl}`];
  const adminArgs = [...common,"-c","wrangler.admin.jsonc"];
  if(process.argv[2]==="check") {
    wrangler([...storefrontArgs,"--dry-run"]);
    wrangler([...adminArgs,"--dry-run"]);
    console.log(`Storefront publish target: ${storefrontUrl}`);
    console.log(`Admin publish target: ${adminUrl}`);
  } else {
    fs.mkdirSync(".tmp",{recursive:true});
    const secretFile=path.resolve(".tmp/free-worker-secrets.json");
    try {
      fs.writeFileSync(secretFile,JSON.stringify({SHOP_ORIGIN_SECRET:env.SHOP_ORIGIN_SECRET}),{mode:0o600});
      // Publish the admin origin first: if the storefront step fails, the old
      // storefront keeps serving /admin instead of redirecting to nothing.
      wrangler([...adminArgs,"--secrets-file",secretFile]);
      wrangler([...storefrontArgs,"--secrets-file",secretFile]);
    } finally {fs.rmSync(secretFile,{force:true});}
    console.log(`Storefront: ${storefrontUrl}`);
    console.log(`Admin panel: ${adminUrl}/admin/`);
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
