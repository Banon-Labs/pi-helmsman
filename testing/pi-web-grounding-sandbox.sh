set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pi-sandbox-state.sh"
source "$SCRIPT_DIR/pi-tmux-sandbox-common.sh"

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
  --no-mirror-host-state  do not copy ~/.pi/agent/auth.json and settings.json into the sandbox
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
MIRROR_HOST_STATE="1"

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
	--no-mirror-host-state)
		MIRROR_HOST_STATE="0"
		shift 1
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

pi_tmux_prepare_sandbox_root "pi-web-grounding-sandbox" SANDBOX_ROOT "$SANDBOX_ROOT"

if [[ -z "$CAPTURE_OUT" ]]; then
	CAPTURE_OUT="$SANDBOX_ROOT/capture.txt"
fi

WORKDIR="$SANDBOX_ROOT/workdir"
AGENT_DIR="$SANDBOX_ROOT/agent"
mkdir -p "$WORKDIR"
pi_tmux_prepare_agent_dir "$SANDBOX_ROOT" AGENT_DIR "$MIRROR_HOST_STATE"
rm -f "$CAPTURE_OUT"

pi_tmux_start_session "$SESSION" "cd '$WORKDIR' && PI_CODING_AGENT_DIR='$AGENT_DIR' pi"

if ! pi_tmux_wait_for_ready "$SESSION" 400 30 1 "[Extensions]" "/ for commands" "no-model"; then
	pi_tmux_capture_pane "$SESSION" 400 "$CAPTURE_OUT"
	echo "error: pi did not become ready within 30s" >&2
	exit 1
fi

if [[ "$RUN_DEMO" == "1" ]]; then
	pi_tmux_send_prompt "$SESSION" "/authoritative-web --limit $LIMIT $QUERY" Enter "$WAIT_SECONDS"
fi

pi_tmux_capture_pane "$SESSION" 500 "$CAPTURE_OUT"

printf 'session=%s\n' "$SESSION"
printf 'sandbox_root=%s\n' "$SANDBOX_ROOT"
printf 'workdir=%s\n' "$WORKDIR"
printf 'capture_out=%s\n' "$CAPTURE_OUT"
printf 'agent_dir=%s\n' "$AGENT_DIR"
printf 'mirrored_host_state=%s\n' "$MIRROR_HOST_STATE"
