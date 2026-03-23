#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./pi-sandbox-state.sh
source "$SCRIPT_DIR/pi-sandbox-state.sh"

usage() {
	cat <<'EOF'
Usage:
  testing/pi-cli-smoke.sh --session <name> --prompt <text> [options]

Required:
  --session <name>        tmux session name
  --prompt <text>         prompt text submitted to pi

Optional:
  --workdir <path>        working directory for pi (default: current directory)
  --sandbox-root <path>   isolated PI_CODING_AGENT_DIR root (default: mktemp dir)
  --extension <path>      extension file passed via -e (repeatable)
  --no-mirror-host-state  do not copy ~/.pi/agent/auth.json and settings.json into the sandbox
  --capture-out <path>    pane capture output path
  --capture-lines <n>     tmux history lines to capture (default: 320)
  --ready-timeout-seconds <n>
                          max wait for pi readiness (default: 30)
  --ready-probe-interval-seconds <n>
                          readiness probe interval (default: 1)
  --submit-key <key>      prompt submit key (default: Enter)
  --wait-seconds <n>      fixed wait after submit before capture (default: 8)

This helper creates a tmux-based pi smoke session with an isolated sandbox,
submits one prompt, captures the pane output, and prints artifact paths.
EOF
}

SESSION=""
PROMPT=""
WORKDIR="$(pwd)"
SANDBOX_ROOT=""
CAPTURE_OUT=""
CAPTURE_LINES="320"
READY_TIMEOUT_SECONDS="30"
READY_PROBE_INTERVAL_SECONDS="1"
SUBMIT_KEY="Enter"
WAIT_SECONDS="8"
MIRROR_HOST_STATE="1"
declare -a EXTENSIONS=()

while [[ $# -gt 0 ]]; do
	case "$1" in
	--session)
		SESSION="${2:-}"
		shift 2
		;;
	--prompt)
		PROMPT="${2:-}"
		shift 2
		;;
	--workdir)
		WORKDIR="${2:-}"
		shift 2
		;;
	--sandbox-root)
		SANDBOX_ROOT="${2:-}"
		shift 2
		;;
	--extension)
		EXTENSIONS+=("${2:-}")
		shift 2
		;;
	--no-mirror-host-state)
		MIRROR_HOST_STATE="0"
		shift 1
		;;
	--capture-out)
		CAPTURE_OUT="${2:-}"
		shift 2
		;;
	--capture-lines)
		CAPTURE_LINES="${2:-}"
		shift 2
		;;
	--ready-timeout-seconds)
		READY_TIMEOUT_SECONDS="${2:-}"
		shift 2
		;;
	--ready-probe-interval-seconds)
		READY_PROBE_INTERVAL_SECONDS="${2:-}"
		shift 2
		;;
	--submit-key)
		SUBMIT_KEY="${2:-}"
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

if [[ -z "$SESSION" || -z "$PROMPT" ]]; then
	usage >&2
	exit 2
fi

if ! command -v pi >/dev/null 2>&1; then
	echo "error: pi not found in PATH" >&2
	exit 127
fi

if ! command -v tmux >/dev/null 2>&1; then
	echo "error: tmux not found in PATH" >&2
	exit 127
fi

if [[ -z "$SANDBOX_ROOT" ]]; then
	SANDBOX_ROOT="$(mktemp -d /tmp/pi-cli-smoke.XXXXXX)"
else
	mkdir -p "$SANDBOX_ROOT"
fi

if [[ -z "$CAPTURE_OUT" ]]; then
	CAPTURE_OUT="$SANDBOX_ROOT/pi-cli-smoke-capture.txt"
fi

AGENT_DIR="$SANDBOX_ROOT/agent"
mkdir -p "$AGENT_DIR"
if [[ "$MIRROR_HOST_STATE" == "1" ]]; then
	mirror_pi_agent_state "$AGENT_DIR"
fi
rm -f "$CAPTURE_OUT"
tmux kill-session -t "$SESSION" 2>/dev/null || true

pi_args=()
for extension in "${EXTENSIONS[@]}"; do
	pi_args+=( -e "$extension" )
done

pi_args_escaped=""
for arg in "${pi_args[@]}"; do
	printf -v q '%q' "$arg"
	pi_args_escaped+=" $q"
done

tmux new-session -d -s "$SESSION" "cd \"$WORKDIR\" && PI_CODING_AGENT_DIR=\"$AGENT_DIR\" pi${pi_args_escaped}"

start_ts="$(date +%s)"
while true; do
	now_ts="$(date +%s)"
	if (( now_ts - start_ts >= READY_TIMEOUT_SECONDS )); then
		tmux capture-pane -p -t "$SESSION" -S -"$CAPTURE_LINES" > "$CAPTURE_OUT"
		echo "error: pi did not become ready within ${READY_TIMEOUT_SECONDS}s" >&2
		exit 1
	fi

	pane_state="$(tmux capture-pane -p -t "$SESSION" -S -"$CAPTURE_LINES")"
	if [[ "$pane_state" == *"Ask anything"* || "$pane_state" == *"ctrl+p commands"* || "$pane_state" == *"loaded AGENTS.md"* || "$pane_state" == *"[Context]"* || "$pane_state" == *"no-model"* || "$pane_state" == *"No models available"* ]]; then
		break
	fi
	sleep "$READY_PROBE_INTERVAL_SECONDS"
done

tmux send-keys -t "$SESSION" Escape
tmux send-keys -t "$SESSION" Escape
sleep 1
tmux send-keys -t "$SESSION" C-u
tmux send-keys -t "$SESSION" "$PROMPT"
tmux send-keys -t "$SESSION" "$SUBMIT_KEY"
sleep "$WAIT_SECONDS"
tmux capture-pane -p -t "$SESSION" -S -"$CAPTURE_LINES" > "$CAPTURE_OUT"

printf 'session=%s\n' "$SESSION"
printf 'sandbox_root=%s\n' "$SANDBOX_ROOT"
printf 'agent_dir=%s\n' "$AGENT_DIR"
printf 'mirrored_host_state=%s\n' "$MIRROR_HOST_STATE"
printf 'capture_out=%s\n' "$CAPTURE_OUT"
