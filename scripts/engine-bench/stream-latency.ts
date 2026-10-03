// Time-to-first-evaluation vs final result through the real StockfishService
// (the streamed panel path). Run from apps/api:
//   STOCKFISH_PATH=<bin> npx ts-node -P tsconfig.json --transpile-only ../../scripts/engine-bench/stream-latency.ts
import { StockfishService } from '../../apps/api/src/stockfish/stockfish.service';

const FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
  'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 9',
  '8/5pk1/6p1/8/3K4/8/5PPP/8 w - - 0 1',
  'r2q1rk1/1b1nbppp/p2ppn2/1p6/3NP3/1BN1B3/PPP1QPPP/2KR3R w - - 0 12',
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5',
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const svc = new StockfishService();
  svc.onModuleInit();
  await sleep(1500);
  for (const fen of FENS) {
    const t0 = Date.now();
    const frames: string[] = [];
    let first = -1;
    const final = await svc.analyzePosition(fen, {
      onUpdate: (u) => {
        if (first < 0) first = Date.now() - t0;
        frames.push(`${Date.now() - t0}ms d${u.depth} ${u.bestMove}`);
      },
    });
    console.log(JSON.stringify({
      firstEvalMs: first, finalMs: Date.now() - t0, frames: frames.length,
      finalDepth: final.depth, finalBest: final.bestMove, timeline: frames.join(' | '),
    }));
  }
  svc.onModuleDestroy();
  process.exit(0);
})();
