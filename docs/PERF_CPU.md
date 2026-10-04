# CPU Performance Profiling

We suspect Stockfish and LiveKit/egress compete for CPU during live classes on our 2-vCPU Oracle ARM production box.
This document outlines how to measure the CPU load to verify this theory without changing any app code.

## Scenarios to Measure

1. **(a) Idle Box**
   - Goal: Establish baseline load.
   - Setup: No live classes in progress. No user interaction.
   - Run: `./scripts/perf/sample-cpu.sh 5 5` (5 minutes is enough)

2. **(b) Live Class without Recording**
   - Goal: Measure LiveKit network overhead without headless Chrome encoding.
   - Setup: Create a live class. Do not start recording. Have 1 coach and 1 student join, keep audio/video unmuted.
   - Run: `./scripts/perf/sample-cpu.sh 5 15`

3. **(c) Live Class with Recording + Engine Analysis Open**
   - Goal: Measure the peak load when LiveKit/egress and Stockfish are both active.
   - Setup: Start recording (which spins up the `nexa_egress` container). Open the engine analysis panel (which starts `stockfish` processes inside the `api` container).
   - Run: `./scripts/perf/sample-cpu.sh 5 15`

## Thresholds for Action

If the total CPU consistently spikes >180% (of the 200% available from 2 vCPUs) and LiveKit dropouts are observed, we will need to change:

- `STOCKFISH_POOL_SIZE`: Lower the maximum number of simultaneous engine processes. (Currently defined in `packages/config/src/api.ts`).
- `STOCKFISH_MOVETIME`: Lower the analysis time to free up the CPU faster. (Currently defined in `packages/config/src/api.ts`).
- Engine threads: each engine gets `min(4, cpus)` threads (`stockfish.service.ts`), i.e. **both vCPUs on this box**, so a single analysis can saturate it. This is not env-configurable today; if Stockfish p95 sits near 200% during (c), capping threads is the first change to make.
- Egress encoding: lower the API's `EncodingOptionsPreset` first. Do not raise `cpu_cost.room_composite_cpu_cost` — it was lowered to 1.5 so this node accepts recordings at all; raising it can stop recording entirely.

Stockfish CPU is measured from `/proc/<pid>/stat` tick deltas inside `nexa_api` (override with `API_CONTAINER=...`), on the same 100-per-vCPU scale as `docker stats`.

## Results

| Scenario | Duration | Avg Total CPU | p95 Total CPU | Max Total CPU | % Samples > 180% | Stockfish p95 | LiveKit p95 | Egress p95 |
|----------|----------|---------------|---------------|---------------|------------------|---------------|-------------|------------|
| (a) Idle | 5m       |               |               |               |                  |               |             |            |
| (b) Live w/o Rec | 15m |            |               |               |                  |               |             |            |
| (c) Live + Rec + Eng | 15m |        |               |               |                  |               |             |            |
