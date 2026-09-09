#!/usr/bin/env bash
# Syntax-checks every JavaScript file.
#
# `node --check` parses as CommonJS, which silently accepts some module files.
# Anything using import/export is copied to a .mjs so it is checked as a
# module, matching how Chrome actually loads it.
set -uo pipefail

cd "$(dirname "$0")/../.."

status=0
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

while IFS= read -r f; do
  if grep -qE '^[[:space:]]*(import|export)[[:space:]]' "$f"; then
    cp "$f" "$tmp/check.mjs"
    target="$tmp/check.mjs"
    kind="esm"
  else
    target="$f"
    kind="script"
  fi

  if node --check "$target" 2>/dev/null; then
    echo "  ok   ($kind) $f"
  else
    echo "  FAIL ($kind) $f"
    node --check "$target" 2>&1 | sed 's/^/       /' | head -4
    echo "::error file=$f::syntax error"
    status=1
  fi
done < <(find src tools .github/scripts \( -name '*.js' -o -name '*.mjs' \) | sort)

exit $status
