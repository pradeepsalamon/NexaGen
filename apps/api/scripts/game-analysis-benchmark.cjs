#!/usr/bin/env node
/* eslint-disable */
// Game-analysis benchmark against Lichess puzzles (CC0, database.lichess.org).
//
//   npm run build -w apps/api
//   STOCKFISH_PATH=/path/to/stockfish node apps/api/scripts/game-analysis-benchmark.cjs \
//     [apps/api/benchmarks/lichess-puzzle-sample.json] [out.json]
//
// Each puzzle is a real game position: its first move is the opponent's
// mistake, the next is the start of the winning line. Lichess's own labels
// (that the setup move was a mistake, the solution move, the themes) are used
// as REFERENCE SIGNALS — not ground truth: Lichess generated them with its own
// engine, depth and rules. Nothing here is tuned to them.
//
// Per puzzle the real pipeline runs twice on the background lane, one thread:
//   A "found":  setup move, then the solution move;
//   B "missed": setup move, then a seeded-random legal move that is NOT the
//               solution (positions shared with A are resumed, not re-searched).
// Measured: setup-move classification, tactic detection after it, motif
// precision / recall against the themes, best-move agreement, FOUND / MISSED
// outcomes, false tactics claimed for the side about to blunder, runtime.

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.STOCKFISH_POOL_SIZE = process.env.STOCKFISH_POOL_SIZE || '2';
process.env.STOCKFISH_MIN_ENGINES = '1';
process.env.STOCKFISH_IDLE_TIMEOUT_S = '0';

const fs = require('fs');
const path = require('path');
const { Logger } = require('@nestjs/common');
const types = require('@nexa-chess/types');
const dist = path.join(__dirname, '..', 'dist', 'src');
const { StockfishService } = require(path.join(dist, 'stockfish', 'stockfish.service.js'));
const { GameAnalysisEngineService } = require(path.join(dist, 'stockfish', 'game-analysis-engine.service.js'));
const { buildAnalysis } = require(path.join(dist, 'game-analysis', 'report-builder.js'));
const { revisionEligibility } = require(path.join(dist, 'game-analysis', 'revision-eligibility.js'));
const { Chess } = require(path.join(dist, 'common', 'chess', 'chess.js'));

const input = process.argv[2] || path.join(__dirname, '..', 'benchmarks', 'lichess-puzzle-sample.json');
const output = process.argv[3] || null;
const LIMIT = Number(process.env.BENCHMARK_LIMIT || 0);

/** Lichess theme(s) that correspond to each NexaGen motif. */
const THEMES_FOR = {
  BACK_RANK_MATE: ['backRankMate'],
  DISCOVERED_ATTACK: ['discoveredAttack'],
  DISCOVERED_CHECK: ['discoveredAttack', 'discoveredCheck'],
  DOUBLE_CHECK: ['doubleCheck'],
  FORK: ['fork'],
  HANGING_PIECE: ['hangingPiece'],
  INTERMEDIATE_MOVE: ['intermezzo'],
  MATE: ['mate', 'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5'],
  PIN: ['pin'],
  PROMOTION: ['promotion', 'underPromotion'],
  REMOVAL_OF_DEFENDER: ['capturingDefender'],
  SKEWER: ['skewer'],
};
const SEVERE = new Set(['MISTAKE', 'BLUNDER', 'MISSED_WIN', 'MISSED_MATE', 'MISSED_DRAW', 'MATE_ALLOWED']);

function seededIndex(id, n) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h % n;
}

async function main() {
  Logger.overrideLogger(false);
  if (!process.env.STOCKFISH_PATH) throw new Error('Set STOCKFISH_PATH.');
  const seen = new Set();
  let puzzles = JSON.parse(fs.readFileSync(input, 'utf8')).filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
  if (LIMIT) puzzles = puzzles.slice(0, LIMIT);

  const stockfish = new StockfishService();
  stockfish.onModuleInit();
  const engine = new GameAnalysisEngineService(stockfish);
  const config = types.GAME_ANALYSIS_PRESETS.STANDARD;

  const rows = [];
  const started = Date.now();
  let searches = 0;
  for (const [i, p] of puzzles.entries()) {
    const moves = p.moves.split(' ');
    const [setup, solution] = moves;
    const afterSetup = new Chess(p.fen);
    afterSetup.move({ from: setup.slice(0, 2), to: setup.slice(2, 4), promotion: setup.slice(4) || undefined });
    const alternatives = afterSetup
      .moves({ verbose: true })
      .map((m) => m.from + m.to + (m.promotion || ''))
      .filter((u) => u !== solution);

    let a;
    try {
      a = await engine.analyzeGame({ movesUci: [setup, solution], startFen: p.fen }, { config });
    } catch (e) {
      rows.push({ error: String(e.message), id: p.id });
      continue;
    }
    searches += a.positions.filter((x) => x.status === 'ANALYSED').length;
    const builtA = buildAnalysis(a, [], null);
    const tacticA = builtA.tactics.opportunities.find((o) => o.ply === 1) || null;
    const ply0 = builtA.tactics.opportunities.find((o) => o.ply === 0) || null;

    let builtB = null;
    let tacticB = null;
    if (alternatives.length) {
      const alt = alternatives[seededIndex(p.id, alternatives.length)];
      const b = await engine.analyzeGame({ movesUci: [setup, alt], startFen: p.fen }, { config, resume: a });
      searches += b.positions.filter((x, idx) => idx === 2 && x.status === 'ANALYSED').length;
      builtB = buildAnalysis(b, [], null);
      tacticB = builtB.tactics.opportunities.find((o) => o.ply === 1) || null;
      tacticB = tacticB && { ...tacticB, revisionEligible: revisionEligibility(b, tacticB).eligible };
    }

    const top1 = a.positions[1].lines.find((l) => l.rank === 1);
    rows.push({
      bestMatchesSolution: !!top1 && top1.pvUci[0] === solution,
      id: p.id,
      missedClassification: builtB ? builtB.classification.moves[1].classification : null,
      missedOutcome: tacticB ? tacticB.outcome : null,
      missedRevisionEligible: tacticB ? tacticB.revisionEligible : null,
      ply0Tactic: ply0 ? ply0.primaryMotif : null,
      rating: p.rating,
      sampledFor: p.sampledFor,
      setupClassification: builtA.classification.moves[0].classification,
      solutionClassification: builtA.classification.moves[1].classification,
      tactic: tacticA && { motifs: tacticA.motifs.map((m) => `${m.motif}:${m.confidence}`), outcome: tacticA.outcome, primary: tacticA.primaryMotif },
      themes: p.themes,
    });
    if ((i + 1) % 25 === 0) process.stderr.write(`${i + 1}/${puzzles.length}\n`);
  }
  const elapsed = Date.now() - started;
  stockfish.onModuleDestroy();

  // ── metrics
  const ok = rows.filter((r) => !r.error);
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  const motifStats = {};
  for (const [motif, themes] of Object.entries(THEMES_FOR)) {
    const labelled = ok.filter((r) => r.themes.some((t) => themes.includes(t)));
    const predicted = ok.filter((r) => r.tactic && r.tactic.motifs.some((m) => m.startsWith(`${motif}:`)));
    const tp = predicted.filter((r) => r.themes.some((t) => themes.includes(t)));
    motifStats[motif] = {
      falsePositives: predicted.length - tp.length,
      labelled: labelled.length,
      precision: pct(tp.length, predicted.length),
      predicted: predicted.length,
      recall: pct(labelled.filter((r) => r.tactic && r.tactic.motifs.some((m) => m.startsWith(`${motif}:`))).length, labelled.length),
      truePositives: tp.length,
    };
  }
  const deflection = ok.filter((r) => r.themes.includes('deflection'));
  const summary = {
    bestMoveAgreement: pct(ok.filter((r) => r.bestMatchesSolution).length, ok.length),
    config,
    deflectionPuzzles: {
      asMaterialGainOnly: deflection.filter((r) => r.tactic && r.tactic.primary === 'MATERIAL_GAIN').length,
      total: deflection.length,
      withAnyTactic: deflection.filter((r) => r.tactic).length,
    },
    engine: stockfish.engineName(),
    errors: rows.length - ok.length,
    falseTacticForBlunderingSide: { count: ok.filter((r) => r.ply0Tactic).length, rate: pct(ok.filter((r) => r.ply0Tactic).length, ok.length) },
    foundWhenSolutionPlayed: pct(ok.filter((r) => r.tactic && r.tactic.outcome === 'FOUND').length, ok.filter((r) => r.tactic).length),
    missedAlternative: {
      classifiedSevere: pct(ok.filter((r) => SEVERE.has(r.missedClassification)).length, ok.filter((r) => r.missedClassification).length),
      outcomeMissed: pct(ok.filter((r) => r.missedOutcome === 'MISSED').length, ok.filter((r) => r.missedOutcome).length),
      revisionEligible: pct(ok.filter((r) => r.missedRevisionEligible).length, ok.filter((r) => r.missedOutcome === 'MISSED').length),
    },
    motifs: motifStats,
    msPerSearch: Math.round(elapsed / Math.max(1, searches)),
    puzzles: ok.length,
    searches,
    setupMoveSevere: pct(ok.filter((r) => SEVERE.has(r.setupClassification)).length, ok.length),
    setupMoveUnclassified: pct(ok.filter((r) => r.setupClassification === 'UNCLASSIFIED').length, ok.length),
    tacticDetectedAfterSetup: pct(ok.filter((r) => r.tactic).length, ok.length),
    totalSeconds: Math.round(elapsed / 1000),
    versions: {
      accuracy: types.ACCURACY_FORMULA_VERSION,
      classification: types.MOVE_CLASSIFICATION_VERSION,
      tactics: types.GAME_TACTICS_VERSION,
    },
  };
  const report = { rows, summary };
  if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
