/** Free Workers static assets + private Supabase Edge API. No domain purchase. */
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {loadEnv} from "./cloudflare.mjs";

const env = {...loadEnv(), CLOUDFLARE_FREE_BUILD:"1"};
env.XDG_CONFIG_HOME ||= path.resolve(".tmp/xdg");
env.WRANGLER_LOG_PATH ||= path.resolve(".tmp/wrangler.log");
env.WRANGLER_SEND_METRICS = "false";
env.NEXT_PUBLIC_SITE_URL = env.PUBLIC_BASE_URL || "https://mamyat.henriquealveslohrayne.workers.dev";
function run(args, cwd=process.cwd()) {
  const r=spawnSync(process.execPath,args,{cwd,env,stdio:"inherit"});
  if(r.status!==0) throw new Error(`Command failed (${r.status}): ${args[0]}`);
}
try {
  const config=JSON.parse(fs.readFileSync("wrangler.free.jsonc","utf8"));
  if(config.containers || config.routes || !config.workers_dev) throw new Error("Expected free workers.dev configuration");
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
  if(process.argv[2]==="check") {
    run(["node_modules/wrangler/bin/wrangler.js","deploy","-c","wrangler.free.jsonc","--dry-run","--no-autoconfig"]);
  } else {
    fs.mkdirSync(".tmp",{recursive:true});
    const secretFile=path.resolve(".tmp/free-worker-secrets.json");
    try {
      fs.writeFileSync(secretFile,JSON.stringify({SHOP_ORIGIN_SECRET:env.SHOP_ORIGIN_SECRET}),{mode:0o600});
      run(["node_modules/wrangler/bin/wrangler.js","deploy","-c","wrangler.free.jsonc","--secrets-file",secretFile,"--no-autoconfig"]);
    } finally {fs.rmSync(secretFile,{force:true});}
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
