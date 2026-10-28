import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { loadEnv } from './cloudflare.mjs';

const env = { ...loadEnv(), MERCADOPAGO_ACCESS_TOKEN: '', TESTING: 'true', MAIL_DELIVERY: 'disabled', SHOP_ORIGIN_SECRET: 'isolated-test-secret' };
const sql = postgres(env.DATABASE_URL, { max: 3, prepare: false, ssl: 'require', connect_timeout: 10 });
const schema = 'mamyat_test_' + crypto.randomUUID().replaceAll('-', '');
let server;
try {
  await sql.unsafe(`create schema ${schema}`);
  await sql.unsafe(`create table ${schema}.documents (like public.mamyat_documents including all)`);
  await sql.unsafe(`insert into ${schema}.documents select * from public.mamyat_documents`);
  const source = fs.readFileSync('supabase/functions/shop-api/core.mjs', 'utf8').replaceAll('public.mamyat_documents', `${schema}.documents`).replaceAll('740021', '740099').replace('./mercadopago.mjs', pathToFileURL(process.cwd() + '/supabase/functions/shop-api/mercadopago.mjs').href);
  const { createHandler } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const handler = createHandler(sql, env);
  server = http.createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const headers = new Headers(Object.entries(req.headers).filter(([, v]) => v !== undefined).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]));
      headers.set('X-Shop-Origin-Secret', env.SHOP_ORIGIN_SECRET);
      headers.set('X-Shop-Client-IP', '127.0.0.1');
      const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) { console.error(e.name); res.writeHead(500); res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let smoke = fs.readFileSync('scripts/smoke.py', 'utf8');
  smoke = smoke.replace('check("customer reset link", status == 200, str(status))', 'check("unavailable email reset is explicit", status == 503, str(status))');
  fs.mkdirSync('.tmp', { recursive: true }); fs.writeFileSync('.tmp/smoke_free.py', smoke);
  const child = spawn('python', ['.tmp/smoke_free.py', '--base', base], { env, stdio: 'inherit' });
  const code = await new Promise(resolve => child.on('exit', resolve)); assert.equal(code, 0, 'API contract smoke failed');
  const call = async (path, body, token) => { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { 'X-Admin-Token': token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
  const login = await call('/api/admin/login', { username: 'admin', password: env.ADMIN_PASSWORD }); assert.equal(login.status, 200); const token = login.body.token;
  assert.equal((await call('/api/admin/dashboard', undefined, token)).body.payment_mode, 'demo');
  const made = await call('/api/admin/products', { name: 'Last stock concurrency check', category: 'Bolsas', price_minor: 9900, variants: [{ id: 'one', name: 'Única', stock: 1 }], images: [] }, token); assert.equal(made.status, 201);
  const payload = { items: [{ product_id: made.body.product.id, variant_id: 'one', qty: 1 }], name: 'Teste Loja', email: 'concurrency@example.com', phone: '11987654321', cpf: '52998224725', shipping_method: 'pickup' };
  const [a, b] = await Promise.all([call('/api/orders', { ...payload, idempotency_key: crypto.randomUUID() }), call('/api/orders', { ...payload, idempotency_key: crypto.randomUUID() })]);
  assert.deepEqual([a.status, b.status].sort(), [201, 400], 'Last unit was oversold');
  const doubled = await call('/api/cart/quote', { items: [{ ...payload.items[0], qty: 1 }, { ...payload.items[0], qty: 1 }] }); assert.equal(doubled.body.ok, false, 'Duplicate lines bypass stock');
  const unauth = await handler(new Request('https://shop.invalid/api/config')); assert.equal(unauth.status, 401, 'Edge origin secret must be required');
  console.log('Additional checks passed: concurrent last-stock reservation, duplicate cart lines, direct-origin protection.');
  const sent = [];
  const mailHandler = createHandler(sql, { ...env, MAIL_DELIVERY: 'enabled', RESEND_API_KEY: 'test-private-key', MAIL_FROM: 'test@example.invalid', PUBLIC_BASE_URL: 'https://shop.invalid' }, async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, 'Bearer test-private-key');
    sent.push(JSON.parse(options.body)); return new Response('{}', { status: 200 });
  });
  const mailCall = async (path, body, token) => {
    const response = await mailHandler(new Request('https://shop.invalid' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Shop-Origin-Secret': env.SHOP_ORIGIN_SECRET, 'X-Shop-Client-IP': 'mail-test', ...(token ? { 'X-Customer-Token': token } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: response.status, body: await response.json() };
  };
  const account = await mailCall('/api/auth/signup', { name: 'Mail Test', username: 'mailtest', email: 'mailtest@example.invalid', password: 'Testing12345' }); assert.equal(account.status, 201);
  assert.equal((await mailCall('/api/auth/password/request', { email: 'missing@example.invalid' })).status, 200); assert.equal(sent.length, 0);
  assert.equal((await mailCall('/api/auth/password/request', { email: 'mailtest@example.invalid' })).status, 200); assert.equal(sent.length, 1);
  const resetToken = new URL(sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('token');
  const reset = await mailCall('/api/auth/password/reset', { token: resetToken, password: 'Changed12345' }); assert.equal(reset.status, 200);
  assert.equal((await mailCall('/api/auth/password/reset', { token: resetToken, password: 'Changed12345' })).status, 400, 'Reset token reused');
  assert.equal((await mailCall('/api/auth/me', undefined, account.body.token)).status, 401, 'Old session survived password reset');
  assert.equal((await mailCall('/api/auth/me', undefined, reset.body.token)).status, 200);
  console.log('Resend Fetch recovery checks passed: generic missing-account reply, single-use reset, session revocation.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await sql.unsafe(`drop schema if exists ${schema} cascade`);
  await sql.end();
}
