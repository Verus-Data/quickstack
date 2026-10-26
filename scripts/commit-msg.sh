#!/usr/bin/env bash
set -euo pipefail
if head -n 1 "$1" | grep -Eq '^(Merge |Revert |fixup! |squash! |(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^()]+\))?!?: .+)'; then exit 0; fi
printf '%s\n' 'Use a Conventional Commit, such as feat: add doctor command.' >&2
exit 1
