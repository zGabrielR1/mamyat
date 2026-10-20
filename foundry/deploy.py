# VENDORED from foundry 0.1.0 — do not edit; regenerate with scripts/vendor.py
"""Stamp a deploy manifest for a host from a checked-in template.

Every service built on this kit starts from the same three things the operator
already proved: a container that builds its own frontend, one process on one
port, and a health endpoint the host polls. What changes between services is
only *names* and *numbers* — the service name, the port, the health path,
which secrets are carried. So the manifests live here as templates with those
few tokens, and `stamp` fills them in.

    python -m foundry.deploy render --set SERVICE=candibet --set PORT=8080 \\
        --health /api/health --out .

A token that is left unfilled is an error, not a literal `{{SERVICE}}` shipped
to a host — the template always either produces a working manifest or nothing.

The templates are deliberately close to what is running today (`render.yaml`
and `fly.toml` in the operator are the working ancestors of these files). The
third host, Vercel, cannot run a stateful money backend at all, and its README
says so rather than pretending otherwise: Vercel hosts the frontend and the
stateless edge functions, and the ledger stays on Render or Fly.
"""
from __future__ import annotations

import argparse
import os
import re
import sys

from . import MODULES  # noqa: F401  (kept for the vendored-module check in tests)

TOKEN = re.compile(r"\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}")

# The tokens each host's template expects, with the value used when a caller
# does not supply one. This is also the doc: it is what `--help` prints.
HOSTS: dict[str, dict] = {
    "render": {
        "tokens": {
            "SERVICE": "my-service",
            "PORT": "8080",
            "HEALTH_PATH": "/api/health",
            "PLAN": "free",
            "REGION": "",
            "DOCKERFILE": "./Dockerfile",
        },
    },
    "fly": {
        "tokens": {
            "SERVICE": "my-service",
            "PORT": "8080",
            "HEALTH_PATH": "/api/health",
            "REGION": "gru",
            "VOLUME": "data",
            "VOLUME_PATH": "/data",
        },
    },
    "vercel": {
        "tokens": {
            "SERVICE": "my-service",
            "HEALTH_PATH": "/api/health",
            "FRAMEWORK": "nextjs",
        },
    },
}


def template_root(start: str = "") -> str:
    """Where the templates live, found relative to this file.

    Works from a checkout and from a vendored copy (the deploy templates are
    not vendored, so a host that only vendored modules falls back to its own
    directory and `stamp` simply reports there is nothing to stamp).
    """
    here = os.path.dirname(os.path.abspath(start or __file__))
    return os.path.join(here, os.pardir, "templates", "deploy")


def available(root: str = "") -> list[str]:
    base = template_root(root)
    if not os.path.isdir(base):
        return []
    return sorted(name for name in os.listdir(base)
                  if os.path.isdir(os.path.join(base, name)))


def fill(text: str, values: dict) -> str:
    """Substitute `{{TOKEN}}`. A missing token raises — never a literal."""
    def swap(match: re.Match) -> str:
        key = match.group(1)
        if key not in values:
            raise KeyError(f"no value for template token {{{{{key}}}}}")
        return str(values[key])
    return TOKEN.sub(swap, text)


def stamp(host: str, *, values: dict | None = None, out_dir: str = ".",
          root: str = "") -> list[str]:
    """Render every `<host>/*.tmpl` into `out_dir`, dropping the `.tmpl` suffix.

    Returns the paths written, so a caller (or a test) can assert on them.
    """
    if host not in HOSTS:
        raise KeyError(f"unknown host {host!r}; known: {', '.join(sorted(HOSTS))}")
    base = os.path.join(template_root(root), host)
    if not os.path.isdir(base):
        raise FileNotFoundError(f"no templates for {host!r} under {base}")
    merged = dict(HOSTS[host]["tokens"])
    merged.update(values or {})
    written: list[str] = []
    for name in sorted(os.listdir(base)):
        if not name.endswith(".tmpl"):
            continue
        with open(os.path.join(base, name), "r", encoding="utf-8") as handle:
            rendered = fill(handle.read(), merged)
        target = os.path.join(out_dir, name[: -len(".tmpl")])
        os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
        with open(target, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(rendered)
        written.append(target)
    return written


def normalize_values(pairs: list[str], health: str = "", port: str = "") -> dict:
    """Turn `--set KEY=VALUE` plus the two conveniences into a values dict."""
    values: dict = {}
    for pair in pairs or []:
        if "=" not in str(pair):
            raise ValueError(f"--set needs KEY=VALUE, got {pair!r}")
        key, _, value = str(pair).partition("=")
        key = key.strip().upper()
        if not key:
            raise ValueError(f"--set needs KEY=VALUE, got {pair!r}")
        values[key] = value.strip()
    if health:
        values["HEALTH_PATH"] = health
    if port:
        values["PORT"] = str(port)
    return values


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m foundry.deploy",
                                     description=__doc__)
    parser.add_argument("host", choices=sorted(HOSTS),
                        help="which deploy target to stamp")
    parser.add_argument("--set", action="append", metavar="KEY=VALUE",
                        default=[], help="fill a template token (repeatable)")
    parser.add_argument("--health", default="", help="health check path")
    parser.add_argument("--port", default="", help="container port")
    parser.add_argument("--out", default=".", help="directory to write into")
    parser.add_argument("--list", action="store_true",
                        help="show the tokens this host accepts and exit")
    args = parser.parse_args(argv)

    if args.list:
        for name, meta in sorted(HOSTS[args.host]["tokens"].items()):
            print(f"{name:12} default {meta!r}")
        return 0
    values = normalize_values(args.set, args.health, args.port)
    try:
        written = stamp(args.host, values=values, out_dir=args.out)
    except (KeyError, ValueError, FileNotFoundError) as exc:
        print(f"stamp failed: {exc}", file=sys.stderr)
        return 1
    for path in written:
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
