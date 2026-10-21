"""Fail closed when an ephemeral production host lacks persistent services."""
from urllib.parse import urlparse


def validate_production(env: dict[str, str]) -> None:
    if env.get("APP_ENV", "").lower() != "production":
        return
    required = ("DATABASE_URL", "CUSTOMER_SESSION_SECRET", "ADMIN_PASSWORD",
                "RESEND_API_KEY", "MAIL_FROM", "TURNSTILE_SITE_KEY",
                "TURNSTILE_SECRET_KEY", "TURNSTILE_HOSTNAMES", "PUBLIC_BASE_URL")
    missing = [key for key in required if not env.get(key, "").strip()]
    if missing:
        raise ValueError("Production settings missing: " + ", ".join(missing))
    if len(env["CUSTOMER_SESSION_SECRET"]) < 32:
        raise ValueError("CUSTOMER_SESSION_SECRET must have at least 32 characters")
    password = env["ADMIN_PASSWORD"]
    if len(password) < 12 or not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        raise ValueError("ADMIN_PASSWORD needs 12+ characters, a letter and a digit")
    url = urlparse(env["PUBLIC_BASE_URL"])
    if url.scheme != "https" or not url.hostname or url.path not in ("", "/") or url.query or url.fragment:
        raise ValueError("PUBLIC_BASE_URL must be an HTTPS origin")
    allowed = {host.strip().lower() for host in env["TURNSTILE_HOSTNAMES"].split(",")}
    if url.hostname not in allowed:
        raise ValueError("TURNSTILE_HOSTNAMES must include the public hostname")
    # Cloudflare's dummy keys must never protect a public shop.
    if env["TURNSTILE_SITE_KEY"].startswith(("1x", "2x", "3x")) or env["TURNSTILE_SECRET_KEY"].startswith(("1x", "2x", "3x")):
        raise ValueError("Turnstile test keys are forbidden in production")
    database = env["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://", 1)
    parsed = urlparse(database)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise ValueError("DATABASE_URL must be a Postgres connection URL")
