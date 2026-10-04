// Drives the real StockfishService. Scenarios: "step" = user clicks through N moves quickly
// (each previous request aborted), "cold" = first request after idle pool.
import { Chess } from 'chess.js';
import { StockfishService } from '../../apps/api/src/stockfish/stockfish.service';

const N = +(process.env.STEPS ?? 8), GAP = +(process.env.GAP_MS ?? 150);
const c = new Chess(); const fens: string[] = [];
for (const m of ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7','Re1','b5']) { c.move(m); fens.push(c.fen()); }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const svc = new StockfishService();
  svc.onModuleInit();
  if (process.env.WARM !== '0') await sleep(1500); // let min engines finish handshake
  const results: string[] = [];
  const t0 = Date.now();
  let last: Promise<unknown> = Promise.resolve();
  const ctrls: AbortController[] = [];
  for (let i = 0; i < N; i++) {
    ctrls.forEach((a) => a.abort()); // client aborts previous request
    const ac = new AbortController(); ctrls.push(ac);
    const started = Date.now();
    const p = (svc as any).analyzePosition(fens[i % fens.length], { signal: ac.signal })
      .then(() => results.push(`#${i} done after ${Date.now() - started}ms`), () => results.push(`#${i} rejected(aborted) after ${Date.now() - started}ms`));
    if (i === N - 1) last = p; else p.catch(() => undefined);
    await sleep(GAP);
  }
  const lastStart = Date.now() - GAP; await last;
  console.log(JSON.stringify({ finalRequestLatencyMs: Date.now() - lastStart - 0 }));
  await sleep(300);
  // how long until the engines are really idle (stale work draining)
  console.log(results.join('\n'));
  svc.onModuleDestroy(); process.exit(0);
})();
