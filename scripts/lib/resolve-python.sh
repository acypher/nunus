# Resolve a Python 3 interpreter that can import jwt (PyJWT).
# shellcheck shell=bash
resolve_python3() {
  local candidate
  if [[ -n "${NUNUS_PYTHON:-}" ]] && "$NUNUS_PYTHON" -c "import jwt" >/dev/null 2>&1; then
    echo "$NUNUS_PYTHON"
    return 0
  fi
  for candidate in \
    "$(command -v python3 2>/dev/null || true)" \
    /Library/Frameworks/Python.framework/Versions/3.11/bin/python3 \
    /Library/Frameworks/Python.framework/Versions/3.12/bin/python3 \
    /opt/homebrew/bin/python3 \
    /usr/local/bin/python3 \
    /usr/bin/python3; do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    if "$candidate" -c "import jwt" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  echo "error: no python3 with PyJWT (jwt) found; install with: pip3 install PyJWT" >&2
  return 1
}
