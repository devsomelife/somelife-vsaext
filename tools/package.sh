#!/usr/bin/env bash
# Builds a shareable zip of the extension.
#
# Only what the extension needs at runtime, plus the user guide: no git
# metadata, no tools, no CI config. The result loads directly via
# chrome://extensions -> Load unpacked (after unzipping).
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(grep -o '"version": *"[^"]*"' manifest.json | head -1 | cut -d'"' -f4)
out="vsa-ext-${version}.zip"

rm -f "$out"
zip -r -q "$out" \
  manifest.json \
  src \
  icons \
  docs/guide.html \
  -x '*.DS_Store' '*/.*'

echo "$out ($(du -h "$out" | cut -f1))"
unzip -l "$out" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
