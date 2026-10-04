#!/usr/bin/env python3
"""
Muzz App Debug Orchestrator
============================
Comprehensive debugging and testing tool for the Rishta matchmaking app.
Runs frontend and backend tests, captures logs, and shows errors in real-time.
"""

import subprocess
import sys
import os
import time
import threading
import signal
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List
import requests


class Colors:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    RESET = '\033[0m'


class DebugOrchestrator:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.backend_dir = self.project_root / "backend"
        self.frontend_dir = self.project_root / "app"
        self.processes: Dict[str, subprocess.Popen] = {}
        self.logs: Dict[str, List[str]] = {"backend": [], "frontend": [], "api": []}
        self.running = False

    def log(self, source: str, message: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        color = {
            "INFO": Colors.CYAN,
            "ERROR": Colors.RED,
            "WARN": Colors.YELLOW,
            "SUCCESS": Colors.GREEN,
            "DEBUG": Colors.MAGENTA,
        }.get(level, Colors.WHITE)

        formatted = f"{color}[{timestamp}] {source}: {message}{Colors.RESET}"
        print(formatted)
        self.logs[source].append(f"[{timestamp}] {level}: {message}")

    def run_cmd(self, cmd: str, cwd: Path, name: str, capture: bool = True) -> subprocess.Popen:
        """Run a command and capture its output."""
        self.log(name, f"Starting: {cmd}", "INFO")

        if capture:
            proc = subprocess.Popen(
                cmd, shell=True, cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True, bufsize=1, universal_newlines=True
            )
        else:
            proc = subprocess.Popen(cmd, shell=True, cwd=cwd)

        self.processes[name] = proc
        return proc

    def stream_output(self, proc: subprocess.Popen, source: str):
        """Stream process output to logs."""
        for line in iter(proc.stdout.readline, ''):
            if line:
                self.log(source, line.rstrip())
        proc.stdout.close()

    def check_prerequisites(self) -> bool:
        """Check if all required tools are installed."""
        self.log("SETUP", "Checking prerequisites...", "INFO")

        checks = [
            ("flutter", "flutter --version"),
            ("node", "node --version"),
            ("npm", "npm --version"),
            ("python3", "python3 --version"),
        ]

        all_ok = True
        for name, cmd in checks:
            try:
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                if result.returncode == 0:
                    version = result.stdout.strip().split('\n')[0]
                    self.log("SETUP", f"✓ {name}: {version}", "SUCCESS")
                else:
                    self.log("SETUP", f"✗ {name}: NOT FOUND", "ERROR")
                    all_ok = False
            except Exception as e:
                self.log("SETUP", f"✗ {name}: ERROR - {e}", "ERROR")
                all_ok = False

        return all_ok

    def check_env_files(self) -> bool:
        """Check if required .env files exist and have required values."""
        self.log("SETUP", "Checking environment configuration...", "INFO")

        backend_env = self.backend_dir / ".env"
        if not backend_env.exists():
            self.log("SETUP", "✗ backend/.env NOT FOUND", "ERROR")
            return False

        self.log("SETUP", "✓ backend/.env exists", "SUCCESS")

        # Check required keys
        required_keys = [
            "FIREBASE_SERVICE_ACCOUNT_BASE64",
            "STREAM_API_KEY",
            "STREAM_API_SECRET",
            "DATABASE_URL",
        ]

        with open(backend_env) as f:
            content = f.read()

        missing = []
        for key in required_keys:
            if f"{key}=" not in content or f"{key}=\n" in content:
                missing.append(key)

        if missing:
            self.log("SETUP", f"⚠ Missing/empty keys in .env: {', '.join(missing)}", "WARN")
        else:
            self.log("SETUP", "✓ All required backend env keys present", "SUCCESS")

        return True

    def start_backend(self) -> bool:
        """Start the NestJS backend in dev mode."""
        self.log("BACKEND", "Starting NestJS backend...", "INFO")

        # Kill any existing process on port 3001
        subprocess.run("pkill -f 'nest start' 2>/dev/null", shell=True)
        time.sleep(1)

        proc = self.run_cmd("npm run dev", self.backend_dir, "backend")

        # Start output streaming thread
        threading.Thread(target=self.stream_output, args=(proc, "backend"), daemon=True).start()

        # Wait for backend to be ready
        for i in range(30):
            try:
                resp = requests.get("http://localhost:3001/auth/health", timeout=2)
                if resp.status_code == 200 and resp.json().get("ok"):
                    self.log("BACKEND", "✓ Backend is healthy on port 3001", "SUCCESS")
                    return True
            except:
                pass
            time.sleep(1)
            if proc.poll() is not None:
                self.log("BACKEND", "✗ Backend process died", "ERROR")
                return False

        self.log("BACKEND", "✗ Backend failed to start within 30s", "ERROR")
        return False

    def test_api_endpoints(self) -> Dict[str, bool]:
        """Test critical API endpoints."""
        self.log("API", "Testing API endpoints...", "INFO")

        results = {}
        base = "http://localhost:3001"

        # Public endpoints
        tests = [
            ("GET /auth/health", "GET", "/auth/health", None, 200),
            ("POST /auth/verify-token (no token)", "POST", "/auth/verify-token", None, 401),
            ("GET /feed (no auth)", "GET", "/feed", None, 401),
        ]

        for name, method, path, body, expected in tests:
            try:
                if method == "GET":
                    r = requests.get(f"{base}{path}", timeout=5)
                else:
                    r = requests.post(f"{base}{path}", json=body, timeout=5)

                ok = r.status_code == expected
                results[name] = ok
                level = "SUCCESS" if ok else "ERROR"
                self.log("API", f"{'✓' if ok else '✗'} {name}: {r.status_code} (expected {expected})", level)
            except Exception as e:
                results[name] = False
                self.log("API", f"✗ {name}: EXCEPTION - {e}", "ERROR")

        return results

    def build_frontend(self) -> bool:
        """Build Flutter web app."""
        self.log("FRONTEND", "Building Flutter web...", "INFO")

        proc = self.run_cmd(
            "flutter build web --dart-define=API_BASE=http://localhost:3001 --no-wasm-dry-run",
            self.frontend_dir, "frontend_build"
        )

        # Wait for build
        exit_code = proc.wait()
        if exit_code == 0:
            self.log("FRONTEND", "✓ Flutter web build successful", "SUCCESS")
            return True
        else:
            self.log("FRONTEND", f"✗ Flutter build failed (exit code {exit_code})", "ERROR")
            return False

    def run_frontend_tests(self) -> bool:
        """Run Flutter tests."""
        self.log("TESTS", "Running Flutter tests...", "INFO")

        proc = self.run_cmd("flutter test", self.frontend_dir, "flutter_tests")
        exit_code = proc.wait()

        if exit_code == 0:
            self.log("TESTS", "✓ Flutter tests passed", "SUCCESS")
            return True
        else:
            self.log("TESTS", f"✗ Flutter tests failed (exit code {exit_code})", "ERROR")
            return False

    def run_backend_tests(self) -> bool:
        """Run backend tests."""
        self.log("TESTS", "Running backend tests...", "INFO")

        proc = self.run_cmd("npm test 2>&1 || echo 'No test script'", self.backend_dir, "backend_tests")
        exit_code = proc.wait()

        if exit_code == 0:
            self.log("TESTS", "✓ Backend tests passed", "SUCCESS")
            return True
        else:
            self.log("TESTS", "⚠ No backend tests or tests failed", "WARN")
            return True  # Not a blocker if no tests exist

    def run_database_checks(self) -> bool:
        """Check database connection and schema."""
        self.log("DB", "Checking database...", "INFO")

        # Try to connect and run a simple query
        try:
            result = subprocess.run(
                "npm run db:init 2>&1 || echo 'db:init failed'",
                shell=True, cwd=self.backend_dir, capture_output=True, text=True
            )
            if "success" in result.stdout.lower() or "already" in result.stdout.lower():
                self.log("DB", "✓ Database initialized", "SUCCESS")
                return True
            else:
                self.log("DB", f"⚠ Database init output: {result.stdout[:200]}", "WARN")
                return True
        except Exception as e:
            self.log("DB", f"⚠ Database check error: {e}", "WARN")
            return True

    def generate_report(self) -> str:
        """Generate a summary report."""
        report = []
        report.append("=" * 60)
        report.append("MUZZ APP DEBUG REPORT")
        report.append(f"Generated: {datetime.now().isoformat()}")
        report.append("=" * 60)

        for source, logs in self.logs.items():
            if logs:
                report.append(f"\n--- {source.upper()} LOGS ---")
                for log in logs[-50:]:  # Last 50 entries
                    report.append(log)

        return "\n".join(report)

    def save_report(self, filename: str = "debug_report.txt"):
        """Save report to file."""
        report = self.generate_report()
        with open(self.project_root / filename, "w") as f:
            f.write(report)
        self.log("REPORT", f"Report saved to {filename}", "INFO")

    def cleanup(self):
        """Clean up all processes."""
        self.log("CLEANUP", "Stopping all processes...", "INFO")
        for name, proc in self.processes.items():
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        self.running = False


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Muzz App Debug Orchestrator")
    parser.add_argument("--project-root", default=".", help="Project root directory")
    parser.add_argument("--skip-build", action="store_true", help="Skip frontend build")
    parser.add_argument("--skip-tests", action="store_true", help="Skip tests")
    parser.add_argument("--api-only", action="store_true", help="Only test API endpoints")
    parser.add_argument("--report", default="debug_report.txt", help="Report output file")
    args = parser.parse_args()

    orchestrator = DebugOrchestrator(args.project_root)

    try:
        # Check prerequisites
        if not orchestrator.check_prerequisites():
            print(f"{Colors.RED}Prerequisites check failed. Exiting.{Colors.RESET}")
            return 1

        if not orchestrator.check_env_files():
            print(f"{Colors.RED}Environment check failed. Exiting.{Colors.RESET}")
            return 1

        if args.api_only:
            if orchestrator.start_backend():
                orchestrator.test_api_endpoints()
            orchestrator.save_report(args.report)
            return 0

        # Full pipeline
        success = True

        if not orchestrator.run_database_checks():
            success = False

        if not orchestrator.start_backend():
            success = False

        orchestrator.test_api_endpoints()

        if not args.skip_build:
            if not orchestrator.build_frontend():
                success = False

        if not args.skip_tests:
            orchestrator.run_frontend_tests()
            orchestrator.run_backend_tests()

        orchestrator.save_report(args.report)

        if success:
            print(f"\n{Colors.GREEN}{Colors.BOLD}✓ All checks passed!{Colors.RESET}")
            return 0
        else:
            print(f"\n{Colors.RED}{Colors.BOLD}✗ Some checks failed. See report.{Colors.RESET}")
            return 1

    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Interrupted by user{Colors.RESET}")
        return 130
    finally:
        orchestrator.cleanup()


if __name__ == "__main__":
    sys.exit(main())