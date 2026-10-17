import {
  ACCURACY_FORMULA_VERSION,
  GAME_PHASES,
  GAME_TACTICS_VERSION,
  INSIGHT_THRESHOLDS,
  MOVE_CLASSIFICATIONS,
  MOVE_CLASSIFICATION_VERSION,
  TACTIC_MOTIFS,
  type AccuracyTrend,
  type ClockStats,
  type GamePhase,
  type MotifInsight,
  type MotifStats,
  type MoveClassification,
  type PhaseStats,
  type StudentGameInsights,
  type TacticMotif,
} from '@nexa-chess/types';

/** One analysed side, as read from game_analysis_sides. */
export type InsightRow = {
  analysisId: string;
  gameId: string;
  depth: 'QUICK' | 'STANDARD' | 'DEEP';
  analysisCreatedAt: Date;
  playedAt: Date;
  side: 'white' | 'black';
  result: string;
  accuracy: number | null;
  accuracyVersion: string;
  classificationVersion: string;
  tacticsVersion: string;
  counts: Record<MoveClassification, number>;
  tactics: Partial<Record<TacticMotif, MotifStats>>;
  phases: Record<GamePhase, PhaseStats>;
  clock: ClockStats | null;
  rating: number | null;
  sourceKey: string;
  eco: string | null;
  openingName: string | null;
};

type Thresholds = typeof INSIGHT_THRESHOLDS;

const DEPTH_RANK = { DEEP: 2, QUICK: 0, STANDARD: 1 } as const;
const MISTAKE_CLASSES: MoveClassification[] = ['MISTAKE', 'MISSED_WIN', 'MISSED_DRAW'];
const BLUNDER_CLASSES: MoveClassification[] = ['BLUNDER', 'MISSED_MATE', 'MATE_ALLOWED'];

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const sumOf = (counts: Record<MoveClassification, number>, keys: MoveClassification[]) =>
  keys.reduce((a, k) => a + (counts[k] ?? 0), 0);

/**
 * One analysis per game: the deepest, then the newest. Two depths of the
 * same game must never count it twice.
 */
export function onePerGame(rows: InsightRow[]): InsightRow[] {
  const best = new Map<string, InsightRow>();
  for (const row of rows) {
    const cur = best.get(row.gameId);
    if (
      !cur ||
      DEPTH_RANK[row.depth] > DEPTH_RANK[cur.depth] ||
      (DEPTH_RANK[row.depth] === DEPTH_RANK[cur.depth] && row.analysisCreatedAt > cur.analysisCreatedAt)
    ) {
      best.set(row.gameId, row);
    }
  }
  return [...best.values()];
}

/**
 * Aggregate a student's analysed games into evidence-backed statements.
 * Every rate, trend and verdict is withheld (null / NOT_ENOUGH_DATA) until the
 * thresholds in INSIGHT_THRESHOLDS are met, and only rows of the CURRENT
 * algorithm versions are combined — older ones are counted as excluded.
 */
export function aggregateInsights(studentId: string, input: InsightRow[], t: Thresholds = INSIGHT_THRESHOLDS): StudentGameInsights {
  const versions = {
    accuracy: ACCURACY_FORMULA_VERSION,
    classification: MOVE_CLASSIFICATION_VERSION,
    tactics: GAME_TACTICS_VERSION,
  };
  const deduped = onePerGame(input);
  const rows = deduped.filter(
    (r) =>
      r.accuracyVersion === versions.accuracy &&
      r.classificationVersion === versions.classification &&
      r.tacticsVersion === versions.tactics,
  );
  const games = rows.length;
  const enough = games >= t.minGamesForRates;

  // ── colour split + results
  const byColor = Object.fromEntries(
    (['white', 'black'] as const).map((color) => {
      const own = rows.filter((r) => r.side === color);
      return [
        color,
        {
          accuracy: round1(mean(own.map((r) => r.accuracy).filter((a): a is number => a !== null))),
          draws: own.filter((r) => r.result === 'DRAW').length,
          games: own.length,
          losses: own.filter((r) => r.result === 'LOSS').length,
          wins: own.filter((r) => r.result === 'WIN').length,
        },
      ];
    }),
  ) as StudentGameInsights['byColor'];

  // ── move classifications
  const counts = Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c, 0])) as Record<MoveClassification, number>;
  for (const r of rows) for (const c of MOVE_CLASSIFICATIONS) counts[c] += r.counts[c] ?? 0;
  const judgedMoves = MOVE_CLASSIFICATIONS.filter((c) => c !== 'FORCED' && c !== 'UNCLASSIFIED').reduce((a, c) => a + counts[c], 0);
  const per100 = (n: number) => (enough && judgedMoves > 0 ? round1((n / judgedMoves) * 100) : null);
  const errorRates = {
    blunders: per100(sumOf(counts, BLUNDER_CLASSES)),
    inaccuracies: per100(counts.INACCURACY),
    judgedMoves,
    mistakes: per100(sumOf(counts, MISTAKE_CLASSES)),
  };

  // ── phases
  const phases = Object.fromEntries(
    GAME_PHASES.map((phase) => {
      const total: PhaseStats = { blunders: 0, lossSum: 0, mistakes: 0, moves: 0 };
      for (const r of rows) {
        const p = r.phases[phase];
        if (!p) continue;
        total.moves += p.moves;
        total.mistakes += p.mistakes;
        total.blunders += p.blunders;
        total.lossSum += p.lossSum;
      }
      const errorRate = enough && total.moves > 0 ? round1(((total.mistakes + total.blunders) / total.moves) * 100) : null;
      return [phase, { ...total, errorRate, lossSum: Math.round(total.lossSum * 10) / 10 }];
    }),
  ) as StudentGameInsights['phases'];

  // ── tactics: denominators are opportunities, never games or moves
  const motifs: MotifInsight[] = [];
  for (const motif of TACTIC_MOTIFS) {
    let found = 0;
    let missed = 0;
    let alternative = 0;
    let allowed = 0;
    let gamesWithMiss = 0;
    const gamesTouched = new Set<string>();
    const examples: MotifInsight['evidence']['examples'] = [];
    for (const r of rows) {
      const s = r.tactics[motif];
      if (!s) continue;
      found += s.found;
      missed += s.missed;
      alternative += s.alternative;
      allowed += s.allowed;
      if (s.found + s.missed + s.alternative > 0) gamesTouched.add(r.gameId);
      if (s.missed > 0) gamesWithMiss += 1;
      for (const ply of s.missedPlies ?? []) {
        if (examples.length < 5) examples.push({ analysisId: r.analysisId, gameId: r.gameId, ply });
      }
    }
    const opportunities = found + missed + alternative;
    if (opportunities === 0 && allowed === 0) continue;
    const rated = opportunities >= t.minOpportunitiesForRate;
    const missRate = rated ? Math.round((missed / opportunities) * 100) / 100 : null;
    const verdict: MotifInsight['verdict'] = !rated
      ? 'NOT_ENOUGH_DATA'
      : missRate !== null &&
          missRate >= t.weaknessMissRate &&
          missed >= t.minMissesForWeakness &&
          gamesWithMiss >= t.minGamesForWeakness
        ? 'WEAKNESS'
        : (found + alternative) / opportunities >= t.strengthFoundRate
          ? 'STRENGTH'
          : 'NEUTRAL';
    motifs.push({
      allowed,
      evidence: { examples, games: gamesTouched.size, samples: opportunities },
      found,
      missRate,
      missed,
      motif,
      opportunities,
      verdict,
    });
  }
  const verdictRank = { NEUTRAL: 2, NOT_ENOUGH_DATA: 3, STRENGTH: 1, WEAKNESS: 0 } as const;
  motifs.sort((a, b) => verdictRank[a.verdict] - verdictRank[b.verdict] || b.opportunities - a.opportunities);

  // ── trend: recent window vs the one before it
  const withAccuracy = rows
    .filter((r) => r.accuracy !== null)
    .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
  const n = t.minGamesPerTrendWindow;
  const recent = withAccuracy.slice(0, n);
  const previous = withAccuracy.slice(n, n * 2);
  const recentAcc = round1(mean(recent.map((r) => r.accuracy as number)));
  const previousAcc = round1(mean(previous.map((r) => r.accuracy as number)));
  let verdict: AccuracyTrend['verdict'] = 'NOT_ENOUGH_DATA';
  if (recent.length >= n && previous.length >= n && recentAcc !== null && previousAcc !== null) {
    const delta = recentAcc - previousAcc;
    verdict = delta >= t.trendMinAccuracyDelta ? 'IMPROVING' : delta <= -t.trendMinAccuracyDelta ? 'DECLINING' : 'STEADY';
  }
  const trend: AccuracyTrend = {
    previous: { accuracy: previousAcc, games: previous.length },
    recent: { accuracy: recentAcc, games: recent.length },
    verdict,
  };

  // ── time pressure: only from rows that had trustworthy clocks
  const clocked = rows.map((r) => r.clock).filter((c): c is ClockStats => c !== null);
  let time: StudentGameInsights['time'] = null;
  if (clocked.length > 0) {
    const sum = clocked.reduce(
      (a, c) => ({
        clockedMoves: a.clockedMoves + c.clockedMoves,
        lowTimeErrors: a.lowTimeErrors + c.lowTimeErrors,
        lowTimeMoves: a.lowTimeMoves + c.lowTimeMoves,
        otherErrors: a.otherErrors + c.otherErrors,
      }),
      { clockedMoves: 0, lowTimeErrors: 0, lowTimeMoves: 0, otherErrors: 0 },
    );
    const otherMoves = sum.clockedMoves - sum.lowTimeMoves;
    const clockedEnough = clocked.length >= t.minGamesForRates;
    time = {
      ...sum,
      lowTimeErrorRate: clockedEnough && sum.lowTimeMoves > 0 ? round1((sum.lowTimeErrors / sum.lowTimeMoves) * 100) : null,
      otherErrorRate: clockedEnough && otherMoves > 0 ? round1((sum.otherErrors / otherMoves) * 100) : null,
    };
  }

  // ── ratings: per source, never merged
  const ratingMap = new Map<string, { latest: number; at: Date; games: number }>();
  for (const r of rows) {
    if (r.rating === null) continue;
    const cur = ratingMap.get(r.sourceKey);
    if (!cur) ratingMap.set(r.sourceKey, { at: r.playedAt, games: 1, latest: r.rating });
    else {
      cur.games += 1;
      if (r.playedAt > cur.at) Object.assign(cur, { at: r.playedAt, latest: r.rating });
    }
  }

  // ── openings: only where the game record named one (never guessed)
  const openingMap = new Map<string, StudentGameInsights['openings'][number] & { accuracies: number[] }>();
  for (const r of rows) {
    if (!r.eco && !r.openingName) continue;
    const key = `${r.side}|${r.eco ?? ''}|${r.openingName ?? ''}`;
    const cur =
      openingMap.get(key) ??
      { accuracies: [], accuracy: null, color: r.side, draws: 0, eco: r.eco, games: 0, losses: 0, name: r.openingName, wins: 0 };
    cur.games += 1;
    if (r.result === 'WIN') cur.wins += 1;
    else if (r.result === 'LOSS') cur.losses += 1;
    else if (r.result === 'DRAW') cur.draws += 1;
    if (r.accuracy !== null) cur.accuracies.push(r.accuracy);
    openingMap.set(key, cur);
  }
  const openings = [...openingMap.values()]
    .map(({ accuracies, ...o }) => ({ ...o, accuracy: round1(mean(accuracies)) }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 10);

  return {
    byColor,
    counts,
    errorRates,
    excludedOtherVersions: deduped.length - rows.length,
    gamesAnalysed: games,
    motifs,
    openings,
    phases,
    ratings: [...ratingMap.entries()].map(([source, v]) => ({ games: v.games, latest: v.latest, source })),
    studentId,
    thresholds: t,
    time,
    trend,
    versions,
  };
}
