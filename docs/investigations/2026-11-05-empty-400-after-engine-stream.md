# Empty 400s after an engine analysis stream (investigation, 2026-11-05)

**Status:** root cause established. **No fix applied** (owner review first).
**Scope of the investigation:** staging only. The owner approved diagnostic
logging on the `api-dev.nexachess.in` nginx server block for at most one hour.
It ran 19:27:56–19:32:50 UTC and is fully reverted (config byte-identical to
the backup, diagnostic log files deleted). Production nginx was not changed.

## 1. Symptom

Some API requests fail with **HTTP 400, an empty body and no API headers**
(only `date` and `server`). A browser reports a CORS error, because the
response has no `Access-Control-Allow-Origin`.

They come right after a Stockfish analysis stream
(`POST /stockfish/analyze/stream`), and on any route: preflights, GET, POST and
PUT. Seen as:
- the first live-class heartbeat of a room session failing;
- a failed coach board save (`PUT /live-class/:id/board-state`);
- room data loads failing (puzzle, matches, simul, activity-run);
- "Failed to save PGN to Cloud";
- in WebKit, a coach's reload of the room showing "Connection lost – Something
  went wrong", because the room's own `GET /live-class/:id` got one of these.

## 2. Exact error

nginx's `info`-level error log for the host stayed **empty**: nginx saw nothing
wrong. Its diagnostic access log showed the 400 **came from the upstream**:

```
… conn=135945 req#=124 proto=HTTP/2.0 sni=dev.nexachess.in host=api-dev.nexachess.in
  "POST /presence/heartbeat" status=400 bytes=0 up_status=400 up_rt=0.002
```

A `clientError` hook preloaded into the staging API recorded Node's HTTP parser
error, the same on 12 of 12 failures:

```
code:   HPE_CLOSED_CONNECTION
reason: Data after `Connection: close`
bytesParsed: 1
requestsBeforeOnThisSocket: 1
previousRequest: POST /stockfish/analyze/stream  (request header Connection: close)
```

That is Node answering a request it refuses to parse. Its built-in reply is
`HTTP/1.1 400 Bad Request` with no headers and no body, which explains why no
API, CORS or security headers were present.

## 3. Root cause

Three settings combine:

1. **nginx sends `Connection: close` upstream on every normal request.** The
   `map $http_upgrade $connection_upgrade { default upgrade; '' close; }` is
   used with `proxy_set_header Connection $connection_upgrade;` in the API
   `location`.
2. **The upstream still has a keep-alive pool** (`upstream
   nestjs_api_upstream { keepalive 64; }`, and the same for
   `nestjs_api_dev_upstream`).
3. **The stream handler overrides the response's `Connection` header**:
   `apps/api/src/stockfish/stockfish.controller.ts` (`analyzeStream`, since
   `ef0a74b7`, 2026-10-03) does `response.setHeader('Connection', 'keep-alive')`.

For an ordinary route, Node honours the request's `Connection: close` and
answers `Connection: close`, so nginx never reuses that upstream connection.
For the stream, Node answers `Connection: keep-alive` (checked directly against
port 3011). nginx trusts the response. When the chunked stream ends, it puts the
connection back into the pool and sends the **next request from any client**
down it. Node, which had been told the connection closes after this request,
rejects those bytes with `HPE_CLOSED_CONNECTION` → empty 400.

**Cancelling the stream isn't required.** It was only the visible trigger in
the UI, because the board starts a stream whenever the position changes.
**HTTP/2 is not involved:** reproduced with HTTP/1.1 clients 4/4. Chromium
reuses the `dev.nexachess.in` connection for API requests (HTTP/2 connection
coalescing, `sni=dev…`) and WebKit opens its own (`sni=api-dev…`). Both failed
the same way. Because the pool is shared, **one user's engine analysis can break
another user's next request.**

## 4. Reproduction (staging)

```bash
O='Origin: https://dev.nexachess.in'
curl -s -c jar.txt -X POST https://api-dev.nexachess.in/auth/login -H "$O" \
  -H 'Content-Type: application/json' -d '{"email":"coach@nexa.test","password":"Test@12345"}'
curl -s -b jar.txt -o /dev/null -X POST https://api-dev.nexachess.in/stockfish/analyze/stream -H "$O" \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1","mode":"analysis"}'
curl -s -b jar.txt -o /dev/null -w '%{http_code}\n' https://api-dev.nexachess.in/notifications -H "$O"   # → 400
```

| Run | Failed / total | Control (no stream) |
|---|---|---|
| curl, HTTP/2, one finished stream then 3 requests | 2 of 3 rounds | – |
| curl `--http1.1`, same | **4 of 4 rounds** (always the first request after the stream) | – |
| Chromium page: 15 cancelled streams, 8 requests after each | 12–15 of 120 | 0 of 120 |
| WebKit page, same | 12–14 of 120 (rest 429 rate limit) | 0 |
| Chromium room (`/live-class/:id`), 3 sessions | first heartbeat preflight 400 in 3 of 3 | – |

**Successful vs failed requests:** a request succeeds on a fresh upstream
connection, or on one whose previous request was an ordinary route (those close
it). It fails when its upstream connection last served the stream, because only
that response says `keep-alive`.

## 5. Production

Affected: the same controller code is on `main`, and `api.nexachess.in` uses the
same map and `keepalive 64`. Counts from the nginx logs on disk (requests from
`https://nexachess.in/` with status 400 and 0 bytes vs engine streams that day):

| Day | Empty 400s | Engine streams |
|---|---|---|
| 22 Oct | 40 | 69 |
| 24 Oct | 5 | 9 |
| 27 Oct | 89 | 166 |
| 28 Oct | 46 | 85 |
| 29 Oct | 211 | 388 |
| 3 Nov | 22 | 44 |
| 5 Nov | 84 | 139 |
| days with no streams | 0 | 0 |

That's about 55 % of streams, every day, over ~500 failed requests in two weeks.
On 5 Nov they included 10 coach board saves and live-class room loads.

## 6. Recommended permanent fix (not applied)

1. **App, smallest and enough on its own:** delete
   `response.setHeader('Connection', 'keep-alive')` from `analyzeStream`.
   `Connection` is a hop-by-hop header: Node manages it, and SSE through nginx
   needs `X-Accel-Buffering: no` (already set), not `keep-alive`. Add a spec
   that the stream response doesn't set `Connection`, and a regression check (a
   stream, then a normal request through nginx, both succeed). Ships in a
   normal release, no infra change.
2. **nginx, optional later, for performance:** either drop the unused
   `keepalive 64` from the API upstreams (nginx asks for `close` anyway), or
   switch to real upstream keep-alive (map `'' ""` instead of `'' close` for
   the API, and Node's `server.keepAliveTimeout` above nginx's upstream
   `keepalive_timeout`, or nginx gets 502s on idle-close races). Either is a
   production nginx change, so it's a separate, reviewed step.

Not needed: changing HTTP/2, the web's stream cancellation, or adding retries.
None of them is the cause. Retries would only hide it.

## 7. Mitigation until the fix ships

No safe config-only mitigation without touching production nginx. The app fix
(6.1) is a one-line change and the right mitigation. If production needs relief
before a release, the least risky nginx option is removing `keepalive 64` from
`nestjs_api_upstream` (it's unused because of `Connection: close`). That needs
the owner's approval.
