"""Run the whole shop locally: API + Better Auth sidecar + Next dev server.

    python scripts/dev.py                  # http://localhost:3000
    python scripts/dev.py --no-web         # API only
    python scripts/dev.py --api-port 8081  # avoid a busy port

One terminal, one Ctrl+C. Output from each process is prefixed so it stays
readable. Optional services stay optional: with no credentials the API runs on
JSON stores, demo Pix, console email and a disabled Turnstile gate, and the
sidecar reports itself unconfigured instead of failing the stack.

The first run needs `cd web && npm ci` (and `cd auth-server && npm ci` for
social login). Nothing is installed automatically: a dev runner that mutates
node_modules under you is worse than a clear message.
"""
from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def _npm() -> str:
    for name in ("npm.cmd", "npm"):
        found = shutil.which(name)
        if found:
            return found
    return "npm"


def _port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _stream(prefix: str, process: subprocess.Popen) -> None:
    assert process.stdout is not None
    for line in process.stdout:
        print(f"[{prefix}] {line.rstrip()}", flush=True)


def _spawn(label: str, command: list[str], env: dict[str, str],
           cwd: str = ROOT) -> subprocess.Popen:
    print(f"[dev] {label}: {' '.join(command)}")
    process = subprocess.Popen(
        command, cwd=cwd, env=env, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, bufsize=1,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    threading.Thread(target=_stream, args=(label, process), daemon=True).start()
    return process


def _stop(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        # npm.cmd -> node -> next: terminate() on the wrapper leaves orphans
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       capture_output=True)
        return
    process.terminate()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-port", type=int,
                        default=int(os.environ.get("API_PORT", "8080")))
    parser.add_argument("--web-port", type=int,
                        default=int(os.environ.get("WEB_PORT", "3000")))
    parser.add_argument("--no-web", action="store_true",
                        help="start only the API (and the auth sidecar)")
    parser.add_argument("--no-auth", action="store_true",
                        help="skip the Better Auth sidecar")
    parser.add_argument("--open", action="store_true",
                        help="open the storefront in a browser")
    args = parser.parse_args(argv)

    for port, label in ((args.api_port, "API"), (args.web_port, "web")):
        if not args.no_web or label == "API":
            if not _port_free(port):
                print(f"[dev] port {port} ({label}) is already in use; "
                      f"stop it or pass a different --{label.lower()}-port",
                      file=sys.stderr)
                return 1

    env = dict(os.environ)
    env["HOST"] = "127.0.0.1"
    env["PORT"] = str(args.api_port)
    env["DATA_DIR"] = env.get("DATA_DIR") or os.path.join("data", "runtime")
    env["BETTER_AUTH_INTERNAL_URL"] = env.get(
        "BETTER_AUTH_INTERNAL_URL", "http://127.0.0.1:3100")
    env["BETTER_AUTH_INTERNAL_PORT"] = env.get("BETTER_AUTH_INTERNAL_PORT", "3100")
    env["BACKEND_URL"] = f"http://127.0.0.1:{args.api_port}"

    processes: list[subprocess.Popen] = []
    try:
        if not args.no_auth:
            if os.path.isdir(os.path.join(ROOT, "auth-server", "node_modules")):
                processes.append(_spawn(
                    "auth", [shutil.which("node") or "node",
                             os.path.join("auth-server", "server.mjs")], env))
            else:
                print("[dev] auth sidecar skipped: "
                      "cd auth-server && npm ci (social login stays off)")

        processes.append(_spawn(
            "api", [sys.executable, "-m", "api.server", "--host", "127.0.0.1",
                    "--port", str(args.api_port)], env))

        if not args.no_web:
            if not os.path.isdir(os.path.join(ROOT, "web", "node_modules")):
                print("[dev] web skipped: cd web && npm ci", file=sys.stderr)
                for process in processes:
                    _stop(process)
                return 1
            processes.append(_spawn(
                "web", [_npm(), "run", "dev", "--", "-p", str(args.web_port)],
                env, cwd=os.path.join(ROOT, "web")))

        print()
        print("  Mamy Ateliê — desenvolvimento")
        print(f"  loja     http://localhost:{args.web_port}")
        print(f"  painel   http://localhost:{args.web_port}/admin")
        print(f"  API      http://127.0.0.1:{args.api_port}/api/health")
        print("  senha do painel: data/runtime/admin_initial_password.txt "
              "(ou ADMIN_PASSWORD)")
        print("  Ctrl+C encerra tudo")
        print()

        if args.open and not args.no_web:
            webbrowser.open(f"http://localhost:{args.web_port}")

        while True:
            for process in processes:
                code = process.poll()
                if code is not None:
                    print(f"[dev] a process exited ({code}); stopping the rest")
                    return code or 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[dev] encerrando")
        return 0
    finally:
        for process in processes:
            _stop(process)


if __name__ == "__main__":
    raise SystemExit(main())
