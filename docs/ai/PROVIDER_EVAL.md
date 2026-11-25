# Outside-AI provider evaluation (free tiers)

Run 2026-11-25 21:00 UTC → PENDING_END (owner's `/goal`, plan agreed the same
day). Branch `ai/provider-eval`. Harness: [`scripts/ai/provider-eval/`](../../scripts/ai/provider-eval/README.md).
Every input is in [`provider-eval/inputs/`](provider-eval/inputs/), every
request and answer in [`provider-eval/runs/`](provider-eval/runs/) (one file per
model × item; capacity runs as JSONL in `runs/capacity/`), the tables below in
[`provider-eval/summary.json`](provider-eval/summary.json) and
[`provider-eval/capacity.json`](provider-eval/capacity.json).

**Question:** which free outside model should each AI feature use, and does
the free quota carry an academy of medium size?

**Short answer**

- **Groq `qwen/qwen3.8-27b` is the best free default for almost everything.**
  It was correct or nearly so on every task, the fastest by far (0.1–1.3 s),
  the cheapest in tokens (it doesn't "think"), and its free quota (1,000
  requests and PENDING_QWEN_TPD tokens a day) carries **all features together at medium
  volume on one model**.
- **Gemini 3.1 Flash-Lite** is the best Tamil writer (translation and
  Tamil-script recap) and a good second model; 15 requests a minute and
  PENDING_LITE_RPD a day. It wrote a dishonest progress note for a struggling
  student, so it should not write progress notes.
- **Gemini 3.5 / 3.8 Flash** write the best English recaps, but the free tier
  gives **20 requests a day** and is overloaded (503) much of the time: fine
  for 10 recaps a day at most, not for production volume.
- **OpenRouter free models** (Nemotron) are good but the account gets **50
  free requests a day in total**: test bench only.
- **`gpt-oss-120b` / `gpt-oss-20b`** spend ~half their tokens thinking, so
  Groq's 200,000 tokens a day run out at ~200 game reviews; 20b also misread
  facts (wrong side in a game, a Tamil-English note turned upside down) and
  fails JSON mode on ~8% of calls. Not recommended.
- **Our own `qwen2.5:3b`** is usable only for English recaps and chess facts;
  it fails Tamil, game reviews, translation and the support pick.
- Free tiers come with **data-use terms that matter for minors** (§2.1):
  Gemini's free tier may use and human-review what it is sent.

Best model per feature is in §6.

---

## 1. What was tested

**Models** (8, plus ours):

| Provider | Model (API id) | Thinks? |
|---|---|---|
| Groq | `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `openai/gpt-oss-20b` | gpt-oss yes, qwen3.8 no |
| Gemini (AI Studio key) | `gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-3.1-flash-lite` | Flash yes (hidden), Lite no |
| OpenRouter | `nvidia/nemotron-3-ultra-550b-a55b:free`, `nvidia/nemotron-3.5-super-vl:free` | yes |
| Ours | `qwen2.5:3b` (Ollama, `compose.ai.yml` image, 1.5 CPU) | no |

Gemini Pro has no free quota and wasn't tried (see the 2026-11-25 trial in
[CLASS_RECAPS.md](../CLASS_RECAPS.md)).

**Tasks** (25 units per model; small data, all synthetic or public domain):

| Task | Units | Input | Prompt |
|---|---|---|---|
| `recap` — class recap in English | 3 | 20-min classes, coach speech only, pseudonymised: English (forks), Tamil-English in Latin letters (pins/skewers), Tamil script (back-rank mate) | the app's own pipeline (`generateRecap`, chunk 2,500) |
| `recap-tamil` — recap written in Tamil script | 1 | the Tamil-script class | the app's prompt with "write in Tamil script" |
| `game-review` — AI play review comment | 2 | Légal's mate 1750 (student lost as Black), Anderssen–Kieseritzky 1851 (student won as White); findings from Stockfish 16 depth 14 | the app's own prompt and `pseudonymisePlay` shape |
| `translate-ta` — review comment → Tamil | 2 | the same English text for every model | written for this test |
| `progress-note` — monthly note to a parent | 2 | an active and a struggling student (numbers + coach note) | written for this test |
| `puzzle-hint` — two hints that don't give the move | 3 | back-rank mate, knight fork, skewer (checked with chess.js) | written for this test |
| `coach-feedback` — feedback form → parent message | 2 | English notes; Tamil-English notes | written for this test |
| `support-pick` — WhatsApp saved-answer pick | 5 | 8 saved answers; questions in English, Tamil-English, Tamil script, one about a child's records (must be null), one not covered (null) | written for this test |
| `chess-facts` — short rules/history answer | 5 | en passant, India's first GM, promotion to king, stalemate, castling after the king moved | written for this test |

Requests are shaped like the app's (`ai/chat-model.ts`): JSON mode,
temperature 0 (0.4 for game review, as the app), outside models get the
app's +4,000 "thinking" tokens on top of each task's limit. Each output was
read by hand (grades in §3) plus automatic checks (JSON, notation, invented
numbers, picked answer).

**Medium volume** (owner): 20 classes a day, 150 students, 3 games + 10
puzzles a student a week, 30 WhatsApp questions a day, one monthly note a
student. In units a day: recaps 20, game reviews 64, Tamil translations 64
(if every review is translated), puzzle hints 214 (one per puzzle tried,
uncached), support picks 30, chess facts 30, progress notes 5 (150 on a
month-end day), coach feedback 5 (150 peak). Test transcripts are about half
a real 20-minute class, so recap tokens are doubled in §5.

## 2. Free limits found

| Provider / model | Per minute | Per day | Reset | How we know |
|---|---|---|---|---|
| Groq, each model separately | 30 requests, **8,000 tokens** | 1,000 requests | rolling | `x-ratelimit-*` headers |
| Groq `gpt-oss-120b`, `gpt-oss-20b` | | **200,000 tokens** | rolling | run to the limit: 209 / 197 game reviews, then 429 "tokens per day (TPD): Limit 200000" |
| Groq `qwen3.8-27b` | | PENDING_QWEN_LIMIT | rolling | run to the limit |
| Gemini `3.1-flash-lite` | 15 requests | PENDING_LITE_RPD | 00:00 Pacific (08:00 UTC) | 429 quota bodies; run to the limit |
| Gemini `3.8-flash` | PENDING | **20 requests** | 00:00 Pacific | 429 "requests per day … limit: 20" after 3 answers + 10 overload (503) answers + 2 per-minute 429s, so overload answers very likely count |
| Gemini `3.5-flash` | PENDING | PENDING | 00:00 Pacific | |
| OpenRouter, all `:free` models together | 20 requests | **50 requests for the whole account** | 00:00 UTC | the key's `free_model_daily_requests`; 429 "free-models-per-day" at exactly 50 |
| Ours (`qwen2.5:3b`) | — | CPU-bound: ~11 s a game review, ~2 min an English recap, ~6 min a Tamil-script recap on 1.5 cores | — | 30 game reviews in 5 min 23 s |

OpenRouter lifts its free cap to 1,000 requests a day after a one-time
purchase of 10 credits (its own 429 text says so). Groq's next tier is paid
("Dev Tier").

### 2.1 Data-use terms (matter more than quotas for minors' data)

What we send is already pseudonymised (S1/S2, no names; game moves only), but:

- **Gemini free tier**: Google's terms for unpaid use allow using prompts and
  answers to improve its products, with human reviewers, and advise not to
  send personal information; paid use (a billing account on the project) is
  excluded from this. [Gemini API terms](https://ai.google.dev/gemini-api/terms_preview)
- **Groq**: says inference data is not retained by default and offers Zero
  Data Retention in Data Controls; the no-training commitment is in its
  services agreement / DPA. [Groq: your data](https://console.groq.com/docs/your-data)
- **OpenRouter free models**: OpenRouter itself doesn't train on inputs, but
  free endpoints may be served by providers that do; the account's privacy
  settings decide whether such endpoints are allowed. [OpenRouter privacy](https://openrouter.ai/docs/guides/privacy/logging)

Before going live, name the chosen provider in `features/legal/content.ts`
(the AI play review consent already requires this) and turn on Groq's Zero
Data Retention.

## 3. Quality per feature

✓ correct and usable · ~ usable with a fault · ✗ wrong or unusable.
Notes give the fault. Full outputs: `runs/<model>/<task>__<item>.json`.

PENDING_QUALITY_TABLE

## 4. Tokens and time per unit

Average over the units of each task (successful ones). "Answer" includes
thinking; "(thinking)" is the part of it the model spent thinking (Gemini
Flash doesn't itemise it: total − prompt − answer). Seconds are the model's
own answer time, not rate-limit waits. Tamil script costs about 2.5× the
tokens per word of English on gpt-oss and qwen (Gemini's tokenizer is
cheaper: 1,431 vs 1,860 prompt tokens for the same Tamil class).

PENDING_TOKEN_TABLES

## 5. Free daily capacity at medium volume

Units a day the free quota allows for each feature on its own (min of
requests a day ÷ calls a unit and tokens a day ÷ tokens a unit; recaps at
2× tokens). ✗ = less than the medium-volume need; "(peak ✗)" = enough on an
average day but not for 150 month-end notes in one day.

PENDING_CAPACITY_TABLES

## 6. Best model per feature

PENDING_BEST

## 7. Things the app should change (found in this run)

PENDING_CHANGES

## 8. Caveats

- Small data: 25 units a model; one run each (temperature 0 except game
  review). Good for spotting failure modes, not for fine ranking.
- Test transcripts are half the length of a real 20-minute class; the
  chunking (2,500 estimated tokens) gave every recap one call. A real class
  will take 2–3 calls with this setting.
- Free quotas and model lists change without notice (Groq dropped
  llama-3.3-70b and Gemini 2.5 Flash closed between the trial and this run).
- Gemini Flash results came over PENDING_DAYS days because of the 20-a-day cap and
  503 overloads.
- The local model ran on the production box between 02:30 and 03:10 IST
  while LiveKit was idle (no class live); its container was removed after.
