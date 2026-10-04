#!/usr/bin/env python3
"""
Muzz Live Debug Viewer
======================
Real-time log viewer for both frontend and backend with error highlighting.
"""

import subprocess
import sys
import os
import threading
import time
import queue
from pathlib import Path
from datetime import datetime
from typing import Optional
import select
import signal


class Colors:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    RESET = '\033[0m'
    CLEAR_LINE = '\033[2K'
    CURSOR_UP = '\033[1A'


class LiveDebugger:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.backend_dir = self.project_root / "backend"
        self.frontend_dir = self.project_root / "app"
        self.running = False
        self.log_queue = queue.Queue()

    def colorize(self, line: str, source: str) -> str:
        """Add colors based on log content."""
        ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]

        # Source prefix with color
        prefix = {
            "backend": f"{Colors.BLUE}[BE]{Colors.RESET}",
            "frontend": f"{Colors.GREEN}[FE]{Colors.RESET}",
            "api": f"{Colors.MAGENTA}[API]{Colors.RESET}",
        }.get(source, f"{Colors.WHITE}[{source[:2].upper()}]{Colors.RESET}")

        # Colorize based on content
        line_lower = line.lower()

        if any(w in line_lower for w in ['error', 'exception', 'failed', 'crash', 'fatal']):
            colored = f"{Colors.RED}{line}{Colors.RESET}"
        elif any(w in line_lower for w in ['warn', 'warning']):
            colored = f"{Colors.YELLOW}{line}{Colors.RESET}"
        elif any(w in line_lower for w in ['success', '✓', 'ok', 'healthy', 'started', 'initialized']):
            colored = f"{Colors.GREEN}{line}{Colors.RESET}"
        elif any(w in line_lower for w in ['debug', 'trace']):
            colored = f"{Colors.DIM}{line}{Colors.RESET}"
        else:
            colored = line

        return f"{Colors.CYAN}[{ts}]{Colors.RESET} {prefix} {colored}"

    def read_stream(self, proc: subprocess.Popen, source: str):
        """Read from process stream and queue lines."""
        try:
            for line in iter(proc.stdout.readline, ''):
                if line:
                    self.log_queue.put((source, line.rstrip()))
        except Exception:
            pass
        finally:
            self.log_queue.put((source, "__EOF__"))

    def run_backend(self):
        """Start backend in dev mode."""
        # Kill existing
        subprocess.run("pkill -f 'nest start' 2>/dev/null", shell=True)
        time.sleep(1)

        proc = subprocess.Popen(
            "npm run dev", shell=True, cwd=self.backend_dir,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, universal_newlines=True
        )
        return proc

    def run_frontend(self):
        """Start frontend in debug mode."""
        proc = subprocess.Popen(
            "flutter run -d chrome --dart-define=API_BASE=http://localhost:3001",
            shell=True, cwd=self.frontend_dir,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, universal_newlines=True
        )
        return proc

    def monitor_api(self):
        """Periodically check API health."""
        while self.running:
            try:
                import requests
                r = requests.get("http://localhost:3001/auth/health", timeout=2)
                if r.status_code == 200:
                    self.log_queue.put(("api", f"Health check: OK - {r.json()}"))
                else:
                    self.log_queue.put(("api", f"Health check: {r.status_code} - {r.text}"))
            except Exception as e:
                self.log_queue.put(("api", f"Health check failed: {e}"))
            time.sleep(10)

    def run(self):
        """Main run loop."""
        print(f"{Colors.BOLD}{Colors.CYAN}╔══════════════════════════════════════════════════════════════╗")
        print(f"║           MUZZ APP LIVE DEBUGGER                           ║")
        print(f"║  Press Ctrl+C to stop                                       ║")
        print(f"╚══════════════════════════════════════════════════════════════╝{Colors.RESET}")

        self.running = True

        # Start processes
        print(f"{Colors.YELLOW}Starting backend...{Colors.RESET}")
        backend_proc = self.run_backend()
        threading.Thread(target=self.read_stream, args=(backend_proc, "backend"), daemon=True).start()

        # Wait for backend to be ready
        for i in range(20):
            try:
                import requests
                r = requests.get("http://localhost:3001/auth/health", timeout=1)
                if r.status_code == 200:
                    break
            except:
                pass
            time.sleep(0.5)

        print(f"{Colors.GREEN}Backend ready. Starting frontend...{Colors.RESET}")
        frontend_proc = self.run_frontend()
        threading.Thread(target=self.read_stream, args=(frontend_proc, "frontend"), daemon=True).start()

        # Start API monitor
        threading.Thread(target=self.monitor_api, daemon=True).start()

        # Main log display loop
        print(f"{Colors.DIM}{'─' * 80}{Colors.RESET}")

        try:
            while self.running:
                try:
                    source, line = self.log_queue.get(timeout=0.5)
                    if line == "__EOF__":
                        print(f"{Colors.RED}[{source}] Process ended{Colors.RESET}")
                        continue
                    print(self.colorize(line, source))
                except queue.Empty:
                    continue
        except KeyboardInterrupt:
            print(f"\n{Colors.YELLOW}Stopping...{Colors.RESET}")
        finally:
            self.running = False
            for proc in [backend_proc, frontend_proc]:
                if proc.poll() is None:
                    proc.terminate()


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Muzz Live Debug Viewer")
    parser.add_argument("--project-root", default=".", help="Project root directory")
    args = parser.parse_args()

    debugger = LiveDebugger(args.project_root)
    debugger.run()


if __name__ == "__main__":
    main()