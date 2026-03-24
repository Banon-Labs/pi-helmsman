# Helmsman tmux sandbox extension

This extension exposes a Pi-native workflow for running Helmsman tmux sandbox scenarios.

## Commands

- `/tmux-sandbox`
  - Prompts for a scenario when none is supplied.
  - Accepts a scenario name as the first argument.

## Tool

- `helmsman_tmux_sandbox`
  - Callable by the LLM.
  - Uses the same scenario runner and structured evidence capture as the command.

## Scenarios

- `cli-smoke`
- `selection`
- `web-grounding`

## Backing scripts

The extension currently delegates to the existing tmux smoke scripts:

- `testing/pi-cli-smoke.sh`
- `testing/pi-selection-sandbox.sh`
- `testing/pi-web-grounding-sandbox.sh`

The goal is to keep those scripts as thin compatibility wrappers while the extension becomes the primary user-facing surface.

## Structured evidence

Every run appends a `helmsman-tmux-sandbox-run` entry containing:

- scenario
- request parameters
- stdout/stderr summary
- parsed session / sandbox / capture paths when available
- exit code
