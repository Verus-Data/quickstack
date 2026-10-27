#!/usr/bin/env bash
# Run a Codex delegate on a contract file inside its own linked worktree and print a digest.
#
#   scripts/delegate.sh <contract.md> --worktree <path> [--write]
#
# Read-only by default; --write lets Codex edit files in the worktree. The script never commits:
# the orchestrator (Claude) reviews the diff, refactors, runs the gate and owns the commit.
# .claude/skills/delegate/SKILL.md is the workflow.
#
# Model and effort: DELEGATE_MODEL (default gpt-6.1-sol), DELEGATE_EFFORT (default high).
# Wall clock: DELEGATE_TIMEOUT_SECS (default 3600). Run it in the background from Claude; a
# foreground Bash call is capped at 10 minutes.
#
# Trust: Codex is trusted as much as Claude Code. With --write it runs without a sandbox, with
# your environment and your own ~/.codex/config.toml (MCP servers included), so feature work has
# the network, `bun add`, git, process inspection and the whole gate. The worktree isolates the
# work from other work; it doesn't contain Codex. Read-only mode uses Codex's read-only sandbox.
#
# Logs go outside the worktree so they survive its removal:
#   ${DELEGATE_LOG_ROOT:-$TMPDIR/quickstacks-delegate}/<worktree>-<timestamp>/

set -uo pipefail

PREAMBLE="You are working in a git worktree for an orchestrator that reviews, refactors and commits your work, so leave your changes uncommitted and don't push. Work in this worktree, not the main checkout. Run the checks the contract names. End with the hand-off report the contract asks for; if it asks for none, end with the files you changed, each check you ran with its result, what the orchestrator should look closer at, and open questions."

MODEL="${DELEGATE_MODEL:-gpt-6.1-sol}"
EFFORT="${DELEGATE_EFFORT:-high}"
TIMEOUT_SECS="${DELEGATE_TIMEOUT_SECS:-3600}"
LOG_ROOT="${DELEGATE_LOG_ROOT:-${TMPDIR:-/tmp}/quickstacks-delegate}"
LAST_MESSAGE_LINES=60

usage() {
    sed -n '4,7p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
}

die() {
    echo "delegate.sh: $*" >&2
    exit 2
}

# --- args ----------------------------------------------------------------------
[ $# -ge 1 ] || usage
CONTRACT="$1"
shift
WRITE=0
WT=""
while [ $# -gt 0 ]; do
    case "$1" in
        --write) WRITE=1 ;;
        --worktree)
            [ $# -ge 2 ] || die "--worktree needs a path"
            WT="$2"
            shift
            ;;
        -h | --help) usage ;;
        *) die "unknown argument: $1" ;;
    esac
    shift
done

[ -n "$WT" ] || die "--worktree is required"
[ -s "$CONTRACT" ] || die "contract missing or empty: $CONTRACT"
CONTRACT="$(cd "$(dirname "$CONTRACT")" && pwd -P)/$(basename "$CONTRACT")"

[ -d "$WT" ] || die "worktree not found: $WT"
WT="$(cd "$WT" && pwd -P)"
TOP="$(git -C "$WT" rev-parse --show-toplevel 2>/dev/null)" || die "not a git work tree: $WT"
[ "$TOP" = "$WT" ] || die "--worktree must be the worktree root ($TOP), got $WT"
# In the main checkout git-dir and git-common-dir are the same directory.
GIT_DIR_ABS="$(cd "$WT" && cd "$(git rev-parse --git-dir)" && pwd -P)"
GIT_COMMON_ABS="$(cd "$WT" && cd "$(git rev-parse --git-common-dir)" && pwd -P)"
[ "$GIT_DIR_ABS" != "$GIT_COMMON_ABS" ] ||
    die "refusing to run a delegate in the main checkout ($WT); create a worktree under .claude/worktrees/"
[ -d "$WT/node_modules" ] || die "$WT has no node_modules; run bun install --frozen-lockfile there first"
CODEX="${CODEX_BIN:-$(command -v codex)}"
[ -n "$CODEX" ] && [ -x "$CODEX" ] || die "codex not found on PATH (or set CODEX_BIN)"

PROMPT="$PREAMBLE

$(cat "$CONTRACT")"

mkdir -p "$LOG_ROOT" || die "cannot create log root $LOG_ROOT"
# mktemp keeps two runs started in the same second from sharing a directory.
RUN_DIR="$(mktemp -d "$LOG_ROOT/$(basename "$WT")-$(date +%Y%m%d-%H%M%S)-XXXX")" ||
    die "cannot create a log dir under $LOG_ROOT"
TIMED_OUT_MARK="$RUN_DIR/.timed-out"
START_MARK="$RUN_DIR/.start"
EVENTS="$RUN_DIR/events.jsonl"
LAST_FILE="$RUN_DIR/last-message.md"

# --- helpers -------------------------------------------------------------------

# run_capped <secs> <cmd...>: run cmd, TERM it after <secs>, KILL 10s later. The watchdog's own
# fds point at /dev/null so a lingering sleep never holds the caller's stdout open.
run_capped() {
    local secs="$1"
    shift
    "$@" &
    local pid=$!
    (
        sleep "$secs" &
        s=$!
        trap 'kill "$s" 2>/dev/null; exit 0' TERM
        wait "$s"
        : >"$TIMED_OUT_MARK"
        kill -TERM "$pid" 2>/dev/null
        sleep 10
        kill -KILL "$pid" 2>/dev/null
    ) </dev/null >/dev/null 2>&1 &
    local wd=$!
    wait "$pid"
    local rc=$?
    kill -TERM "$wd" 2>/dev/null
    wait "$wd" 2>/dev/null
    return "$rc"
}

indent() {
    sed 's/^/  /'
}

changed_paths() {
    git -C "$WT" status --short --untracked-files=all 2>/dev/null | sort || true
}

# Files written during the run, including edits to paths already dirty and gitignored files,
# which a status diff alone would miss.
files_touched() {
    (cd "$WT" && find . \( -name .git -o -name node_modules -o -name dist -o -name coverage \
        -o -name logs -o -name .dev -o -name '*.tsbuildinfo' \) -prune \
        -o -type f -newer "$START_MARK" -print 2>/dev/null) | sed 's|^\./||' | sort
}

BEFORE="$(changed_paths)"
: >"$START_MARK"
sleep 1 # mtime granularity: anything written from here on is -newer the mark

SANDBOX="read-only"
[ "$WRITE" = 1 ] && SANDBOX="danger-full-access"

START=$(date +%s)
run_capped "$TIMEOUT_SECS" "$CODEX" exec \
    --ephemeral \
    --cd "$WT" \
    --sandbox "$SANDBOX" \
    --model "$MODEL" \
    -c "model_reasoning_effort=\"$EFFORT\"" \
    -c 'approval_policy="never"' \
    --json \
    --output-last-message "$LAST_FILE" \
    "$PROMPT" \
    </dev/null >"$EVENTS" 2>"$RUN_DIR/stderr.txt"
RC=$?
ELAPSED=$(($(date +%s) - START))

STATUS="failure"
if [ -e "$TIMED_OUT_MARK" ]; then
    REASON="timed out after ${TIMEOUT_SECS}s"
elif [ "$RC" -ne 0 ]; then
    REASON="codex exited $RC (see $RUN_DIR/stderr.txt)"
elif grep -q -E '"type":"(turn\.failed|error)"' "$EVENTS"; then
    REASON="turn failed: $(grep -m1 -E '"type":"(turn\.failed|error)"' "$EVENTS" | cut -c1-300)"
elif ! grep -q '"type":"turn.completed"' "$EVENTS"; then
    REASON="no turn.completed event"
elif [ ! -s "$LAST_FILE" ]; then
    REASON="empty last message"
else
    STATUS="success"
    REASON="turn completed"
fi

# --- digest --------------------------------------------------------------------
echo "delegate:  codex $MODEL ($EFFORT, $([ "$WRITE" = 1 ] && echo write || echo read-only))"
echo "worktree:  $WT"
echo "exit:      $RC  (${ELAPSED}s)"
echo "result:    $STATUS - $REASON"
echo "logs:      $RUN_DIR"

COMMANDS="$(jq -r 'select(.type == "item.completed" and .item.type == "command_execution")
    | "  [\(.item.exit_code)] \(.item.command | .[0:160])"' "$EVENTS" 2>/dev/null)"
if [ -n "$COMMANDS" ]; then
    echo "commands:  $(echo "$COMMANDS" | wc -l | tr -d ' ')"
    echo "$COMMANDS" | head -20
else
    echo "commands:  0"
fi

AFTER="$(changed_paths)"
NEW_STATUS="$(comm -13 <(echo "$BEFORE") <(echo "$AFTER") | sed '/^$/d')"
echo "git status entries new since the run started:"
if [ -n "$NEW_STATUS" ]; then indent <<<"$NEW_STATUS"; else echo "  (none)"; fi
TOUCHED="$(files_touched)"
echo "files written during the run:"
if [ -n "$TOUCHED" ]; then head -50 <<<"$TOUCHED" | indent; else echo "  (none)"; fi
if [ -n "$BEFORE" ]; then
    echo "  note: $(echo "$BEFORE" | wc -l | tr -d ' ') path(s) were already dirty before the run; review with git diff"
fi

echo "last message:"
if [ -s "$LAST_FILE" ]; then
    total=$(wc -l <"$LAST_FILE" | tr -d ' ')
    head -n "$LAST_MESSAGE_LINES" "$LAST_FILE" | indent
    [ "$total" -gt "$LAST_MESSAGE_LINES" ] && echo "  ... ($total lines, full text in $LAST_FILE)"
else
    echo "  (none)"
fi

[ "$STATUS" = success ]
