/**
 * One-off: populate `LiveSession.recordingBytes` / `recordingDurationSeconds`
 * for recordings that predate migration `20260831050015_analytics_foundations`.
 *
 * Only touches rows with `recordingUrl` set and `recordingBytes` null. Reads the
 * file size from local disk (`RECORDING_STORAGE_DIR`); rows whose file is gone
 * (pruned, or only in object storage) are left null → shown as "unknown" in the
 * analytics UI. Safe to re-run.
 *
 *   docker compose exec api node dist/prisma/scripts/backfill-recording-sizes.js
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const STORAGE_DIR = path.resolve(process.env.RECORDING_STORAGE_DIR || "/recordings");

function resolveLocalPath(key: string): string | null {
  const clean = key.replace(/^([/\\]?recordings[/\\])/, "").replace(/^[/\\]+/, "");
  const abs = path.resolve(STORAGE_DIR, clean);
  const rel = path.relative(STORAGE_DIR, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.liveSession.findMany({
    where: { recordingUrl: { not: null }, recordingBytes: null },
    select: {
      id: true,
      classId: true,
      recordingUrl: true,
      startedAt: true,
      endedAt: true,
      class: { select: { startsAt: true, endsAt: true } }
    }
  });

  let updated = 0;
  let missing = 0;

  for (const row of rows) {
    const local = row.recordingUrl ? resolveLocalPath(row.recordingUrl) : null;
    let bytes: number | null = null;
    try {
      if (local && fs.existsSync(local)) bytes = fs.statSync(local).size;
    } catch {
      bytes = null;
    }

    if (bytes === null) {
      missing += 1;
      continue;
    }

    const actualMs =
      row.startedAt && row.endedAt
        ? row.endedAt.getTime() - row.startedAt.getTime()
        : row.class
          ? row.class.endsAt.getTime() - row.class.startsAt.getTime()
          : 0;

    await prisma.liveSession.update({
      where: { id: row.id },
      data: {
        recordingBytes: BigInt(bytes),
        recordingStatus: "COMPLETED",
        ...(actualMs > 0
          ? { recordingDurationSeconds: Math.round(actualMs / 1000) }
          : {})
      }
    });
    updated += 1;
  }

  console.log(
    `Backfill complete: ${updated} updated, ${missing} skipped (file not on local disk), ${rows.length} candidates.`
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
