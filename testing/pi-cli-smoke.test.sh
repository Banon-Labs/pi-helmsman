#!/usr/bin/env bash
set -euo pipefail

script="./testing/pi-cli-smoke.sh"

if [[ ! -f "$script" ]]; then
	echo "missing script: $script" >&2
	exit 1
fi

help_output="$(bash "$script" --help)"

[[ "$help_output" == *"--session <name>"* ]]
[[ "$help_output" == *"--prompt <text>"* ]]
[[ "$help_output" == *"--sandbox-root <path>"* ]]
[[ "$help_output" == *"--extension <path>"* ]]
[[ "$help_output" == *"tmux"* ]]

echo "pi-cli-smoke help contract ok"
