#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-$(pwd)}"
source_file="$repo_root/scripts/e2e/real-api-tool-use.mjs"
dest_file="${2:-/tmp/tachyon-real-api-tool-use-no-reload.mjs}"

if [[ ! -f "$source_file" ]]; then
  echo "source runner not found: $source_file" >&2
  exit 1
fi

python3 - "$source_file" "$dest_file" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
text = src.read_text()

reload_old = "\n    await enableTestMode(options.webdriverUrl, sessionId);"
reload_new = (
    "\n    // DEV app exposes the test bridge; avoid reload because tauri-wd "
    "0.1.3 can poison its script lock on reload."
)
if reload_old in text:
    text = text.replace(reload_old, reload_new, 1)
else:
    print("warning: enableTestMode call was not found; no reload patch applied", file=sys.stderr)

wait_old = """    const finalState = await waitFor(
      options.webdriverUrl,
      sessionId,
      (state) =>
        !!state &&
        !state.isLoading &&
        state.chunks.some((chunk) => chunk.type !== "user"),
      options.timeoutMs,
      "chat completion",
    );"""

wait_new = """    let finalState;
    try {
      finalState = await waitFor(
        options.webdriverUrl,
        sessionId,
        (state) =>
          !!state &&
          !state.isLoading &&
          state.chunks.some((chunk) => chunk.type !== "user"),
        options.timeoutMs,
        "chat completion",
      );
    } catch (error) {
      finalState = await getBridgeState(options.webdriverUrl, sessionId);
      report.failures.push(
        error instanceof Error ? error.message : String(error),
      );
    }"""

if wait_old in text:
    text = text.replace(wait_old, wait_new, 1)
else:
    print("warning: chat completion wait block was not found; no timeout-state patch applied", file=sys.stderr)

assert_old = "    report.failures = assertExpectations(finalState, options);"
assert_new = "    report.failures.push(...assertExpectations(finalState, options));"
if assert_old in text:
    text = text.replace(assert_old, assert_new, 1)
else:
    print("warning: assertExpectations assignment was not found; no failure-append patch applied", file=sys.stderr)

dst.write_text(text)
print(dst)
PY

node --check "$dest_file" >/dev/null
echo "prepared $dest_file"
