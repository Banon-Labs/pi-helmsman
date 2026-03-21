export const TOOL_NAME = "fetch_reference";
export const COMMAND_NAME = "fetch-reference";
export const CACHE_ROOT = ".pi/remote-refs";
export const POLICY_VERSION = 2;
export const MAX_BYTES = 256 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
export const ALLOWED_HOSTS = new Set(["raw.githubusercontent.com", "github.com"]);
export const ALLOWED_REPOSITORIES = new Set(["badlogic/pi-mono", "Banon-Labs/pi-helmsman"]);
