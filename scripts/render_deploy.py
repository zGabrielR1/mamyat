"""Create (or update) the Render service and deploy it, without a browser.

    # credentials: environment first, then two files in your home directory
    #   ~/.render_api_key   one line, the key (dashboard > Account > API Keys)
    #   ~/.render_repo      one line, the repository URL
    python scripts/render_deploy.py --check      # is the tree deployable?
    python scripts/render_deploy.py --url-only   # where is it, if it exists?
    python scripts/render_deploy.py              # create/update, deploy, watch

`render.yaml` is the contract; this script sends the same settings explicitly
so it also works where a Blueprint is not picked up.

The environment is **merged** by default: variables that live only in the
dashboard survive, while values from the local gitignored `.env*` files are
applied. Pass `--replace-env` only for a deliberate reset. A setting absent
everywhere is not sent at all — an unconfigured rail stays unconfigured
instead of half-configured.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
sys.path.insert(0, ROOT)

from foundry.envfile import load_env  # noqa: E402

API = "https://api.render.com/v1"
SERVICE_NAME = "mamyat"

# Mirrors render.yaml. Kept here so the script and the Blueprint cannot drift.
SERVICE = {
    "type": "web_service",
    "name": SERVICE_NAME,
    "runtime": "docker",
    "plan": "free",
    "dockerfilePath": "./Dockerfile",
    "branch": "main",
    "healthCheckPath": "/api/health",
    "numInstances": 1,
}
BUILD = {
    "serviceDetails": {
        "runtime": "docker",
        "plan": "free",
        "healthCheckPath": "/api/health",
        "numInstances": 1,
        "envSpecificDetails": {
            "dockerfilePath": "./Dockerfile",
            "dockerContext": ".",
        },
    },
}

BASE_ENV = [
    {"key": "HOST", "value": "0.0.0.0"},
    {"key": "DATA_DIR", "value": "/data"},
    {"key": "BETTER_AUTH_INTERNAL_PORT", "value": "3100"},
    {"key": "BETTER_AUTH_INTERNAL_URL", "value": "http://127.0.0.1:3100"},
]

# (env file, keys) — anything set in the real environment wins over the file.
RAILS = [
    (".env", ["PUBLIC_BASE_URL", "CORS_ORIGINS", "ADMIN_USERNAME",
              "ADMIN_PASSWORD", "CUSTOMER_SESSION_SECRET", "DATABASE_URL"]),
    (".env.asaas", ["ASAAS_API_KEY", "ASAAS_CUSTOMER_ID",
                    "ASAAS_WEBHOOK_SECRET", "ASAAS_BASE_URL"]),
    (".env.resend", ["RESEND_API_KEY", "MAIL_FROM", "MAIL_FROM_NAME"]),
    (".env.turnstile", ["TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY",
                        "TURNSTILE_HOSTNAMES"]),
    (".env.supabase", ["DATABASE_URL"]),
    (".env.betterauth", ["BETTER_AUTH_URL", "BETTER_AUTH_TRUSTED_ORIGINS",
                         "BETTER_AUTH_APP_NAME", "BETTER_AUTH_SECRET",
                         "BETTER_AUTH_BRIDGE_SECRET",
                         "BETTER_AUTH_BRIDGE_URL", "GOOGLE_CLIENT_ID",
                         "GOOGLE_CLIENT_SECRET", "FACEBOOK_CLIENT_ID",
                         "FACEBOOK_CLIENT_SECRET", "APPLE_CLIENT_ID",
                         "APPLE_TEAM_ID", "APPLE_KEY_ID",
                         "APPLE_PRIVATE_KEY"]),
]

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


class RenderError(RuntimeError):
    pass


def _call(path: str, key: str, payload=None, method: str = "GET"):
    request = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json",
                 "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        hint = ""
        if exc.code in (401, 403):
            hint = (" — check dashboard > Account > API Keys; the key must be "
                    "able to see this account")
        raise RenderError(f"{exc.code} {exc.reason}{hint}\n  {detail}") from exc
    except urllib.error.URLError as exc:
        raise RenderError(f"cannot reach {API}: {exc.reason}") from exc
    except ValueError as exc:
        raise RenderError(f"unreadable answer from {path}: {exc}") from exc


def entity(answer, *names: str) -> dict:
    if isinstance(answer, list):
        for item in answer:
            found = entity(item, *names)
            if found:
                return found
        return {}
    if not isinstance(answer, dict):
        return {}
    for name in names:
        found = answer.get(name)
        if isinstance(found, dict) and found:
            return found
    return answer if ("id" in answer or "name" in answer) else {}


def entities(answer, *names: str) -> list[dict]:
    items = answer if isinstance(answer, list) else [answer]
    out: list[dict] = []
    for item in items:
        if isinstance(item, list):
            out.extend(entities(item, *names))
            continue
        found = entity(item, *names)
        if found:
            out.append(found)
    return out


def cursor_of(answer) -> str:
    items = answer if isinstance(answer, list) else [answer]
    for item in items:
        if isinstance(item, dict) and item.get("cursor"):
            return item["cursor"]
    return ""


def read_credential(name: str, env_name: str) -> str:
    value = os.environ.get(env_name, "").strip()
    if value:
        return value
    path = os.path.join(os.path.expanduser("~"), name)
    if not os.path.isfile(path):
        return ""
    with open(path, "r", encoding="utf-8-sig") as handle:
        for line in handle:
            line = line.strip()
            if line and not line.startswith("#"):
                return line
    return ""


def repo_url() -> str:
    value = read_credential(".render_repo", "RENDER_REPO")
    if value:
        return value
    try:
        result = subprocess.run(["git", "remote", "get-url", "origin"],
                                capture_output=True, text=True, timeout=10)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def rails_env() -> list[dict]:
    """Only the keys that have a value somewhere, environment winning."""
    out: dict[str, str] = {}
    for name, keys in RAILS:
        values = load_env(os.path.join(ROOT, name))
        for key in keys:
            if not values.get(key):
                continue
            out[key] = values[key]
    for key in list(out):
        if os.environ.get(key, "").strip():
            out[key] = os.environ[key].strip()
    return [{"key": key, "value": value} for key, value in out.items()]


def wanted_env() -> list[dict]:
    merged = {row["key"]: row["value"] for row in BASE_ENV}
    merged.update({row["key"]: row["value"] for row in rails_env()})
    return [{"key": key, "value": value} for key, value in merged.items()]


def find_service(key: str, repo: str = "") -> dict | None:
    cursor = ""
    named = None
    while True:
        page = _call("/services?limit=100" + (f"&cursor={cursor}" if cursor else ""),
                     key)
        for service in entities(page, "service"):
            if repo and (service.get("repo") or "").rstrip("/").lower() == \
                    repo.rstrip("/").lower():
                return service
            if service.get("name") == SERVICE_NAME:
                named = service
        cursor = cursor_of(page)
        if not cursor:
            return named


def find_owner(key: str) -> dict:
    owners = entities(_call("/owners", key), "owner")
    if not owners:
        raise RenderError("this key cannot see any account")
    personal = [row for row in owners if row.get("type") == "user"]
    return personal[0] if personal else owners[0]


def get_env_vars(service_id: str, key: str) -> list[dict]:
    answer = _call(f"/services/{service_id}/env-vars", key)
    rows = answer.get("envVars") if isinstance(answer, dict) else answer
    out = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        env = row.get("envVar") if isinstance(row.get("envVar"), dict) else row
        name = str(env.get("key") or "").strip()
        if name:
            out.append({"key": name, "value": env.get("value", "")})
    return out


def merge_env(current: list[dict], wanted: list[dict]) -> list[dict]:
    merged = {row["key"]: row.get("value", "") for row in current}
    merged.update({row["key"]: row.get("value", "") for row in wanted})
    return [{"key": key, "value": value} for key, value in merged.items()]


def deploy(service_id: str, key: str) -> str:
    try:
        _call(f"/services/{service_id}/deploys", key,
              {"clearCache": "do_not_clear"}, "POST")
    except RenderError:
        pass  # the deploy still started; only the answer was unreadable
    page = _call(f"/services/{service_id}/deploys?limit=1", key)
    started = entities(page, "deploy")
    if not started:
        raise RenderError("Render accepted the deploy but reported none")
    deploy_id = started[0].get("id", "")
    trigger_at = started[0].get("createdAt", "")
    print(f"deploy {deploy_id}: building…")
    seen = ""
    for _ in range(180):  # ~30 min at 10 s
        time.sleep(10)
        status = entity(_call(f"/services/{service_id}/deploys/{deploy_id}", key),
                        "deploy")
        state = f"{status.get('status')} " \
                f"{(status.get('commit') or {}).get('shortHash', '')}".strip()
        if state != seen:
            print(" ", state)
            seen = state
        if status.get("status") in ("live", "build_failed", "update_failed",
                                    "canceled"):
            if status.get("status") != "live":
                print_build_failure(service_id, key, trigger_at)
            return status.get("status", "")
    raise RenderError("the deploy did not finish within 30 minutes")


def print_build_failure(service_id: str, key: str, since: str) -> None:
    try:
        owners = entities(_call("/owners", key), "owner")
        if not owners:
            return
        path = (f"/logs?ownerId={owners[0]['id']}&startTime={since}"
                f"&endTime={time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}"
                f"&limit=400&direction=forward&resource={service_id}")
        entries = _call(path, key).get("logs", [])
    except (RenderError, KeyError, IndexError):
        return
    print("build log (tail):")
    for entry in entries[-40:]:
        text = ANSI.sub("", entry.get("message", "")).rstrip()
        if text:
            print("  ", text)


def check() -> int:
    """Is the tree deployable? Needs nothing but the files themselves."""
    fail = []
    required = ["Dockerfile", "render.yaml", "requirements.txt",
                "api/server.py", "auth-server/server.mjs",
                "auth-server/package-lock.json", "data/seed/products.json"]
    for path in required:
        if not os.path.isfile(path):
            fail.append(f"missing {path}")
    if os.path.isfile("Dockerfile"):
        text = open("Dockerfile", encoding="utf-8").read()
        for token in ("python3 -m api.server", "auth-server/server.mjs",
                      "api/", "foundry/", "data/"):
            if token not in text:
                fail.append(f"Dockerfile is missing {token!r}")
    if os.path.isfile("render.yaml"):
        text = open("render.yaml", encoding="utf-8").read()
        for token in ("healthCheckPath: /api/health", "runtime: docker",
                      "dockerfilePath: ./Dockerfile"):
            if token not in text:
                fail.append(f"render.yaml is missing {token!r}")
    for name in (".env", ".env.local", ".env.asaas", ".env.resend",
                 ".env.turnstile", ".env.supabase", ".env.betterauth"):
        if os.path.isfile(name):
            print(f"note: {name} will be carried to Render (it is gitignored)")
    if fail:
        print("deploy check: FAILED")
        for item in fail:
            print("  ", item)
        return 1
    print("deploy check: OK — the tree builds an image that runs api.server "
          "and the auth sidecar")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--url-only", action="store_true")
    parser.add_argument("--replace-env", action="store_true")
    args = parser.parse_args(argv)

    if args.check:
        return check()

    key = read_credential(".render_api_key", "RENDER_API_KEY")
    if not key:
        print("deploy needs RENDER_API_KEY (or ~/.render_api_key). "
              "Run --check first; it needs no credentials.", file=sys.stderr)
        return 2
    repo = repo_url()
    if not repo:
        print("deploy needs a repository: set RENDER_REPO or ~/.render_repo, "
              "or add a git remote.", file=sys.stderr)
        return 2

    try:
        service = find_service(key, repo) or find_service(key)
        if args.url_only:
            print(service.get("serviceDetails", {}).get("url", "") if service
                  else "no service found")
            return 0
        if service:
            service_id = service["id"]
            print(f"service {service.get('name')} ({service_id})")
            _call(f"/services/{service_id}", key, BUILD, "PATCH")
        else:
            owner = find_owner(key)
            body = {**SERVICE, **BUILD, "repo": repo, "ownerID": owner["id"]}
            created = entity(_call("/services", key, body, "POST"), "service")
            service_id = created["id"]
            print(f"created service {created.get('name')} ({service_id})")

        current = [] if args.replace_env else get_env_vars(service_id, key)
        env = merge_env(current, wanted_env())
        _call(f"/services/{service_id}/env-vars", key, env, "PUT")
        print(f"environment: {len(env)} variables "
              f"({'replaced' if args.replace_env else 'merged'})")

        state = deploy(service_id, key)
        if state != "live":
            print(f"deploy finished as {state}", file=sys.stderr)
            return 1
        print("deploy is live")
        return 0
    except RenderError as exc:
        print(f"deploy failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
