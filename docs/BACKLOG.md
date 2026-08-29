# Backlog — known gaps

The 2026-08-29 codebase audit (all Critical/High/Medium/Low findings remediated;
`AUDIT.md` removed once complete) left these non-finding, feature-sized gaps.
None is a correctness bug; each is net-new work.

## Runtime open question — LiveKit webhooks

`livekit.yaml` has no `webhook:` section. `docker-compose.yml` sets
`LIVEKIT_WEBHOOK_API_KEY` / `LIVEKIT_WEBHOOK_URLS`, which livekit-server does not
read — webhook config belongs in the YAML:

```yaml
webhook:
  api_key: <name of a key in `keys` / LIVEKIT_KEYS>
  urls:
    - http://api:3001/webhooks/livekit
```

If webhooks are not firing in production: no leave/disconnect events are
recorded, durations are never computed from logs, `room_finished` never fires,
and the `TOKEN_REQUEST` join in `getToken` is the only thing creating attendance
rows. **Confirm first** — check API logs for `LiveKit webhook: event=…` during a
real class — then wire the YAML (needs the real key name, so likely via
`LIVEKIT_CONFIG` env or a templated config, not a committed literal).

## Feature gaps

| Item | Notes |
|---|---|
| **Chessboard clock / timer** | No clock state in either board store; no increment, no flag-fall. New board-store subsystem + sync-protocol fields. |
| **Practice detach / resync** | One shared store per room. Needs a per-student local board and a "resync to coach" action. |
| **Course / CourseModule / Practice / StudentPractice / Announcement authoring** | Models are queried by the student dashboard but there is no API or admin UI to create any of them — "Continue Learning / Practice / Announcements" are permanently empty outside seed data. |
| **Waiting room / lobby** | The "coach hasn't joined" gate implies one; currently just a polling screen. |
| **Live-monitoring screen** | `GET /attendance/class/:id/live` (`classLive`) and `getLiveClassMonitoring` are fully implemented and unused — no frontend. |
| **Admin drill-downs** | `GET /attendance/student/:id` and `/attendance/coach/:id` have no frontend caller. |
| **God-component splits** | `ProfileForm.tsx` (642L), `MeetingVideoGrid.tsx` (592L), `completed-classes/[id]/page.tsx` (483L), `DemoClassesClient.tsx` (484L), `MeetingChat.tsx` (421L) — not split or memoized. |
| **`packages/ui` / `packages/utils`** | Declared workspaces, empty shells — either fill or remove. |

## Other deferred

- Email verification is commented out in `auth.service.ts` (two places) by design for now.
- `GET /batches/:id` (`batches.get`) has no frontend caller — the list response is reused.
- `POST /upload/pgn` has no frontend caller and no size limit on the PGN string.
