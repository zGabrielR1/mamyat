"""Same-origin proxy from the Python host to the loopback Better Auth server.

The browser never talks to Node directly: Vercel and local development send
`/api/betterauth/*` to this process, which forwards the request to
`127.0.0.1:3100`. Keeping the hop on loopback means Better Auth needs no
public port, no CORS and no second TLS terminator.
"""
from __future__ import annotations

import http.client
from urllib.parse import urlsplit

from .app import ApiError

DEFAULT_URL = "http://127.0.0.1:3100"

# Hop-by-hop and framing headers are rebuilt by each HTTP client.
SKIP_REQUEST = frozenset({
    "host", "connection", "keep-alive", "proxy-authenticate",
    "proxy-authorization", "te", "trailers", "transfer-encoding",
    "upgrade", "content-length",
})
SKIP_RESPONSE = frozenset({
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length",
})


class BetterAuthProxy:
    """A thin, fixed-target HTTP forwarder."""

    def __init__(self, base_url: str = DEFAULT_URL, *, timeout: float = 15.0) -> None:
        parsed = urlsplit(base_url.rstrip("/"))
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("BETTER_AUTH_INTERNAL_URL must be http(s)")
        self.scheme = parsed.scheme
        self.host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or (443 if self.scheme == "https" else 80)
        self.timeout = timeout

    def forward(self, method: str, target: str, headers: dict[str, str],
                body: bytes, *, client_ip: str = "") -> tuple[int, list[tuple[str, str]], bytes]:
        connection_class = (http.client.HTTPSConnection if self.scheme == "https"
                            else http.client.HTTPConnection)
        connection = connection_class(self.host, self.port, timeout=self.timeout)
        outgoing: dict[str, str] = {}
        for key, value in headers.items():
            if key.lower() in SKIP_REQUEST:
                continue
            outgoing[key] = value
        original_host = headers.get("Host") or headers.get("host") or ""
        outgoing.setdefault("x-forwarded-host", original_host)
        if "x-forwarded-proto" not in {key.lower() for key in outgoing}:
            local = original_host.split(":")[0] in {"localhost", "127.0.0.1"}
            outgoing["x-forwarded-proto"] = "http" if local else "https"
        if client_ip and not any(key.lower() == "x-forwarded-for" for key in outgoing):
            outgoing["x-forwarded-for"] = client_ip
        outgoing["accept-encoding"] = "identity"

        try:
            connection.request(method, target, body=body or None, headers=outgoing)
            response = connection.getresponse()
            payload = response.read()
            answer_headers = [
                (key, value) for key, value in response.getheaders()
                if key.lower() not in SKIP_RESPONSE
            ]
            return response.status, answer_headers, payload
        except (OSError, http.client.HTTPException) as exc:
            raise ApiError(
                503,
                "login social indisponível no momento; tente pelo email",
                "betterauth_unavailable",
            ) from exc
        finally:
            connection.close()
