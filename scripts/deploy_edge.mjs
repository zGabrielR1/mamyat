/** Publish the private Edge API and its payment secrets without logging values. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './cloudflare.mjs';
const env = loadEnv();
const ref = env.SUPABASE_PROJECT_REF || (env.DATABASE_URL || '').match(/postgres\.([a-z0-9]+)[:@]/)?.[1];
if (!ref) throw new Error('SUPABASE_PROJECT_REF missing');
env.npm_config_cache = path.resolve('.tmp/npm-cache');
env.SUPABASE_HOME ||= path.resolve('.tmp/supabase');
env.SUPABASE_TELEMETRY_DISABLED = '1';
env.DO_NOT_TRACK = '1';
const npx = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js')
  : path.resolve(process.env.npm_execpath || '/usr/local/lib/node_modules/npm/bin/npm-cli.js').replace(/npm-cli\.js$/, 'npx-cli.js');
function cli(args) {
  const r = spawnSync(process.execPath, [npx, '--yes', 'supabase@2', ...args], { env, stdio:'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('Supabase publish failed. Run `npm run login:edge` or set SUPABASE_ACCESS_TOKEN in .env.local.');
}
if (process.argv[2] === 'login') {
  cli(['login', '--no-browser', '--output', 'pretty']);
  process.exit(0);
}
if (env.MERCADOPAGO_ACCESS_TOKEN) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN.startsWith('APP_USR-')) throw new Error('Production Mercado Pago token required');
  if ((env.MERCADOPAGO_NOTIFICATION_SECRET || '').length < 32) throw new Error('MERCADOPAGO_NOTIFICATION_SECRET must contain at least 32 characters');
  if (new URL(env.PUBLIC_BASE_URL).protocol !== 'https:') throw new Error('PUBLIC_BASE_URL must use HTTPS');
  fs.mkdirSync('.tmp', {recursive:true});
  const file = path.resolve('.tmp/payment-secrets.env');
  const secrets = { MERCADOPAGO_ACCESS_TOKEN:env.MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_NOTIFICATION_SECRET:env.MERCADOPAGO_NOTIFICATION_SECRET, PUBLIC_BASE_URL:env.PUBLIC_BASE_URL };
  for (const value of Object.values(secrets)) if (/[\r\n]/.test(value)) throw new Error('Multiline secret rejected');
  try {
    fs.writeFileSync(file, Object.entries(secrets).map(([k,v])=>`${k}=${v}`).join('\n')+'\n', {mode:0o600});
    cli(['secrets','set','--project-ref',ref,'--env-file',file]);
  } finally { fs.rmSync(file, {force:true}); }
}
cli(['functions','deploy','shop-api','--project-ref',ref,'--use-api']);
