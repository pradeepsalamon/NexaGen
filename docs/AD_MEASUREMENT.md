# Ad measurement: Meta Conversions API and Pixel

Status: **built 2026-11-22 (night run), off by default.** Nexa's academy only
(`DEFAULT_TENANT_ID`): another academy never gets Nexa's events, pixel or banner. Plan:
`docs/NIGHT_RUN_2026-11-22.md` (removed by the run's PR); lead side: [LEAD_STAGES.md](LEAD_STAGES.md).

Goal: Meta learns which ads bring demo bookings and paying students, so campaigns can optimise
for them, without sending anything about the children.

## Conversions API (server)

`apps/api/src/meta-capi/` (`MetaCapiService`, pure payload in `meta-capi.payload.ts`).

**Outbox.** A `MetaCapiEvent` row (unique per lead + event name) is written **in the transaction
that made the lead or moved its stage**, and sent by a minute sweep (`JOB_LOCKS.metaCapiSend`,
lease claim like the Frappe push), with retries 1 min → 5 min → 30 min → 2 h → 12 h, then
`FAILED`. A refusal from Meta (400/401/403/404) fails at once; 429/5xx retry. An event older than
Meta's 7-day limit, a website event whose consent was withdrawn, or a WhatsApp event without
`WHATSAPP_BUSINESS_ACCOUNT_ID` becomes `SKIPPED` with the reason in `error`. The row holds no
personal data (the hashed details are built at send time). Retention: 180 days
(`RETENTION_RULES`).

**Events** (`META_EVENT_NAMES`, `metaMilestoneForStatus`; a stage change from anywhere counts:
automatic, the Leads page, or Frappe's return path):

| NexaGen | WhatsApp lead | Website lead |
|---|---|---|
| lead created | `LeadSubmitted` (lead capture with an ad click) | `Lead` (demo form) |
| Demo booked (`DEMO_SCHEDULED`) | `QualifiedLead` | `Schedule` |
| Converted / Active student | `Purchase` | `Purchase` |

Each at most once per lead (a demo booked twice is one `QualifiedLead`). `Purchase` carries
`value` (major units) + `currency` from the student's latest paid order (`PAID` or
`PARTIALLY_REFUNDED`, linked through `Lead.userId`); without a paid order it has no value.

**Which leads.** A **WhatsApp lead** is one with a Click-to-WhatsApp click id (`LeadAdClick`,
lead capture): `action_source: "business_messaging"`, `messaging_channel: "whatsapp"`,
`user_data` = `whatsapp_business_account_id` + `ctwa_clid` (the latest click), nothing else. A
**website lead** needs its visit's banner consent (`VisitorSession.adConsent = true`, checked when
queued and again when sent): `action_source: "website"`, `event_source_url` = the landing page
without its query, `user_data` = SHA-256 of the parent's phone (digits with country code) and email
(trimmed, lower-case) from the lead, `fbc` (`fb.1.<first visit ms>.<fbclid>`), `fbp` (stored only
after consent), client IP and user agent. A lead with neither (an organic WhatsApp chat, a website
visitor who didn't accept) is never sent.

**Never sent:** a child's name, age or level, an account's email or anything from the account, any
unhashed contact detail. Only the lead's parent phone/email, hashed.

**Website `Lead` and the pixel.** The demo form sends the pixel's `event_id` as `metaEventId`;
the server's `Lead` reuses it so Meta keeps one of the two. A malformed id is replaced by
`nexa.<EventName>.<leadId>` (also the id of every other event).

### Env (API)

| Var | Meaning |
|---|---|
| `META_DATASET_ID` | The dataset (pixel) id in Events Manager. With the token, switches the Conversions API on. |
| `META_CAPI_ACCESS_TOKEN` | A system user's token with access to the dataset. |
| `META_CAPI_TEST_EVENT_CODE` | Set = every event is a test event (Events Manager → Test events). Staging. |
| `META_GRAPH_API_VERSION` | Default `v21.0`. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Needed for WhatsApp events (already used for templates). |

### Testing safely

Specs use a mocked `post` (no test reaches Meta); integration tests blank every `META_*`. To try it
for real: set the dataset, token **and** `META_CAPI_TEST_EVENT_CODE` (from Events Manager → Test
events) on staging, make a lead there, and watch the event arrive under Test events. Remember that
staging leads also go to the real Frappe CRM (see LEAD_STAGES.md). Remove the test code only in
production, once the test events look right.
