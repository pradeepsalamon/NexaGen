/**
 * P0 reliability Phase 6 reconciliation audit (RELIABILITY_DESIGN.md §6).
 *
 * Read-only. Samples completed classes in a trailing window and reports
 * attendance duration vs. scheduled duration, split by whether the class ran
 * before or after the heartbeat backbone shipped (2026-09-05, Phase 1) — the
 * question this answers is "did adding the heartbeat fallback change existing
 * duration numbers in a way it shouldn't have?" A ratio close to 1.0 on both
 * sides of the cutoff, with no new anomalies appearing after it, is the
 * expected (healthy) result.
 *
 * Point this at whatever database DATABASE_URL resolves to — run it against
 * `vps_dev` (or a prod read replica) for a real historical comparison; run
 * against local dev only to sanity-check the script itself, since local dev
 * data is synthetic (and LiveKit webhooks can't even reach `localhost`, so
 * the fallback path is effectively unexercised there — see CLAUDE.md's
 * debugging table).
 *
 * Needs a generated Prisma client (npm run db:generate):
 *   npm run audit:reliability -w apps/api -- --days 90 --limit 50
 *
 * Flags: --days <n> (default 90, window by class startsAt)
 *        --limit <n> (default 50, max per-class rows printed)
 */
// A bare client, not the Nest app: booting AppModule would also start its cron
// jobs, which write. Attendance rows are not soft-deletable, so no filter is lost.
const { PrismaClient } = require("@prisma/client");

const HEARTBEAT_ROLLOUT_DATE = new Date("2026-09-05T00:00:00.000Z");

function argValue(name, fallback) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function sumSessionDurations(logs) {
  return logs.reduce((sum, log) => sum + (log.sessionDuration || 0), 0);
}

function hasHeartbeatFallback(logs) {
  return logs.some((l) => l.eventType === "DISCONNECT" && l.reason === "heartbeat_timeout");
}

(async () => {
  const days = argValue("days", 90);
  const limit = argValue("limit", 50);
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);

  const prisma = new PrismaClient();

  try {
    const sessions = await prisma.liveSession.findMany({
      where: { status: "ENDED", startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      include: {
        class: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            coachAttendance: { include: { logs: true } },
            attendances: { include: { logs: true } },
          },
        },
      },
    });

    if (sessions.length === 0) {
      console.log(`No ENDED sessions with startedAt in the last ${days} days.`);
      return;
    }

    const rows = sessions.map((session) => {
      const c = session.class;
      const scheduledSeconds = Math.max(
        0,
        (new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 1000
      );

      const studentLogs = c.attendances.flatMap((a) => a.logs);
      const coachLogs = c.coachAttendance?.logs ?? [];

      const studentSeconds = sumSessionDurations(studentLogs);
      const coachSeconds = sumSessionDurations(coachLogs);
      const fallbackTriggered = hasHeartbeatFallback(studentLogs) || hasHeartbeatFallback(coachLogs);

      const ratio = scheduledSeconds > 0 ? studentSeconds / scheduledSeconds : null;
      // Sanity flag only — a genuinely long office-hours-style class or a
      // student who never disconnected across a long grace period can
      // legitimately exceed scheduled time by a bit; this just catches the
      // multi-hour-runaway class of bug the finalize-clamp exists to prevent.
      const anomalous = ratio !== null && (ratio > 3 || ratio < 0);

      return {
        classId: c.id,
        title: c.title || "(untitled)",
        startedAt: session.startedAt,
        prePhase1: new Date(session.startedAt) < HEARTBEAT_ROLLOUT_DATE,
        scheduledMinutes: Math.round(scheduledSeconds / 60),
        studentMinutes: Math.round(studentSeconds / 60),
        coachMinutes: Math.round(coachSeconds / 60),
        durationRatio: ratio,
        heartbeatFallbackTriggered: fallbackTriggered,
        anomalous,
      };
    });

    console.log(`\nSampled ${rows.length} ENDED class(es) since ${since.toISOString()}\n`);

    for (const r of rows.slice(0, limit)) {
      const flag = r.anomalous ? " ⚠ ANOMALY" : "";
      const fallback = r.heartbeatFallbackTriggered ? " [heartbeat-fallback]" : "";
      const bucket = r.prePhase1 ? "pre-P1 " : "post-P1";
      console.log(
        `  [${bucket}] ${r.startedAt.toISOString().slice(0, 10)}  ${r.classId}  ` +
          `scheduled=${r.scheduledMinutes}m student=${r.studentMinutes}m coach=${r.coachMinutes}m ` +
          `ratio=${r.durationRatio === null ? "n/a" : r.durationRatio.toFixed(2)}${fallback}${flag}`
      );
    }
    if (rows.length > limit) {
      console.log(`  ... and ${rows.length - limit} more (raise --limit to see them)`);
    }

    const summarize = (bucket) => {
      const ratios = bucket.map((r) => r.durationRatio).filter((r) => r !== null);
      const avgRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
      return {
        count: bucket.length,
        avgRatio,
        anomalies: bucket.filter((r) => r.anomalous).length,
        heartbeatFallbacks: bucket.filter((r) => r.heartbeatFallbackTriggered).length,
      };
    };

    const pre = summarize(rows.filter((r) => r.prePhase1));
    const post = summarize(rows.filter((r) => !r.prePhase1));

    console.log("\nSummary (attendance-duration / scheduled-duration ratio, ~1.0 is healthy):");
    console.log(
      `  pre-Phase-1  : n=${pre.count} avgRatio=${pre.avgRatio?.toFixed(2) ?? "n/a"} ` +
        `anomalies=${pre.anomalies} heartbeatFallbacks=${pre.heartbeatFallbacks}`
    );
    console.log(
      `  post-Phase-1 : n=${post.count} avgRatio=${post.avgRatio?.toFixed(2) ?? "n/a"} ` +
        `anomalies=${post.anomalies} heartbeatFallbacks=${post.heartbeatFallbacks}`
    );
    console.log(
      "\nExpected: avgRatio stays close on both sides, and post-Phase-1 anomalies are the " +
        "same or fewer than pre-Phase-1 (the fallback should only ever prevent a runaway " +
        "duration, never introduce one)."
    );
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
