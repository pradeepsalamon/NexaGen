#!/usr/bin/env bash
# Proves the compose.ai.yml overlay's isolation (docs/ai/architecture/PHASE1_SPEC.md §4.4).
#
#   scripts/ai/compose-topology-test.sh             static + dynamic (CI only)
#   scripts/ai/compose-topology-test.sh --static    static checks only (safe anywhere)
#
# The dynamic part starts containers under a throwaway project and always ends
# with `down -v`. It refuses to run where production containers exist: the base
# compose file pins container names (nexa_redis, nexa_api), so a second project
# on the production box would collide with them.
set -euo pipefail

cd "$(dirname "$0")/../.."

PROJECT=nexa_ai_topology
BASE=(docker compose -f docker-compose.yml)
OVERLAY=(docker compose -f docker-compose.yml -f compose.ai.yml)
STATIC_ONLY=false
[ "${1:-}" = "--static" ] && STATIC_ONLY=true

# The base file requires this one; nothing here is real.
export LIVEKIT_NODE_IP="${LIVEKIT_NODE_IP:-127.0.0.1}"

pass() { echo "  ok  $*"; }
fail() { echo "  FAIL $*" >&2; exit 1; }

echo "Static checks"

base_json=$("${BASE[@]}" config --format json 2>/dev/null)
overlay_json=$("${OVERLAY[@]}" config --format json 2>/dev/null)
profile_json=$("${OVERLAY[@]}" --profile ai config --format json 2>/dev/null)

# 1. Invisible without the overlay *and* the profile.
"${BASE[@]}" config --services 2>/dev/null | grep -qx ai-runtime && fail "1: ai-runtime is in docker-compose.yml"
"${OVERLAY[@]}" config --services 2>/dev/null | grep -qx ai-runtime && fail "1: ai-runtime active without --profile ai"
"${OVERLAY[@]}" --profile ai config --services 2>/dev/null | grep -qx ai-runtime || fail "1: ai-runtime missing with --profile ai"
pass "1: ai-runtime only exists with the overlay and --profile ai"

# 2. Hardening of the runtime service.
rt=$(jq '.services["ai-runtime"]' <<<"$profile_json")
[ "$(jq '.ports // [] | length' <<<"$rt")" = 0 ] || fail "2: ai-runtime publishes ports"
[ "$(jq -c '.networks | keys' <<<"$rt")" = '["ai_internal"]' ] || fail "2: ai-runtime networks are not exactly [ai_internal]"
[ "$(jq '.networks.ai_internal.internal' <<<"$profile_json")" = true ] || fail "2: ai_internal is not internal"
[ "$(jq '.read_only' <<<"$rt")" = true ] || fail "2: not read_only"
[ "$(jq -c '.cap_drop' <<<"$rt")" = '["ALL"]' ] || fail "2: cap_drop is not [ALL]"
user=$(jq -r '.user // ""' <<<"$rt")
[ -n "$user" ] && [ "${user%%:*}" != 0 ] && [ "${user%%:*}" != root ] || fail "2: runs as root"
[ "$(jq -r '.deploy.resources.limits.cpus // ""' <<<"$rt")" != "" ] || fail "2: no CPU limit"
[ "$(jq -r '.deploy.resources.limits.memory // ""' <<<"$rt")" != "" ] || fail "2: no memory limit"
pass "2: no ports, ai_internal only (internal), read-only, no caps, non-root, limited"

# 3. Nothing else changes; api gains exactly one network and three variables.
for svc in $(jq -r '.services | keys[]' <<<"$base_json"); do
  [ "$svc" = api ] && continue
  a=$(jq -S ".services[\"$svc\"]" <<<"$base_json")
  b=$(jq -S ".services[\"$svc\"]" <<<"$profile_json")
  [ "$a" = "$b" ] || fail "3: service $svc differs with the overlay"
done
strip='del(.networks.ai_internal) | del(.environment.AI_ENABLED, .environment.AI_RUNTIME_URL, .environment.AI_RUNTIME_SHARED_SECRET)'
a=$(jq -S '.services.api' <<<"$base_json")
b=$(jq -S ".services.api | $strip" <<<"$profile_json")
[ "$a" = "$b" ] || fail "3: api differs by more than ai_internal + AI_*"
[ "$(jq -S '.services.api' <<<"$overlay_json")" = "$(jq -S '.services.api' <<<"$profile_json")" ] || fail "3: api depends on the profile"
pass "3: other services identical; api adds ai_internal and AI_ENABLED/AI_RUNTIME_URL/AI_RUNTIME_SHARED_SECRET"

# 4. Nobody waits on the runtime.
jq -e '[.services[] | (.depends_on // {}) | keys[]] | index("ai-runtime") | not' <<<"$profile_json" >/dev/null \
  || fail "4: a service depends_on ai-runtime"
pass "4: no depends_on ai-runtime"

$STATIC_ONLY && { echo "Static checks passed."; exit 0; }

echo "Dynamic checks"

if docker ps -a --format '{{.Names}}' | grep -qxE 'nexa_(api|redis|postgres|web)'; then
  echo "Production-named containers exist on this host; the dynamic topology test only runs in CI." >&2
  exit 2
fi

SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/')
export AI_RUNTIME_SHARED_SECRET="$SECRET"
P=(docker compose -p "$PROJECT" -f docker-compose.yml -f compose.ai.yml --profile ai)
PROBE=nexa_ai_topology_probe
PROBE_IMAGE=python:3.12-slim-bookworm

cleanup() {
  docker rm -f "$PROBE" >/dev/null 2>&1 || true
  "${P[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${P[@]}" build ai-runtime
"${P[@]}" up -d --wait redis ai-runtime

# A probe dual-homed like api: on ai_internal and nexa_network.
docker run -d --name "$PROBE" --network "${PROJECT}_ai_internal" --entrypoint sleep "$PROBE_IMAGE" 600 >/dev/null
docker network connect "${PROJECT}_nexa_network" "$PROBE"

probe() { docker exec -i -e SECRET="$SECRET" "$PROBE" python - "$@"; }

# 5. The dual-homed probe reaches both the runtime and redis.
probe <<'PY' || fail "5: dual-homed probe cannot reach ai-runtime and redis"
import socket, urllib.request
assert urllib.request.urlopen("http://ai-runtime:8000/healthz", timeout=3).status == 200
s = socket.create_connection(("redis", 6379), timeout=3); s.sendall(b"PING\r\n")
assert s.recv(16).startswith(b"+PONG")
PY
pass "5: api-like probe reaches ai-runtime:8000 and redis:6379"

# 6. Something on nexa_network only can't see the runtime.
docker network disconnect "${PROJECT}_ai_internal" "$PROBE"
probe <<'PY' || fail "6: nexa_network-only probe reached ai-runtime"
import socket
try:
    socket.create_connection(("ai-runtime", 8000), timeout=3)
except OSError:
    raise SystemExit(0)
raise SystemExit(1)
PY
docker network connect "${PROJECT}_ai_internal" "$PROBE"
pass "6: nexa_network alone cannot resolve or connect to ai-runtime"

# 7. Nothing published to the host.
rt_id=$("${P[@]}" ps -q ai-runtime)
[ -z "$(docker port "$rt_id")" ] || fail "7: ai-runtime has published ports"
if curl -s -m 3 http://127.0.0.1:8000/healthz >/dev/null 2>&1; then fail "7: host reaches 127.0.0.1:8000"; fi
pass "7: no published ports; host cannot reach the runtime"

# 8. No egress from the runtime: not the internet, not redis.
"${P[@]}" exec -T ai-runtime python - <<'PY' || fail "8: ai-runtime has egress"
import socket
for host, port in (("1.1.1.1", 443), ("redis", 6379)):
    try:
        socket.create_connection((host, port), timeout=3)
    except OSError:
        continue
    raise SystemExit(f"connected to {host}:{port}")
PY
pass "8: ai-runtime cannot reach 1.1.1.1:443 or redis:6379"

# 9. Auth is on: a signed echo works, an unsigned one is 401.
probe <<'PY' || fail "9: signed/unsigned echo did not behave"
import base64, hashlib, hmac, json, os, time, urllib.error, urllib.request, uuid
b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
body = json.dumps({"dataClass": "PUBLIC", "input": {"text": "topology"}, "route": "mock:echo", "task": "diagnostic.echo.v1"}).encode()
now = int(time.time())
claims = {"aud": "ai-runtime", "bh": b64(hashlib.sha256(body).digest()), "dataClass": "PUBLIC", "exp": now + 30, "iat": now,
          "iss": "nexa-api", "jti": str(uuid.uuid4()), "rid": "topology-0001", "scope": "runtime:diagnostic.echo",
          "task": "diagnostic.echo.v1", "ver": 1}
signing = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()) + "." + b64(json.dumps(claims).encode())
token = signing + "." + b64(hmac.new(os.environ["SECRET"].encode(), signing.encode(), hashlib.sha256).digest())
def call(headers):
    req = urllib.request.Request("http://ai-runtime:8000/v1/diagnostic/echo", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "X-Request-Id": "topology-0001", **headers})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, None
status, payload = call({"Authorization": f"Bearer {token}"})
assert status == 200 and payload["output"]["echo"] == "topology", status
assert call({})[0] == 401
PY
pass "9: signed echo 200, unsigned 401"

echo "All topology checks passed."
