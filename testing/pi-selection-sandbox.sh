set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pi-sandbox-state.sh"
source "$SCRIPT_DIR/pi-tmux-sandbox-common.sh"

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
  --no-mirror-host-state  do not copy ~/.pi/agent/auth.json and settings.json into the sandbox
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
MIRROR_HOST_STATE="1"

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
	--no-mirror-host-state)
		MIRROR_HOST_STATE="0"
		shift 1
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

pi_tmux_require_command tmux

pi_tmux_prepare_sandbox_root "pi-selection-sandbox" SANDBOX_ROOT "$SANDBOX_ROOT"

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

mkdir -p "$NON_REPO_WORKDIR" "$REPO_ALPHA/.git" "$REPO_BETA/.git"
pi_tmux_prepare_agent_dir "$SANDBOX_ROOT" AGENT_DIR "$MIRROR_HOST_STATE"
rm -f "$CAPTURE_OUT" "$CAPTURE_BEFORE_SELECT" "$CAPTURE_AFTER_SELECT"

pi_tmux_start_session "$SESSION" "cd '$NON_REPO_WORKDIR' && PI_CODING_AGENT_DIR='$AGENT_DIR' pi -e /home/choza/projects/pi-helmsman/.pi/extensions/helmsman-context.ts"

if ! pi_tmux_wait_for_ready "$SESSION" 320 30 1 "[Extensions]" "[Context]" "No models available" "no-model" "ctx:uncertain"; then
	pi_tmux_capture_pane "$SESSION" 320 "$CAPTURE_OUT"
	echo "error: pi did not become ready within 30s" >&2
	exit 1
fi

pi_tmux_send_prompt "$SESSION" "continue current task" Enter "$WAIT_SECONDS"
pi_tmux_send_prompt "$SESSION" "/context-switch" Enter "$WAIT_SECONDS"
pi_tmux_capture_pane "$SESSION" 320 "$CAPTURE_BEFORE_SELECT"
tmux send-keys -t "$SESSION" Enter
sleep "$WAIT_SECONDS"
pi_tmux_capture_pane "$SESSION" 320 "$CAPTURE_AFTER_SELECT"
cp -f "$CAPTURE_AFTER_SELECT" "$CAPTURE_OUT"

printf 'session=%s\n' "$SESSION"
printf 'sandbox_root=%s\n' "$SANDBOX_ROOT"
printf 'workspace_root=%s\n' "$WORKSPACE_ROOT"
printf 'capture_before_select=%s\n' "$CAPTURE_BEFORE_SELECT"
printf 'capture_after_select=%s\n' "$CAPTURE_AFTER_SELECT"
printf 'capture_out=%s\n' "$CAPTURE_OUT"
printf 'agent_dir=%s\n' "$AGENT_DIR"
printf 'mirrored_host_state=%s\n' "$MIRROR_HOST_STATE"
