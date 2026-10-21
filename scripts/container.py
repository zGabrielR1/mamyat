"""Supervise the three container processes; restart together on any failure."""
import os
import signal
import subprocess
import time


def main():
    children = []
    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        children.append(subprocess.Popen(["python3", "-m", "api.server"]))
        children.append(subprocess.Popen(["node", "auth-server/server.mjs"]))
        children.append(subprocess.Popen(["node", "web/server.js"], env={
            **os.environ, "PORT": "3000", "HOSTNAME": "0.0.0.0"}))
        while not stopping:
            if any(child.poll() is not None for child in children):
                return 1
            time.sleep(0.25)
        return 0
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == "__main__":
    raise SystemExit(main())
