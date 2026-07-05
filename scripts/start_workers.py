#!/usr/bin/env python3
"""Start multiple rq workers for parallel downloads."""
import os
import sys
import signal
import subprocess
import time

WORKERS = 5
REDIS_URL = "redis://localhost:6379/0"
QUEUE = "spotdl-downloads"

workers = []

def shutdown(sig, frame):
    for p in workers:
        try:
            p.terminate()
        except Exception:
            pass
    sys.exit(0)

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)

print(f"Starting {WORKERS} workers for queue '{QUEUE}'...")
for i in range(WORKERS):
    cmd = [
        "/opt/spotdl-web/bin/rq", "worker",
        QUEUE,
        "--url", REDIS_URL,
        "--name", f"worker-{i+1}",
    ]
    p = subprocess.Popen(cmd, cwd="/opt/spotdl-web")
    workers.append(p)
    print(f"  Worker {i+1} started (PID {p.pid})")

print(f"All {WORKERS} workers running. Waiting...")

while True:
    for i, p in enumerate(workers):
        if p.poll() is not None:
            print(f"  Worker {i+1} died (rc={p.returncode}), restarting...")
            cmd = [
                sys.executable, "-m", "rq", "worker",
                QUEUE,
                "--url", REDIS_URL,
                "--name", f"worker-{i+1}",
            ]
            new_p = subprocess.Popen(cmd, cwd="/opt/spotdl-web")
            workers[i] = new_p
            print(f"  Worker {i+1} restarted (PID {new_p.pid})")
    time.sleep(5)
