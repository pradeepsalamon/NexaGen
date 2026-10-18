#!/bin/sh

# Usage: ./sample-cpu.sh [INTERVAL_SEC] [DURATION_MIN]
INTERVAL=${1:-5}
DURATION_MINUTES=${2:-30}
case "$INTERVAL" in
  ''|*[!0-9]*) INTERVAL=0 ;;
esac
if [ "$INTERVAL" -le 0 ]; then
  echo "INTERVAL_SEC must be a positive integer (got '${1}')." >&2
  exit 1
fi
SAMPLES=$((DURATION_MINUTES * 60 / INTERVAL))

DIR="$(cd "$(dirname "$0")" && pwd)"
OUTDIR="$DIR/out"
mkdir -p "$OUTDIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTFILE="$OUTDIR/${TIMESTAMP}.csv"

API_CONTAINER=${API_CONTAINER:-nexa_api}

# Total utime+stime ticks of every stockfish process in the API container.
# The runtime image has no `ps`, and ps' pcpu is a lifetime average anyway.
stockfish_ticks() {
  docker exec "$API_CONTAINER" sh -c '
    for p in /proc/[0-9]*; do
      read -r line < "$p/stat" 2>/dev/null || continue
      case "$line" in *"(stockfish)"*) echo "$line" ;; esac
    done' 2>/dev/null | awk '{sum += $14 + $15} END {print sum+0}'
}

CLK_TCK=$(docker exec "$API_CONTAINER" getconf CLK_TCK 2>/dev/null || echo 100)
if ! docker exec "$API_CONTAINER" true 2>/dev/null; then
  echo "Container $API_CONTAINER not reachable; stockfish CPU will read 0 (set API_CONTAINER)." >&2
fi

echo "timestamp,type,name,value" > "$OUTFILE"
echo "Sampling every ${INTERVAL}s for ${DURATION_MINUTES}m ($SAMPLES samples). Writing to $OUTFILE"

PREV_TICKS=$(stockfish_ticks)
PREV_T=$(date +%s.%N)

for i in $(seq 1 $SAMPLES); do
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # docker stats for all containers
  docker stats --no-stream --format "{{.Name}},{{.CPUPerc}}" | sed 's/%//g' | while IFS=, read -r name cpu; do
    echo "$NOW,container,$name,$cpu" >> "$OUTFILE"
  done
  
  # stockfish CPU % since the previous sample (100 = one full vCPU, like docker stats).
  # Ticks of an engine that exited mid-interval are lost; the delta is clamped at 0.
  TICKS=$(stockfish_ticks)
  T=$(date +%s.%N)
  SF_CPU=$(awk -v a="$PREV_TICKS" -v b="$TICKS" -v t0="$PREV_T" -v t1="$T" -v hz="$CLK_TCK" \
    'BEGIN { d = b - a; if (d < 0) d = 0; dt = t1 - t0; printf "%.2f", (dt > 0 ? d / hz / dt * 100 : 0) }')
  PREV_TICKS=$TICKS
  PREV_T=$T
  echo "$NOW,process,stockfish,$SF_CPU" >> "$OUTFILE"
  
  # host load
  LOAD1=$(cat /proc/loadavg 2>/dev/null | awk '{print $1}')
  if [ -z "$LOAD1" ]; then
      LOAD1=$(uptime | awk -F'load average:' '{print $2}' | cut -d, -f1 | tr -d ' ')
  fi
  echo "$NOW,load,load1,$LOAD1" >> "$OUTFILE"
  
  sleep "$INTERVAL"
done

echo "Done."
