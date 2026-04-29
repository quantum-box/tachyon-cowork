# PLT-941 fetchWithAuth first step

## Context

- Parent issue: PLT-941 Tachyon Cowork stabilization, Phase 2 P1-C.
- Roadmap: `~/knowledge/src/projects/tachyon-cowork/stabilization-roadmap-202604.md`
- Branch: `feature/plt-941-fetch-with-auth`

## Scope

- Add `src/lib/fetch-with-auth.ts`.
- Migrate only `submitToolResult` away from the raw fetch path.
- Add focused unit coverage for 401 refresh retry and unauthorized handling.
- Leave `executeAgent`, `deleteSession`, and `deleteMessage` migration to follow-up work.

## Notes

- `isSSE` is included in the helper signature for the follow-up SSE migration but is not used in this first implementation.
- Existing transient pending-tool 404 retry behavior in `submitToolResult` must be preserved.
