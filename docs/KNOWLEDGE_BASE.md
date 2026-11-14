# Knowledge base & help centre

Status: **Phase 5a** (2026-10-27): the admin-managed knowledge base and the
role-filtered help centre, with keyword search, and the assistant tools.
**No AI and no pgvector yet.** Phase 5b (meaning-based search + AI answers with
citations) builds on these tables and needs OD-6b (pgvector in production)
and a generation model (docs/ai/architecture/ROADMAP.md).

Owner decisions (2026-10-27, DECISIONS.md §4):

- **Nothing ships pre-loaded.** Every article comes from an admin (or a coach
  suggestion an admin publishes). The RAG PoC corpus is evaluation data only.
- **Per-role visibility.** A student never gets a coach- or admin-only article,
  by search, by link, or through an assistant tool.
- **Fully manageable**: versions, change log, rollback, archive.
- **OD-7 licensing**: academy-owned, public domain, CC0/CC-BY (credited), or
  written permission. Each article records its source; CC-BY / permission
  can't publish without a credit note.
- Editors: **admins and super admins**. Permanent delete: super admin only.

## 1. Where things are

| | Path |
|---|---|
| Shared rules + schemas | `packages/types/src/knowledge.ts` (`canReadKnowledgeArticle`, `detectKnowledgeWarnings`, `diffKnowledgeLines`, request schemas) |
| Assistant tool contract | `packages/types/src/assistant-tools.ts` |
| API | `apps/api/src/knowledge/` (`KnowledgeService` readers + coaches, `KnowledgeAdminService` authoring, `knowledge.tools.ts`) |
| Tool registry | `apps/api/src/ai/tools/` (`AssistantToolRegistry`, `/admin/ai/tools`) |
| Web | `features/knowledge/`; pages `/help`, `/help/[slug]`, `/admin/knowledge`, `/admin/knowledge/new`, `/admin/knowledge/[id]` |
| Tests | `knowledge/knowledge.int-spec.ts` (permission probes, lifecycle), `knowledge.rules.spec.ts`, rows in `cross-user-access.int-spec.ts` |

## 2. Model

- `KnowledgeArticle`: slug, kind (`ARTICLE` / `FAQ` / `GAME` / `RESOURCE`),
  status (`DRAFT` / `PUBLISHED` / `ARCHIVED`), **audience** (`STUDENT`,
  `COACH`, `ADMIN`; empty = nobody), optional batch scope
  (`KnowledgeArticleBatch`), category, route tags, language + translation
  group, source/licence, `publishAt` / `expiresAt` / `reviewBy`, and
  `publishedVersionId`.
- `KnowledgeArticleVersion`: numbered, immutable once it leaves
  `DRAFT`/`SUBMITTED`. `PUBLISHED` (at most one per article), `SUPERSEDED`,
  `SUBMITTED` (coach suggestion), `REJECTED`. Holds title/summary/markdown
  body/PGN/resource link and `warnings`.
- `KnowledgeArticleEvent`: the change log (who, what, when; settings changes
  store before/after of the changed keys).
- `KnowledgeFeedback`: one helpful / not-helpful vote per reader per article.
- `KnowledgeSearchLog`: help searches (normalised text, role, the searcher's
  batch ids, route, result count). **No user id.** 90-day `RETENTION_RULES`.
- `KnowledgeCategory`: admin-defined, archivable; can't be deleted while it
  has articles.

None of these are soft-deletable: archive is the reversible "delete";
permanent delete cascades versions, events, votes and batch scope.

## 3. Visibility (the rule you must not break)

A reader sees an article only if **all** hold (`canReadKnowledgeArticle`, and
its Prisma twin `readerWhere` in `knowledge.shared.ts`, applied inside the
query that fetches rows):

1. status `PUBLISHED`, a published version exists, and now is inside
   `[publishAt, expiresAt)`;
2. the reader's audience is listed (`SUPER_ADMIN` reads as `ADMIN`);
3. if the article is batch-scoped, a student/coach reaches it only through one
   of those batches (their current, non-deleted enrolment / coaching link).
   Admins are never batch-scoped. Scope is the `batchScoped` flag, not "has
   batch rows": a batch purged from Trash cascades its row away, and a scoped
   article left with no batches is hidden from students and coaches, never
   opened to all. Saving its settings with no batches makes it unscoped.

A hidden article is a **404** (slugs can't be probed). Search ranks only ids
the rule already allowed, so ranking can't widen visibility. Staff's
**Preview as role** runs the same rule for a chosen role/batch and never logs.
The editor warns about internal links the audience can't open; the reader's
renderer shows such a link as plain text.

## 4. Search

Postgres full-text (`english`), title weighted over summary over body (+ PGN),
plus a case-insensitive substring match for names, ECO codes and non-English
text. Computed per query with **no index**: the corpus is small (hundreds of
articles) and an expression index would show up as schema drift in CI's
`prisma migrate diff`. Revisit (generated `tsvector` column, or pgvector in
5b) past a few thousand articles. Articles whose route tags match the page the
reader came from (`/help?from=<route>`, the header's Help button) are listed
first and in "Help for the page you were on".

A search of 3+ characters is logged; one that found nothing feeds the admins'
**unanswered inbox** (Questions & feedback tab), where it can be answered
(opens a new FAQ pre-filled with the question and the asking roles) or
dismissed. Coaches see **What students ask**: queries from their batches'
students made at least `KNOWLEDGE_TREND_MIN_COUNT` (2) times in 30 days,
only for batches with at least `KNOWLEDGE_TREND_MIN_BATCH_SIZE` (5) current
students: the log has no user id, so in a smaller batch one student's repeated
query would point at them.

## 5. Lifecycle

- Create → version 1 `DRAFT`. Save draft writes the open draft (or starts the
  next number). Publish: the open draft, a named draft/suggestion, or the last
  published version again (republish after Unpublish). The old live version
  becomes `SUPERSEDED`. Publish refuses an empty audience (400), a CC-BY /
  permission source without a credit (400), and flagged text without
  `acknowledgeWarnings` (409).
- **Flags** (`detectKnowledgeWarnings`): the RAG PoC's injection patterns
  ("ignore previous instructions", role tags, tool calls…). Text is shown to
  readers as written; the flag exists because 5b will quote it to a model.
- Rollback copies an old version into a new one and publishes it; history only
  grows. Diff = line LCS of title/summary/body/PGN.
- Unpublish hides (status `DRAFT`, published version kept); Archive hides and
  moves to the archive filter; Restore returns to live (or draft).
- Coach suggestions (`/knowledge/suggestions`): a new article (empty audience)
  or an edit of one the coach can read; editable/withdrawable while
  `SUBMITTED`; at most 20 pending per coach. Admins publish (audience first)
  or decline with a note the coach sees.
- Import (JSON export or Markdown files, ≤200) always creates drafts. Export:
  every non-archived article's live (else draft) version + settings, no batch
  scope.

Undo (`lib/undo/README.md`): archive/restore, unpublish, category
create/archive use `useUndoableMutation`; withdraw, dismiss and category
delete are `defer`. Save draft / settings / publish / rollback are excluded
(versioned; rollback is the correction), as are import and permanent delete.

## 6. Assistant tools

`AssistantToolRegistry` (AI_FOUNDATION.md §6) holds typed READ tools; each
runs in NestJS with the **caller's** access token through the same reader rule.
Today: `knowledge.search {query, route?}` and `knowledge.get_article {slug}`
(body capped at 8,000 chars; returns citations). Tool searches are not logged.
A refusal (403/404) becomes `{ok:false, error:"Not found."}` so a model learns
nothing about hidden articles. `GET /admin/ai/tools` lists them with JSON
Schemas; `POST /admin/ai/tools/run` dry-runs one as yourself (super admin;
works with `AI_ENABLED` off). The assistant loop itself is Phase 5b.

## 7. Rendering

`features/knowledge/lib/markdown.ts` parses a Markdown subset into blocks;
`KnowledgeMarkdown` renders React elements only (no HTML injection). ```` ```fen ````
blocks are static boards (`readSetupFen`, so set-up positions work), ```` ```pgn ````
blocks and GAME articles are a replayable mainline (`parsePgnToMoveTree`).
External links open in a new tab with `noopener noreferrer nofollow`; any
other scheme is text. Boards read `useChessAppearance()` via `PracticeBoard`.

## 8. Privacy

Votes and a coach's suggestions are in the personal-data export
(`helpFeedback`, `helpSuggestions`). Search logs carry no user id and are
deleted after 90 days; free text typed by students (minors) is visible to
admins in the inbox, and to coaches only as an aggregate of ≥2 searches.
