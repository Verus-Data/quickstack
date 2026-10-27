#!/usr/bin/env bash
# Follow the dev stack's log with the terminal escape codes stripped.
#
# `bun run dev` records through a pty (see scripts/dev.sh), which keeps the live
# terminal coloured but leaves the escape sequences in the file. They make the
# log hostile to grep, so strip them on the way out.
set -euo pipefail
cd "$(dirname "$0")/.."

LOG_FILE=".logs/dev.log"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "no ${LOG_FILE} yet; start the stack with: bun run dev" >&2
  exit 1
fi

# -F rather than -f: the log is truncated on each `bun run dev`, and -F follows
# it across that truncation instead of going silent.
tail -n "${LOG_LINES:-200}" -F "$LOG_FILE" | perl -pe 's/\e\[[0-9;?]*[A-Za-z]//g; s/\e\][^\a]*\a//g'
