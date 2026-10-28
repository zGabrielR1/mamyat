import assert from 'node:assert/strict';
import { Shop, ApiError, sha } from '../supabase/functions/shop-api/core.mjs';

const state = {
  orders: [{ id: 'order1', customer_id: 'buyer', status: 'paid', items: [{ product_id: 'product1' }] }],
  customers: [{ id: 'buyer', active: true }],
  customer_sessions: { [await sha('customer-token')]: { customer: 'buyer', epoch: 0, expires: Date.now() / 1000 + 3600 } },
  admins: [{ id: 'admin1', role: 'admin' }, { id: 'viewer1', role: 'viewer' }],
  admin_sessions: {
    [await sha('admin-token')]: { admin_id: 'admin1', expires_at: Date.now() / 1000 + 3600 },
    [await sha('viewer-token')]: { admin_id: 'viewer1', expires_at: Date.now() / 1000 + 3600 },
  },
};
const call = (path, method = 'GET', body = {}, token = '', admin = false) => new Shop(state, {}, new Request(`https://shop.invalid${path}`, { method, headers: token ? { [admin ? 'X-Admin-Token' : 'X-Customer-Token']: token } : {} })).route(body);
const payload = { order_id: 'order1', product_id: 'product1', rating: 5, status: 'approved' };
const rejected = (fn, status) => assert.rejects(fn, e => e instanceof ApiError && e.status === status);
await rejected(() => call('/api/reviews', 'POST', payload), 401);
await rejected(() => call('/api/reviews', 'POST', { ...payload, order_id: 'temp' }, 'customer-token'), 403);
await rejected(() => call('/api/reviews', 'POST', { ...payload, product_id: 'other' }, 'customer-token'), 403);
for (const status of ['awaiting_payment', 'cancelled', 'refunded']) {
  state.orders[0].status = status;
  await rejected(() => call('/api/reviews', 'POST', payload, 'customer-token'), 403);
}
state.orders[0].status = 'paid';
for (const rating of [true, '5', 1.5, 0, 6]) await rejected(() => call('/api/reviews', 'POST', { ...payload, rating }, 'customer-token'), 400);
await rejected(() => call('/api/reviews', 'POST', { ...payload, comment: 'x'.repeat(1001) }, 'customer-token'), 400);
const created = await call('/api/reviews', 'POST', payload, 'customer-token'), id = created.body.review.id;
assert.equal(created.status, 201);
assert.equal(created.body.review.status, 'pending');
assert.equal(created.body.review.name, 'Cliente anônimo');
assert.deepEqual((await call('/api/reviews')).body.reviews, []);
await rejected(() => call(`/api/reviews/${id}`), 404);
await rejected(() => call('/api/reviews', 'POST', payload, 'customer-token'), 400);
for (const token of ['', 'viewer-token']) await rejected(() => call(`/api/admin/reviews/${id}/approve`, 'POST', {}, token, true), token ? 403 : 401);
await call(`/api/admin/reviews/${id}/approve`, 'POST', {}, 'admin-token', true);
const published = (await call(`/api/reviews/${id}`)).body.review;
assert.equal(published.rating, 5);
assert.equal('order_id' in published, false);
assert.equal('status' in published, false);
await rejected(() => call(`/api/reviews/${id}/reject`), 404);
await call(`/api/admin/reviews/${id}/reject`, 'POST', {}, 'admin-token', true);
assert.deepEqual((await call('/api/reviews')).body.reviews, []);
await call(`/api/admin/reviews/${id}`, 'DELETE', {}, 'admin-token', true);
assert.equal(state.reviews.length, 0);
console.log('Review checks passed: purchase authorization, validation, moderation, privacy, viewer guards, duplicate prevention and deletion.');

// Product detail statistics must match the Python API and moderation visibility.
state.products = [{ id: 'product1', slug: 'bolsa', active: true, variants: [], price_minor: 1000 }];
const emptyStats = { count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
assert.deepEqual((await call('/api/products/bolsa')).body.review_stats, emptyStats);
state.reviews = [
  { id: 'a', product_id: 'product1', status: 'approved', rating: 5 },
  { id: 'b', product_id: 'product1', status: 'approved', rating: 2 },
  { id: 'c', product_id: 'product1', status: 'approved', rating: 3 },
  { id: 'pending', product_id: 'product1', status: 'pending', rating: 1 },
  { id: 'rejected', product_id: 'product1', status: 'rejected', rating: 1 },
  { id: 'other', product_id: 'other', status: 'approved', rating: 1 },
];
assert.deepEqual((await call('/api/products/product1')).body.review_stats,
  { count: 3, average: 3.3, distribution: { 1: 0, 2: 1, 3: 1, 4: 0, 5: 1 } });
await call('/api/admin/reviews/a/reject', 'POST', {}, 'admin-token', true);
assert.equal((await call('/api/products/bolsa')).body.review_stats.count, 2);
await call('/api/admin/reviews/a/approve', 'POST', {}, 'admin-token', true);
assert.equal((await call('/api/products/bolsa')).body.review_stats.count, 3);
await call('/api/admin/reviews/a', 'DELETE', {}, 'admin-token', true);
assert.equal((await call('/api/products/bolsa')).body.review_stats.average, 2.5);
console.log('Product review statistics passed: empty, rounded average, distribution, product scope and moderation transitions.');
