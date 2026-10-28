import { enabled as mpEnabled, createCheckout, mpCall, matchesPayment, notificationToken } from './mercadopago.mjs';
// Free-tier API. Every commerce mutation is one Postgres transaction, including
// stock reservations, order transitions and idempotency. No browser DB access.
const enc = new TextEncoder();
const now = () => new Date().toISOString();
const uid = prefix => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const digits = value => String(value || '').replace(/\D/g, '');
const money = value => (Number(value || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = value => `R$ ${money(value)}`;
const labels = { awaiting_payment: 'Aguardando pagamento', paid: 'Pago', packing: 'Em produção', shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado', refunded: 'Reembolsado' };
const transitions = { awaiting_payment: ['paid', 'cancelled'], paid: ['packing', 'refunded'], packing: ['shipped', 'refunded'], shipped: ['delivered', 'refunded'], delivered: ['refunded'], cancelled: [], refunded: [] };
export class ApiError extends Error { constructor(status, message, code = 'invalid_request') { super(message); this.status = status; this.code = code; } }
const fail = (message, code = 'invalid_request', status = 400) => { throw new ApiError(status, message, code); };
function text(value, field, min = 0, max = 300) { const s = String(value ?? '').trim(); if (s.length < min || s.length > max) fail(`${field}: valor inválido`); return s; }
function email(value) { const s = text(value, 'Email', 3, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail('Email inválido'); return s; }
function integer(value, field, min = 0, max = 100000000) { const n = Number(value); if (!Number.isSafeInteger(n) || n < min || n > max) fail(`${field}: valor inválido`); return n; }
function password(value) { const s = String(value || ''); if (s.length < 8 || s.length > 128 || !/[a-zA-Z]/.test(s) || !/\d/.test(s)) fail('A senha precisa de 8 caracteres, uma letra e um número'); return s; }
function cpf(value) { const s = digits(value); if (!s) return ''; if (s.length !== 11 || /^(.)\1+$/.test(s)) fail('CPF inválido'); for (let j = 9; j < 11; j++) { let n = 0; for (let i = 0; i < j; i++) n += Number(s[i]) * (j + 1 - i); const d = (n * 10) % 11; if ((d === 10 ? 0 : d) !== Number(s[j])) fail('CPF inválido'); } return s; }
function phone(value) { const s = digits(value); if (s && !/^(?:55)?\d{10,11}$/.test(s)) fail('Telefone inválido'); return s; }
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const unhex = s => Uint8Array.from(s.match(/../g) || [], h => parseInt(h, 16));
export async function sha(value) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(value))); }
export function equal(a, b) { const x = enc.encode(a || ''), y = enc.encode(b || ''); if (x.length !== y.length) return false; let n = 0; for (let i = 0; i < x.length; i++) n |= x[i] ^ y[i]; return n === 0; }
export async function hashPassword(value, encoded) {
  const parts = encoded?.split('$');
  const iterations = parts ? Number(parts[1]) : 600000;
  if (parts && (parts[0] !== 'pbkdf2_sha256' || parts.length !== 4 || !Number.isInteger(iterations) || iterations < 1 || iterations > 5000000 || !/^[a-f0-9]{16,128}$/.test(parts[2]) || !/^[a-f0-9]{32,256}$/.test(parts[3]))) return '';
  const salt = parts ? unhex(parts[2]) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(value)), 'PBKDF2', false, ['deriveBits']);
  const digest = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, parts ? parts[3].length * 4 : 256);
  return `pbkdf2_sha256$${iterations}$${hex(salt)}$${hex(digest)}`;
}
const publicCustomer = c => Object.fromEntries(['id', 'username', 'email', 'name', 'phone', 'cpf', 'created_at', 'updated_at', 'active', 'marketing', 'deleted_at'].map(k => [k, c[k] ?? (k === 'active' ? true : '')]).concat([['has_password', !!c.password_hash], ['provider', c.provider || 'password']]));
const publicAdmin = a => ({ id: a.id, username: a.username, role: a.role, must_change_password: !!a.must_change_password });
const result = (body, status = 200) => ({ body, status });
const MEDIA_BUCKET = 'product-media';
const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const MEDIA_QUOTA_BYTES = 900 * 1024 * 1024;
const MEDIA_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
function mediaType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return '';
}
async function uploadMedia(sql, env, request, fetcher) {
  const token = request.headers.get('X-Admin-Token') || (request.headers.get('Authorization') || '').replace(/^Bearer /i, '');
  if (!token) fail('Entre novamente no painel', 'unauthorized', 401);
  const digest = await sha(token);
  const rows = await sql`select collection, payload from public.mamyat_documents where collection in ('admin_sessions', 'admins')`;
  const state = Object.fromEntries(rows.map(row => [row.collection, row.payload]));
  const session = (state.admin_sessions || {})[digest];
  const admin = session && session.expires_at > Date.now() / 1000
    ? (state.admins || []).find(row => row.id === session.admin_id) : null;
  if (!admin) fail('Entre novamente no painel', 'unauthorized', 401);
  if (admin.role !== 'admin') fail('Acesso somente para leitura', 'forbidden', 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail('O envio de fotos não está configurado', 'media_unavailable', 503);

  const declared = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) fail('Envie uma imagem', 'invalid_media');
  if (bytes.length > MEDIA_MAX_BYTES) fail('A imagem deve ter no máximo 5 MB', 'invalid_media');
  const detected = mediaType(bytes);
  if (!detected || detected !== declared) fail('Envie uma imagem JPEG, PNG ou WebP', 'invalid_media');

  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const authorization = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
  try {
    const listed = await fetcher(`${base}/storage/v1/object/list/${MEDIA_BUCKET}`, {
      method: 'POST',
      headers: { Authorization: authorization, apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    if (listed.ok) {
      const objects = await listed.json();
      const used = Array.isArray(objects) ? objects.reduce((total, item) => total + Number(item.metadata?.size || 0), 0) : 0;
      if (used + bytes.length > MEDIA_QUOTA_BYTES) fail('O armazenamento de fotos está cheio', 'media_quota', 413);
    } else {
      console.error('media quota check failed', listed.status);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('media quota check failed', error?.name || 'Error');
  }

  const key = `${crypto.randomUUID().replaceAll('-', '')}.${MEDIA_TYPES[detected]}`;
  let response;
  try {
    response = await fetcher(`${base}/storage/v1/object/${MEDIA_BUCKET}/${key}`, {
      method: 'POST',
      headers: { Authorization: authorization, apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': detected, 'x-upsert': 'false', 'cache-control': '31536000' },
      body: bytes,
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    console.error('media upload failed', error?.name || 'Error');
    fail('Não foi possível guardar a foto agora', 'media_unavailable', 503);
  }
  if (!response.ok) {
    console.error('media upload rejected', response.status);
    fail('Não foi possível guardar a foto agora', 'media_unavailable', 503);
  }
  return result({ url: `/media/${key}`, key, content_type: detected, size: bytes.length }, 201);
}
function blankState(s) { for (const key of ['products', 'orders', 'customers', 'admins', 'password_resets', 'contacts', 'reviews']) s[key] ||= []; for (const key of ['settings', 'reservations', 'admin_sessions', 'customer_sessions', 'edge_rate_limits']) s[key] ||= {}; return s; }
const publicReview = r => Object.fromEntries(['id', 'product_id', 'rating', 'comment', 'name', 'created_at'].map(k => [k, r[k]]));
export class Shop {
  constructor(state, env, request, fetcher = fetch) { this.s = blankState(state); this.env = env; this.request = request; this.fetch = fetcher; this.messages = []; }
  mailEnabled() { return this.env.MAIL_DELIVERY === 'enabled' && !!this.env.RESEND_API_KEY && !!this.env.MAIL_FROM; }
  mail(to, subject, content, required = false) { if (this.mailEnabled()) this.messages.push({ id: uid('mail'), to, subject, text: content, required }); }
  async requestReset(address) {
    if (!this.mailEnabled()) fail('Para redefinir sua senha, entre em contato com o ateliê pelo WhatsApp.', 'mail_unavailable', 503);
    const c = this.s.customers.find(c => c.email === address && c.active !== false);
    if (c) {
      const token = uid('reset');
      this.s.password_resets = this.s.password_resets.filter(r => r.customer_id !== c.id && r.expires > Date.now() / 1000);
      this.s.password_resets.push({ customer_id: c.id, hash: await sha(token), expires: Date.now() / 1000 + 1800 });
      const link = new URL('/conta/redefinir/', this.env.PUBLIC_BASE_URL);
      link.searchParams.set('token', token);
      this.mail(c.email, 'Recuperar acesso ao ateliê', `Use este link em até 30 minutos para criar uma nova senha:\n${link}\nSe não foi você, ignore esta mensagem.`, true);
    }
    return result({ ok: true });
  }
  rate() {
    const p = new URL(this.request.url).pathname;
    if (this.request.method === 'GET') return;
    const max = p === '/api/admin/login' ? 10 : p.includes('login') ? 20 : p.includes('password/request') ? 6 : p.includes('signup') ? 10 : p === '/api/contact' ? 5 : p.endsWith('/payment-status') ? 15 : 120;
    const stamp = Math.floor(Date.now() / 300000), ip = this.request.headers.get('X-Shop-Client-IP') || 'unknown';
    for (const [key, value] of Object.entries(this.s.edge_rate_limits)) if (value.stamp < stamp - 12) delete this.s.edge_rate_limits[key];
    const key = `${ip}:${p}:${stamp}`, hit = this.s.edge_rate_limits[key] ||= { count: 0, stamp };
    if (++hit.count > max) fail('Muitas tentativas. Aguarde alguns minutos.', 'rate_limited', 429);
  }
  async gate(body, action) {
    if (this.env.TESTING === 'true') return;
    if (!this.env.TURNSTILE_SECRET_KEY || !this.env.TURNSTILE_SITE_KEY) fail('Verificação temporariamente indisponível', 'captcha_unavailable', 503);
    if (typeof body.turnstile_token !== 'string' || !body.turnstile_token || body.turnstile_token.length > 2048) fail('Confirme a verificação para continuar', 'captcha_required');
    const response = await this.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: this.env.TURNSTILE_SECRET_KEY, response: body.turnstile_token, remoteip: this.request.headers.get('X-Shop-Client-IP') || '' }), signal: AbortSignal.timeout(10000) });
    const answer = await response.json();
    const allowed = String(this.env.TURNSTILE_HOSTNAMES || '').split(',').map(s => s.trim());
    if (!response.ok || answer.success !== true || answer.action !== action || !allowed.includes(answer.hostname)) fail('Verificação inválida ou expirada; tente de novo', 'captcha_failed');
  }
  prune() { for (const [key, row] of Object.entries(this.s.reservations)) if (!row || row.expires_at <= Date.now() / 1000) delete this.s.reservations[key]; }
  available(p, v) { if (p.made_to_order) return 9999; let reserved = 0; for (const row of Object.values(this.s.reservations)) for (const i of row.items || []) if (i.product_id === p.id && i.variant_id === v.id) reserved += i.qty; return Math.max(0, v.stock - reserved); }
  product(p) { const variants = p.variants.map(v => ({ ...v, available: this.available(p, v) })); return { ...p, price: p.price_minor / 100, compare_at: p.compare_at_minor ? p.compare_at_minor / 100 : null, available: variants.reduce((n, v) => n + v.available, 0), variants, url: `/produto/${p.slug}` }; }
  reviewStats(productId) {
    const rows = this.s.reviews.filter(r => r.product_id === productId && r.status === 'approved');
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of rows) distribution[row.rating]++;
    return { count: rows.length, average: rows.length ? Math.round(rows.reduce((sum, r) => sum + r.rating, 0) / rows.length * 10) / 10 : 0, distribution };
  }
  categories() { return (this.s.settings.categories || []).map(name => ({ name, count: this.s.products.filter(p => p.category === name).length })); }
  quote(b) {
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 40) fail('Seu carrinho está vazio ou é inválido', 'invalid_cart');
    const combined = new Map();
    for (const i of b.items) { const key = `${i.product_id}:${i.variant_id}`; const qty = integer(i.qty, 'Quantidade', 1, 99); combined.set(key, { ...i, qty: (combined.get(key)?.qty || 0) + qty }); }
    const items = [], problems = [];
    for (const i of combined.values()) {
      const p = this.s.products.find(p => p.id === i.product_id && p.active), v = p?.variants.find(v => v.id === i.variant_id);
      if (!p || !v || i.qty > 99 || this.available(p, v) < i.qty) { problems.push('Uma peça está indisponível na quantidade escolhida'); continue; }
      items.push({ product_id: p.id, variant_id: v.id, slug: p.slug, name: p.name, variant_name: v.name, sku: v.sku, image: p.images?.[0] || '', unit_price_minor: p.price_minor, qty: i.qty, line_total_minor: p.price_minor * i.qty, made_to_order: !!p.made_to_order, production_days: p.production_days || 0 });
    }
    const settings = this.s.settings, subtotal = items.reduce((sum, i) => sum + i.line_total_minor, 0), method = b.shipping_method || 'delivery';
    if (!['delivery', 'pickup'].includes(method) || method === 'pickup' && !settings.pickup_enabled) fail('Forma de entrega indisponível');
    const shipping = method === 'pickup' || settings.free_shipping_minor > 0 && subtotal >= settings.free_shipping_minor ? 0 : settings.shipping_flat_minor;
    let discount = 0, coupon = '';
    if (b.coupon) { const code = String(b.coupon).trim().toUpperCase(), c = settings.coupons?.[code]; if (!c || c.active === false || subtotal < (c.min_minor || 0)) fail('Cupom inválido ou indisponível'); const value = Number(String(c.value).replace(',', '.')); if (!Number.isFinite(value) || value < 0 || c.type === 'percent' && value > 100) fail('Cupom inválido'); discount = Math.min(subtotal, Math.round(c.type === 'percent' ? subtotal * value / 100 : value * 100)); coupon = c.label || code; }
    return { ok: !problems.length, problems, items, subtotal_minor: subtotal, shipping_minor: shipping, discount_minor: discount, total_minor: Math.max(0, subtotal + shipping - discount), shipping_method: method, free_shipping: shipping === 0 && method === 'delivery', coupon };
  }
  async customer(required = false) {
    const token = this.request.headers.get('X-Customer-Token') || (this.request.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    const row = token ? this.s.customer_sessions[await sha(token)] : null;
    const c = row && row.expires > Date.now() / 1000 ? this.s.customers.find(c => c.id === row.customer && c.active !== false && (c.session_epoch || 0) === row.epoch) : null;
    if (!c && required) fail('Entre novamente na sua conta', 'unauthorized', 401);
    return c;
  }
  async session(c, remember = false) { const token = uid('cs'); this.s.customer_sessions[await sha(token)] = { customer: c.id, epoch: c.session_epoch || 0, expires: Date.now() / 1000 + (remember ? 2592000 : 43200) }; return { customer: publicCustomer(c), token, expires_in: remember ? 2592000 : 43200 }; }
  revokeCustomer(c) { c.session_epoch = (c.session_epoch || 0) + 1; for (const [key, session] of Object.entries(this.s.customer_sessions)) if (session.customer === c.id) delete this.s.customer_sessions[key]; }
  identity(b, existing) {
    const username = text(b.username ?? existing?.username, 'Usuário', 3, 20).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,19}$/.test(username)) fail('Nome de usuário inválido');
    const out = { username, email: email(b.email ?? existing?.email), name: text(b.name ?? existing?.name, 'Nome', 2, 100), phone: phone(b.phone ?? existing?.phone), cpf: cpf(b.cpf ?? existing?.cpf) };
    if (this.s.customers.some(c => c.id !== existing?.id && (c.username === out.username || c.email === out.email || out.cpf && c.cpf === out.cpf))) fail('Usuário, email ou CPF já cadastrado', 'duplicate_customer');
    return out;
  }
  async createCustomer(b, admin = false) { const temporary = admin && !b.password ? `Mamy1-${crypto.randomUUID()}` : ''; const p = password(b.password || temporary); const c = { id: uid('cus'), ...this.identity(b), password_hash: await hashPassword(p), active: true, marketing: !!b.marketing, session_epoch: 0, created_at: now(), provider: 'password' }; this.s.customers.push(c); return { c, temporary }; }
  publicOrder(o) {
    const payment = { ...o.payment };
    if (payment.provider === 'mercadopago') {
      const expiry = payment.expires_at ? Date.parse(payment.expires_at) : Date.parse(o.created_at) + 1800000;
      if (Number.isFinite(expiry)) payment.expires_at = new Date(expiry).toISOString();
      payment.expired = o.status === 'awaiting_payment' && Number.isFinite(expiry) && expiry <= Date.now();
    }
    return { ...o, payment, total: brl(o.total_minor), status_label: labels[o.status], can_cancel: o.status === 'awaiting_payment' && !payment.review_required, item_count: o.items.reduce((n, i) => n + i.qty, 0) };
  }
  order(number) { const o = this.s.orders.find(o => o.number === number || o.id === number); if (!o) fail('Pedido não encontrado', 'not_found', 404); return o; }
  async authorizeOrder(o, b, q) { const c = await this.customer(); if (c?.id !== o.customer_id && (!String(b.email || q.get('email') || '').trim() || String(b.email || q.get('email')).trim().toLowerCase() !== o.email)) fail('Informe o email do pedido para consultar', 'forbidden', 403); }
  paid(o) { if (o.status !== 'awaiting_payment') return false; const reservation = this.s.reservations[o.number]; if (!reservation) fail('A reserva expirou; confirme o estoque antes de receber o pagamento'); for (const i of reservation.items) { const p = this.s.products.find(p => p.id === i.product_id), v = p?.variants.find(v => v.id === i.variant_id); if (!p || !v || !p.made_to_order && v.stock < i.qty) fail('Estoque indisponível'); if (!p.made_to_order) v.stock -= i.qty; } delete this.s.reservations[o.number]; o.status = 'paid'; o.paid_at = now(); o.payment.status = 'confirmed'; o.history.push({ status: 'paid', at: o.paid_at, source: 'admin-demo' }); return true; }
  transition(o, status, tracking = '') { if (!transitions[o.status]?.includes(status)) fail('Mudança de status inválida', 'invalid_transition'); if (status === 'paid') { if (o.payment.provider !== 'demo') fail('Payment confirmation requires the provider', 'provider_required', 403); return this.paid(o); } if (status === 'cancelled') delete this.s.reservations[o.number]; o.status = status; if (status === 'shipped') { o.tracking_code = text(tracking, 'Rastreio', 0, 80); o.shipped_at = now(); } o.history.push({ status, at: now() }); }
  async checkout(o) {
    if (o.payment.review_required) fail('Payment needs manual review', 'payment_review', 409);
    if (o.status !== 'awaiting_payment') fail('Pedido não está aguardando pagamento');
    const reservation = this.s.reservations[o.number];
    if (!reservation) fail('Reserva expirada. Faça um novo pedido.', 'reservation_expired', 409);
    if (o.payment.provider === 'mercadopago' && o.payment.checkout_url) return;
    try { o.payment = await createCheckout(this.env, this.fetch, o, reservation.expires_at); }
    catch { o.payment = {provider:'mercadopago', status:'error', retryable:true, error:'Não foi possível abrir o Mercado Pago. Tente novamente.'}; }
  }
  async fetchMercadoPayment(o, id) {
    if (!mpEnabled(this.env) || o.payment.provider !== 'mercadopago') fail('Pagamento indisponível', 'payments_disabled', 503);
    if (!/^[0-9]{1,30}$/.test(id)) fail('Identificador de pagamento inválido', 'invalid_payment');
    let payment;
    try { payment = await mpCall(this.env, this.fetch, '/v1/payments/' + id); }
    catch { fail('Não foi possível verificar o pagamento', 'provider_unavailable', 503); }
    if (!matchesPayment(payment, o) || String(payment.id) !== id) fail('Pagamento divergente', 'payment_mismatch', 400);
    return payment;
  }
  applyMercadoPayment(o, payment) {
    const id = String(payment.id);
    o.payment.last_checked_at = now();
    if (o.status === 'awaiting_payment' && !o.payment.review_required) {
      o.payment.provider_status = payment.status;
      if (['pending', 'in_process', 'authorized', 'in_mediation', 'rejected', 'cancelled'].includes(payment.status)) o.payment.status = payment.status;
    }
    if (payment.status === 'approved' && o.status === 'awaiting_payment') {
      // A flagged payment remains for an operator, even if stock later changes.
      if (o.payment.review_required) return { changed:false, review_required:true };
      // A delayed approval may arrive after expiry. Reacquire stock only if it is still free.
      if (!this.s.reservations[o.number]) {
        for (const i of o.items) { const p = this.s.products.find(p => p.id === i.product_id), v = p?.variants.find(v => v.id === i.variant_id); if (!p || !v || this.available(p,v) < i.qty) { o.payment.review_required = true; o.payment.payment_id = id; return { changed:false, review_required:true }; } }
        this.s.reservations[o.number] = {items:o.items, expires_at:Date.now()/1000 + 60};
      }
      this.paid(o); o.payment.payment_id = id; o.history.at(-1).source = 'mercadopago';
      return { changed:true };
    } else if (payment.status === 'approved' && o.payment.payment_id && o.payment.payment_id !== id) { o.payment.review_required = true; }
    else if (o.payment.payment_id === id && ['refunded','charged_back'].includes(payment.status) && ['paid','packing','shipped','delivered'].includes(o.status)) this.transition(o, 'refunded');
    else if (payment.status === 'approved' && o.status === 'cancelled') { o.payment.review_required = true; o.payment.payment_id = id; }
    return { changed:false, review_required:!!o.payment.review_required };
  }
  async mercadoWebhook(b, q) {
    if (!mpEnabled(this.env)) fail('Pagamentos desabilitados', 'payments_disabled', 503);
    const o = this.order(q.get('order'));
    if (!equal(q.get('token'), await notificationToken(this.env, o))) fail('Notificação inválida', 'bad_signature', 401);
    const id = String(q.get('data.id') || b.data?.id || '');
    if (!/^[0-9]{1,30}$/.test(id) || (b.type || q.get('type')) !== 'payment') return result({ok:true, ignored:true});
    return result({ok:true, ...this.applyMercadoPayment(o, await this.fetchMercadoPayment(o, id))});
  }
  async checkMercadoPayment(o, id) {
    id = String(id || '');
    const last = Date.parse(o.payment.last_return_check_at || '');
    if (o.payment.last_return_payment_id === id && Number.isFinite(last) && Date.now() - last < 15000) return;
    const payment = await this.fetchMercadoPayment(o, id);
    this.applyMercadoPayment(o, payment);
    o.payment.last_return_payment_id = id;
    o.payment.last_return_check_at = now();
  }
  config() { const s = this.s.settings; return { version: '0.2.0', store: { name: s.store_name, tagline: s.tagline, announcement: s.announcement, email: s.email, whatsapp: s.whatsapp, instagram: s.instagram, cnpj: s.cnpj, city: s.city }, shipping: { flat_minor: s.shipping_flat_minor, free_minor: s.free_shipping_minor, pickup_enabled: s.pickup_enabled, delivery_days: s.delivery_days, pickup_address: s.pickup_address }, payment: { mode: mpEnabled(this.env) ? 'mercadopago' : 'demo', environment: mpEnabled(this.env) ? 'produção' : 'demonstração' }, turnstile: { enabled: !!this.env.TURNSTILE_SITE_KEY, site_key: this.env.TURNSTILE_SITE_KEY || '' }, categories: s.categories, features: { pickup: !!s.pickup_enabled, coupons: true, guest_checkout: true, social_login: false, email: this.mailEnabled(), media: !!(this.env.SUPABASE_URL && this.env.SUPABASE_SERVICE_ROLE_KEY) } }; }
  async route(b = {}) {
    this.prune();
    const url = new URL(this.request.url), path = decodeURIComponent(url.pathname), q = url.searchParams, method = this.request.method;
    const parts = path.split('/').filter(Boolean).slice(1);
    if (parts[0] === 'reviews') {
      if (method === 'GET' && parts.length <= 2) {
        const reviews = this.s.reviews.filter(r => r.status === 'approved' && (!q.get('product_id') || r.product_id === q.get('product_id')));
        if (parts.length === 2) { const r = reviews.find(r => r.id === parts[1]); if (!r) fail('Avaliação não encontrada', 'not_found', 404); return result({ review: publicReview(r) }); }
        return result({ reviews: reviews.slice().reverse().map(publicReview) });
      }
      if (method === 'POST' && parts.length === 1) {
        const c = await this.customer(true), o = this.s.orders.find(o => o.id === b.order_id && o.customer_id === c.id);
        if (!o || !['paid', 'packing', 'shipped', 'delivered'].includes(o.status) || !o.items.some(i => i.product_id === b.product_id)) fail('Selecione uma compra paga deste produto', 'purchase_required', 403);
        if (this.s.reviews.some(r => r.order_id === o.id && r.product_id === b.product_id)) fail('Este produto já foi avaliado neste pedido', 'invalid_review');
        if (typeof b.rating !== 'number' || !Number.isInteger(b.rating) || b.rating < 1 || b.rating > 5) fail('Avaliação deve ser de 1 a 5 estrelas', 'invalid_review');
        const review = { id: uid('rev'), product_id: b.product_id, order_id: o.id, rating: b.rating, comment: text(b.comment, 'Comentário', 0, 1000), name: text(b.name, 'Nome', 0, 60) || 'Cliente anônimo', status: 'pending', created_at: now(), updated_at: now() };
        this.s.reviews.push(review);
        return result({ review, message: 'Avaliação enviada! Será publicada após aprovação.' }, 201);
      }
      fail('Rota não encontrada', 'not_found', 404);
    }
    if (path === '/api/health' && method === 'GET') return result({ ok: true, service: 'mamyat', version: '0.2.0', time: now(), storage: 'postgres', payment: mpEnabled(this.env) ? 'mercadopago' : 'demo', mail: this.mailEnabled() ? 'resend' : 'disabled', captcha: this.env.TURNSTILE_SITE_KEY ? 'turnstile' : 'disabled', hosting: 'cloudflare-free+supabase-free' });
    if (path === '/api/webhooks/mercadopago' && method === 'POST') return this.mercadoWebhook(b, q);
    if (path === '/api/config' && method === 'GET') return result(this.config());
    if (path.startsWith('/api/betterauth/')) return result({ enabled: false, providers: [], providers_configured: [] });
    if (parts[0] === 'products' && method === 'GET') { let rows = this.s.products.filter(p => p.active).map(p => this.product(p)); if (parts.length === 2) { const p = rows.find(p => p.slug === parts[1] || p.id === parts[1]); if (!p) fail('Produto não encontrado', 'not_found', 404); return result({ product: p, related: rows.filter(x => x.id !== p.id && x.category === p.category).slice(0, 4), review_stats: this.reviewStats(p.id) }); } if (q.get('category')) rows = rows.filter(p => p.category === q.get('category')); if (q.get('q')) rows = rows.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(q.get('q').toLowerCase())); if (['1', 'true'].includes(q.get('featured'))) rows = rows.filter(p => p.featured); return result({ products: rows, categories: this.categories() }); }
    if (path === '/api/cart/quote' && method === 'POST') return result(this.quote(b));
    if (path === '/api/orders' && method === 'POST') {
      await this.gate(b, 'checkout'); const c = await this.customer(), addressEmail = email(b.email || c?.email), key = text(b.idempotency_key, 'Chave do pedido', 8, 128);
      const previous = this.s.orders.find(o => o.idempotency_key === key); if (previous) { if (previous.email !== addressEmail) fail('Chave de pedido já utilizada', 'idempotency_conflict', 409); return result(this.publicOrder(previous), 201); }
      const quote = this.quote(b); if (!quote.ok) fail(quote.problems.join('; '), 'invalid_cart');
      const name = text(b.name || c?.name, 'Nome', 2, 100), tel = phone(b.phone), tax = cpf(b.cpf), a = b.address || {};
      let shipping = { method: quote.shipping_method, notes: text(a.notes, 'Observações', 0, 500) };
      if (quote.shipping_method === 'delivery') { const cep = digits(a.cep); if (cep.length !== 8) fail('CEP inválido'); shipping = { ...shipping, cep, street: text(a.street, 'Endereço', 3, 120), number: text(a.number, 'Número', 1, 20), district: text(a.district, 'Bairro', 2, 80), city: text(a.city, 'Cidade', 2, 80), state: text(a.state, 'Estado', 2, 2).toUpperCase(), complement: text(a.complement, 'Complemento', 0, 80) }; if (!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(shipping.state)) fail('Estado inválido'); } else shipping.pickup_address = this.s.settings.pickup_address;
      let n = this.s.orders.length + 1001; while (this.s.orders.some(o => o.number === `MA-${n}`)) n++; const number = `MA-${n}`, date = now();
      const o = { id: uid('ord'), number, customer_id: c?.id || '', idempotency_key: key, name, email: addressEmail, phone: tel, cpf: tax, items: quote.items, subtotal_minor: quote.subtotal_minor, shipping_minor: quote.shipping_minor, discount_minor: quote.discount_minor, total_minor: quote.total_minor, coupon: quote.coupon, shipping_method: quote.shipping_method, shipping, status: 'awaiting_payment', created_at: date, paid_at: null, shipped_at: null, tracking_code: '', history: [{ status: 'awaiting_payment', at: date }], payment: { provider: 'demo', status: 'pending', amount_minor: quote.total_minor, environment: 'demonstração', qr_code: '', qr_base64: '', notice: 'Pedido de demonstração. Nenhum pagamento real será cobrado.' } };
      this.s.orders.push(o); this.s.reservations[number] = { order_id: number, created_at: date, expires_at: Date.now() / 1000 + 1800, items: quote.items }; if (mpEnabled(this.env)) await this.checkout(o); return result(this.publicOrder(o), 201);
    }
    if (parts[0] === 'orders') {
      if (parts.length === 1 && method === 'GET') { const c = await this.customer(true); return result({ orders: this.s.orders.filter(o => o.customer_id === c.id).map(o => this.publicOrder(o)).reverse() }); }
      if (parts[1] === 'lookup') { const number = b.number || q.get('number'), address = email(b.email || q.get('email')), o = this.s.orders.find(o => o.number === number && o.email === address); if (!o) fail('Pedido não encontrado', 'not_found', 404); return result(this.publicOrder(o)); }
      const o = this.order(parts[1]); await this.authorizeOrder(o, b, q);
      if (method === 'GET') return result(this.publicOrder(o));
      if (method === 'POST' && parts[2] === 'payment-status') { await this.checkMercadoPayment(o, b.payment_id); return result(this.publicOrder(o)); }
      if (method === 'POST' && parts[2] === 'cancel') { if (o.status !== 'awaiting_payment' || o.payment.review_required) fail('Este pedido não pode ser cancelado'); this.transition(o, 'cancelled'); return result(this.publicOrder(o)); }
      if (method === 'POST' && parts[2] === 'pay') { if (mpEnabled(this.env)) await this.checkout(o); return result(this.publicOrder(o)); }
    }
    if (path === '/api/auth/signup' && method === 'POST') { await this.gate(b, 'signup'); const { c } = await this.createCustomer(b); return result(await this.session(c, !!b.remember), 201); }
    if (path === '/api/auth/login' && method === 'POST') { await this.gate(b, 'login'); const identifier = String(b.identifier || b.email || b.username || '').trim().toLowerCase(), c = this.s.customers.find(c => c.email === identifier || c.username === identifier); const target = c?.password_hash || this.s.admins[0]?.password_hash; const encoded = await hashPassword(String(b.password || '').slice(0, 128), target); if (!c || c.active === false || !equal(encoded, c.password_hash)) fail('Usuário ou senha inválidos', 'invalid_credentials', 401); return result(await this.session(c, !!b.remember)); }
    if (path === '/api/auth/logout' && method === 'POST') { const token = this.request.headers.get('X-Customer-Token'); if (token) delete this.s.customer_sessions[await sha(token)]; return result({ ok: true }); }
    if (path === '/api/auth/me') { const c = await this.customer(true); if (method === 'PATCH') { Object.assign(c, this.identity({ ...c, ...b }, c)); c.marketing = !!(b.marketing ?? c.marketing); c.updated_at = now(); } return result({ customer: publicCustomer(c) }); }
    if (path === '/api/auth/password' && method === 'POST') { const c = await this.customer(true); if (!equal(await hashPassword(String(b.current_password || ''), c.password_hash), c.password_hash)) fail('Senha atual inválida'); c.password_hash = await hashPassword(password(b.new_password || b.password)); this.revokeCustomer(c); return result({ ok: true, ...(await this.session(c, true)) }); }
    if (path === '/api/auth/password/request' && method === 'POST') { await this.gate(b, 'reset'); return this.requestReset(email(b.email)); }
    if (path === '/api/auth/password/reset' && method === 'POST') {
      const digest = await sha(text(b.token, 'Token', 10, 200));
      const reset = this.s.password_resets.find(r => equal(r.hash, digest) && r.expires > Date.now() / 1000);
      const c = reset && this.s.customers.find(c => c.id === reset.customer_id && c.active !== false);
      if (!c) fail('Link inválido ou expirado. Fale com o ateliê.', 'invalid_reset');
      c.password_hash = await hashPassword(password(b.password)); this.revokeCustomer(c);
      this.s.password_resets = this.s.password_resets.filter(r => r.customer_id !== c.id);
      return result(await this.session(c, true));
    }
    if (parts[0] === 'cep' && method === 'GET') { const cep = digits(parts[1]); if (cep.length !== 8) fail('CEP inválido'); const response = await this.fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) }); const a = await response.json(); if (a.erro) fail('CEP não encontrado', 'not_found', 404); return result({ cep, street: a.logradouro, district: a.bairro, city: a.localidade, state: a.uf }); }
    if (path === '/api/contact' && method === 'POST') { await this.gate(b, 'contact'); this.s.contacts.push({ id: uid('msg'), name: text(b.name, 'Nome', 2, 100), email: email(b.email), message: text(b.message, 'Mensagem', 5, 5000), created_at: now() }); return result({ ok: true, message: 'Mensagem recebida pelo ateliê.' }, 201); }
    if (parts[0] === 'admin') return this.admin(parts.slice(1), method, b, q);
    if (path === '/api/webhooks/asaas') fail('Pagamentos reais ainda não estão habilitados', 'payments_disabled', 503);
    fail('Rota não encontrada', 'not_found', 404);
  }
  async admin(parts, method, b, q) {
    if (parts[0] === 'login' && method === 'POST') { const a = this.s.admins.find(a => a.username === String(b.username || '').toLowerCase()), target = a?.password_hash || this.s.admins[0]?.password_hash, encoded = await hashPassword(String(b.password || '').slice(0, 128), target); if (!a || !equal(encoded, a.password_hash)) fail('Usuário ou senha inválidos', 'invalid_credentials', 401); const token = uid('as'); this.s.admin_sessions[await sha(token)] = { admin_id: a.id, expires_at: Date.now() / 1000 + 43200 }; return result({ token, admin: publicAdmin(a), default_password: !!a.must_change_password, must_change_password: !!a.must_change_password }); }
    const token = this.request.headers.get('X-Admin-Token') || (this.request.headers.get('Authorization') || '').replace(/^Bearer /i, ''), key = token ? await sha(token) : '', session = this.s.admin_sessions[key], a = session && session.expires_at > Date.now() / 1000 ? this.s.admins.find(a => a.id === session.admin_id) : null;
    if (!a) fail('Entre novamente no painel', 'unauthorized', 401);
    const ownAccountAction = parts[0] === 'logout' || (parts[0] === 'password' && method === 'POST');
    if (method !== 'GET' && a.role !== 'admin' && !ownAccountAction) fail('Acesso somente para leitura', 'forbidden', 403);
    const kind = parts[0], id = parts[1];
    if (kind === 'reviews') {
      if (!id && method === 'GET') return result({ reviews: this.s.reviews.slice().reverse().map(r => ({ ...r, product_name: this.s.products.find(p => p.id === r.product_id)?.name || 'Produto indisponível' })) });
      const review = this.s.reviews.find(r => r.id === id);
      if (!review) fail('Avaliação não encontrada', 'not_found', 404);
      if (parts.length === 2 && method === 'DELETE') { this.s.reviews = this.s.reviews.filter(r => r.id !== id); return result({ ok: true }); }
      if (parts.length === 3 && method === 'POST' && ['approve', 'reject'].includes(parts[2])) { review.status = parts[2] === 'approve' ? 'approved' : 'rejected'; review.updated_at = now(); return result({ review }); }
      fail('Rota não encontrada', 'not_found', 404);
    }
    if (kind === 'me') return result({ admin: publicAdmin(a) });
    if (kind === 'logout') { delete this.s.admin_sessions[key]; return result({ ok: true }); }
    if (kind === 'password' && method === 'POST') { if (!equal(await hashPassword(String(b.current_password || ''), a.password_hash), a.password_hash)) fail('Senha atual inválida'); a.password_hash = await hashPassword(password(b.new_password || b.password)); a.must_change_password = false; for (const [k, v] of Object.entries(this.s.admin_sessions)) if (v.admin_id === a.id && k !== key) delete this.s.admin_sessions[k]; return result({ ok: true }); }
    if (kind === 'dashboard' && method === 'GET') { const paid = this.s.orders.filter(o => ['paid', 'packing', 'shipped', 'delivered'].includes(o.status)), revenue = paid.reduce((n, o) => n + o.total_minor, 0), by_status = Object.fromEntries(Object.keys(labels).map(s => [s, this.s.orders.filter(o => o.status === s).length])); const low_stock = this.s.products.filter(p => p.active).flatMap(p => p.variants.filter(v => !p.made_to_order && v.stock <= 3).map(v => ({ product_id: p.id, product: p.name, slug: p.slug, variant: v.name, sku: v.sku, stock: v.stock }))); const top = new Map(); for (const o of paid) for (const i of o.items) { const v = top.get(i.product_id) || { name: i.name, qty: 0, revenue_minor: 0 }; v.qty += i.qty; v.revenue_minor += i.line_total_minor; top.set(i.product_id, v); } return result({ payment_mode: mpEnabled(this.env) ? 'mercadopago' : 'demo', revenue_minor: revenue, revenue: brl(revenue), orders: this.s.orders.length, paid_orders: paid.length, average_ticket_minor: paid.length ? Math.round(revenue / paid.length) : 0, customers: this.s.customers.length, awaiting: by_status.awaiting_payment, by_status, low_stock, top_products: [...top.values()].sort((a, b) => b.qty - a.qty), recent_orders: this.s.orders.slice(-8).reverse().map(o => this.publicOrder(o)), default_admin: !!a.must_change_password }); }
    if (kind === 'contacts' && method === 'GET') return result({ contacts: this.s.contacts.slice().reverse() });
    if (kind === 'settings') { if (method === 'PATCH') { const s = this.s.settings; for (const [key, value] of Object.entries(b)) { if (!(key in s)) continue; if (['shipping_flat_minor', 'free_shipping_minor'].includes(key)) s[key] = integer(value, key); else if (key === 'pickup_enabled') s[key] = !!value; else if (key === 'coupons') { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Cupons inválidos'); for (const c of Object.values(value)) { const n = Number(String(c.value).replace(',', '.')); if (!Number.isFinite(n) || n < 0 || !['fixed', 'percent'].includes(c.type) || c.type === 'percent' && n > 100) fail('Cupom inválido'); } s[key] = value; } else if (key === 'categories') { if (!Array.isArray(value) || !value.length || this.s.products.some(p => !value.includes(p.category))) fail('Há produtos nas categorias removidas'); s[key] = [...new Set(value.map(v => text(v, 'Categoria', 2, 40)))]; } else s[key] = text(value, key, 0, 300); } } return result({ settings: this.s.settings, defaults: this.s.settings, payment_mode: mpEnabled(this.env) ? 'mercadopago' : 'demo' }); }
    if (kind === 'categories') { const names = this.s.settings.categories; if (method === 'POST') { const name = text(b.name, 'Categoria', 2, 40); if (names.some(n => n.toLowerCase() === name.toLowerCase())) fail('Essa categoria já existe'); names.push(name); } if (id && ['PATCH', 'DELETE'].includes(method)) { const index = names.indexOf(id); if (index < 0) fail('Categoria não encontrada', 'not_found', 404); if (method === 'DELETE') { if (names.length === 1 || this.s.products.some(p => p.category === id)) fail('Há produtos nessa categoria', 'category_in_use'); names.splice(index, 1); } else { const name = text(b.name, 'Categoria', 2, 40); if (names.some((n, i) => i !== index && n.toLowerCase() === name.toLowerCase())) fail('Essa categoria já existe'); names[index] = name; for (const p of this.s.products) if (p.category === id) p.category = name; } } return result({ categories: this.categories() }, method === 'POST' ? 201 : 200); }
    if (kind === 'products') { if (!id && method === 'GET') return result({ products: this.s.products.map(p => this.product(p)), categories: this.categories(), media: !!(this.env.SUPABASE_URL && this.env.SUPABASE_SERVICE_ROLE_KEY) }); let p = id ? this.s.products.find(p => p.id === id) : null; if (id && !p) fail('Produto não encontrado', 'not_found', 404); if (method === 'DELETE') { p.active = false; return result({ product: this.product(p) }); } if (['PATCH', 'POST'].includes(method)) { const old = p || {}, name = text(b.name ?? old.name, 'Nome', 2, 120), slug = text(b.slug || old.slug || name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 'Endereço', 2, 120); if (!/^[a-z0-9-]+$/.test(slug) || this.s.products.some(x => x.id !== p?.id && x.slug === slug)) fail('Endereço já usado ou inválido'); const category = b.category ?? old.category; if (!this.s.settings.categories.includes(category)) fail('Categoria inválida'); const variants = b.variants ?? old.variants; if (!Array.isArray(variants) || !variants.length || variants.length > 50) fail('Adicione uma variação'); const clean = variants.map((v, i) => ({ id: text(v.id || `var-${i + 1}`, 'Variação', 1, 80), name: text(v.name, 'Variação', 1, 80), sku: text(v.sku, 'SKU', 0, 80), stock: integer(v.stock ?? 0, 'Estoque', 0, 99999) })); if (new Set(clean.map(v => v.id)).size !== clean.length) fail('Variações duplicadas'); const images = b.images ?? old.images ?? []; if (!Array.isArray(images) || images.length > 6 || images.some(x => typeof x !== 'string' || !/^(https:\/\/|\/(?!\/))/.test(x))) fail('Use até 6 imagens HTTPS ou arquivos da loja'); const price = b.price_minor !== undefined ? integer(b.price_minor, 'Preço', 1) : b.price !== undefined ? integer(Math.round(Number(String(b.price).replace(',', '.')) * 100), 'Preço', 1) : old.price_minor; if (!price) fail('Preço inválido'); const next = { ...old, id: old.id || uid('prd'), name, slug, category, price_minor: price, compare_at_minor: b.compare_at_minor === undefined ? old.compare_at_minor || null : b.compare_at_minor ? integer(b.compare_at_minor, 'Preço anterior', 1) : null, description: text(b.description ?? old.description, 'Descrição', 0, 6000), details: b.details ?? old.details ?? [], images, variants: clean, active: b.active ?? old.active ?? true, featured: b.featured ?? old.featured ?? false, made_to_order: b.made_to_order ?? old.made_to_order ?? false, production_days: integer(b.production_days ?? old.production_days ?? 0, 'Prazo', 0, 365), created_at: old.created_at || now(), updated_at: now() }; if (p) Object.assign(p, next); else { p = next; this.s.products.push(p); } return result({ product: this.product(p) }, method === 'POST' ? 201 : 200); } }
    if (kind === 'orders') { if (!id) { let rows = this.s.orders; if (q.get('status')) rows = rows.filter(o => o.status === q.get('status')); if (q.get('q')) rows = rows.filter(o => `${o.number} ${o.name} ${o.email}`.toLowerCase().includes(q.get('q').toLowerCase())); return result({ orders: rows.slice().reverse().map(o => this.publicOrder(o)) }); } const o = this.order(id); let changed = false; if (method === 'POST' && parts[2] === 'paid') { if (o.payment.provider !== 'demo') fail('Payment confirmation requires the provider', 'provider_required', 403); changed = this.paid(o); } if (method === 'POST' && parts[2] === 'status') this.transition(o, b.status, b.tracking_code); return result({ order: this.publicOrder(o), changed }); }
    if (kind === 'customers') {
      if (!id && method === 'POST') { const { c, temporary } = await this.createCustomer(b, true); return result({ customer: publicCustomer(c), temporary_password: temporary }, 201); }
      if (!id) { let rows = this.s.customers; if (q.get('q')) rows = rows.filter(c => `${c.name} ${c.email} ${c.username} ${c.phone}`.toLowerCase().includes(q.get('q').toLowerCase())); if (q.get('status') === 'active') rows = rows.filter(c => c.active); if (q.get('status') === 'blocked') rows = rows.filter(c => !c.active); return result({ customers: rows.slice().reverse().map(publicCustomer) }); }
      const c = this.s.customers.find(c => c.id === id); if (!c) fail('Cliente não encontrado', 'not_found', 404);
      if (method === 'PATCH') { const previous = c.active; Object.assign(c, this.identity({ ...c, ...b }, c)); c.active = b.active ?? c.active; c.marketing = b.marketing ?? c.marketing; c.updated_at = now(); if (previous && !c.active) this.revokeCustomer(c); }
      if (method === 'DELETE') { this.revokeCustomer(c); Object.assign(c, { name: 'Cliente removido', username: `removido_${c.id.slice(-8)}`, email: `${c.id}@deleted.invalid`, cpf: '', phone: '', password_hash: '', active: false, deleted_at: now(), marketing: false }); }
      if (method === 'POST' && parts[2] === 'reset') return this.requestReset(c.email);
      const orders = this.s.orders.filter(o => o.customer_id === c.id), paid = orders.filter(o => ['paid', 'packing', 'shipped', 'delivered'].includes(o.status)), spent = paid.reduce((n, o) => n + o.total_minor, 0);
      return result({ deleted: method === 'DELETE', customer: publicCustomer(c), orders: orders.map(o => this.publicOrder(o)), stats: { orders: orders.length, paid: paid.length, spent_minor: spent, spent: brl(spent) } });
    }
    fail('Rota não encontrada', 'not_found', 404);
  }
}

export function createHandler(sql, env, fetcher = fetch) {
  return async request => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!env.SHOP_ORIGIN_SECRET || !equal(request.headers.get('X-Shop-Origin-Secret'), env.SHOP_ORIGIN_SECRET)) return new Response(JSON.stringify({ error: 'Acesso não autorizado', code: 'unauthorized' }), { status: 401, headers });
    const route = request.headers.get('X-Shop-Path');
    if (route) { if (!route.startsWith('/api/') || route.startsWith('//')) return new Response('{}', { status: 400, headers }); request = new Request(new URL(route, 'https://shop.internal'), request); }
    try {
      // Media uploads are authenticated here and written straight to Storage:
      // they must not hold the commerce advisory lock while bytes move.
      if (request.method === 'POST' && new URL(request.url).pathname === '/api/admin/media') {
        const answer = await uploadMedia(sql, env, request, fetcher);
        return new Response(JSON.stringify(answer.body), { status: answer.status, headers });
      }
      let body = {};
      if (!['GET', 'HEAD'].includes(request.method)) { const raw = await request.text(); if (enc.encode(raw).length > 1000000) fail('Corpo grande demais', 'too_large', 413); try { body = raw ? JSON.parse(raw) : {}; } catch { fail('JSON inválido', 'bad_json'); } if (!body || Array.isArray(body) || typeof body !== 'object') fail('JSON inválido', 'bad_json'); }
      const answer = await sql.begin(async tx => {
        await tx`select pg_advisory_xact_lock(740021)`;
        const rows = await tx`select collection, payload from public.mamyat_documents order by collection for update`;
        const state = structuredClone(Object.fromEntries(rows.map(r => [r.collection, r.payload])));
        const shop = new Shop(state, env, request, fetcher);
        shop.rate();
        const original = structuredClone(state);
        let response;
        try { response = await shop.route(body); } catch (error) { if (!(error instanceof ApiError)) throw error; shop.s = original; response = result({ error: error.message, code: error.code }, error.status); }
        for (const [collection, payload] of Object.entries(shop.s)) { const previous = rows.find(r => r.collection === collection); if (previous && JSON.stringify(previous.payload) === JSON.stringify(payload)) continue; await tx`insert into public.mamyat_documents (collection, payload) values (${collection}, ${tx.json(payload)}) on conflict (collection) do update set payload = excluded.payload, updated_at = now()`; }
        return { ...response, messages: response.status < 400 ? shop.messages : [] };
      });
      for (const message of answer.messages) {
        try {
          const response = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': message.id }, body: JSON.stringify({ from: env.MAIL_FROM, to: [message.to], subject: message.subject, text: message.text }), signal: AbortSignal.timeout(10000), redirect: 'error' });
          if (!response.ok) throw new Error('Mail rejected');
        } catch { if (message.required) fail('Não foi possível enviar o email agora. Fale com o ateliê.', 'mail_unavailable', 503); console.error('shop-api email delivery failed'); }
      }
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers });
    } catch (error) { if (error instanceof ApiError) return new Response(JSON.stringify({ error: error.message, code: error.code }), { status: error.status, headers }); console.error('shop-api request failed', error?.name || 'Error'); return new Response(JSON.stringify({ error: 'Algo deu errado; tente de novo', code: 'internal' }), { status: 500, headers }); }
  };
}
