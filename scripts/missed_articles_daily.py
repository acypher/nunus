#!/usr/bin/env python3
"""Install, run, and tear down the local Missed Articles daily job."""

from __future__ import annotations

import argparse
import json
import os
import plistlib
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent

STATE_FILE = SCRIPT_DIR / ".missed-articles-daily.json"
LOG_DIR = SCRIPT_DIR / "logs"
LOG_FILE = LOG_DIR / "missed-articles-daily.log"
LAUNCH_AGENT_LABEL = "com.acypher.nunus.missed-articles-daily"
DEFAULT_HOUR = 7
DEFAULT_MINUTE = 0


def load_env() -> None:
    env_file = Path(os.environ.get("NUNUS_RELEASE_ENV", SCRIPT_DIR / "release.env"))
    if not env_file.is_file():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = val


def log(message: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(f"[{stamp}] {message}\n")
    print(message, flush=True)


def launch_agent_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{LAUNCH_AGENT_LABEL}.plist"


def schedule_hour() -> int:
    raw = os.environ.get("MISSED_ARTICLES_HOUR", str(DEFAULT_HOUR)).strip()
    try:
        return max(0, min(23, int(raw)))
    except ValueError:
        return DEFAULT_HOUR


def schedule_minute() -> int:
    raw = os.environ.get("MISSED_ARTICLES_MINUTE", str(DEFAULT_MINUTE)).strip()
    try:
        return max(0, min(59, int(raw)))
    except ValueError:
        return DEFAULT_MINUTE


def resolve_cursor_agent() -> str | None:
    candidates = [
        os.environ.get("CURSOR_AGENT_BIN", "").strip(),
        str(Path.home() / ".local" / "bin" / "cursor-agent"),
        "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    ]
    for raw in candidates:
        if not raw:
            continue
        path = Path(raw)
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
    which = subprocess.run(["which", "cursor-agent"], capture_output=True, text=True)
    if which.returncode == 0 and which.stdout.strip():
        return which.stdout.strip()
    return None


def write_launch_agent(run_script: Path) -> Path:
    plist_path = launch_agent_path()
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    hour = schedule_hour()
    minute = schedule_minute()
    payload = {
        "Label": LAUNCH_AGENT_LABEL,
        "ProgramArguments": ["/bin/bash", str(run_script)],
        "StartCalendarInterval": {"Hour": hour, "Minute": minute},
        "StandardOutPath": str(LOG_FILE),
        "StandardErrorPath": str(LOG_FILE),
        "RunAtLoad": False,
        "WorkingDirectory": str(ROOT),
    }
    plist_path.write_bytes(plistlib.dumps(payload))
    return plist_path


def load_launch_agent(plist_path: Path) -> None:
    uid = os.getuid()
    domain = f"gui/{uid}"
    subprocess.run(
        ["launchctl", "bootout", domain, str(plist_path)],
        check=False,
        capture_output=True,
    )
    subprocess.run(["launchctl", "bootstrap", domain, str(plist_path)], check=True)


def unload_launch_agent(plist_path: Path) -> None:
    uid = os.getuid()
    domain = f"gui/{uid}"
    subprocess.run(
        ["launchctl", "bootout", domain, str(plist_path)],
        check=False,
        capture_output=True,
    )
    if plist_path.is_file():
        plist_path.unlink()


def run_checker_json() -> dict:
    script = SCRIPT_DIR / "check-missed-articles.sh"
    proc = subprocess.run(
        [str(script), "--json"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode not in (0, 1):
        raise RuntimeError(
            f"checker failed ({proc.returncode}): {proc.stderr or proc.stdout}"
        )
    text = proc.stdout.strip()
    if not text:
        raise RuntimeError("checker produced no JSON")
    return json.loads(text)


def send_imessage(body: str) -> None:
    script = SCRIPT_DIR / "send-imessage.sh"
    proc = subprocess.run(
        [str(script), body],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "imessage failed")
    log(proc.stdout.strip() or "iMessage sent")


def format_report(
    *,
    found: int,
    fixed: int,
    titles: list[tuple[str, str]],
) -> str:
    """titles: list of (title, status) where status is fixed|deferred|abandoned|found."""
    lines = [
        f"Nunus Missed Articles — {date.today().isoformat()}",
        f"Found: {found}",
        f"Fixed: {fixed}",
    ]
    if titles:
        lines.append("")
        for title, status in titles:
            if status == "found" and found == fixed == 0:
                lines.append(f"• {title}")
            elif status == "found":
                lines.append(f"• {title}")
            else:
                lines.append(f"• {title} ({status})")
    return "\n".join(lines)


def build_agent_prompt() -> str:
    return (
        "Follow the Missed Articles skill in this repo "
        "(.cursor/skills/missed-articles/SKILL.md) end to end on this machine.\n\n"
        "1. Run ./scripts/check-missed-articles.sh (and --json if useful).\n"
        "2. If misses: fix at most 4 articles today; at most 2 checker re-runs per "
        "article then give up on that URL. Use Task subagents to inspect the live "
        "NYT homepage at ~1280x720 and patch sites/nyt.js as needed. Bump patch "
        "version, commit to main, push.\n"
        "3. Always finish by sending an iMessage via ./scripts/send-imessage.sh with "
        "Found count, Fixed count, and every problem title (mark fixed / deferred / "
        "abandoned) — unless MISSED_ARTICLES_DAILY_WRAPPER=1 (then the wrapper sends "
        "the report).\n"
        "4. If Found is 0, still ensure a zero report is sent (by you or the wrapper).\n"
    )


def run_local_agent() -> int:
    agent = resolve_cursor_agent()
    if not agent:
        log("No cursor-agent binary found; skipping auto-fix")
        return 2

    prompt = build_agent_prompt()
    cmd: list[str]
    if agent.endswith("/cursor") and "Cursor.app" in agent:
        cmd = [
            agent,
            "agent",
            "--print",
            "--force",
            "--trust",
            "--workspace",
            str(ROOT),
            prompt,
        ]
    else:
        cmd = [
            agent,
            "--print",
            "--force",
            "--trust",
            "--workspace",
            str(ROOT),
            prompt,
        ]

    log(f"Starting local Cursor agent: {cmd[0]}")
    proc = subprocess.run(cmd, cwd=str(ROOT), check=False)
    log(f"Cursor agent exit: {proc.returncode}")
    return proc.returncode


def run_daily() -> int:
    load_env()
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log("=== Missed Articles daily run start ===")

    try:
        before = run_checker_json()
    except Exception as exc:
        log(f"checker error: {exc}")
        try:
            send_imessage(
                f"Nunus Missed Articles — {date.today().isoformat()}\n"
                f"Found: ?\nFixed: 0\n\nChecker failed: {exc}"
            )
        except Exception as send_exc:
            log(f"iMessage failed: {send_exc}")
        return 1

    found = int(before.get("missedCount") or 0)
    missed = before.get("missed") or []
    log(f"checker: found={found} candidates={before.get('candidateCount')} detected={before.get('detectedCount')}")

    agent_rc: int | None = None
    if found > 0:
        agent_rc = run_local_agent()
    else:
        log("No misses; skipping agent")

    # Re-check after agent (or use before if agent skipped / failed to start)
    fixed = 0
    titles: list[tuple[str, str]] = []
    try:
        after = run_checker_json() if found > 0 else before
        remaining_urls = {m.get("url") for m in (after.get("missed") or [])}
        for item in missed:
            title = (item.get("title") or "").strip() or "(untitled)"
            url = item.get("url")
            if url and url not in remaining_urls:
                titles.append((title, "fixed"))
                fixed += 1
            elif found > 0 and agent_rc not in (0, None) and agent_rc == 2:
                titles.append((title, "found — agent unavailable"))
            else:
                # Still missed after attempted fix (cap / abandon / agent fail)
                titles.append((title, "still missed"))
        # Prefer agent-sent iMessage; if agent ran successfully it should have sent.
        # Always send a summary from this wrapper so the daily text is reliable.
        body = format_report(found=found, fixed=fixed, titles=titles)
        send_imessage(body)
    except Exception as exc:
        log(f"post-run report error: {exc}")
        # Best-effort report from pre-fix list
        try:
            titles = [
                ((m.get("title") or "").strip() or "(untitled)", "found")
                for m in missed
            ]
            send_imessage(format_report(found=found, fixed=0, titles=titles))
        except Exception as send_exc:
            log(f"iMessage failed: {send_exc}")
        return 1

    log(f"=== Missed Articles daily run done (found={found} fixed={fixed}) ===")
    return 0 if found == 0 or fixed == found else 0


def setup() -> int:
    load_env()
    run_script = SCRIPT_DIR / "run-missed-articles-daily.sh"
    if not run_script.is_file():
        raise RuntimeError(f"missing runner: {run_script}")
    hour = schedule_hour()
    minute = schedule_minute()
    STATE_FILE.write_text(
        json.dumps(
            {
                "repo_root": str(ROOT),
                "hour": hour,
                "minute": minute,
                "started_at": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    plist_path = write_launch_agent(run_script)
    load_launch_agent(plist_path)
    log(f"armed Missed Articles daily at {hour:02d}:{minute:02d}")
    print(f"Missed Articles daily armed.")
    print(f"  Schedule: every day at {hour:02d}:{minute:02d} (local)")
    print(f"  Log: {LOG_FILE}")
    print(f"  Launch agent: {plist_path}")
    print("  Disable cloud Automation in Cursor Automations UI if still enabled.")
    agent = resolve_cursor_agent()
    if agent:
        print(f"  Cursor agent: {agent}")
        print("  If fixes are skipped, run: cursor agent login")
    else:
        print("  Cursor agent: NOT FOUND — reports will still iMessage; fixes need agent login/install")
    return 0


def stop(*, quiet: bool = False) -> int:
    plist_path = launch_agent_path()
    unload_launch_agent(plist_path)
    if STATE_FILE.is_file():
        STATE_FILE.unlink()
    log("stopped Missed Articles daily")
    if not quiet:
        print("Missed Articles daily stopped.")
    return 0


def show_status() -> int:
    load_env()
    plist_path = launch_agent_path()
    if STATE_FILE.is_file():
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        print(f"Schedule: {state.get('hour', schedule_hour()):02d}:{state.get('minute', schedule_minute()):02d} daily")
        print(f"Started: {state.get('started_at', '?')}")
    else:
        print("No Missed Articles daily state file.")
    print(f"Launch agent: {plist_path} ({'present' if plist_path.is_file() else 'missing'})")
    print(f"Log: {LOG_FILE}")
    agent = resolve_cursor_agent()
    print(f"Cursor agent: {agent or 'NOT FOUND'}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("setup", help="Install LaunchAgent for daily local runs")
    sub.add_parser("stop", help="Remove LaunchAgent")
    sub.add_parser("status", help="Show LaunchAgent status")
    sub.add_parser("run", help="Run one Missed Articles daily cycle (used by launchd)")
    args = parser.parse_args()
    if args.cmd == "setup":
        return setup()
    if args.cmd == "stop":
        return stop()
    if args.cmd == "status":
        return show_status()
    if args.cmd == "run":
        return run_daily()
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
