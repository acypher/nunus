#!/usr/bin/env bash
# Send an iMessage via macOS Messages.app.
#
# Usage:
#   ./scripts/send-imessage.sh "body text"
#   ./scripts/send-imessage.sh <<EOF
#   multi-line body
#   EOF
#
# Recipient: MISSED_ARTICLES_IMESSAGE_TO in scripts/release.env
# (E.164 preferred, e.g. +18312510122). Disable with MISSED_ARTICLES_IMESSAGE=0.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=lib/load-release-env.sh
source "$SCRIPT_DIR/lib/load-release-env.sh"

if [[ "${MISSED_ARTICLES_IMESSAGE:-1}" == "0" ]]; then
  echo "iMessage disabled (MISSED_ARTICLES_IMESSAGE=0)"
  exit 0
fi

TO="${MISSED_ARTICLES_IMESSAGE_TO:-}"
if [[ -z "$TO" ]]; then
  echo "error: set MISSED_ARTICLES_IMESSAGE_TO in scripts/release.env" >&2
  exit 1
fi

# Normalize (831) 251-0122 → +18312510122
normalize_phone() {
  local raw="$1"
  local digits
  digits="$(printf '%s' "$raw" | tr -cd '0-9')"
  if [[ ${#digits} -eq 10 ]]; then
    printf '+1%s' "$digits"
  elif [[ ${#digits} -eq 11 && ${digits:0:1} == 1 ]]; then
    printf '+%s' "$digits"
  elif [[ "$raw" == \+* ]]; then
    printf '%s' "$raw"
  else
    printf '%s' "$raw"
  fi
}

TO_NORM="$(normalize_phone "$TO")"

if [[ $# -gt 0 ]]; then
  BODY="$*"
else
  BODY="$(cat)"
fi

if [[ -z "${BODY//[$' \t\n']/}" ]]; then
  echo "error: empty message body" >&2
  exit 1
fi

# Write body to a temp file to avoid AppleScript quoting issues.
BODY_FILE="$(mktemp -t nunus-imessage)"
cleanup() { rm -f "$BODY_FILE"; }
trap cleanup EXIT
printf '%s' "$BODY" >"$BODY_FILE"

osascript \
  -e 'on run argv' \
  -e 'set targetPhone to item 1 of argv' \
  -e 'set bodyPath to item 2 of argv' \
  -e 'set messageText to read POSIX file bodyPath as «class utf8»' \
  -e 'tell application "Messages"' \
  -e 'set targetService to 1st account whose service type = iMessage' \
  -e 'set targetBuddy to participant targetPhone of targetService' \
  -e 'send messageText to targetBuddy' \
  -e 'end tell' \
  -e 'end run' \
  -- "$TO_NORM" "$BODY_FILE"

echo "iMessage sent to $TO_NORM"
