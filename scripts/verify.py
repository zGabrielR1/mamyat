"""Preflight for mamyat: structure, syntax, vendored-kit contract, links, tests.

Exit contract: 0 = OK, 1 = FAILED. Nothing here needs credentials, so it is
safe to run before a deploy and in CI.

Checks, in the order they fail:

1. every file the project promises to ship exists;
2. every Python source compiles (in memory, so the tree stays clean);
3. nothing under ``foundry/`` imports a third-party module;
4. the checked-in JSON parses;
5. every relative Markdown link resolves;
6. the backend suite passes;
7. the frontend typechecks (skipped when ``node_modules`` is absent).

The storefront is deployed by Vercel, so this does not require a ``web/.next``
build; it typechecks the sources instead.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SKIP_DIRS = {"node_modules", "__pycache__", ".next", "out", ".git", ".venv",
             ".tmp", "data/runtime"}
FAIL: list[str] = []

REQUIRED = [
    "README.md", "AGENTS.md", "ARCHITECTURE.md", "PROGRESS.md", "CURRENTTASK",
    "Makefile", "requirements.txt", "Dockerfile", "render.yaml", ".env.example",
    ".gitignore", ".dockerignore",
    "docs/deploy.md", "docs/oauth.md", "docs/mail.md", "docs/turnstile.md",
    "docs/asaas.md", "docs/supabase.md", "docs/needed-from-owner.md",
    "docs/admin.md",
    "decisions/0001-python-stdlib-backend.md",
    "decisions/0004-signed-customer-sessions.md",
    "decisions/0007-jsonb-collections.md",
    "decisions/0008-betterauth-sidecar.md",
    "api/__init__.py", "api/app.py", "api/server.py", "api/store.py",
    "api/db.py", "api/models.py", "api/orders.py", "api/catalog.py",
    "api/accounts.py", "api/sessions.py", "api/asaas.py", "api/money.py",
    "api/validation.py", "api/betterauth_proxy.py", "api/tests/test_app.py",
    "foundry/__init__.py", "foundry/envfile.py", "foundry/deploy.py",
    "foundry/mail/__init__.py", "foundry/mail/mailer.py",
    "foundry/turnstile/__init__.py", "foundry/turnstile/verifier.py",
    "foundry/auth/__init__.py", "foundry/auth/password.py",
    "foundry/betterauth/__init__.py", "foundry/betterauth/bridge.py",
    "auth-server/auth.mjs", "auth-server/server.mjs",
    "auth-server/package.json", "auth-server/package-lock.json",
    "supabase/migrations/20261020000000_mamyat.sql",
    "data/seed/products.json",
    "scripts/verify.py", "scripts/smoke.py", "scripts/render_deploy.py",
    "scripts/dev.py",
    "web/package.json", "web/next.config.ts", "web/components.json",
    "web/lib/api.ts", "web/lib/types.ts", "web/lib/utils.ts",
    "web/components/providers.tsx", "web/components/site-shell.tsx",
    "web/components/admin/admin-shell.tsx",
    "web/components/admin/category-manager.tsx",
    "web/app/layout.tsx", "web/app/(site)/page.tsx", "web/app/admin/page.tsx",
    "web/app/(site)/loja/page.tsx", "web/app/(site)/checkout/page.tsx",
    "web/app/(site)/conta/page.tsx", "web/app/admin/pedidos/page.tsx",
    "web/app/admin/produtos/page.tsx", "web/app/admin/categorias/page.tsx",
    "web/app/admin/configuracoes/page.tsx",
    "web/app/admin/clientes/page.tsx", "web/app/admin/contatos/page.tsx",
]


def walk(root: str = "."):
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        yield base, dirs, files


def check_required() -> None:
    for path in REQUIRED:
        if not os.path.isfile(path):
            FAIL.append(f"missing {path}")


def check_python() -> None:
    for base, _dirs, files in walk():
        for name in files:
            if not name.endswith(".py"):
                continue
            path = os.path.join(base, name)
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    compile(handle.read(), path, "exec")
            except (SyntaxError, ValueError) as exc:
                FAIL.append(f"py_compile failed: {path}: {exc}")


def check_foundry_stdlib() -> None:
    """The vendored kit is the shared floor: stdlib only, by contract."""
    for base, _dirs, files in walk("foundry"):
        for name in files:
            if not name.endswith(".py"):
                continue
            path = os.path.join(base, name)
            with open(path, "r", encoding="utf-8") as handle:
                for lineno, line in enumerate(handle, 1):
                    stripped = line.strip()
                    if not stripped.startswith(("import ", "from ")):
                        continue
                    parts = stripped.split()
                    if len(parts) < 2 or parts[1].startswith("."):
                        continue
                    module = parts[1].split(".")[0]
                    if module in {"foundry", "__future__"}:
                        continue
                    if module not in sys.stdlib_module_names:
                        FAIL.append(
                            f"non-stdlib import in {path}:{lineno}: {stripped}")


def check_json() -> None:
    for path in ("data/seed/products.json", "web/package.json",
                 "web/tsconfig.json", "web/components.json",
                 "auth-server/package.json"):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                json.load(handle)
        except (OSError, ValueError) as exc:
            FAIL.append(f"invalid JSON: {path}: {exc}")


def check_links() -> None:
    link = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for base, _dirs, files in walk():
        for name in files:
            if not name.endswith(".md"):
                continue
            path = os.path.join(base, name)
            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                for lineno, line in enumerate(handle, 1):
                    for target in link.findall(line):
                        target = target.split("#", 1)[0].strip()
                        if not target or "://" in target or target.startswith(
                                ("mailto:", "tel:")):
                            continue
                        resolved = os.path.normpath(
                            os.path.join(os.path.dirname(path), target))
                        if not os.path.exists(resolved):
                            FAIL.append(
                                f"broken link in {path}:{lineno}: {target}")


def check_contract() -> None:
    """A few invariants the deploy depends on, asserted rather than assumed."""
    dockerfile = open("Dockerfile", encoding="utf-8").read()
    if "api.server" not in dockerfile:
        FAIL.append("Dockerfile does not start api.server")
    if "auth-server/server.mjs" not in dockerfile:
        FAIL.append("Dockerfile does not start the Better Auth sidecar")
    if "python3 -m api.server" not in dockerfile:
        FAIL.append("Dockerfile must run the backend as a module")

    render = open("render.yaml", encoding="utf-8").read()
    for token in ("healthCheckPath: /api/health", "runtime: docker",
                  "dockerfilePath: ./Dockerfile", "HOST"):
        if token not in render:
            FAIL.append(f"render.yaml is missing {token!r}")

    example = open(".env.example", encoding="utf-8").read()
    for key in ("ASAAS_API_KEY", "TURNSTILE_SECRET_KEY", "RESEND_API_KEY",
                "DATABASE_URL", "BETTER_AUTH_BRIDGE_SECRET"):
        if key not in example:
            FAIL.append(f".env.example is missing {key}")


def run_tests() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", "api/tests"],
        cwd=ROOT)
    if result.returncode != 0:
        FAIL.append("api tests failed")


def run_typecheck() -> None:
    if not os.path.isdir(os.path.join("web", "node_modules")):
        print("typecheck skipped: web/node_modules is absent (npm ci)")
        return
    npm = "npm.cmd" if os.name == "nt" else "npm"
    result = subprocess.run([npm, "run", "typecheck"], cwd=os.path.join(ROOT, "web"))
    if result.returncode != 0:
        FAIL.append("frontend typecheck failed")


def main() -> int:
    check_required()
    check_python()
    check_foundry_stdlib()
    check_json()
    check_links()
    check_contract()

    if FAIL:
        print("mamyat verify: FAILED")
        for item in FAIL:
            print("  ", item)
        return 1
    print("mamyat verify: structure OK, sources compile, kit is stdlib-only, "
          "links resolve")

    run_tests()
    run_typecheck()
    if FAIL:
        print("mamyat verify: FAILED")
        for item in FAIL:
            print("  ", item)
        return 1
    print("mamyat verify: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
