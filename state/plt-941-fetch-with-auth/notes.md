# PLT-941 fetchWithAuth notes

## 2026-04-29

- Added `fetchWithAuth` as the first P1-C migration step.
- The helper retries once after an initial 401 when a `TokenManager` is provided.
- Retry headers are rebuilt with `Headers` so existing `HeadersInit` formats are preserved while replacing `Authorization`.
- `isSSE` is intentionally accepted but unused in this step; SSE-specific behavior belongs to the follow-up `executeAgent` migration.
- `submitToolResult` keeps its existing pending-tool 404 retry behavior and delegates 401 refresh handling to `fetchWithAuth`.
