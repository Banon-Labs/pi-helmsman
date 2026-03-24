set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pi-sandbox-state.sh"
source "$SCRIPT_DIR/pi-tmux-sandbox-common.sh"

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

pi_tmux_require_command pi
pi_tmux_require_command tmux

pi_tmux_prepare_sandbox_root "pi-cli-smoke" SANDBOX_ROOT "$SANDBOX_ROOT"

if [[ -z "$CAPTURE_OUT" ]]; then
	CAPTURE_OUT="$SANDBOX_ROOT/pi-cli-smoke-capture.txt"
fi

pi_tmux_prepare_agent_dir "$SANDBOX_ROOT" AGENT_DIR "$MIRROR_HOST_STATE"
rm -f "$CAPTURE_OUT"

pi_args=()
for extension in "${EXTENSIONS[@]}"; do
	pi_args+=( -e "$extension" )
done

pi_args_escaped=""
for arg in "${pi_args[@]}"; do
	printf -v q '%q' "$arg"
	pi_args_escaped+=" $q"
done

pi_tmux_start_session "$SESSION" "cd \"$WORKDIR\" && PI_CODING_AGENT_DIR=\"$AGENT_DIR\" pi${pi_args_escaped}"

if ! pi_tmux_wait_for_ready "$SESSION" "$CAPTURE_LINES" "$READY_TIMEOUT_SECONDS" "$READY_PROBE_INTERVAL_SECONDS" \
	"Ask anything" "ctrl+p commands" "loaded AGENTS.md" "[Context]" "no-model" "No models available"; then
	pi_tmux_capture_pane "$SESSION" "$CAPTURE_LINES" "$CAPTURE_OUT"
	echo "error: pi did not become ready within ${READY_TIMEOUT_SECONDS}s" >&2
	exit 1
fi

pi_tmux_send_prompt "$SESSION" "$PROMPT" "$SUBMIT_KEY" "$WAIT_SECONDS"
pi_tmux_capture_pane "$SESSION" "$CAPTURE_LINES" "$CAPTURE_OUT"

printf 'session=%s\n' "$SESSION"
printf 'sandbox_root=%s\n' "$SANDBOX_ROOT"
printf 'agent_dir=%s\n' "$AGENT_DIR"
printf 'mirrored_host_state=%s\n' "$MIRROR_HOST_STATE"
printf 'capture_out=%s\n' "$CAPTURE_OUT"
