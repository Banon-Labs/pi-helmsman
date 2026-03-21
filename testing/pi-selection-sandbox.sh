#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'EOF'
Usage:
  testing/pi-selection-sandbox.sh --session <name> [options]

Creates an ambiguous repo-selection sandbox for Helmsman /context-switch,
using a non-repo working directory plus two sibling fake git repos so the
selection prompt path is deterministic in tmux.

Options:
  --session <name>        tmux session name (required)
  --sandbox-root <path>   sandbox root (default: mktemp dir)
  --capture-out <path>    final capture output path
  --wait-seconds <n>      wait after each step (default: 4)

Artifacts written beside the final capture:
  - capture.before-select.txt
  - capture.after-select.txt

The helper submits:
  1. a neutral user goal
  2. /context-switch
  3. Enter to accept the first repo from the selection prompt
EOF
}

SESSION=""
SANDBOX_ROOT=""
CAPTURE_OUT=""
WAIT_SECONDS="4"

while [[ $# -gt 0 ]]; do
	case "$1" in
	--session)
		SESSION="${2:-}"
		shift 2
		;;
	--sandbox-root)
		SANDBOX_ROOT="${2:-}"
		shift 2
		;;
	--capture-out)
		CAPTURE_OUT="${2:-}"
		shift 2
		;;
	--wait-seconds)
		WAIT_SECONDS="${2:-}"
		shift 2
		;;
	-h|--help)
		usage
		exit 0
		;;
	*)
		echo "Unknown argument: $1" >&2
		usage >&2
		exit 2
		;;
	esac
done

if [[ -z "$SESSION" ]]; then
	usage >&2
	exit 2
fi

if [[ -z "$SANDBOX_ROOT" ]]; then
	SANDBOX_ROOT="$(mktemp -d /tmp/pi-selection-sandbox.XXXXXX)"
else
	mkdir -p "$SANDBOX_ROOT"
fi

if [[ -z "$CAPTURE_OUT" ]]; then
	CAPTURE_OUT="$SANDBOX_ROOT/capture.txt"
fi
CAPTURE_BEFORE_SELECT="${CAPTURE_OUT%.txt}.before-select.txt"
CAPTURE_AFTER_SELECT="${CAPTURE_OUT%.txt}.after-select.txt"

WORKSPACE_ROOT="$SANDBOX_ROOT/workspace"
NON_REPO_WORKDIR="$WORKSPACE_ROOT/notes"
REPO_ALPHA="$WORKSPACE_ROOT/alpha-repo"
REPO_BETA="$WORKSPACE_ROOT/beta-repo"
AGENT_DIR="$SANDBOX_ROOT/agent"

mkdir -p "$NON_REPO_WORKDIR" "$REPO_ALPHA/.git" "$REPO_BETA/.git" "$AGENT_DIR"
rm -f "$CAPTURE_OUT" "$CAPTURE_BEFORE_SELECT" "$CAPTURE_AFTER_SELECT"

tmux kill-session -t "$SESSION" 2>/dev/null || true

tmux new-session -d -s "$SESSION" "cd '$NON_REPO_WORKDIR' && PI_CODING_AGENT_DIR='$AGENT_DIR' pi -e /home/choza/projects/pi-helmsman/.pi/extensions/helmsman-context.ts"

start_ts="$(date +%s)"
while true; do
	now_ts="$(date +%s)"
	if (( now_ts - start_ts >= 30 )); then
		tmux capture-pane -p -t "$SESSION" -S -320 > "$CAPTURE_OUT"
		echo "error: pi did not become ready within 30s" >&2
		exit 1
	fi
	pane_state="$(tmux capture-pane -p -t "$SESSION" -S -320)"
	if [[ "$pane_state" == *"[Context]"* || "$pane_state" == *"No models available"* || "$pane_state" == *"no-model"* ]]; then
		break
	fi
	sleep 1
done

send_prompt() {
	local text="$1"
	tmux send-keys -t "$SESSION" Escape
	tmux send-keys -t "$SESSION" Escape
	sleep 1
	tmux send-keys -t "$SESSION" C-u
	tmux send-keys -t "$SESSION" "$text"
	tmux send-keys -t "$SESSION" Enter
	sleep "$WAIT_SECONDS"
}

send_prompt "continue current task"
send_prompt "/context-switch"
tmux capture-pane -p -t "$SESSION" -S -320 > "$CAPTURE_BEFORE_SELECT"
tmux send-keys -t "$SESSION" Enter
sleep "$WAIT_SECONDS"
tmux capture-pane -p -t "$SESSION" -S -320 > "$CAPTURE_AFTER_SELECT"
cp -f "$CAPTURE_AFTER_SELECT" "$CAPTURE_OUT"

printf 'session=%s\n' "$SESSION"
printf 'sandbox_root=%s\n' "$SANDBOX_ROOT"
printf 'workspace_root=%s\n' "$WORKSPACE_ROOT"
printf 'capture_before_select=%s\n' "$CAPTURE_BEFORE_SELECT"
printf 'capture_after_select=%s\n' "$CAPTURE_AFTER_SELECT"
printf 'capture_out=%s\n' "$CAPTURE_OUT"
