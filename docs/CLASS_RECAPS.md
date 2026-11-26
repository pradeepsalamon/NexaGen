# AI class recaps

After a class with a transcript, an AI model drafts a short recap for its
students from what the coach said. The coach or an admin reviews it, edits it
and publishes it. Students see nothing before that, and always see the label
"Prepared by your coach with AI assistance". Built 2026-11-25 as Phase 3 v1
([ai/architecture/PHASE3_SPEC.md](ai/architecture/PHASE3_SPEC.md) §0a); owner
decisions in [ai/architecture/DECISIONS.md](ai/architecture/DECISIONS.md) §4,
2026-11-25.

| | |
|---|---|
| Input | The coach's stored transcript only ([LIVE_CLASS.md](LIVE_CLASS.md) § "Class transcript"). No board, chat or student audio in v1 |
| Output | English only: a recap paragraph, key ideas, things to practise. **No chess moves or squares** (speech recognition gets notation wrong) and **never a student** |
| Who sees it | Draft and published: the class's coach and the academy's admins. Published only: the class's students (its batch, or anyone who attended) |
| Where the AI runs | Each academy chooses (Admin → Class recaps): **our own server** (default; a local model, nothing leaves) or **an outside AI service** (the model the platform console maps to class recaps, [AI_PROVIDERS.md](AI_PROVIDERS.md)) |
| Switches | Server `AI_CLASS_RECAPS_ENABLED` (off by default) → plan feature `aiClassRecaps` (Enterprise by default; operators change plans in the console) → the academy's switch (on by default) → the class setting "Class transcript" + the coach's consent |

## Where things are

| Piece | Path |
|---|---|
| Contract and rules | `packages/types/src/class-recap.ts` (schemas, views, `pseudonymiseTranscript`, `chunkTranscript`, prompts, `cleanRecapDraft`, `classRecapContentIssues`), routes `API_ROUTES.classRecaps` |
| API module | `apps/api/src/class-recap/` (`ClassRecapService` access + reviewer actions + settings, `ClassRecapJob`, `generateRecap`) |
| Model client | `apps/api/src/ai/chat-model.ts` (`RECAP_MODELS`: LOCAL from `AI_LOCAL_MODEL_URL`; OUTSIDE = the `CLASS_RECAP` route of `AiProvidersService`, main model then fallback; `callChatModel` / `completeOnRoute`) |
| Web | `features/class-recap/`: `/admin/class-recaps` (settings + every recap), `/coach/class-recaps` (own classes), `/student/class-recaps` (published feed); `ClassRecapCard` on the after-class screen and the admin completed-class page; "Class recap" row action in Class history; nav badge = drafts waiting for review |
| Tables | `class_recaps` (one per class, deleted with it), `class_recap_settings` (one per academy); migration `20261125162512_class_recaps` |
| Local model | `compose.ai.yml` service `ollama` (pinned image, internal network, 1.5 CPU / 5 GB), weights via `scripts/ai/pull-model.sh` |

## 1. How a recap is made

`ClassRecapJob` runs every 5 minutes (one runner, `JOB_LOCKS.classRecaps`),
once per academy inside its context, only when `AI_CLASS_RECAPS_ENABLED=true`,
the plan has `aiClassRecaps` and the academy's switch is on:

1. **Pick up.** Ended classes of the last 48 h, at least 10 minutes long, not
   demo classes, with at least one transcript line and no recap yet, get a
   `QUEUED` row. A class is picked up 3 minutes after it ends (the coach's last
   lines may still arrive).
2. **Write.** Up to 10 queued recaps per run, oldest first, with the
   academy's chosen model. Nothing is written when the chosen one isn't set up.
   - The transcript is read oldest first; every student's name (first, last,
     full, username; anyone ever in the batch or who attended) becomes `S1`,
     `S2`… (by user id) and the coach's becomes `Coach`. A two-letter name
     ("Om") is replaced only when capitalised and never when it is a common
     English word; one letter never. Spoken email addresses and phone numbers
     become `[email]` / `[phone]` (`redactContactDetails`). Names in Tamil
     script aren't matched: the model is told never to name anyone and the
     reviewer reads everything.
   - Under 80 words: `SKIPPED` (`TOO_SHORT`).
   - Split into parts of about `AI_CLASS_RECAP_CHUNK_TOKENS` (2,500,
     estimated; Tamil script counts heavier). One part: one call writes the
     recap. Several: each part's teaching points first, then one call writes
     the recap from all of them (at most 20 parts).
   - **Clean-up** (`cleanRecapDraft`): a sentence or item that names a student
     code or writes chess notation is removed, never rewritten. Unusable (no
     recap text or no key idea) → one repair call → else `FAILED`
     (`INVALID_OUTPUT`).
   - A model error is retried 10 minutes later, up to 3 runs, then `FAILED`
     (`MODEL_ERROR`). Only the error code is logged, never text.
3. **The local model never competes with a class.** It doesn't start while
   any class of any academy is live; a call in progress is stopped when one
   starts (checked every 30 s), and the recap waits 15 minutes (the attempt
   doesn't count). A run that died leaves `RUNNING` rows; the next run queues
   them again. The outside AI isn't paused.

Statuses: `QUEUED` → `RUNNING` → `READY` → `PUBLISHED`; also `DISCARDED`,
`FAILED`, `SKIPPED`.

## 2. Review (coach and admin)

Every change is a status-filtered update (a wrong state or a lost race is a
409). Anyone but the class's coach or an admin gets a 404.

| Action | From | Notes |
|---|---|---|
| Save draft | READY | Edited text kept apart from the model's draft (both shown) |
| Publish | READY | Optional edited content; refused (400) with a student code anywhere (`classRecapContentIssues`); Undo = take back |
| Take back (unpublish) | PUBLISHED | Back to READY; Undo = publish |
| Discard | READY | Undo = back to review (restore) |
| New draft (regenerate) | READY, DISCARDED, FAILED, SKIPPED | Confirmed first; replaces the draft and edits; 5 per class |
| Thumbs up/down | READY, PUBLISHED, DISCARDED | For judging the model |

## 3. Routes

| Route | Who |
|---|---|
| `GET /class-recaps/class/:classId` | coach of the class / admin (staff view with draft); its students (published view or `null`) |
| `PUT /class-recaps/class/:classId`, `POST …/publish`, `/unpublish`, `/discard`, `/restore`, `/regenerate`, `/rating` | coach of the class / admin |
| `GET /class-recaps` (paged, `status`, `search`) | coaches (own classes), admins |
| `GET /class-recaps/review-count` | coaches, admins (others get 0) |
| `GET /class-recaps/me` (cursor feed) | students |
| `GET/PATCH /admin/class-recaps/settings` | admins |

The controller has `@RequireFeature("aiClassRecaps", { allowReads: true })`:
changes need the plan, reading doesn't (published recaps stay readable).

## 4. Privacy

- What leaves the server: nothing with the LOCAL model. With OUTSIDE, the
  pseudonymised transcript text goes to that service. Name it in
  `features/legal/content.ts` before an academy uses it. Named: **Groq**
  (2026-11-26); connect only Groq for recaps until another is named.
- The policy (`features/legal/content.ts`, terms version 2026-11-26.2) and the
  coach's transcript consent (`TRANSCRIPT_CONSENT_VERSION` 2) say the
  transcript drafts recaps, maybe with an outside service; coaches are asked
  again.
- Export sections: `classRecapsAsCoach` (drafts and published, for the
  class's coach) and `classRecapsPublishedToMe` (students).
- Recaps are derived data: deleted with their class, not soft-deletable, kept
  with the class. The transcript itself still goes after 30 days.

## 5. Setting it up

1. **Our own server** (production needs owner approval OD-26 first):
   `scripts/ai/pull-model.sh` once (downloads `qwen2.5:3b` into the
   `nexa_ollama_models` volume and checks it is the benchmarked layer), then
   `docker compose -f docker-compose.yml -f compose.ai.yml --profile ai up -d ollama api`
   and set `AI_CLASS_RECAPS_ENABLED=true`. The overlay sets
   `AI_LOCAL_MODEL_URL=http://ollama:11434/v1`. Outside Docker (staging dev
   mode): run the same image with a published port and set
   `AI_LOCAL_MODEL_URL=http://127.0.0.1:<port>/v1` in `apps/api/.env`.
2. **Outside AI**: a platform operator connects a provider's key in the
   platform console → AI and leaves "AI class recaps" on Auto (or picks a
   main model and a fallback) — [AI_PROVIDERS.md](AI_PROVIDERS.md). Name the
   provider in the privacy policy, then the academy picks it in Admin → Class
   recaps. An outside call carries no `seed` (Gemini refuses it), gets
   `OUTSIDE_THINKING_TOKENS` (4,000) extra answer room (thinking models spend
   it before the answer) and reads `AI_CLASS_RECAP_OUTSIDE_CHUNK_TOKENS`
   (5,000) of transcript per call instead of 2,500, so a real class takes 1–2
   requests of the free daily quota. When the main model fails (429 quota,
   503 overload, timeout, bad key) the same call goes to the fallback; the
   recap stores the model that actually answered. Staging test 2026-11-25
   (same sample transcript): Groq `openai/gpt-oss-120b` 1.5 s, OpenRouter
   `nvidia/nemotron-3.5-super-vl:free` 24 s, both one call and better than
   `qwen2.5:3b`; Gemini's free tier answered 503 (overloaded). The full
   comparison is `docs/ai/PROVIDER_EVAL.md` on branch `ai/provider-eval`. Free tiers may train on what they're sent — not for
   real classes (minors) without accepting that.
3. Turn on "Class transcript" for the classes (Admin → Live class settings, or
   per batch/class); each coach agrees once in the room (desktop Chrome).

Measured cost on this box (2026-10-25 benchmark, same model): about 3.6
tokens/s output, 16 tokens/s input, 3.2 GB RAM. A one-hour class (about
12,000 tokens of speech) is roughly 5 parts plus one final call: **15–25
minutes of CPU per class**, between classes.

## 6. Tests

Unit: `class-recap.rules.spec.ts` (pseudonymiser, chunking, notation and
student-code clean-up), `class-recap.generator.spec.ts` (one part, map-reduce,
repair, failures, live-class stop), `class-recap.service.spec.ts` (who sees
what, every action's states), `class-recap.job.spec.ts` (pick-up, live-class
guard, outside AI, retries). Integration: `class-recap.int-spec.ts` (end to end
on Postgres with a stub model) and rows in `access-cases.ts`.

## 7. Rolling back

`AI_CLASS_RECAPS_ENABLED=false` stops new drafts at once; an academy's switch
or plan does the same per academy; a coach or admin takes back any published
recap. The migration is additive (class A).
