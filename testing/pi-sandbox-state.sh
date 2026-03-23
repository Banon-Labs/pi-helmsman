#!/usr/bin/env bash
set -euo pipefail

resolve_pi_agent_state_root() {
	if [[ -n "${PI_CODING_AGENT_DIR:-}" ]]; then
		printf '%s\n' "$PI_CODING_AGENT_DIR"
		return 0
	fi
	printf '%s\n' "$HOME/.pi/agent"
}

mirror_pi_agent_state() {
	if [[ $# -lt 1 || $# -gt 2 ]]; then
		echo "usage: mirror_pi_agent_state <dest-agent-dir> [source-agent-dir]" >&2
		return 2
	fi

	local dest_agent_dir="$1"
	local source_agent_dir="${2:-$(resolve_pi_agent_state_root)}"
	mkdir -p "$dest_agent_dir"

	for file_name in auth.json settings.json; do
		local src="$source_agent_dir/$file_name"
		local dest="$dest_agent_dir/$file_name"
		if [[ -f "$src" ]]; then
			cp -f "$src" "$dest"
		fi
	done
}
