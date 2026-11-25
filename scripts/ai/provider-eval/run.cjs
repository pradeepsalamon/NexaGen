// Outside-AI provider evaluation runner (docs/ai/PROVIDER_EVAL.md).
//
// Sends the small test set in docs/ai/provider-eval/inputs to each model and
// keeps every request and answer in docs/ai/provider-eval/runs/<model>/.
// Resumable: a call whose record already holds an answer is not sent again.
// Waits out per-minute limits; stops a model for the day when its daily
// quota is spent (rerun later to continue).
//
// Keys come from a gitignored env file (GROQ_KEY=, GEMINI_KEY=, OPENROUTER_KEY=)
// and are never written to a record or printed.
//
// Usage (from the repo root; needs a built @nexa-chess/types and apps/api, see README):
//   KEYS=.env.outside-ai APP_ROOT=<checkout with node_modules + dist> \
//     node scripts/ai/provider-eval/run.cjs --models groq:openai/gpt-oss-120b,local:qwen2.5:3b [--tasks recap,game-review]
//   ... run.cjs --capacity <task> --models <one model> [--max 2000]   (run until the daily limit)
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const APP_ROOT = process.env.APP_ROOT || ROOT;
const types = require(path.join(APP_ROOT, "packages/types/dist/index.js"));
const { generateRecap } = require(path.join(APP_ROOT, "apps/api/dist/src/class-recap/class-recap.generator.js"));
const { OUTSIDE_AI_SYSTEM_PROMPT, outsideAiUserPrompt } = require(path.join(APP_ROOT, "apps/api/dist/src/ai/outside/outside-ai.js"));
const { OUTSIDE_THINKING_TOKENS } = require(path.join(APP_ROOT, "apps/api/dist/src/ai/chat-model.js"));

const INPUTS = path.join(ROOT, "docs/ai/provider-eval/inputs");
const RUNS = path.join(ROOT, "docs/ai/provider-eval/runs");
const CHUNK_TOKENS = Number(process.env.CHUNK_TOKENS || 2500); // the app's AI_CLASS_RECAP_CHUNK_TOKENS default

// ── Providers ───────────────────────────────────────────────

const PROVIDERS = {
  gemini: { key: "GEMINI", url: "https://generativelanguage.googleapis.com/v1beta/openai" },
  groq: { key: "GROQ", url: "https://api.groq.com/openai/v1" },
  local: { key: null, url: process.env.LOCAL_URL || "http://127.0.0.1:11437/v1" },
  openrouter: { key: "OPENROUTER", url: "https://openrouter.ai/api/v1" }
};

function readKeys() {
  const file = process.env.KEYS || path.join(ROOT, ".env.outside-ai");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z]+)_KEY=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()])
  );
}
const KEYS = readKeys();
const SECRETS = Object.values(KEYS).filter((k) => k.length > 8);
// Keys, and account ids that error bodies carry (Groq names the organisation).
const redact = (text) =>
  SECRETS.reduce((t, s) => t.split(s).join("[key]"), String(text))
    .replace(/org_[a-z0-9]{10,}/gi, "org_[redacted]")
    .replace(/user_[A-Za-z0-9]{16,}/g, "user_[redacted]");

const slug = (s) => s.replace(/[^a-zA-Z0-9.-]+/g, "_");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const log = (...a) => console.log(now().slice(11, 19), ...a);

class DailyLimitError extends Error {}

/** Seconds to wait from a 429/503 answer, or null when not stated. */
function retryAfterSeconds(headers, bodyText) {
  const h = headers.get("retry-after");
  if (h && !Number.isNaN(Number(h))) return Number(h);
  const m = bodyText.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) || bodyText.match(/try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (m) return m.length === 3 ? Number(m[1] || 0) * 60 + Number(m[2]) : Number(m[1]);
  return null;
}

function isDailyLimit(provider, bodyText) {
  if (provider === "groq") return /per day \((?:TPD|RPD)\)/i.test(bodyText);
  if (provider === "gemini") return /PerDay/i.test(bodyText);
  if (provider === "openrouter") return /free-models-per-day/i.test(bodyText);
  return false;
}

/**
 * One chat call, shaped like the app's (`ai/chat-model.ts`): outside models get
 * OUTSIDE_THINKING_TOKENS extra room; JSON tasks ask for a JSON object; only
 * the local model gets a seed. Retries 429 (per-minute) and 5xx; a daily limit
 * throws DailyLimitError. Returns the full record of the exchange.
 */
async function chat(model, prompt, opts) {
  const p = PROVIDERS[model.provider];
  const outside = model.provider !== "local";
  const body = {
    max_tokens: outside ? opts.maxTokens + OUTSIDE_THINKING_TOKENS : opts.maxTokens,
    messages: [
      { content: prompt.system, role: "system" },
      { content: prompt.user, role: "user" }
    ],
    model: model.id,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    ...(outside ? {} : { seed: 7 }),
    temperature: opts.temperature ?? 0
  };
  const attempts = [];
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const started = Date.now();
    let res;
    let text;
    try {
      res = await fetch(`${p.url}/chat/completions`, {
        body: JSON.stringify(body),
        headers: {
          ...(p.key ? { Authorization: `Bearer ${KEYS[p.key]}` } : {}),
          "Content-Type": "application/json"
        },
        method: "POST",
        signal: AbortSignal.timeout(outside ? 300_000 : 900_000)
      });
      text = await res.text();
    } catch (e) {
      attempts.push({ at: now(), error: redact(e.message), ms: Date.now() - started });
      await sleep(Math.min(300, 15 * attempt) * 1000);
      continue;
    }
    const ms = Date.now() - started;
    const limits = {};
    for (const [k, v] of res.headers) if (/ratelimit|retry-after/i.test(k)) limits[k] = v;
    if (res.ok) {
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        attempts.push({ at: now(), error: "unreadable body", ms, status: res.status });
        await sleep(10_000);
        continue;
      }
      const choice = json.choices?.[0] ?? {};
      const content = typeof choice.message?.content === "string" ? choice.message.content : "";
      attempts.push({ at: now(), limits, ms, status: res.status });
      if (!content.trim() && attempt < 3) {
        // An empty answer (all thinking, or a provider hiccup): try once more.
        attempts[attempts.length - 1].error = `empty answer (finish_reason ${choice.finish_reason ?? "?"})`;
        continue;
      }
      return {
        attempts,
        request: body,
        response: {
          content,
          finishReason: choice.finish_reason ?? null,
          ms,
          providerModel: json.model ?? null,
          reasoning: choice.message?.reasoning ?? choice.message?.reasoning_content ?? null,
          usage: json.usage ?? null
        }
      };
    }
    const errText = redact(text).slice(0, 2000);
    attempts.push({ at: now(), error: errText, limits, ms, status: res.status });
    if (res.status === 429 && isDailyLimit(model.provider, text)) {
      const err = new DailyLimitError(`daily limit: ${errText.slice(0, 300)}`);
      err.attempts = attempts;
      err.request = body;
      throw err;
    }
    if (res.status === 429 || res.status >= 500 || res.status === 408) {
      const wait = retryAfterSeconds(res.headers, text) ?? Math.min(600, 20 * 2 ** Math.min(attempt, 5));
      log(`   ${model.label} ${res.status}, waiting ${Math.ceil(wait)} s (attempt ${attempt})`);
      await sleep((wait + 2) * 1000);
      continue;
    }
    // 400/401/403/404/413: not worth retrying.
    const err = new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
    err.attempts = attempts;
    err.request = body;
    throw err;
  }
  const err = new Error("gave up after 12 attempts");
  err.attempts = attempts;
  err.request = body;
  throw err;
}

// ── Tasks ───────────────────────────────────────────────────

const input = (name) => JSON.parse(fs.readFileSync(path.join(INPUTS, `${name}.json`), "utf8"));

const TAMIL_RECAP_RULE =
  "- The transcript comes from speech recognition: it may mix Tamil and English and contain mistakes. Write in simple Tamil, in Tamil script; common chess words may stay in English.";
function tamilRecapPrompt(prompt) {
  if (!prompt.system.startsWith("You write a short recap")) return prompt;
  return {
    system: prompt.system.replace(/- The transcript comes from speech recognition:.*$/m, TAMIL_RECAP_RULE),
    user: prompt.user
  };
}

/** Each task: items → one "unit" each; a unit may make several calls (recaps). */
const TASKS = {
  recap: {
    feature: "Class recap (English)",
    units: () =>
      ["recap-en", "recap-mixed", "recap-ta"].map((id) => ({
        id,
        run: (call) => runRecap(call, input(id).lines, (p) => p)
      }))
  },
  "recap-tamil": {
    feature: "Class recap in Tamil script",
    units: () => [{ id: "recap-ta-to-ta", run: (call) => runRecap(call, input("recap-ta").lines, tamilRecapPrompt) }]
  },
  "game-review": {
    feature: "Game review comment (AI play review)",
    units: () =>
      ["game-legal", "game-immortal"].map((id) => ({
        id,
        run: async (call) => {
          const play = input(id).play;
          const r = await call(
            { system: OUTSIDE_AI_SYSTEM_PROMPT, user: outsideAiUserPrompt(play) },
            { maxTokens: 400, temperature: 0.4 }
          );
          return { output: r.response.content.trim().slice(0, 1500), checks: checkReview(r.response.content, play) };
        }
      }))
  },
  "translate-ta": {
    feature: "Tamil translation of a review",
    units: () =>
      input("translate-ta").items.map((item) => ({
        id: item.id,
        run: async (call) => {
          const r = await call(
            {
              system: [
                "You translate a chess coach's short comment for a child and their parent in Tamil Nadu.",
                "Translate into simple, natural spoken-style Tamil in Tamil script. Keep the meaning exactly; add nothing.",
                "Chess piece names and words like checkmate may stay in English (in Tamil letters or English letters) as Tamil chess players say them.",
                'Return only JSON: {"tamil": "..."}'
              ].join("\n"),
              user: item.english
            },
            { json: true, maxTokens: 1200 }
          );
          const parsed = types.parseModelJson(r.response.content);
          const ta = typeof parsed?.tamil === "string" ? parsed.tamil : "";
          return { output: ta, checks: { json: Boolean(ta), tamilShare: tamilShare(ta) } };
        }
      }))
  },
  "progress-note": {
    feature: "Monthly progress note",
    units: () =>
      input("progress-notes").items.map((item) => ({
        id: item.id,
        run: async (call) => {
          const { id: _id, ...facts } = item;
          const r = await call(
            {
              system: [
                "You write a chess academy's monthly progress note to a parent about their child.",
                "You get the month's numbers and the coach's note. Write 4 to 6 warm, honest sentences in simple English:",
                "what went well, what to work on, and one concrete suggestion for next month. Call the student 'your child'.",
                "Use only the facts given; never invent a number, a game or an event. No chess notation.",
                'Return only JSON: {"note": "...", "focusNextMonth": ["1 to 3 short items"]}'
              ].join("\n"),
              user: JSON.stringify(facts)
            },
            { json: true, maxTokens: 600 }
          );
          const parsed = types.parseModelJson(r.response.content);
          const note = typeof parsed?.note === "string" ? parsed.note : "";
          return {
            output: parsed,
            checks: { json: Boolean(note), notation: types.containsMoveNotation(note), numbersNotInInput: foreignNumbers(note, facts) }
          };
        }
      }))
  },
  "puzzle-hint": {
    feature: "Puzzle hint",
    units: () =>
      input("puzzle-hints").items.map((item) => ({
        id: item.id,
        run: async (call) => {
          const r = await call(
            {
              system: [
                "You help a child who is stuck on a chess puzzle.",
                "You get the position (FEN), the side to move, the solution and the theme.",
                "Write two hints: the first gentle (what to look at), the second stronger (the idea), each one short sentence.",
                "Never give the solution move, never name the square the piece moves to, and never write chess notation.",
                'Return only JSON: {"hint1": "...", "hint2": "..."}'
              ].join("\n"),
              user: JSON.stringify({ fen: item.fen, sideToMove: item.sideToMove, solution: item.solution, theme: item.theme })
            },
            { json: true, maxTokens: 300 }
          );
          const parsed = types.parseModelJson(r.response.content);
          const hints = [parsed?.hint1, parsed?.hint2].filter((h) => typeof h === "string");
          return {
            output: parsed,
            checks: { json: hints.length === 2, givesAway: hints.some((h) => types.containsMoveNotation(h) || h.includes(item.solution[0].replace(/[+#]/g, ""))) }
          };
        }
      }))
  },
  "coach-feedback": {
    feature: "Coach feedback message",
    units: () =>
      input("coach-feedback").items.map((item) => ({
        id: item.id,
        run: async (call) => {
          const { id: _id, ...facts } = item;
          const r = await call(
            {
              system: [
                "You turn a chess coach's quick feedback form into a short message to the student's parent.",
                "You get ratings from 1 to 5 and the coach's rough notes (they may mix Tamil and English).",
                "Write 3 to 5 polite, encouraging and honest sentences in simple English from the coach. Call the student 'your child'.",
                "Keep every point the coach made and add nothing new. No chess notation.",
                'Return only JSON: {"message": "..."}'
              ].join("\n"),
              user: JSON.stringify(facts)
            },
            { json: true, maxTokens: 500 }
          );
          const parsed = types.parseModelJson(r.response.content);
          return { output: parsed, checks: { json: typeof parsed?.message === "string" } };
        }
      }))
  },
  "support-pick": {
    feature: "Support bot saved-answer pick",
    units: () => {
      const data = input("support-pick");
      return data.items.map((item) => ({
        id: item.id,
        run: async (call) => {
          const r = await call(
            {
              system: [
                "You sort WhatsApp messages for a chess academy's support desk.",
                "You get the academy's saved answers and one message from a parent (English, Tamil or a mix).",
                "Pick the one saved answer that fully answers the message, or null when none does.",
                "Questions about one child's own records (attendance, fees paid, progress) always get null: a person answers those.",
                'Return only JSON: {"answerId": "A1" or null, "reason": "a few words"}'
              ].join("\n"),
              user: JSON.stringify({ message: item.question, savedAnswers: data.savedAnswers.map(({ id, title, text }) => ({ id, text, title })) })
            },
            { json: true, maxTokens: 150 }
          );
          const parsed = types.parseModelJson(r.response.content);
          const picked = parsed && "answerId" in parsed ? (parsed.answerId === "null" ? null : parsed.answerId) : undefined;
          return { output: parsed, checks: { correct: picked === item.expected, expected: item.expected, json: picked !== undefined, picked } };
        }
      }));
    }
  },
  "chess-facts": {
    feature: "Chess facts answer",
    units: () =>
      input("chess-facts").items.map((item) => ({
        id: item.id,
        run: async (call) => {
          const r = await call(
            {
              system: [
                "You answer a chess question from a child or a parent at a chess academy.",
                "Answer correctly in 1 to 3 short sentences of simple English. If you are not sure, say so.",
                'Return only JSON: {"answer": "..."}'
              ].join("\n"),
              user: item.question
            },
            { json: true, maxTokens: 250 }
          );
          const parsed = types.parseModelJson(r.response.content);
          const answer = typeof parsed?.answer === "string" ? parsed.answer : "";
          const lower = answer.toLowerCase();
          return {
            output: parsed,
            checks: { json: Boolean(answer), mentions: item.mustMention.every((w) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(lower)) }
          };
        }
      }))
  }
};

async function runRecap(call, lines, mapPrompt) {
  const result = await generateRecap({
    chunkTokens: CHUNK_TOKENS,
    complete: async (prompt, maxTokens) => {
      const r = await call(mapPrompt(prompt), { json: true, maxTokens });
      return r.response.content;
    },
    lines
  });
  const all = [result.content.recap, ...result.content.keyPoints, ...result.content.practice].join(" ");
  return { checks: { calls: result.calls, removedByCleaner: result.removed, tamilShare: tamilShare(all) }, output: result.content };
}

function tamilShare(text) {
  const letters = [...String(text)].filter((c) => /\p{L}/u.test(c));
  if (!letters.length) return 0;
  return Math.round((100 * letters.filter((c) => /[஀-௿]/.test(c)).length) / letters.length);
}

function foreignNumbers(text, facts) {
  const known = new Set(JSON.stringify(facts).match(/\d+/g));
  return [...new Set(String(text).match(/\d+/g) ?? [])].filter((n) => !known.has(n));
}

function checkReview(text, play) {
  const sans = new Set(play.segments.flatMap((s) => s.moves.map((m) => m.replace(/^\*/, ""))));
  play.findings.forEach((f) => f.better && sans.add(f.better));
  const mentioned = String(text).match(/\b(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g) ?? [];
  return { inventedMoves: [...new Set(mentioned.filter((m) => !sans.has(m) && !sans.has(`${m}+`) && !sans.has(`${m}#`)))] };
}

// ── Running ─────────────────────────────────────────────────

function parseModels(arg) {
  return arg.split(",").map((s) => {
    const i = s.indexOf(":");
    const provider = s.slice(0, i);
    const id = s.slice(i + 1);
    if (!PROVIDERS[provider]) throw new Error(`unknown provider ${provider}`);
    if (PROVIDERS[provider].key && !KEYS[PROVIDERS[provider].key]) throw new Error(`no key for ${provider}`);
    return { id, label: `${provider}/${id}`, provider, slug: slug(`${provider}__${id}`) };
  });
}

async function runUnit(model, taskName, unit) {
  const dir = path.join(RUNS, model.slug);
  const file = path.join(dir, `${taskName}__${unit.id}.json`);
  if (fs.existsSync(file)) {
    const prev = JSON.parse(fs.readFileSync(file, "utf8"));
    if (prev.ok) return "skip";
    // Keep the failed attempt next to the new one.
    let n = 1;
    while (fs.existsSync(file.replace(/\.json$/, `.fail${n}.json`))) n += 1;
    fs.renameSync(file, file.replace(/\.json$/, `.fail${n}.json`));
  }
  fs.mkdirSync(dir, { recursive: true });
  const calls = [];
  const call = async (prompt, opts) => {
    try {
      const r = await chat(model, prompt, opts);
      calls.push(r);
      return r;
    } catch (e) {
      calls.push({ attempts: e.attempts ?? [], error: redact(e.message), request: e.request ?? null });
      throw e;
    }
  };
  const started = Date.now();
  const record = { feature: TASKS[taskName].feature, item: unit.id, model: model.label, startedAt: now(), task: taskName };
  try {
    const result = await unit.run(call);
    Object.assign(record, { checks: result.checks, ok: true, output: result.output });
  } catch (e) {
    Object.assign(record, { error: redact(e.message), ok: false });
    if (e instanceof DailyLimitError) record.dailyLimit = true;
  }
  record.ms = Date.now() - started;
  record.usage = sumUsage(calls);
  record.calls = calls;
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  log(`${record.ok ? "ok  " : "FAIL"} ${model.label} ${taskName}/${unit.id} ${record.ms} ms ${JSON.stringify(record.usage)} ${record.ok ? "" : record.error.slice(0, 160)}`);
  if (record.dailyLimit) throw new DailyLimitError(record.error);
  return record.ok ? "ok" : "fail";
}

function sumUsage(calls) {
  const u = { calls: 0, completion: 0, prompt: 0, reasoning: 0, total: 0 };
  for (const c of calls) {
    const x = c.response?.usage;
    if (!x) continue;
    u.calls += 1;
    u.prompt += x.prompt_tokens ?? 0;
    u.completion += x.completion_tokens ?? 0;
    u.total += x.total_tokens ?? (x.prompt_tokens ?? 0) + (x.completion_tokens ?? 0);
    u.reasoning += x.completion_tokens_details?.reasoning_tokens ?? x.output_tokens_details?.reasoning_tokens ?? 0;
  }
  return u;
}

async function evalModel(model, taskNames) {
  for (const taskName of taskNames) {
    for (const unit of TASKS[taskName].units()) {
      try {
        await runUnit(model, taskName, unit);
      } catch (e) {
        if (e instanceof DailyLimitError) {
          log(`STOP ${model.label}: daily limit reached; rerun after the reset to continue`);
          return;
        }
        throw e;
      }
    }
  }
  log(`DONE ${model.label}`);
}

/** Capacity check: repeat one task's units until the model's daily limit answers. JSONL, every call kept. */
async function capacity(model, taskName, max) {
  const dir = path.join(RUNS, "capacity");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${model.slug}__${taskName}.jsonl`);
  const units = TASKS[taskName].units();
  let n = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).length : 0;
  log(`capacity ${model.label} ${taskName}: starting at ${n}`);
  while (n < max) {
    const unit = units[n % units.length];
    const calls = [];
    const call = async (prompt, opts) => {
      const r = await chat(model, prompt, opts);
      calls.push(r);
      return r;
    };
    const started = Date.now();
    let line;
    try {
      const result = await unit.run(call);
      line = { at: now(), checks: result.checks, item: unit.id, ms: Date.now() - started, n, ok: true, output: result.output, usage: sumUsage(calls), calls };
    } catch (e) {
      line = { at: now(), error: redact(e.message), item: unit.id, n, ok: false, usage: sumUsage(calls), calls: [...calls, { attempts: e.attempts ?? [] }] };
      fs.appendFileSync(file, JSON.stringify(line) + "\n");
      if (e instanceof DailyLimitError) {
        log(`capacity ${model.label}: daily limit after ${n} units`);
        return;
      }
      log(`capacity ${model.label}: unit ${n} failed: ${line.error.slice(0, 160)}`);
      n += 1;
      continue;
    }
    fs.appendFileSync(file, JSON.stringify(line) + "\n");
    n += 1;
    if (n % 10 === 0) log(`capacity ${model.label}: ${n} units`);
  }
  log(`capacity ${model.label}: reached --max ${max}`);
}

(async () => {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const models = parseModels(arg("--models") ?? "");
  const cap = arg("--capacity");
  if (cap) {
    if (!TASKS[cap]) throw new Error(`unknown task ${cap}`);
    await Promise.all(models.map((m) => capacity(m, cap, Number(arg("--max") ?? 5000))));
    return;
  }
  const taskNames = (arg("--tasks") ?? Object.keys(TASKS).join(",")).split(",");
  for (const t of taskNames) if (!TASKS[t]) throw new Error(`unknown task ${t}`);
  // One lane per model, except OpenRouter: its free requests are shared, so its models go one after another.
  const lanes = new Map();
  for (const m of models) {
    const lane = m.provider === "openrouter" ? "openrouter" : m.label;
    lanes.set(lane, [...(lanes.get(lane) ?? []), m]);
  }
  await Promise.all(
    [...lanes.values()].map(async (lane) => {
      for (const m of lane) await evalModel(m, taskNames);
    })
  );
})().catch((e) => {
  console.error(redact(e.stack ?? e.message));
  process.exit(1);
});
