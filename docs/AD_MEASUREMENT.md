# Ad measurement: Meta Conversions API and Pixel

Status: **built 2026-11-22 (night run), off by default.** Nexa's academy only
(`DEFAULT_TENANT_ID`): another academy never gets Nexa's events, pixel or banner. Results, defaults
and the switch-on order: [BACKLOG.md](BACKLOG.md) § "Questions for the owner" (2026-11-22 night run); lead side: [LEAD_STAGES.md](LEAD_STAGES.md).

Goal: Meta learns which ads bring demo bookings and paying students, so campaigns can optimise
for them, without sending anything about the children.

## Conversions API (server)

`apps/api/src/meta-capi/` (`MetaCapiService`, pure payload in `meta-capi.payload.ts`).

**Outbox.** A `MetaCapiEvent` row (unique per lead + event name) is written **in the transaction
that made the lead or moved its stage**, and sent by a minute sweep (`JOB_LOCKS.metaCapiSend`,
lease claim like the Frappe push), with retries 1 min → 5 min → 30 min → 2 h → 12 h, then
`FAILED`. A refusal from Meta (400/401/403/404) fails at once, unless Meta marks the error
temporary (`is_transient`, or codes 1, 2, 4, 17, 32, 341, 613); 429/5xx retry. An event older than
Meta's 7-day limit, a website event whose consent was withdrawn, a WhatsApp event without
`WHATSAPP_BUSINESS_ACCOUNT_ID`, or one whose lead was trashed (its pending events are skipped in the
trash transaction, and `send` checks again: review Part 1 #3) becomes `SKIPPED` with the reason in `error`. The row holds no
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
`PARTIALLY_REFUNDED`, linked through `Lead.userId`). Meta requires both, so a `Purchase` queued
before the payment (enrolment marked by hand) waits: the send looks for the order hourly for up to
six days (`PURCHASE_VALUE_WAIT_MS`), without using an attempt, then is `SKIPPED`.

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

## Meta Pixel and the cookie banner (web)

`apps/web/src/features/ad-consent/` (`AdMeasurement`, `AdConsentSettingsButton`, `lib/adConsent.ts`,
`lib/metaPixel.ts`).

- **`NEXT_PUBLIC_META_PIXEL_ID`** (build-time; `Dockerfile` ARG + compose build arg). Empty = no
  pixel **and no banner**.
- **Where:** `AdMeasurement` is mounted on Nexa's public pages only: `/` (and its demo form),
  `/academy`, `/privacy`, `/terms`. Not `/plans`: it needs a sign-in (`ROUTE_RULES`), so it is a
  signed-in page; hence no `ViewContent` event either. It renders nothing on another academy's address
  (`data-host="academy"`, and it sits inside `platform-brand-only`) and nothing for a signed-in
  user; it is never mounted in role areas, the live class or demo guest pages.
- **Banner:** Accept / Decline, the answer in the first-party cookie `nexa_ad_consent`
  (`granted`/`denied`, six months, `SameSite=Lax`) and on the visit through
  `POST /leads/ad-consent` (`VisitorSession.adConsent`, `adConsentAt`; starts the visit if the
  tracking call hasn't yet). **Decline marks every visit of this browser** (same `visitorId`), so a
  queued website event for an earlier lead is skipped. "Change cookie choices" on `/privacy`
  reopens the banner.
- **Keeping the server in step** (`lib/consentSync.ts`): consent calls run one after another (a
  later answer always lands last), after the page's visit-tracking call (so both use one visit),
  are retried, and a saved answer is sent again for each new browser session (the server's
  consent is per visit) until the server confirms it. The demo form waits for a consent call
  still on its way (at most three seconds) before sending the lead. Decline also switches off a
  pixel already loaded on the page (`fbq("consent", "revoke")`), and every pixel event checks the
  answer at the moment it is sent.
- **Pixel, after Accept only:** loaded without an inline script (`loadMetaPixel`: Meta's queue stub
  + `connect.facebook.net/en_US/fbevents.js`), then `PageView` on each page and `Lead` when the demo form succeeds, with the `event_id` the form also sends as
  `metaEventId` (the server's `Lead` reuses it). Meta's `_fbp` cookie (on the site's top domain)
  is read by the API on the form and consent calls and kept only on a consented visit.
- **CSP:** `connect.facebook.net` (script, connect) and `www.facebook.com` (connect) are added to
  `next.config.mjs` `reportOnlyCsp()` only when the pixel id is set; images already allow `https:`.
- **Privacy policy:** `features/legal/content.ts` section "Ad measurement" (what the pixel and the
  server send, what never is, how to decline), "Meta (ads)" under sharing, retention.

## Funnel report (admin)

Admin → Leads → **Funnel** tab (`LeadFunnelPanel`), `GET /admin/leads/funnel?from=YYYY-MM-DD&to=YYYY-MM-DD`
(`LeadFunnelService`, admins and super admins, `leadsCrm` feature).

- Leads **created** between the two days (both included) **in the academy's time zone**
  (`Tenant.timezone`, else Asia/Kolkata; `zonedDateToUtc`), at most 366 days, grouped by source and
  campaign. Counted in batches of 1,000; the report lists groups, not leads.
- How far each got is **`leadFunnelReach`** (`@nexa-chess/types` `leads.ts`), the one rule: booked =
  a demo registration or a booked/missed/attended stage; attended = a guest who joined or Demo
  attended; enrolled = `convertedAt` or Converted / Active student. A lead later moved to Follow up
  or Lost still counts where it got to. Percentages are of the row's leads.
- **Ad spend** (optional): `META_ADS_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` →
  `MetaAdsInsightsService` reads ad-level spend for the range (read-only Marketing API Insights,
  `ads_read`; Meta's days are the ad account's), cached six hours per range, Nexa's academy only.
  Spend arrives in major units and is converted with `toMinorUnits` in the account's currency, so a
  currency without decimals isn't multiplied by 100 (review Part 1 #4).
  Matched per row: WhatsApp ad leads by ad id (`LeadAdClick.firstAdId`), website leads by campaign
  name (`utm_campaign` = the Meta campaign's name), leaving out ads a WhatsApp row already took;
  rows sharing one campaign (say instagram and facebook) split its spend by their leads
  (`allocateSpend`), so each ad is counted once. Cost per lead / enrolment where matched; the
  total is every ad's spend in the range. A Meta error leaves the funnel and shows why spend is
  missing. Empty = no spend columns.

### Env (API)

| Var | Meaning |
|---|---|
| `META_DATASET_ID` | The dataset (pixel) id in Events Manager. With the token, switches the Conversions API on. |
| `META_CAPI_ACCESS_TOKEN` | A system user's token with access to the dataset. |
| `META_CAPI_TEST_EVENT_CODE` | Set = every event is a test event (Events Manager → Test events). Staging. |
| `META_GRAPH_API_VERSION` | Default `v21.0`. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Needed for WhatsApp events (already used for templates). |
| `META_ADS_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` | Funnel report ad spend (read-only). Both empty = no spend columns. |

Web (build-time): `NEXT_PUBLIC_META_PIXEL_ID` (empty = no pixel, no banner).

### Testing safely

Specs use a mocked `post` (no test reaches Meta); integration tests blank every `META_*`. To try it
for real: set the dataset, token **and** `META_CAPI_TEST_EVENT_CODE` (from Events Manager → Test
events) on staging, make a lead there, and watch the event arrive under Test events. Remember that
staging leads also go to the real Frappe CRM (see LEAD_STAGES.md). Remove the test code only in
production, once the test events look right.
