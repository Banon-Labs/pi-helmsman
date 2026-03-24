set -euo pipefail

pi_tmux_require_command() {
	local name="$1"
	if ! command -v "$name" >/dev/null 2>&1; then
		echo "error: $name not found in PATH" >&2
		return 127
	fi
}

pi_tmux_prepare_sandbox_root() {
	local prefix="$1"
	local sandbox_root_var="$2"
	local requested_root="${3:-}"
	local resolved_root="${requested_root:-}"
	if [[ -z "$resolved_root" ]]; then
		resolved_root="$(mktemp -d "/tmp/${prefix}.XXXXXX")"
	else
		mkdir -p "$resolved_root"
	fi
	printf -v "$sandbox_root_var" '%s' "$resolved_root"
}

pi_tmux_prepare_agent_dir() {
	local sandbox_root="$1"
	local agent_dir_var="$2"
	local mirror_host_state="${3:-1}"
	local resolved_agent_dir="$sandbox_root/agent"
	mkdir -p "$resolved_agent_dir"
	if [[ "$mirror_host_state" == "1" ]]; then
		mirror_pi_agent_state "$resolved_agent_dir"
	fi
	printf -v "$agent_dir_var" '%s' "$resolved_agent_dir"
}

pi_tmux_kill_session() {
	local session="$1"
	tmux kill-session -t "$session" 2>/dev/null || true
}

pi_tmux_start_session() {
	local session="$1"
	local command="$2"
	pi_tmux_kill_session "$session"
	tmux new-session -d -s "$session" "$command"
}

pi_tmux_wait_for_ready() {
	local session="$1"
	local capture_lines="$2"
	local timeout_seconds="$3"
	local probe_interval_seconds="$4"
	shift 4
	local -a markers=("$@")

	local start_ts now_ts pane_state matched
	start_ts="$(date +%s)"
	while true; do
		now_ts="$(date +%s)"
		if (( now_ts - start_ts >= timeout_seconds )); then
			tmux capture-pane -p -t "$session" -S -"$capture_lines" > /dev/null
			return 1
		fi

		pane_state="$(tmux capture-pane -p -t "$session" -S -"$capture_lines")"
		matched="0"
		for marker in "${markers[@]}"; do
			if [[ "$pane_state" == *"$marker"* ]]; then
				matched="1"
				break
			fi
		done
		if [[ "$matched" == "1" ]]; then
			return 0
		fi
		sleep "$probe_interval_seconds"
	done
}

pi_tmux_send_prompt() {
	local session="$1"
	local prompt="$2"
	local submit_key="${3:-Enter}"
	local wait_seconds="${4:-1}"
	tmux send-keys -t "$session" Escape
	tmux send-keys -t "$session" Escape
	sleep 1
	tmux send-keys -t "$session" C-u
	tmux send-keys -t "$session" "$prompt"
	tmux send-keys -t "$session" "$submit_key"
	sleep "$wait_seconds"
}

pi_tmux_capture_pane() {
	local session="$1"
	local capture_lines="$2"
	local capture_out="$3"
	tmux capture-pane -p -t "$session" -S -"$capture_lines" > "$capture_out"
}
