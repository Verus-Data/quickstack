#!/usr/bin/env bash
# Cursor preToolUse uses permission, rather than hookSpecificOutput.
# https://cursor.com/docs/hooks
set -euo pipefail
hook_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
source "$hook_dir/../../.claude/hooks/_lib.sh"
input=$(cat)
tool=$(hook_get "$input" tool_name)
case "$tool" in
  Shell) script=block-destructive.sh ;;
  Write | Edit) script=detect-secrets.sh ;;
  *) printf '{"permission":"allow"}\n'; exit 0 ;;
esac
decision=$(printf '%s' "$input" | bash "$hook_dir/../../.claude/hooks/$script")
if [ -z "$decision" ]; then
  printf '{"permission":"allow"}\n'
else
  reason=$(hook_get "$decision" hookSpecificOutput.permissionDecisionReason)
  printf '{"permission":"deny","user_message":%s,"agent_message":%s}\n' \
    "$(json_quote "$reason")" "$(json_quote "$reason")"
fi
