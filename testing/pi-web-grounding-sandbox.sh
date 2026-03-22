#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'EOF'
Usage:
  testing/pi-web-grounding-sandbox.sh --session <name> [options]

Creates a temporary Helmsman web-grounding sandbox in tmux so you can try the
search-then-fetch authoritative-answer workflow outside the repo.

Options:
  --session <name>        tmux session name (required)
  --query <text>          authoritative-answer discovery query
                          (default: rfc 9110 http semantics)
  --limit <n>             search result limit passed to /authoritative-web
                          (default: 3)
  --sandbox-root <path>   sandbox root (default: mktemp dir)
  --capture-out <path>    final capture output path
  --wait-seconds <n>      wait after command submission (default: 7)
  --no-demo               launch pi in the sandbox but do not auto-run the
                          /authoritative-web workflow command

Artifacts:
  - capture.txt           final tmux capture
  - workdir/              sandbox working directory where .pi/web-searches and
                          .pi/web-refs will materialize

The helper auto-submits:
  /authoritative-web --limit <n> <query>

Then you can continue in tmux with e.g.:
  /fetch-web --format markdown <chosen-url>
EOF
}

SESSION=""
QUERY="rfc 9110 http semantics"
LIMIT="3"
SANDBOX_ROOT=""
CAPTURE_OUT=""
WAIT_SECONDS="7"
RUN_DEMO="1"

while [[ $# -gt 0 ]]; do
	case "$1" in
	--session)
		SESSION="${2:-}"
		shift 2
		;;
	--query)
		QUERY="${2:-}"
		shift 2
		;;
	--limit)
		LIMIT="${2:-}"
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
	--no-demo)
		RUN_DEMO="0"
		shift 1
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
	SANDBOX_ROOT="$(mktemp -d /tmp/pi-web-grounding-sandbox.XXXXXX)"
else
	mkdir -p "$SANDBOX_ROOT"
fi

if [[ -z "$CAPTURE_OUT" ]]; then
	CAPTURE_OUT="$SANDBOX_ROOT/capture.txt"
fi

WORKDIR="$SANDBOX_ROOT/workdir"
mkdir -p "$WORKDIR"
rm -f "$CAPTURE_OUT"

tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" "cd '$WORKDIR' && pi"

start_ts="$(date +%s)"
while true; do
	now_ts="$(date +%s)"
	if (( now_ts - start_ts >= 30 )); then
		tmux capture-pane -p -t "$SESSION" -S -400 > "$CAPTURE_OUT"
		echo "error: pi did not become ready within 30s" >&2
		exit 1
	fi
	pane_state="$(tmux capture-pane -p -t "$SESSION" -S -400)"
	if [[ "$pane_state" == *"[Extensions]"* || "$pane_state" == *"/ for commands"* || "$pane_state" == *"no-model"* ]]; then
		break
	fi
	sleep 1
done

if [[ "$RUN_DEMO" == "1" ]]; then
	tmux send-keys -t "$SESSION" Escape
	tmux send-keys -t "$SESSION" Escape
	sleep 1
	tmux send-keys -t "$SESSION" C-u
	tmux send-keys -t "$SESSION" "/authoritative-web --limit $LIMIT $QUERY"
	tmux send-keys -t "$SESSION" Enter
	sleep "$WAIT_SECONDS"
fi

tmux capture-pane -p -t "$SESSION" -S -500 > "$CAPTURE_OUT"

printf 'session=%s\n' "$SESSION"
printf 'sandbox_root=%s\n' "$SANDBOX_ROOT"
printf 'workdir=%s\n' "$WORKDIR"
printf 'capture_out=%s\n' "$CAPTURE_OUT"
