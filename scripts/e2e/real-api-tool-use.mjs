#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_WEBDRIVER_URL = "http://127.0.0.1:4444";
const DEFAULT_BINARY_PATH = resolve(
  process.cwd(),
  "src-tauri/target/debug/tachyon-cowork",
);
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 960;
const DEFAULT_TIMEOUT_MS = 120_000;
const TEST_MODE_STORAGE_KEY = "__tachyon_test_mode";

function printUsage() {
  console.log(`Usage:
  node scripts/e2e/real-api-tool-use.mjs --message "toolを使って..." [options]

Required:
  --message <text>                 User message to send

Options:
  --task <text>                    Optional task override sent to the agent API
  --project <abs-path>             Activate this project before sending
  --model <model-id>               Select a model before sending
  --binary <path>                  Tauri debug binary path
  --webdriver-url <url>            WebDriver server base URL
  --timeout-ms <n>                 Overall wait timeout after send
  --output <path>                  Write full JSON report to this file
  --expect-tool <name>             Assert that at least one chunk used this tool (repeatable)
  --expect-chunk-type <type>       Assert that at least one chunk has this type (repeatable)
  --keep-session                   Do not delete the WebDriver session
  --help                           Show this help

Environment:
  TACHYON_E2E_API_BASE_URL         Real API base URL
  TACHYON_E2E_ACCESS_TOKEN         Access token
  TACHYON_E2E_TENANT_ID            Tenant ID
  TACHYON_E2E_USER_ID              Optional user ID
  TACHYON_E2E_REFRESH_TOKEN        Optional refresh token

If the required auth env vars are omitted, the runner will try to reuse
auth already stored in the app.
`);
}

function parseArgs(argv) {
  const parsed = {
    message: "",
    task: undefined,
    project: undefined,
    model: undefined,
    binary: DEFAULT_BINARY_PATH,
    webdriverUrl: DEFAULT_WEBDRIVER_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    output: undefined,
    expectTools: [],
    expectChunkTypes: [],
    keepSession: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];

    const readValue = () => {
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${current}`);
      }
      i += 1;
      return next;
    };

    if (current === "--help") {
      printUsage();
      process.exit(0);
    }
    if (current === "--message") {
      parsed.message = readValue();
      continue;
    }
    if (current === "--task") {
      parsed.task = readValue();
      continue;
    }
    if (current === "--project") {
      parsed.project = readValue();
      continue;
    }
    if (current === "--model") {
      parsed.model = readValue();
      continue;
    }
    if (current === "--binary") {
      parsed.binary = resolve(readValue());
      continue;
    }
    if (current === "--webdriver-url") {
      parsed.webdriverUrl = readValue().replace(/\/+$/, "");
      continue;
    }
    if (current === "--timeout-ms") {
      parsed.timeoutMs = Number(readValue());
      continue;
    }
    if (current === "--output") {
      parsed.output = resolve(readValue());
      continue;
    }
    if (current === "--expect-tool") {
      parsed.expectTools.push(readValue());
      continue;
    }
    if (current === "--expect-chunk-type") {
      parsed.expectChunkTypes.push(readValue());
      continue;
    }
    if (current === "--keep-session") {
      parsed.keepSession = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!parsed.message) {
    throw new Error("--message is required");
  }

  return parsed;
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function webdriverRequest(baseUrl, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `WebDriver request failed (${response.status} ${response.statusText}): ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
  }

  return parsed;
}

async function createSession(baseUrl, binaryPath) {
  const response = await webdriverRequest(baseUrl, "POST", "/session", {
    capabilities: {
      alwaysMatch: {
        "tauri:options": {
          binary: binaryPath,
        },
      },
    },
  });

  const sessionId = response?.value?.sessionId;
  if (!sessionId) {
    throw new Error(`WebDriver sessionId missing in response: ${JSON.stringify(response)}`);
  }

  return sessionId;
}

async function deleteSession(baseUrl, sessionId) {
  await webdriverRequest(baseUrl, "DELETE", `/session/${sessionId}`);
}

async function setWindowRect(baseUrl, sessionId) {
  await webdriverRequest(
    baseUrl,
    "POST",
    `/session/${sessionId}/window/rect`,
    { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
  );
}

async function executeSync(baseUrl, sessionId, script, args = []) {
  const response = await webdriverRequest(
    baseUrl,
    "POST",
    `/session/${sessionId}/execute/sync`,
    { script, args },
  );
  return response?.value;
}

async function executeAsync(baseUrl, sessionId, script, args = []) {
  const response = await webdriverRequest(
    baseUrl,
    "POST",
    `/session/${sessionId}/execute/async`,
    { script, args },
  );
  return response?.value;
}

async function enableTestMode(baseUrl, sessionId) {
  await executeSync(
    baseUrl,
    sessionId,
    `
      localStorage.setItem(arguments[0], "1");
      location.reload();
      return true;
    `,
    [TEST_MODE_STORAGE_KEY],
  );
}

async function waitFor(baseUrl, sessionId, predicate, timeoutMs, label) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = await getBridgeState(baseUrl, sessionId);
    if (predicate(state)) {
      return state;
    }
    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForBridge(baseUrl, sessionId, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ready = await executeSync(
      baseUrl,
      sessionId,
      "return !!window.__tachyonTestBridge;",
    );
    if (ready) {
      return;
    }
    await sleep(1000);
  }

  throw new Error("Timed out waiting for test bridge");
}

async function getBridgeState(baseUrl, sessionId) {
  return executeSync(
    baseUrl,
    sessionId,
    `
      const bridge = window.__tachyonTestBridge;
      if (!bridge) {
        return null;
      }
      return bridge.getState();
    `,
  );
}

async function callBridge(baseUrl, sessionId, method, args = []) {
  const result = await executeAsync(
    baseUrl,
    sessionId,
    `
      const done = arguments[arguments.length - 1];
      const method = arguments[0];
      const bridgeArgs = arguments[1];
      const bridge = window.__tachyonTestBridge;
      if (!bridge) {
        done({ ok: false, error: "window.__tachyonTestBridge is not available" });
        return;
      }
      const fn = bridge[method];
      if (typeof fn !== "function") {
        done({ ok: false, error: \`Unknown bridge method: \${method}\` });
        return;
      }
      Promise.resolve(fn(...bridgeArgs))
        .then((value) => done({ ok: true, value }))
        .catch((error) =>
          done({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
    `,
    [method, args],
  );

  if (!result?.ok) {
    throw new Error(result?.error ?? `Bridge call failed: ${method}`);
  }

  return result.value;
}

function summarizeChunks(chunks) {
  const chunkCounts = {};
  const toolCalls = [];
  const toolResults = [];
  const assistantTexts = [];

  for (const chunk of chunks) {
    chunkCounts[chunk.type] = (chunkCounts[chunk.type] ?? 0) + 1;

    if (
      chunk.type === "tool_call" ||
      chunk.type === "tool_call_args" ||
      chunk.type === "tool_call_pending"
    ) {
      toolCalls.push({
        id: chunk.id,
        type: chunk.type,
        tool_id: chunk.tool_id ?? null,
        tool_name: chunk.tool_name ?? null,
        tool_arguments: chunk.tool_arguments ?? null,
      });
    }

    if (chunk.type === "tool_result") {
      toolResults.push({
        id: chunk.id,
        tool_id: chunk.tool_id ?? null,
        tool_name: chunk.tool_name ?? null,
        tool_result: chunk.tool_result ?? chunk.result ?? chunk.text ?? null,
      });
    }

    if (
      chunk.type === "assistant" ||
      chunk.type === "say" ||
      chunk.type === "completion" ||
      chunk.type === "attempt_completion"
    ) {
      if (chunk.text || chunk.content) {
        assistantTexts.push({
          id: chunk.id,
          type: chunk.type,
          text: chunk.text ?? chunk.content ?? "",
        });
      }
    }
  }

  return {
    chunkCounts,
    toolCalls,
    toolResults,
    assistantTexts,
  };
}

function assertExpectations(state, options) {
  const failures = [];
  const toolNames = new Set(
    state.chunks
      .map((chunk) => chunk.tool_name)
      .filter((toolName) => typeof toolName === "string"),
  );
  const chunkTypes = new Set(state.chunks.map((chunk) => chunk.type));

  for (const expectedTool of options.expectTools) {
    if (!toolNames.has(expectedTool)) {
      failures.push(`Expected tool was not observed: ${expectedTool}`);
    }
  }

  for (const expectedType of options.expectChunkTypes) {
    if (!chunkTypes.has(expectedType)) {
      failures.push(`Expected chunk type was not observed: ${expectedType}`);
    }
  }

  return failures;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const authFromEnv =
    process.env.TACHYON_E2E_API_BASE_URL &&
    process.env.TACHYON_E2E_ACCESS_TOKEN &&
    process.env.TACHYON_E2E_TENANT_ID
      ? {
          apiBaseUrl: process.env.TACHYON_E2E_API_BASE_URL,
          accessToken: process.env.TACHYON_E2E_ACCESS_TOKEN,
          tenantId: process.env.TACHYON_E2E_TENANT_ID,
          ...(process.env.TACHYON_E2E_USER_ID
            ? { userId: process.env.TACHYON_E2E_USER_ID }
            : {}),
          ...(process.env.TACHYON_E2E_REFRESH_TOKEN
            ? { refreshToken: process.env.TACHYON_E2E_REFRESH_TOKEN }
            : {}),
        }
      : null;

  const report = {
    startedAt: new Date().toISOString(),
    options: {
      message: options.message,
      task: options.task ?? null,
      project: options.project ?? null,
      model: options.model ?? null,
      binary: options.binary,
      webdriverUrl: options.webdriverUrl,
      timeoutMs: options.timeoutMs,
      expectTools: options.expectTools,
      expectChunkTypes: options.expectChunkTypes,
    },
    sessionId: null,
    title: null,
    finalState: null,
    summary: null,
    failures: [],
  };

  let sessionId = null;

  try {
    sessionId = await createSession(options.webdriverUrl, options.binary);
    report.sessionId = sessionId;

    await setWindowRect(options.webdriverUrl, sessionId);
    report.title = await webdriverRequest(
      options.webdriverUrl,
      "GET",
      `/session/${sessionId}/title`,
    );

    await enableTestMode(options.webdriverUrl, sessionId);
    await waitForBridge(options.webdriverUrl, sessionId, 30_000);

    if (authFromEnv) {
      await callBridge(options.webdriverUrl, sessionId, "setAuth", [authFromEnv]);
      await waitFor(
        options.webdriverUrl,
        sessionId,
        (state) => !!state?.auth?.accessToken,
        30_000,
        "auth state",
      );
    } else {
      const existingState = await getBridgeState(options.webdriverUrl, sessionId);
      if (!existingState?.auth?.accessToken) {
        throw new Error(
          "No stored app auth was found. Set TACHYON_E2E_API_BASE_URL / TACHYON_E2E_ACCESS_TOKEN / TACHYON_E2E_TENANT_ID or sign in once in the app first.",
        );
      }
    }

    if (options.project) {
      await callBridge(options.webdriverUrl, sessionId, "activateProject", [
        options.project,
      ]);
      await waitFor(
        options.webdriverUrl,
        sessionId,
        (state) => state?.activeProject?.path === options.project,
        30_000,
        "active project",
      );
    }

    if (options.model) {
      await callBridge(options.webdriverUrl, sessionId, "setSelectedModel", [
        options.model,
      ]);
      await waitFor(
        options.webdriverUrl,
        sessionId,
        (state) => state?.selectedModel === options.model,
        10_000,
        "selected model",
      );
    }

    await callBridge(options.webdriverUrl, sessionId, "newChat");
    await callBridge(options.webdriverUrl, sessionId, "sendMessage", [
      options.message,
      options.task,
    ]);

    const finalState = await waitFor(
      options.webdriverUrl,
      sessionId,
      (state) =>
        !!state &&
        !state.isLoading &&
        state.chunks.some((chunk) => chunk.type !== "user"),
      options.timeoutMs,
      "chat completion",
    );

    report.finalState = finalState;
    report.summary = summarizeChunks(finalState.chunks);
    report.failures = assertExpectations(finalState, options);

    if (options.output) {
      await writeFile(options.output, JSON.stringify(report, null, 2));
    }

    console.log(JSON.stringify(report, null, 2));

    if (report.failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (sessionId && !options.keepSession) {
      try {
        await deleteSession(options.webdriverUrl, sessionId);
      } catch (error) {
        console.warn(
          `Failed to delete WebDriver session ${sessionId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  process.exit(1);
});
