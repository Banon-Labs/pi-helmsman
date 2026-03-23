#!/usr/bin/env bash
set -euo pipefail

script="./testing/pi-selection-sandbox.sh"

if [[ ! -f "$script" ]]; then
	echo "missing script: $script" >&2
	exit 1
fi

help_output="$(bash "$script" --help)"

[[ "$help_output" == *"--session <name>"* ]]
[[ "$help_output" == *"--capture-out <path>"* ]]
[[ "$help_output" == *"--no-mirror-host-state"* ]]
[[ "$help_output" == *"ambiguous repo-selection sandbox"* ]]
[[ "$help_output" == *"capture.before-select.txt"* ]]
[[ "$help_output" == *"/context-switch"* ]]

echo "pi-selection-sandbox help contract ok"
