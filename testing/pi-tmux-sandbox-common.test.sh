set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pi-sandbox-state.sh"
source "$SCRIPT_DIR/pi-tmux-sandbox-common.sh"

tmp_root="$(mktemp -d /tmp/pi-tmux-common-test.XXXXXX)"
trap 'rm -rf "$tmp_root"' EXIT

source_agent="$tmp_root/source-agent"
mkdir -p "$source_agent"
printf 'auth-data' > "$source_agent/auth.json"
printf 'settings-data' > "$source_agent/settings.json"
PI_CODING_AGENT_DIR="$source_agent"
export PI_CODING_AGENT_DIR

declare sandbox_root agent_dir
pi_tmux_prepare_sandbox_root "pi-tmux-common-test" sandbox_root "$tmp_root/sandbox"
[[ -d "$sandbox_root" ]]

pi_tmux_prepare_agent_dir "$sandbox_root" agent_dir 1
[[ -f "$agent_dir/auth.json" ]]
[[ -f "$agent_dir/settings.json" ]]

printf 'pi tmux common helper ok\n'
