#!/usr/bin/env python3
"""Install, run, and tear down the daily publish-check watcher."""

from __future__ import annotations

import argparse
import json
import os
import plistlib
import smtplib
import subprocess
import sys
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import check_store_live as live  # noqa: E402
import check_store_pending as pending  # noqa: E402

WATCH_STATE = SCRIPT_DIR / ".publish-check-watch.json"
LOG_DIR = SCRIPT_DIR / "logs"
LOG_FILE = LOG_DIR / "publish-check-watch.log"
LAUNCH_AGENT_LABEL = "com.acypher.nunus.publish-check"
DEFAULT_NOTIFY_EMAIL = "code@acypher.com"


def load_env() -> None:
    pending.load_env()


def log(message: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"[{stamp}] {message}\n"
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(line)


def read_watch() -> dict | None:
    if not WATCH_STATE.is_file():
        return None
    return json.loads(WATCH_STATE.read_text(encoding="utf-8"))


def write_watch(data: dict) -> None:
    WATCH_STATE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def clear_watch() -> None:
    if WATCH_STATE.is_file():
        WATCH_STATE.unlink()


def launch_agent_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{LAUNCH_AGENT_LABEL}.plist"


def manifest_version() -> str:
    return pending.repo_version()


def notify_email() -> str:
    return os.environ.get("PUBLISH_CHECK_NOTIFY_EMAIL", DEFAULT_NOTIFY_EMAIL).strip() or DEFAULT_NOTIFY_EMAIL


def daily_hour() -> int:
    raw = os.environ.get("PUBLISH_CHECK_DAILY_HOUR", "9").strip()
    try:
        hour = int(raw)
    except ValueError:
        hour = 9
    return max(0, min(23, hour))


def daily_minute() -> int:
    raw = os.environ.get("PUBLISH_CHECK_DAILY_MINUTE", "0").strip()
    try:
        minute = int(raw)
    except ValueError:
        minute = 0
    return max(0, min(59, minute))


def is_live(version: str) -> bool:
    statuses = [live.chrome_status(version), live.firefox_status(version), live.safari_status(version)]
    return all(item.state == "LIVE" for item in statuses)


def send_live_email(version: str, to_email: str) -> None:
    subject = f"Nunus version {version} is now Live on all stores"
    body = (
        f"Nunus {version} is now live on the Chrome Web Store, Firefox AMO, "
        f"and Mac App Store (Safari).\n\n"
        f"The daily publish-check watcher has been stopped.\n"
    )

    message = EmailMessage()
    message["Subject"] = subject
    message["To"] = to_email
    message["From"] = os.environ.get("SMTP_FROM", to_email)
    message.set_content(body)

    host = os.environ.get("SMTP_HOST", "").strip()
    port_raw = os.environ.get("SMTP_PORT", "587").strip()
    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "").strip()

    if host:
        port = int(port_raw)
        use_ssl = port == 465 or os.environ.get("SMTP_USE_SSL", "").strip() in {"1", "true", "yes"}
        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=30) as smtp:
                if user:
                    smtp.login(user, password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=30) as smtp:
                smtp.starttls()
                if user:
                    smtp.login(user, password)
                smtp.send_message(message)
        return

    mail_path = Path("/usr/bin/mail")
    if mail_path.is_file():
        proc = subprocess.run(
            [str(mail_path), "-s", subject, to_email],
            input=body.encode("utf-8"),
            check=False,
        )
        if proc.returncode == 0:
            return
        raise RuntimeError(f"/usr/bin/mail failed with exit code {proc.returncode}")

    raise RuntimeError(
        "email not configured: set SMTP_HOST (and SMTP_USER/SMTP_PASSWORD) in scripts/release.env "
        "or configure macOS mail"
    )


def write_launch_agent(run_script: Path) -> Path:
    plist_path = launch_agent_path()
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "Label": LAUNCH_AGENT_LABEL,
        "ProgramArguments": ["/bin/bash", str(run_script)],
        "StartCalendarInterval": {"Hour": daily_hour(), "Minute": daily_minute()},
        "StandardOutPath": str(LOG_FILE),
        "StandardErrorPath": str(LOG_FILE),
        "RunAtLoad": False,
    }
    plist_path.write_bytes(plistlib.dumps(payload))
    return plist_path


def load_launch_agent(plist_path: Path) -> None:
    uid = os.getuid()
    domain = f"gui/{uid}"
    subprocess.run(["launchctl", "bootout", domain, str(plist_path)], check=False, capture_output=True)
    subprocess.run(["launchctl", "bootstrap", domain, str(plist_path)], check=True)


def unload_launch_agent(plist_path: Path) -> None:
    uid = os.getuid()
    domain = f"gui/{uid}"
    subprocess.run(["launchctl", "bootout", domain, str(plist_path)], check=False, capture_output=True)
    if plist_path.is_file():
        plist_path.unlink()


def setup_watch(version: str | None = None) -> int:
    load_env()
    target = version or manifest_version()
    email = notify_email()
    run_script = SCRIPT_DIR / "run-publish-check-watch.sh"
    if not run_script.is_file():
        raise RuntimeError(f"missing runner script: {run_script}")

    write_watch(
        {
            "version": target,
            "repo_root": str(ROOT),
            "notify_email": email,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    plist_path = write_launch_agent(run_script)
    load_launch_agent(plist_path)
    log(f"setup daily publish-check for version {target} -> {email} at {daily_hour():02d}:{daily_minute():02d}")
    print(f"Daily publish-check armed for Nunus {target}.")
    print(f"  Notify: {email}")
    print(f"  Schedule: every day at {daily_hour():02d}:{daily_minute():02d} local time")
    print(f"  Log: {LOG_FILE}")
    print(f"  Launch agent: {plist_path}")
    return 0


def stop_watch(*, quiet: bool = False) -> int:
    plist_path = launch_agent_path()
    unload_launch_agent(plist_path)
    clear_watch()
    log("stopped daily publish-check watcher")
    if not quiet:
        print("Daily publish-check watcher stopped.")
    return 0


def show_status() -> int:
    watch = read_watch()
    plist_path = launch_agent_path()
    if watch:
        print(f"Watching version: {watch.get('version', '?')}")
        print(f"Notify email: {watch.get('notify_email', notify_email())}")
        print(f"Started: {watch.get('started_at', '?')}")
    else:
        print("No active publish-check watch.")
    print(f"Launch agent plist: {plist_path} ({'present' if plist_path.is_file() else 'missing'})")
    print(f"Log: {LOG_FILE}")
    return 0


def run_watch() -> int:
    load_env()
    watch = read_watch()
    if not watch:
        return 0

    version = str(watch.get("version", "")).strip()
    if not version:
        log("watch state missing version; stopping watcher")
        stop_watch(quiet=True)
        return 1

    to_email = str(watch.get("notify_email") or notify_email()).strip() or notify_email()
    log(f"running daily publish-check for version {version}")

    try:
        release_note = live.try_release_safari_version(version)
        if release_note:
            log(release_note)

        if not is_live(version):
            log(f"version {version} not live on all stores yet; no action")
            return 0

        log(f"version {version} is live on all stores; sending email to {to_email}")
        send_live_email(version, to_email)
        log(f"email sent to {to_email}")
        stop_watch(quiet=True)
        log(f"stopped daily publish-check watcher after {version} went live")
        print(f"Nunus {version} is live on all stores; notified {to_email} and stopped daily checks.")
        return 0
    except Exception as exc:  # noqa: BLE001 - daily job should log and continue until next run
        log(f"error during publish-check watch: {exc}")
        print(f"error: {exc}", file=sys.stderr)
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    setup = sub.add_parser("setup", help="Arm daily publish-check for a published version")
    setup.add_argument("--version", metavar="X.Y.Z", help="Version to watch (default: manifest.json)")

    sub.add_parser("run", help="Run one daily publish-check (used by launchd)")
    sub.add_parser("stop", help="Stop daily publish-check and remove launch agent")
    sub.add_parser("status", help="Show current watch state")

    args = parser.parse_args()
    if args.command == "setup":
        return setup_watch(args.version)
    if args.command == "run":
        return run_watch()
    if args.command == "stop":
        return stop_watch()
    if args.command == "status":
        return show_status()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
