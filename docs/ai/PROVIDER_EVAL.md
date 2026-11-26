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
  It was correct or nearly so on every task, the fastest by far (0.1–1.3 s)
  and the cheapest in tokens (it doesn't "think"). Its free quota is 1,000
  requests and 200,000 tokens a day; all features at medium volume would need
  ~214,000, so it carries everything except the Tamil work and puzzle hints,
  which go to Gemini Flash-Lite (§6). That split uses ~71% and ~64% of the
  two free quotas.
- **Gemini 3.1 Flash-Lite** is the best Tamil writer (translation and
  Tamil-script recap) and a good second model: 15 requests a minute, 500 a
  day. It wrote a sugar-coated progress note for a struggling student, so it
  should not write progress notes.
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
| Groq `qwen3.8-27b` | | **200,000 tokens** | rolling | run to the limit: 391 game reviews, then 429 "TPD: Limit 200000" |
| Gemini `3.1-flash-lite` | 15 requests | **500 requests** | 00:00 Pacific (08:00 UTC) | run to the limit: 25 eval + 467 game reviews (≈ 200,000 tokens), then 429 "requests per day … limit: 500" |
| Gemini `3.8-flash` | not reached | **20 requests** | 00:00 Pacific | 429 "requests per day … limit: 20" after 3 answers + 10 overload (503) answers + 2 per-minute 429s, so overload answers very likely count |
| Gemini `3.5-flash` | not reached | **20 requests** | 00:00 Pacific | 429 "limit: 20" after 11 answers + 8 × 503 + 1 timeout: overload answers count |
| OpenRouter, all `:free` models together | 20 requests | **50 requests for the whole account** | 00:00 UTC | the key's `free_model_daily_requests`; day 1: 429 "free-models-per-day" at exactly 50 (one request at a time); day 2: both models together, 2 + 15 + 40 = 57 answered (the counter read "used 56, limit 50": parallel requests slip a few past the cap) |
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

Columns: Groq **120b** / **20b** (`gpt-oss`), **q3.8** (`qwen3.8-27b`);
Gemini **Lite** (`3.1-flash-lite`), **3.5F** / **3.8F** (Flash); OpenRouter
**Ultra** / **SVL** (Nemotron); **ours** (`qwen2.5:3b`).

| Feature | 120b | 20b | q3.8 | Lite | 3.5F | 3.8F | Ultra | SVL | ours |
|---|---|---|---|---|---|---|---|---|---|
| Recap, English transcript | ✓ | ✓ | ✓ | ✓ | ✓ best | ✓ best | ✓ | ✓ | ✓ |
| Recap, Tamil-English (Latin) | ✓ | ~ a | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ b |
| Recap, Tamil-script transcript → English | ✗ c | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ d |
| Recap written in Tamil script | ✗ c | ✓ | ~ e | ✓ | ✓ | PENDING_38_TA | ✓ | ✓ | ✗ d |
| Game review | ✓ | ✗ f | ✓ | ✓ | ✓ | PENDING_38 | ~ g | ✓ best | ✗ h |
| Tamil translation | ~ i | ~ j | ✓ | ✓ best | ✓ | PENDING_38 | ✗ k | ~ l | ✗ m |
| Progress note | ~ n | ~ o | ✓ best | ✗ p | ✓ | PENDING_38 | ✓ | ✓ | ✗ q |
| Puzzle hint (3) | ✓ | ~ r | ✓ | ✓ | PENDING_35 | PENDING_38 | ✓ | ~ s | ~ t |
| Coach feedback (2) | ~ u | ✗ v | ✓ best | ✓ | PENDING_35 | PENDING_38 | ✓ | ✓ | ~ w |
| Support pick (5) | 5/5 | 5/5 | 5/5 | 5/5 | PENDING_35 | PENDING_38 | 5/5 | 5/5 | 2/5 x |
| Chess facts (5) | 5/5 | 4/5 y | 5/5 | 5/5 | PENDING_35 | PENDING_38 | 5/5 | 5/5 | 4/5 z |

- a: explains a pin as a piece "blocking a more powerful piece from attacking the king".
- b: key points are bare topic labels; the skewer explanation is wrong.
- c: read "பன்னிரண்டு" (twelve) as "two" and Saturday as Sunday for the homework — in both the English and the Tamil recap.
- d: invents a class about "how the pieces move" / pawn promotion; nothing about the back-rank mate the coach taught. Each call took ~6 min.
- e: "ஹெட் பான்" (head pawn) for the h-pawn.
- f: praises the student for Bxf7+ and Nd5# — the opponent's moves (wrong side).
- g: "checkmate on move 31" (the game ended on move 23); its Légal's-mate review was the best of all.
- h: third person ("The student"), invents that "the rook takes on d1", writes Black's moves for the White player.
- i: accurate but formal, English glosses in brackets, calls pieces "கற்கள்" (stones).
- j: one of two failed: Groq JSON mode answered 400 `json_validate_failed`, twice (deterministic at temperature 0).
- k: transliterates every word (க்னைட், பஸ்ல்ஸ்), broken grammar.
- l: mixes Bengali words (দিয়ে) into the Tamil; typo.
- m: one answer was "...", the other meaningless Tamil.
- n: for the struggling student, hides the attendance and homework problems; "He/she".
- o: honest but a cold list of numbers.
- p: tells the parent of the struggling student it was "a productive October" and leaves out the attendance problem.
- q: "did very well in October" for the struggling student; suggests a topic not in the data.
- r: second hint nearly states the move.
- s: knight-fork hints give the whole solution.
- t: knight-fork hint 1 is misleading ("the knight is attacking the king and rook" — not yet).
- u: Tamil-English notes: "about half of the homework" (coach said only 2 done); leaks "(rating 4)".
- v: turned the Tamil-English notes upside down ("we will keep the camera off next time", "homework will be limited to two tasks").
- w: generic; drops the forks and camera details.
- x: answers "none" to every real question (even "how to join").
- y: the 5th failed on JSON mode (see j).
- z: en passant explained wrongly ("passed through your square").

Every model that answered kept the student codes out, wrote no chess
notation in recaps (the app's cleaner removed nothing except 3 items from
ours), and invented no numbers in progress notes.

## 4. Tokens and time per unit

Average over the units of each task (successful ones). "Answer" includes
thinking; "(thinking)" is the part of it the model spent thinking (Gemini
Flash doesn't itemise it: total − prompt − answer). Seconds are the model's
own answer time, not rate-limit waits. Tamil script costs about 2.5× the
tokens per word of English on gpt-oss and qwen (Gemini's tokenizer is
cheaper: 1,431 vs 1,860 prompt tokens for the same Tamil class).

<!-- generated:tokens (scripts/ai/provider-eval/summarize.cjs) -->
#### chess-facts

| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 5/5 | 0 | 1 | 65 | 31 | 0 | 96 | 18.4 | 0 | 0 |
| groq/openai/gpt-oss-120b | 5/5 | 0 | 1 | 162 | 136 | 95 | 298 | 0.6 | 2 | 0 |
| groq/openai/gpt-oss-20b | 4/5 | 2 | 1 | 162 | 98 | 58 | 260 | 0.4 | 2 | 0 |
| groq/qwen/qwen3.8-27b | 5/5 | 0 | 1 | 79 | 29 | 0 | 108 | 0.1 | 2 | 0 |
| local/qwen2.5:3b | 5/5 | 0 | 1 | 73 | 24 | 0 | 97 | 12.7 | 0 | 0 |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 5/5 | 0 | 1 | 77 | 95 | 65 | 173 | 2 | 0 | 0 |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 5/5 | 1 | 1 | 77 | 196 | 164 | 274 | 2.4 | 0 | 0 |

#### coach-feedback

| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 2/2 | 0 | 1 | 176 | 84 | 0 | 260 | 5.2 | 0 | 0 |
| groq/openai/gpt-oss-120b | 2/2 | 0 | 1 | 268 | 418 | 329 | 686 | 1.3 | 1 | 0 |
| groq/openai/gpt-oss-20b | 2/2 | 0 | 1 | 268 | 412 | 350 | 680 | 0.8 | 1 | 0 |
| groq/qwen/qwen3.8-27b | 2/2 | 0 | 1 | 190 | 81 | 0 | 271 | 0.2 | 0 | 0 |
| local/qwen2.5:3b | 2/2 | 0 | 1 | 184 | 67 | 0 | 251 | 19.5 | 0 | 0 |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 2/2 | 0 | 1 | 191 | 436 | 365 | 627 | 12.7 | 0 | 0 |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 2/2 | 0 | 1 | 191 | 1446 | 1385 | 1636 | 11.2 | 0 | 0 |

#### game-review

| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 2/2 | 0 | 1 | 346 | 90 | 0 | 436 | 1.8 | 0 | 0 |
| gemini/gemini-3.5-flash | 2/2 | 0 | 1 | 346 | 1291 | 1195 | 1637 | 101.4 | 0 | 6 |
| gemini/gemini-3.8-flash | 0/1 | 1 | – | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| groq/openai/gpt-oss-120b | 2/2 | 0 | 1 | 433 | 593 | 491 | 1025 | 1.5 | 2 | 0 |
| groq/openai/gpt-oss-20b | 2/2 | 0 | 1 | 433 | 561 | 470 | 994 | 0.9 | 2 | 0 |
| groq/qwen/qwen3.8-27b | 2/2 | 0 | 1 | 383 | 84 | 0 | 466 | 0.3 | 3 | 0 |
| local/qwen2.5:3b | 2/2 | 0 | 1 | 379 | 72 | 0 | 451 | 32.6 | 0 | 0 |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 2/2 | 0 | 1 | 396 | 550 | 462 | 946 | 14.1 | 0 | 0 |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 2/2 | 0 | 1 | 396 | 1009 | 927 | 1405 | 9.7 | 0 | 0 |

#### progress-note

| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 2/2 | 0 | 1 | 263 | 170 | 0 | 432 | 2.8 | 0 | 0 |
| gemini/gemini-3.5-flash | 2/2 | 0 | 1 | 263 | 1870 | 1684 | 2133 | 11 | 0 | 0 |
| groq/openai/gpt-oss-120b | 2/2 | 0 | 1 | 355 | 773 | 634 | 1128 | 1.8 | 2 | 0 |
| groq/openai/gpt-oss-20b | 2/2 | 0 | 1 | 355 | 524 | 388 | 879 | 0.9 | 2 | 0 |
| groq/qwen/qwen3.8-27b | 2/2 | 0 | 1 | 282 | 161 | 0 | 442 | 0.4 | 2 | 0 |
| local/qwen2.5:3b | 2/2 | 0 | 1 | 274 | 118 | 0 | 392 | 35.7 | 0 | 0 |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 2/2 | 0 | 1 | 288 | 744 | 570 | 1032 | 21 | 0 | 0 |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 2/2 | 0 | 1 | 288 | 1207 | 1062 | 1495 | 9.2 | 0 | 0 |

#### puzzle-hint

| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 3/3 | 0 | 1 | 160 | 52 | 0 | 212 | 1.1 | 0 | 0 |
| gemini/gemini-3.5-flash | 1/2 | 1 | 1 | 153 | 786 | 745 | 939 | 5.4 | 1 | 0 |
| groq/openai/gpt-oss-120b | 3/3 | 0 | 1 | 258 | 280 | 236 | 538 | 0.9 | 2 | 0 |
| groq/openai/gpt-oss-20b | 3/3 | 0 | 1 | 258 | 456 | 406 | 714 | 0.8 | 3 | 0 |
| groq/qwen/qwen3.8-27b | 3/3 | 0 | 1 | 178 | 44 | 0 | 222 | 0.2 | 2 | 0 |
| local/qwen2.5:3b | 3/3 | 0 | 1 | 170 | 43 | 0 | 213 | 13.5 | 0 | 0 |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 3/3 | 0 | 1 | 178 | 1433 | 1384 | 1612 | 34 | 0 | 0 |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 3/3 | 0 | 1 | 178 | 1156 | 1110 | 1335 | 13.3 | 0 | 0 |

#### recap

| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 3/3 | 0 | 1 | 1660 | 283 | 0 | 1943 | 2.4 | 0 | 0 |
| gemini/gemini-3.5-flash | 3/3 | 0 | 1 | 1660 | 1663 | 1403 | 3323 | 52 | 0 | 2 |
| gemini/gemini-3.8-flash | 3/3 | 0 | 1 | 1660 | 1404 | 1139 | 3064 | 143.8 | 0 | 7 |
| groq/openai/gpt-oss-120b | 3/3 | 0 | 1 | 1842 | 768 | 502 | 2609 | 2.1 | 0 | 0 |
| groq/openai/gpt-oss-20b | 3/3 | 0 | 1 | 1842 | 468 | 227 | 2310 | 0.9 | 0 | 0 |
| groq/qwen/qwen3.8-27b | 3/3 | 0 | 1 | 1947 | 301 | 0 | 2248 | 0.8 | 0 | 0 |
| local/qwen2.5:3b | 3/3 | 0 | 1 | 2727 | 150 | 0 | 2877 | 122.3 | 0 | 0 |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 3/3 | 0 | 1 | 1892 | 954 | 631 | 2847 | 39.2 | 0 | 0 |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 3/3 | 0 | 1 | 1892 | 1739 | 1507 | 3631 | 13.5 | 0 | 0 |

#### recap-tamil

| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 1/1 | 0 | 1 | 1431 | 328 | 0 | 1759 | 1.8 | 0 | 0 |
| gemini/gemini-3.5-flash | 1/1 | 0 | 1 | 1431 | 1803 | 1448 | 3234 | 7.7 | 0 | 0 |
| gemini/gemini-3.8-flash | 0/1 | 1 | – | 0 | 0 | 0 | 0 | 0 | 1 | 3 |
| groq/openai/gpt-oss-120b | 1/1 | 0 | 1 | 1860 | 1176 | 724 | 3036 | 2.7 | 1 | 0 |
| groq/openai/gpt-oss-20b | 1/1 | 0 | 1 | 1860 | 579 | 261 | 2439 | 0.9 | 1 | 0 |
| groq/qwen/qwen3.8-27b | 1/1 | 0 | 1 | 2193 | 576 | 0 | 2769 | 1.3 | 1 | 0 |
| local/qwen2.5:3b | 1/1 | 0 | 1 | 4521 | 142 | 0 | 4663 | 66.9 | 0 | 0 |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 1/1 | 0 | 1 | 2045 | 1169 | 734 | 3214 | 25.1 | 0 | 0 |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 1/1 | 0 | 1 | 2045 | 2685 | 2223 | 4730 | 19.4 | 0 | 0 |

#### support-pick

| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 5/5 | 0 | 1 | 487 | 36 | 0 | 522 | 1.9 | 1 | 1 |
| groq/openai/gpt-oss-120b | 5/5 | 0 | 1 | 564 | 133 | 110 | 697 | 0.5 | 5 | 0 |
| groq/openai/gpt-oss-20b | 5/5 | 0 | 1 | 564 | 137 | 115 | 701 | 0.5 | 3 | 0 |
| groq/qwen/qwen3.8-27b | 5/5 | 0 | 1 | 494 | 20 | 0 | 514 | 0.1 | 2 | 0 |
| local/qwen2.5:3b | 5/5 | 0 | 1 | 494 | 33 | 0 | 527 | 33.6 | 0 | 0 |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 5/5 | 0 | 1 | 514 | 158 | 128 | 673 | 5 | 0 | 0 |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 5/5 | 0 | 1 | 514 | 373 | 341 | 888 | 3.1 | 0 | 0 |

#### translate-ta

| Model | OK | Failed tries | Calls/unit | Prompt | Answer | (thinking) | Total tokens/unit | s/unit | 429s | 5xx |
|---|---|---|---|---|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 2/2 | 0 | 1 | 160 | 136 | 0 | 296 | 2 | 0 | 0 |
| gemini/gemini-3.5-flash | 2/2 | 0 | 1 | 160 | 1320 | 1171 | 1480 | 12.1 | 0 | 0 |
| groq/openai/gpt-oss-120b | 2/2 | 0 | 1 | 256 | 819 | 633 | 1075 | 2 | 1 | 0 |
| groq/openai/gpt-oss-20b | 1/2 | 2 | 1 | 265 | 1029 | 859 | 1294 | 1.5 | 1 | 0 |
| groq/qwen/qwen3.8-27b | 2/2 | 0 | 1 | 175 | 209 | 0 | 384 | 0.5 | 0 | 0 |
| local/qwen2.5:3b | 2/2 | 0 | 1 | 168 | 230 | 0 | 398 | 50.3 | 0 | 0 |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 2/2 | 0 | 1 | 175 | 1610 | 1410 | 1785 | 34.5 | 0 | 0 |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 2/2 | 0 | 1 | 175 | 3387 | 3191 | 3561 | 28.4 | 0 | 0 |
<!-- /generated:tokens -->

## 5. Free daily capacity at medium volume

Units a day the free quota allows for each feature on its own (min of
requests a day ÷ calls a unit and tokens a day ÷ tokens a unit; recaps at
2× tokens). ✗ = less than the medium-volume need; "(peak ✗)" = enough on an
average day but not for 150 month-end notes in one day.

<!-- generated:capacity (scripts/ai/provider-eval/summarize.cjs) -->
#### Free units a day per feature (each feature alone)

| Feature (need/day) | gemini-3.1-flash-lite | gemini-3.5-flash | gemini-3.8-flash | openai/gpt-oss-120b | openai/gpt-oss-20b | qwen/qwen3.8-27b | nvidia/nemotron-3-ultra-550b-a55b:free | nvidia/nemotron-3.5-super-vl:free |
|---|---|---|---|---|---|---|---|---|
| chess-facts (30) | 500 | – | – | 671 | 769 | 1000 | 50 | 50 |
| coach-feedback (5, peak 150) | 500 | – | – | 291 | 294 | 738 | 50 (peak ✗) | 50 (peak ✗) |
| game-review (64) | 500 | 20 ✗ | – | 195 | 201 | 429 | 50 ✗ | 50 ✗ |
| progress-note (5, peak 150) | 500 | 20 (peak ✗) | – | 177 | 227 | 452 | 50 (peak ✗) | 50 (peak ✗) |
| puzzle-hint (214) | 500 | 20 ✗ | – | 371 | 280 | 900 | 50 ✗ | 50 ✗ |
| recap (20) | 250 | 10 ✗ | 10 ✗ | 38 | 43 | 44 | 25 | 25 |
| recap-tamil (20) | 250 | 10 ✗ | – | 32 | 41 | 36 | 25 | 25 |
| support-pick (30) | 500 | – | – | 286 | 285 | 389 | 50 | 50 |
| translate-ta (64) | 500 | 20 ✗ | – | 186 | 154 | 520 | 50 ✗ | 50 ✗ |

#### All features together on one model, an average day

| Model | Requests/day needed | Limit | Tokens/day needed | Limit | Fits? |
|---|---|---|---|---|---|
| gemini/gemini-3.1-flash-lite | 452 | 500 | 191,936 | not seen | yes |
| groq/openai/gpt-oss-120b | 452 | 1000 | 392,812 | 200,000 | no |
| groq/openai/gpt-oss-20b | 452 | 1000 | 428,253 | 200,000 | no |
| groq/qwen/qwen3.8-27b | 452 | 1000 | 214,053 | 200,000 | no |
| openrouter/nvidia/nemotron-3-ultra-550b-a55b:free | 452 | 50 (shared) | 667,307 | not seen | no |
| openrouter/nvidia/nemotron-3.5-super-vl:free | 452 | 50 (shared) | 799,269 | not seen | no |
<!-- /generated:capacity -->

## 6. Best model per feature

Weighs quality (§3), free capacity at medium volume (§5) and speed. "Best
quality" is the best answer seen regardless of quota.

| Feature | Use (free) | Fallback | Best quality seen | Don't use |
|---|---|---|---|---|
| Class recap (English) | Groq `qwen3.8-27b` | Gemini Flash-Lite | Gemini 3.5 / 3.8 Flash (20 requests a day: ≤ 10 recaps) | ours for Tamil transcripts; `gpt-oss-120b` for Tamil-script transcripts |
| Recap in Tamil script | Gemini Flash-Lite | Groq `gpt-oss-20b` | Gemini 3.5 Flash | `gpt-oss-120b`, ours |
| Game review (play review) | Groq `qwen3.8-27b` | Gemini Flash-Lite | Nemotron Super-VL (50 a day) | `gpt-oss-20b` (wrong side), ours |
| Tamil translation | Gemini Flash-Lite | Groq `qwen3.8-27b` | Gemini Flash-Lite | Nemotron Ultra, ours |
| Monthly progress note | Groq `qwen3.8-27b` | Gemini 3.5 Flash (spread over days) | `qwen3.8-27b` | Gemini Flash-Lite (sugar-coats), ours |
| Puzzle hint | Groq `qwen3.8-27b` | Gemini Flash-Lite | any but Super-VL | — |
| Coach feedback message | Groq `qwen3.8-27b` | Gemini Flash-Lite | `qwen3.8-27b` | `gpt-oss-20b`, ours |
| Support saved-answer pick | Groq `qwen3.8-27b` (0.1 s) | Gemini Flash-Lite | all outside models 5/5 | ours (2/5) |
| Chess facts | Groq `qwen3.8-27b` | Gemini Flash-Lite | all outside models | — |

**A plan that fits the free quotas at medium volume** (average day, recaps at
real length):

| Model | Features | Requests / limit | Tokens / limit |
|---|---|---|---|
| Groq `qwen3.8-27b` | recaps, game reviews, progress notes, coach feedback, support picks, chess facts | ~175 / 1,000 | ~142,000 / 200,000 (71%) |
| Gemini Flash-Lite | Tamil translations, Tamil-script recaps, puzzle hints | ~320 / 500 (64%) | no daily token cap seen |

On a month-end day, 150 progress notes + 150 feedback messages add ~107,000
tokens to `qwen3.8-27b` — over its 200,000. Spread month-end notes over 2–3
days, or let them fall back to the second model. Caching hints per puzzle
(the library is shared) would cut the 214 hints a day to new puzzles only.
Nothing else is needed for medium volume; at double volume the plan needs a
paid tier or a third free model.

## 7. Things the app should change (found in this run)

1. **Play review leaves thinking models no room.** `outside-ai.ts` sends
   `max_tokens: 400`; `gpt-oss` used 470–490 thinking tokens on a review,
   Gemini Flash ~1,100–1,450, Nemotron up to 1,400. With 400 they return
   nothing or a cut answer. Give it the same `OUTSIDE_THINKING_TOKENS` room as
   recaps (this run did), or pick a non-thinking model (`qwen3.8-27b`, Flash-Lite).
2. **One outside provider for everything.** `AI_REVIEW_PROVIDER_*` serves
   both recaps and the play review. The plan in §6 needs a model per
   feature and a fallback provider (Groq → Gemini) when one answers 429/503.
3. **Groq JSON mode can refuse** with 400 `json_validate_failed` (`gpt-oss-20b`,
   2 of 25, same items every time). Treat it like an unusable answer: one
   retry without `response_format` and parse with `parseModelJson`.
4. **Gemini free tier: overload answers count against the 20 a day**
   (3.5 Flash: 11 answers + 8 × 503 + 1 timeout = 20, then 429). Don't retry
   Gemini Flash in a tight loop; Flash-Lite was overloaded only once in 25.
5. **Recap chunk size.** All test recaps fit one call at 2,500 estimated
   tokens; a real class takes 2–3 calls, each counting against the daily
   requests. The outside models take far more context (Groq's limit is 8,000
   tokens a minute, so ~6,000 a call is safe), so a separate, larger chunk for
   outside models halves recap requests. `estimateTokens` overestimates
   Tamil script by ~1.5× for these tokenizers (safe side).
6. **Local `qwen2.5:3b`** should stay off for Tamil-script transcripts (it
   invents a different lesson) and is too slow for daytime work (6 min a call
   on Tamil). It's fine for English recaps at night.
7. **Name the provider and switch on Zero Data Retention** before going live
   (§2.1); decide whether Gemini's free terms are acceptable for
   pseudonymised class text (logged as a question in
   [BACKLOG.md](../BACKLOG.md)).

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
