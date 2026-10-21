"""Production boundaries: persistent sessions, real mail and captcha policy."""
import os
import tempfile
import unittest

from api.configuration import validate_production
from api.sessions import CustomerSessions, SessionRegistry
from api.store import JsonStore
from foundry.mail import Message, resolve_mailer
from foundry.turnstile import SiteverifyVerifier


class ProductionTests(unittest.TestCase):
    def settings(self):
        return {
            "APP_ENV": "production", "DATABASE_URL": "postgresql://user:pass@db.test/postgres?sslmode=require",
            "CUSTOMER_SESSION_SECRET": "s" * 48, "ADMIN_PASSWORD": "SafePassword123!",
            "RESEND_API_KEY": "re_test", "MAIL_FROM": "oi@mamyatelie.com",
            "TURNSTILE_SITE_KEY": "0xsite", "TURNSTILE_SECRET_KEY": "0xsecret",
            "TURNSTILE_HOSTNAMES": "mamyatelie.com,www.mamyatelie.com",
            "PUBLIC_BASE_URL": "https://mamyatelie.com",
        }

    def test_production_requires_every_service(self):
        validate_production(self.settings())
        for key in self.settings():
            if key == "APP_ENV":
                continue
            with self.subTest(key=key):
                env = self.settings()
                env.pop(key)
                with self.assertRaises(ValueError):
                    validate_production(env)

    def test_demo_and_insecure_settings_refused_in_production(self):
        for key, value in (("TURNSTILE_SITE_KEY", "1x00000000000000000000AA"),
                           ("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA"),
                           ("CUSTOMER_SESSION_SECRET", "short"),
                           ("ADMIN_PASSWORD", "short123"),
                           ("PUBLIC_BASE_URL", "http://mamyatelie.com"),
                           ("TURNSTILE_HOSTNAMES", "another.test"),
                           ("DATABASE_URL", "sqlite:///local.db")):
            with self.subTest(key=key):
                with self.assertRaises(ValueError):
                    validate_production({**self.settings(), key: value})

    def test_local_development_still_needs_no_credentials(self):
        validate_production({})

    def test_shared_session_store_survives_registry_restart_and_revocation(self):
        with tempfile.TemporaryDirectory() as tmp:
            def registry():
                return SessionRegistry(os.path.join(tmp, "unused.json"),
                    store=JsonStore(os.path.join(tmp, "shared.json"), {}))
            sessions = CustomerSessions("stable-key")
            session = sessions.verify(sessions.issue("customer-1"))
            first = registry()
            first.record(session)
            restarted = registry()
            self.assertTrue(restarted.alive(session))
            self.assertTrue(restarted.revoke(session.session_id))
            self.assertFalse(first.alive(session))
            self.assertFalse(os.path.exists(os.path.join(tmp, "unused.json")))

    def test_resend_sender_and_idempotency_reach_provider(self):
        mailer = resolve_mailer(env={"RESEND_API_KEY": "re_test", "MAIL_FROM": "oi@mamyatelie.com"})
        calls = []
        def transport(method, url, headers, body, timeout):
            import json
            calls.append((url, headers, json.loads(body)))
            return {"id": "email-1"}
        mailer._transport = transport
        result = mailer.send(Message(to="person@gmail.com", subject="Olá", text="Pedido recebido"), idempotency_key="order:1")
        self.assertEqual(result.id, "email-1")
        self.assertEqual(calls[0][0], "https://api.resend.com/emails")
        self.assertEqual(calls[0][1]["Idempotency-Key"], "order:1")
        self.assertEqual(calls[0][2]["from"], "oi@mamyatelie.com")

    def test_turnstile_rejects_wrong_host_or_action(self):
        from foundry.turnstile import TurnstileError
        for hostname, action in (("attacker.test", "signup"), ("mamyatelie.com", "checkout")):
            verifier = SiteverifyVerifier("secret", hostnames=("mamyatelie.com",),
                transport=lambda *_: {"success": True, "hostname": hostname, "action": action})
            with self.assertRaises(TurnstileError):
                verifier.verify("token", action="signup")


if __name__ == "__main__":
    unittest.main()
