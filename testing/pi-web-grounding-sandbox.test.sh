#!/usr/bin/env bash
set -euo pipefail

script="./testing/pi-web-grounding-sandbox.sh"

if [[ ! -f "$script" ]]; then
	echo "missing script: $script" >&2
	exit 1
fi

help_output="$(bash "$script" --help)"

[[ "$help_output" == *"--session <name>"* ]]
[[ "$help_output" == *"--query <text>"* ]]
[[ "$help_output" == *"--no-demo"* ]]
[[ "$help_output" == *"/authoritative-web --limit <n> <query>"* ]]
[[ "$help_output" == *"/fetch-web --format markdown <chosen-url>"* ]]

echo "pi-web-grounding-sandbox help contract ok"
