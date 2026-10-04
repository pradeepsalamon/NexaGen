/**
 * Lichess puzzle catalogue — STAGE 1, PREPARE (spec §13; docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md).
 *
 * Runs OFF the production box: replaying 6M puzzles with chess.js is about
 * 1.75 CPU-hours. A pure function of the input file, so retry = re-run.
 *
 *   curl -fLO https://database.lichess.org/lichess_db_puzzle.csv.zst
 *   npm run puzzles:prepare -w apps/api -- --in lichess_db_puzzle.csv.zst --out ./lichess-release
 *
 * Options: --workers N (default: CPUs - 1), --dump-date YYYY-MM-DD (default: the
 * input file's mtime), --source-url URL, --sort-mem SIZE (GNU sort -S, default 1G).
 *
 * Pipeline: zstd -dc → line split → validate + derive in worker threads
 * (src/puzzle/catalogue/lichess-prepare.core.ts) → sort by contentHash and mark
 * the canonical row of each content → sort by (ratingBand, randKey, id) — the
 * physical order the walk index relies on — → zstd.
 *
 * Output, laid out exactly as it is stored in OCI (`lichess/<preparedSha256>/`):
 *   <out>/<preparedSha256>/catalogue.tsv.zst
 *   <out>/<preparedSha256>/manifest.json
 *   <out>/<preparedSha256>/rejects.tsv
 * preparedSha256 is the sha256 of the UNCOMPRESSED TSV, so it does not depend
 * on the zstd version. Exits 1 when rejects exceed 0.1% of rows.
 *
 * Needs a built API (`npm run build -w apps/api` — the npm script does it) and
 * zstd + GNU sort on PATH.
 */
const { spawn, execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { Worker, isMainThread, parentPort } = require("node:worker_threads");

const CORE_PATH = path.join(__dirname, "../dist/src/puzzle/catalogue/lichess-prepare.core.js");
const DEFAULT_SOURCE_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const BATCH_SIZE = 1000;

function loadCore() {
  if (!fs.existsSync(CORE_PATH)) {
    console.error(`Missing ${CORE_PATH} — run \`npm run build -w apps/api\` first.`);
    process.exit(2);
  }
  return require(CORE_PATH);
}

// ── Worker: validate + derive one batch of lines ─────────────────────────────
if (!isMainThread) {
  const core = loadCore();
  parentPort.on("message", ({ lines }) => {
    const valid = [];
    const rejects = [];
    const unknownThemes = {};
    let badOpeningTags = 0;
    let badGameUrl = 0;
    for (const { lineNo, text } of lines) {
      const result = core.prepareLine(text);
      if (!result.ok) {
        rejects.push({ detail: result.detail ?? "", id: result.id, lineNo, reason: result.reason });
        continue;
      }
      // Last column carries SOURCE quality for now; the canonical pass narrows it.
      valid.push(core.toCatalogueTsv(result.row, result.row.passesSourceQuality));
      for (const key of result.flags.unknownThemes) unknownThemes[key] = (unknownThemes[key] ?? 0) + 1;
      if (result.flags.badOpeningTags) badOpeningTags += 1;
      if (result.flags.badGameUrl) badGameUrl += 1;
    }
    parentPort.postMessage({ badGameUrl, badOpeningTags, rejects, unknownThemes, valid });
  });
  return;
}

// ── Main thread ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  if (!args.in || !args.out) {
    throw new Error("Usage: lichess-puzzles-prepare.cjs --in <dump.csv.zst> --out <dir> [--workers N] [--dump-date YYYY-MM-DD]");
  }
  return args;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: __dirname, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited with ${code}`))));
  });
}

function writeLine(stream, line) {
  return stream.write(`${line}\n`) ? null : new Promise((resolve) => stream.once("drain", resolve));
}

/** Stage A: decompress, split, validate in workers → unsorted valid.tsv + rejects.tsv. */
async function validateAll(core, args, workDir, releaseFiles) {
  const workerCount = Math.max(1, Number(args.workers) || Math.max(1, os.cpus().length - 1));
  const workers = Array.from({ length: workerCount }, () => new Worker(__filename));
  const validOut = fs.createWriteStream(path.join(workDir, "valid.tsv"));
  const rejectsOut = fs.createWriteStream(releaseFiles.rejects);
  rejectsOut.write("lineNo\tid\treason\tdetail\n");

  const seenIds = new Uint8Array(Math.ceil(core.LICHESS_ID_SPACE / 8));
  const stats = { badGameUrl: 0, badOpeningTags: 0, rejectReasons: {}, rejected: 0, total: 0, unknownThemes: {}, valid: 0 };
  const reject = (lineNo, id, reason, detail) => {
    stats.rejected += 1;
    stats.rejectReasons[reason] = (stats.rejectReasons[reason] ?? 0) + 1;
    rejectsOut.write(`${lineNo}\t${id}\t${reason}\t${String(detail ?? "").replace(/[\t\n]/g, " ")}\n`);
  };

  const zstd = spawn("zstd", ["-dc", args.in], { stdio: ["ignore", "pipe", "inherit"] });
  const zstdDone = waitForExit(zstd, "zstd -dc");
  const rl = readline.createInterface({ crlfDelay: Infinity, input: zstd.stdout });

  let inFlight = 0;
  let nextWorker = 0;
  let batch = [];
  let lineNo = 0;
  let wake = null;
  const maxInFlight = workerCount * 4;
  const hasCapacity = () => inFlight < maxInFlight && !validOut.writableNeedDrain;
  const nudge = () => {
    if (wake && (hasCapacity() || inFlight === 0)) {
      const resolve = wake;
      wake = null;
      resolve();
    }
  };

  const onResult = (msg) => {
    inFlight -= 1;
    for (const line of msg.valid) validOut.write(`${line}\n`);
    stats.valid += msg.valid.length;
    for (const r of msg.rejects) reject(r.lineNo, r.id, r.reason, r.detail);
    for (const [key, n] of Object.entries(msg.unknownThemes)) stats.unknownThemes[key] = (stats.unknownThemes[key] ?? 0) + n;
    stats.badOpeningTags += msg.badOpeningTags;
    stats.badGameUrl += msg.badGameUrl;
    nudge();
  };
  for (const w of workers) {
    w.on("message", onResult);
    w.on("error", (err) => {
      console.error("Worker failed:", err);
      process.exit(1);
    });
  }
  validOut.on("drain", nudge);

  // Backpressure: the for-await loop stops pulling lines while workers or the
  // output file are saturated.
  const flush = async () => {
    if (batch.length > 0) {
      workers[nextWorker].postMessage({ lines: batch });
      nextWorker = (nextWorker + 1) % workers.length;
      inFlight += 1;
      batch = [];
    }
    while (!hasCapacity()) await new Promise((resolve) => (wake = resolve));
  };

  let lastReport = Date.now();
  for await (const text of rl) {
    lineNo += 1;
    if (lineNo === 1) {
      if (text.trim() !== core.LICHESS_CSV_HEADER) {
        throw new Error(`Unexpected header — the dump format changed:\n  got      ${text}\n  expected ${core.LICHESS_CSV_HEADER}`);
      }
      continue;
    }
    if (text === "") continue;
    stats.total += 1;
    const id = text.slice(0, text.indexOf(","));
    if (/^[A-Za-z0-9]{5}$/.test(id)) {
      const n = core.lichessIdOrdinal(id);
      const bit = 1 << (n & 7);
      if (seenIds[n >> 3] & bit) {
        reject(lineNo, id, "DUPLICATE_ID");
        continue;
      }
      seenIds[n >> 3] |= bit;
    }
    batch.push({ lineNo, text });
    if (batch.length >= BATCH_SIZE) await flush();
    if (Date.now() - lastReport > 30_000) {
      lastReport = Date.now();
      console.log(`  … ${stats.total.toLocaleString("en")} rows read, ${stats.valid.toLocaleString("en")} valid`);
    }
  }
  await flush();
  await zstdDone;
  while (inFlight > 0) await new Promise((resolve) => (wake = resolve));
  await Promise.all(workers.map((w) => w.terminate()));
  await new Promise((resolve) => validOut.end(resolve));
  await new Promise((resolve) => rejectsOut.end(resolve));
  return stats;
}

/**
 * Stage B: one canonical row per contentHash (highest nbPlays, then smallest
 * id) keeps its quality flag; every other row of that content is a duplicate
 * and never passes. Then the physical (ratingBand, randKey, id) sort, hashed
 * uncompressed and compressed with zstd.
 */
async function canonicaliseAndSort(core, args, workDir, compressedPath) {
  const k = core.TSV_SORT_KEYS;
  const sortEnv = { ...process.env, LC_ALL: "C" };
  const sortMem = args["sort-mem"] || "1G";
  const common = ["-t", "\t", "-S", sortMem, "-T", workDir];

  const byContent = spawn(
    "sort",
    [...common, `-k${k.contentHash},${k.contentHash}`, `-k${k.nbPlays},${k.nbPlays}nr`, `-k${k.id},${k.id}`, path.join(workDir, "valid.tsv")],
    { env: sortEnv, stdio: ["ignore", "pipe", "inherit"] }
  );
  const byWalk = spawn(
    "sort",
    [...common, `-k${k.ratingBand},${k.ratingBand}n`, `-k${k.randKey},${k.randKey}n`, `-k${k.id},${k.id}`],
    { env: sortEnv, stdio: ["pipe", "pipe", "inherit"] }
  );
  const zstd = spawn("zstd", ["-q", "-f", "-T0", "-10", "-o", compressedPath], { stdio: ["pipe", "inherit", "inherit"] });
  const done = Promise.all([waitForExit(byContent, "sort (content)"), waitForExit(byWalk, "sort (walk)"), waitForExit(zstd, "zstd")]);

  const tsvHash = crypto.createHash("sha256");
  let tsvBytes = 0;
  const bandCounts = {};
  byWalk.stdout.on("data", (chunk) => {
    tsvHash.update(chunk);
    tsvBytes += chunk.length;
    if (!zstd.stdin.write(chunk)) {
      byWalk.stdout.pause();
      zstd.stdin.once("drain", () => byWalk.stdout.resume());
    }
  });
  byWalk.stdout.on("end", () => zstd.stdin.end());

  let previousHash = null;
  let duplicates = 0;
  let passing = 0;
  const gateCol = k.passesQualityGate - 1;
  const hashCol = k.contentHash - 1;
  const bandCol = k.ratingBand - 1;
  const rl = readline.createInterface({ crlfDelay: Infinity, input: byContent.stdout });
  for await (const line of rl) {
    const cols = line.split("\t");
    const canonical = cols[hashCol] !== previousHash;
    previousHash = cols[hashCol];
    if (!canonical) duplicates += 1;
    const passes = canonical && cols[gateCol] === "t";
    if (passes) passing += 1;
    cols[gateCol] = passes ? "t" : "f";
    bandCounts[cols[bandCol]] = (bandCounts[cols[bandCol]] ?? 0) + 1;
    const wait = writeLine(byWalk.stdin, cols.join("\t"));
    if (wait) await wait;
  }
  byWalk.stdin.end();
  await done;
  return { bandCounts, duplicates, passing, preparedSha256: tsvHash.digest("hex"), tsvBytes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const core = loadCore();
  const started = Date.now();
  const outRoot = path.resolve(args.out);
  fs.mkdirSync(outRoot, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(outRoot, ".prepare-"));
  const releaseFiles = { compressed: path.join(workDir, "catalogue.tsv.zst"), rejects: path.join(workDir, "rejects.tsv") };

  try {
    const inputStat = fs.statSync(args.in);
    const dumpDate = args["dump-date"] || inputStat.mtime.toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dumpDate)) throw new Error(`--dump-date must be YYYY-MM-DD, got ${dumpDate}`);

    console.log(`Hashing ${args.in} …`);
    const sourceSha256 = await sha256File(args.in);
    console.log("Validating …");
    const stats = await validateAll(core, args, workDir, releaseFiles);
    console.log(`Validated ${stats.total.toLocaleString("en")} rows (${stats.rejected} rejected). Sorting …`);
    const sorted = await canonicaliseAndSort(core, args, workDir, releaseFiles.compressed);
    const compressedSha256 = await sha256File(releaseFiles.compressed);

    const manifest = {
      formatVersion: core.PREPARE_FORMAT_VERSION,
      lichessDumpDate: dumpDate,
      sourceUrl: args["source-url"] || DEFAULT_SOURCE_URL,
      sourceSha256,
      preparedSha256: sorted.preparedSha256,
      preparedAt: new Date().toISOString(),
      preparerGitSha: gitSha(),
      columns: [...core.CATALOGUE_TSV_COLUMNS],
      files: {
        catalogue: { name: "catalogue.tsv.zst", bytes: fs.statSync(releaseFiles.compressed).size, sha256: compressedSha256, uncompressedBytes: sorted.tsvBytes },
        rejects: { name: "rejects.tsv" }
      },
      qualityGate: { ...core.QUALITY_GATE, canonicalPerContentHash: true },
      rows: {
        total: stats.total,
        valid: stats.valid,
        rejected: stats.rejected,
        duplicates: sorted.duplicates,
        passesQualityGate: sorted.passing
      },
      rejectReasons: stats.rejectReasons,
      unknownThemes: stats.unknownThemes,
      flagged: { badGameUrl: stats.badGameUrl, badOpeningTags: stats.badOpeningTags },
      ratingBands: sorted.bandCounts,
      durationSeconds: Math.round((Date.now() - started) / 1000)
    };

    const releaseDir = path.join(outRoot, sorted.preparedSha256);
    fs.rmSync(releaseDir, { force: true, recursive: true });
    fs.mkdirSync(releaseDir);
    fs.renameSync(releaseFiles.compressed, path.join(releaseDir, "catalogue.tsv.zst"));
    fs.renameSync(releaseFiles.rejects, path.join(releaseDir, "rejects.tsv"));
    fs.writeFileSync(path.join(releaseDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    const rejectRatio = stats.total === 0 ? 1 : stats.rejected / stats.total;
    console.log(
      [
        "",
        `Release      ${releaseDir}`,
        `Rows         ${stats.total.toLocaleString("en")} total, ${stats.valid.toLocaleString("en")} valid, ${stats.rejected.toLocaleString("en")} rejected`,
        `Duplicates   ${sorted.duplicates.toLocaleString("en")} (same position + line)`,
        `Quality gate ${sorted.passing.toLocaleString("en")} pass`,
        `Reject why   ${JSON.stringify(stats.rejectReasons)}`,
        `Unknown      ${Object.keys(stats.unknownThemes).length ? JSON.stringify(stats.unknownThemes) : "none"} (themes not in LICHESS_THEMES)`,
        `Flagged      ${stats.badOpeningTags} opening tags, ${stats.badGameUrl} game URLs`,
        `Duration     ${manifest.durationSeconds}s`,
        ""
      ].join("\n")
    );
    if (rejectRatio > core.MAX_REJECT_RATIO) {
      console.error(`Rejects are ${(rejectRatio * 100).toFixed(3)}% of rows (limit ${core.MAX_REJECT_RATIO * 100}%) — the dump format may have changed. Do not load this release.`);
      process.exitCode = 1;
    }
  } finally {
    fs.rmSync(workDir, { force: true, recursive: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
