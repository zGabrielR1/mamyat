// Checkout Pro uses server totals and verifies payments against the provider API.
const enc = new TextEncoder();
export const enabled = env => !!env.MERCADOPAGO_ACCESS_TOKEN;
export async function notificationToken(env, order) {
  if (!env.MERCADOPAGO_NOTIFICATION_SECRET) throw new Error('Missing notification secret');
  const key = await crypto.subtle.importKey('raw', enc.encode(env.MERCADOPAGO_NOTIFICATION_SECRET), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(order.id))), x => x.toString(16).padStart(2,'0')).join('');
}
export async function mpCall(env, fetcher, path, body) {
  const response = await fetcher('https://api.mercadopago.com' + path, {
    method: body ? 'POST' : 'GET', headers: {Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`, 'Content-Type':'application/json'},
    ...(body ? {body: JSON.stringify(body)} : {}), redirect:'error', signal:AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Mercado Pago unavailable (${response.status})`);
  return response.json();
}
export async function createCheckout(env, fetcher, order, expires) {
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:') throw new Error('Checkout requires HTTPS');
  const back = new URL(`/pedido/${order.number}`, base).href;
  const notification = new URL('/api/webhooks/mercadopago', base);
  notification.searchParams.set('order', order.number);
  notification.searchParams.set('token', await notificationToken(env, order));
  const expiration = new Date(expires * 1000).toISOString();
  const raw = await mpCall(env, fetcher, '/checkout/preferences', {
    items:[{id:order.id, title:`Pedido ${order.number} - Mamy Ateliê`, quantity:1, currency_id:'BRL', unit_price:order.total_minor / 100}],
    payer:{name:order.name, email:order.email}, external_reference:order.id,
    metadata:{order_id:order.id}, notification_url:notification.href,
    back_urls:{success:back, pending:back, failure:back}, auto_return:'approved',
    expires:true, expiration_date_to:expiration,
    payment_methods:{excluded_payment_types:[{id:'ticket'},{id:'atm'}]},
    statement_descriptor:'MAMY ATELIE'
  });
  const checkout = new URL(raw.init_point);
  if (!raw.id || checkout.protocol !== 'https:' || !['www.mercadopago.com.br','www.mercadopago.com'].includes(checkout.hostname)) throw new Error('Invalid checkout response');
  return {provider:'mercadopago', provider_ref:String(raw.id), status:'pending', amount_minor:order.total_minor, invoice_url:checkout.href, checkout_url:checkout.href, expires_at:expiration, environment:'produção'};
}
export function matchesPayment(payment, order) {
  const amount = /^(\d+)(?:\.(\d{1,2})0*)?$/.exec(String(payment.transaction_amount));
  const minor = amount ? Number(amount[1]) * 100 + Number((amount[2] || '').padEnd(2, '0')) : NaN;
  return payment.external_reference === order.id && payment.currency_id === 'BRL'
    && payment.live_mode === true && Number.isSafeInteger(minor) && minor === order.total_minor
    && payment.metadata?.order_id === order.id;
}
