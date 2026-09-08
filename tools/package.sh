#!/usr/bin/env bash
# Builds a shareable zip of the extension.
#
# Only runtime files go in: no git metadata, no README, no tools. The result
# loads directly via chrome://extensions -> Load unpacked (after unzipping).
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(grep -o '"version": *"[^"]*"' manifest.json | head -1 | cut -d'"' -f4)
out="vsa-ext-${version}.zip"

rm -f "$out"
zip -r -q "$out" \
  manifest.json \
  src \
  icons \
  -x '*.DS_Store' '*/.*'

echo "$out ($(du -h "$out" | cut -f1))"
unzip -l "$out" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
