# Pi Input Pathways Cache

Compact reference for reproducible smoke tests and future session reuse.

## Primary input pathways

1. **Interactive startup with initial message args**
   - `pi "message"`
   - Starts interactive TUI and seeds the first user prompt.

2. **Non-interactive print mode**
   - `pi -p "message"`
   - Processes one prompt and exits.

3. **Interactive resumed session with initial message**
   - `pi -c "message"`
   - Continues the prior session and submits an initial message.

4. **Interactive session picker**
   - `pi -r`
   - Opens the `/resume` flow from CLI startup.

5. **Explicit session routing**
   - `pi --session <path-or-id>`
   - `pi --fork <path-or-id>`
   - `pi --no-session`

6. **Interactive editor command path**
   - Type `/` in the editor to access built-in commands and extension commands.
   - Relevant for smoke: `/resume`, `/reload`, `/session`, `/new`, custom commands like `/fetch-reference`.

7. **Extension loading path**
   - `pi -e <path>`
   - Project-local discovery also applies unless disabled.

## Deterministic smoke notes

- Prefer **CLI startup flags** plus one tmux-submitted prompt for repeatability.
- For isolation, set `PI_CODING_AGENT_DIR` to a sandbox path.
- Session files live under `~/.pi/agent/sessions/` by default, or under `$PI_CODING_AGENT_DIR/sessions/` when overridden.
- Slash commands are entered through the same editor input path as normal prompts.
- `/reload` reloads extensions/skills/prompts/themes/context files, but a fresh session is still safer for instruction-file changes like `AGENTS.md`.

## Readiness / submission heuristics used by harness

- Ready indicators observed in pi docs/UI text:
  - `Ask anything`
  - `ctrl+p commands`
  - startup header showing loaded context files/extensions
- Default tmux submission path:
  - clear editor with `C-u`
  - send prompt text
  - submit with `Enter`

## Deterministic selection-prompt sandbox

- Helper: `testing/pi-selection-sandbox.sh`
- Purpose: force the `/context-switch` repo-selection UI path in a controlled tmux sandbox.
- Strategy:
  - start pi from a **non-repo** working directory
  - create two sibling fake git repos under the same workspace root
  - submit a neutral goal so neither repo gets an input-based edge
  - run `/context-switch` with no explicit target
  - capture pane state **before** selection and **after** accepting the first option
- Expected proof:
  - before-select capture shows `Choose target repo`
  - after-select capture shows `Explicit context-correction flow:` with the chosen repo

## Sources

- `pi --help`
- `packages/coding-agent/README.md`
- `packages/coding-agent/docs/session.md`
- `packages/coding-agent/src/core/slash-commands.ts`
- `packages/coding-agent/docs/tmux.md`
