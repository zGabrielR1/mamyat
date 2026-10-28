"""Review purchase authorization, moderation privacy and storage regressions."""
import os
import json
import threading
import tempfile
import unittest
import urllib.request
import urllib.error
from types import SimpleNamespace

from api.app import App, ApiError
from api.reviews import Reviews, ReviewError, validate_review
from api.store import JsonStore
from api.server import build_server


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.app = App.__new__(App)
        self.app.reviews = Reviews(JsonStore(os.path.join(self.tmp.name, 'reviews.json'), []))
        self.app.catalog = SimpleNamespace(all=lambda **kwargs: [{'id': 'product1', 'name': 'Bolsa teste'}])
        self.order = {'id': 'order1', 'customer_id': 'buyer', 'status': 'paid',
                      'items': [{'product_id': 'product1'}]}
        self.app.orders = SimpleNamespace(for_customer=lambda cid: [self.order] if cid == 'buyer' else [])
        self.payload = {'order_id': 'order1', 'product_id': 'product1', 'rating': 5}

    def test_purchase_authorization(self):
        for customer, payload in [({}, self.payload), ({'id': 'other'}, self.payload),
                                  ({'id': 'buyer'}, {**self.payload, 'order_id': 'temp'}),
                                  ({'id': 'buyer'}, {**self.payload, 'product_id': 'other'})]:
            with self.subTest(customer=customer, payload=payload), self.assertRaises(ApiError):
                self.app.create_review(payload, customer=customer)
        for status in ['awaiting_payment', 'cancelled', 'refunded']:
            self.order['status'] = status
            with self.subTest(status=status), self.assertRaises(ApiError):
                self.app.create_review(self.payload, customer={'id': 'buyer'})
        self.assertEqual(self.app.reviews.all(status=''), [])

    def test_moderation_privacy_duplicate_and_delete(self):
        row = self.app.create_review({**self.payload, 'status': 'approved'}, customer={'id': 'buyer'})['review']
        self.assertEqual(row['status'], 'pending')
        self.assertEqual(row['name'], 'Cliente anônimo')
        self.assertEqual(self.app.list_reviews()['reviews'], [])
        with self.assertRaises(ApiError):
            self.app.get_review(row['id'])
        with self.assertRaises(ApiError):
            self.app.create_review(self.payload, customer={'id': 'buyer'})
        self.app.approve_review(row['id'])
        public = self.app.get_review(row['id'])['review']
        self.assertNotIn('order_id', public)
        self.assertNotIn('status', public)
        self.assertEqual(self.app.reviews.product_stats('product1')['average'], 5)
        self.app.reject_review(row['id'])
        self.assertEqual(self.app.list_reviews()['reviews'], [])
        self.assertTrue(self.app.delete_review(row['id'])['ok'])
        with self.assertRaises(ApiError):
            self.app.delete_review(row['id'])

    def test_strict_rating_and_length(self):
        for rating in [True, 1.5, '5', None, 0, 6]:
            with self.subTest(rating=rating), self.assertRaises(ReviewError):
                validate_review({**self.payload, 'rating': rating})
        with self.assertRaises(ApiError):
            self.app.create_review({**self.payload, 'comment': 'x' * 1001}, customer={'id': 'buyer'})

    def test_http_routes_and_viewer_permissions(self):
        self.app.accounts = SimpleNamespace(
            authenticate=lambda token: {'id': 'buyer'} if token == 'customer' else None,
            admin_for_token=lambda token: {'id': token, 'role': token} if token in {'admin', 'viewer'} else None)
        server = build_server(self.app, '127.0.0.1', 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def call(path, method='GET', payload=None, headers=None):
            req = urllib.request.Request(
                f'http://127.0.0.1:{server.server_port}{path}', method=method,
                data=json.dumps(payload).encode() if payload is not None else None,
                headers={'Content-Type': 'application/json', **(headers or {})})
            try:
                response = urllib.request.urlopen(req, timeout=5)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                return response.status, json.load(response)
        try:
            self.assertEqual(call('/api/reviews', 'POST', self.payload)[0], 401)
            code, body = call('/api/reviews', 'POST', self.payload, {'X-Customer-Token': 'customer'})
            self.assertEqual(code, 201)
            rid = body['review']['id']
            self.assertEqual(call(f'/api/reviews/{rid}')[0], 404)
            self.assertEqual(call('/api/admin/reviews')[0], 401)
            self.assertEqual(call('/api/admin/reviews', headers={'X-Admin-Token': 'viewer'})[0], 200)
            self.assertEqual(call(f'/api/admin/reviews/{rid}/approve', 'POST', {}, {'X-Admin-Token': 'viewer'})[0], 403)
            self.assertEqual(call(f'/api/admin/reviews/{rid}/approve', 'POST', {}, {'X-Admin-Token': 'admin'})[0], 200)
            self.assertEqual(len(call('/api/reviews?product_id=product1')[1]['reviews']), 1)
            self.assertEqual(call('/api/reviews?product_id=other')[1]['reviews'], [])
            self.assertEqual(call(f'/api/reviews/{rid}/reject')[0], 404)
            self.assertEqual(call(f'/api/admin/reviews/{rid}', 'DELETE', headers={'X-Admin-Token': 'viewer'})[0], 403)
            self.assertEqual(call(f'/api/admin/reviews/{rid}', 'DELETE', headers={'X-Admin-Token': 'admin'})[0], 200)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
