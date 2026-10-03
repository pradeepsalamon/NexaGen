#!/usr/bin/env node
// Reproducible Stockfish benchmark. Spawns the given binary directly and speaks UCI,
// so it measures the engine + options, independent of the Nest pool.
//
//   node scripts/engine-bench/bench.mjs --bin /usr/local/bin/stockfish \
//        [--threads 1] [--hash 64] [--multipv 1] [--movetime 800] [--depth 0] \
//        [--runs 3] [--concurrency 1] [--warm] [--json]
//
// --warm      reuse one process for all positions (pool behaviour); default is
//             a cold process per run (measures startup + NNUE load too).
// --concurrency N  run N analyses at once (each its own process, as the pool does).
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

const POSITIONS = {
  opening: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  tactical: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
  middlegame: "r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 9",
  endgame: "8/5pk1/6p1/8/3K4/8/5PPP/8 w - - 0 1",
  complex: "r2q1rk1/1b1nbppp/p2ppn2/1p6/3NP3/1BN1B3/PPP1QPPP/2KR3R w - - 0 12",
  nexa_workflow: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5",
};

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]]);
    return acc;
  }, []),
);
const bin = args.bin;
if (!bin) throw new Error("--bin required");
const cfg = {
  threads: +(args.threads ?? 1),
  hash: +(args.hash ?? 64),
  multipv: +(args.multipv ?? 1),
  movetime: +(args.movetime ?? 800),
  depth: +(args.depth ?? 0),
  runs: +(args.runs ?? 3),
  concurrency: +(args.concurrency ?? 1),
};

class Engine {
  constructor() {
    this.t0 = performance.now();
    this.p = spawn(bin);
    this.buf = "";
    this.listeners = [];
    this.p.stdout.on("data", (d) => {
      this.buf += d;
      const lines = this.buf.split("\n");
      this.buf = lines.pop();
      for (const l of lines) this.listeners.forEach((f) => f(l.trim()));
    });
  }
  send(s) { this.p.stdin.write(s + "\n"); }
  waitFor(pred) {
    return new Promise((res) => {
      const f = (l) => { if (pred(l)) { this.listeners = this.listeners.filter((x) => x !== f); res(l); } };
      this.listeners.push(f);
    });
  }
  async init() {
    this.send("uci");
    await this.waitFor((l) => l === "uciok");
    this.send(`setoption name Hash value ${cfg.hash}`);
    this.send(`setoption name Threads value ${cfg.threads}`);
    this.send(`setoption name MultiPV value ${cfg.multipv}`);
    this.send("isready");
    await this.waitFor((l) => l === "readyok");
    this.startupMs = performance.now() - this.t0;
  }
  async analyze(fen) {
    const out = { firstEvalMs: null, depth: 0, nodes: 0, nps: 0, best: "" };
    const t = performance.now();
    const off = (l) => {
      if (!l.startsWith("info") || !l.includes(" score ")) return;
      if (out.firstEvalMs === null) out.firstEvalMs = performance.now() - t;
      const m = (k) => { const x = l.match(new RegExp(`\\b${k} (\\d+)`)); return x ? +x[1] : null; };
      if (!l.includes(" multipv ") || m("multipv") === 1) { out.depth = m("depth") ?? out.depth; }
      out.nodes = m("nodes") ?? out.nodes; out.nps = m("nps") ?? out.nps;
    };
    this.listeners.push(off);
    this.send("ucinewgame");
    this.send(`position fen ${fen}`);
    this.send(`go ${cfg.depth ? `depth ${cfg.depth} ` : ""}${cfg.movetime ? `movetime ${cfg.movetime}` : ""}`.trim());
    const bm = await this.waitFor((l) => l.startsWith("bestmove"));
    this.listeners = this.listeners.filter((x) => x !== off);
    out.best = bm.split(" ")[1];
    out.totalMs = performance.now() - t;
    return out;
  }
  quit() { this.send("quit"); this.p.kill(); }
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rss = (pid) => { try { return +(spawnSyncRss(pid)); } catch { return 0; } };
import { execSync } from "node:child_process";
const spawnSyncRss = (pid) => execSync(`awk '/VmRSS/{print $2}' /proc/${pid}/status`).toString().trim();

async function runOne(name, fen, engine) {
  const e = engine ?? new Engine();
  if (!engine) await e.init();
  const r = await e.analyze(fen);
  r.startupMs = engine ? 0 : e.startupMs;
  r.rssMb = rss(e.p.pid) / 1024;
  if (!engine) e.quit();
  return { name, ...r };
}

const rows = [];
const wallStart = performance.now();
if (args.warm) {
  const e = new Engine(); await e.init();
  for (let i = 0; i < cfg.runs; i++)
    for (const [n, f] of Object.entries(POSITIONS)) rows.push(await runOne(n, f, e));
  rows.startup = e.startupMs; e.quit();
} else {
  for (let i = 0; i < cfg.runs; i++) {
    for (const [n, f] of Object.entries(POSITIONS)) {
      const batch = await Promise.all(Array.from({ length: cfg.concurrency }, () => runOne(n, f)));
      rows.push(...batch);
    }
  }
}
const wall = performance.now() - wallStart;
const summary = {
  bin, cfg, warm: !!args.warm,
  startupMs: median(rows.filter((r) => r.startupMs).map((r) => r.startupMs)) || rows.startup || 0,
  firstEvalMs: median(rows.map((r) => r.firstEvalMs ?? r.totalMs)),
  bestMoveMs: median(rows.map((r) => r.totalMs)),
  p95BestMoveMs: [...rows.map((r) => r.totalMs)].sort((a, b) => a - b)[Math.floor(rows.length * 0.95)],
  depth: median(rows.map((r) => r.depth)),
  nps: median(rows.map((r) => r.nps)),
  rssMb: Math.round(median(rows.map((r) => r.rssMb))),
  perPosition: Object.fromEntries(Object.keys(POSITIONS).map((n) => {
    const rs = rows.filter((r) => r.name === n);
    return [n, { depth: median(rs.map((r) => r.depth)), nps: median(rs.map((r) => r.nps)), best: rs.map((r) => r.best).join(",") }];
  })),
  wallMs: Math.round(wall),
};
if (args.json) console.log(JSON.stringify(summary));
else console.log(summary);
