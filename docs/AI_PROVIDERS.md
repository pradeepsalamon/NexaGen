# Outside AI providers and the model per feature

Built 2026-11-26 from the provider evaluation (`docs/ai/PROVIDER_EVAL.md` on
branch `ai/provider-eval`, §6 "Best model per feature" and §7 "Things the app
should change").

## What it is

- **Platform operators** (Nexa's super admins, `assertPlatformOperator`)
  connect the outside AI providers' API keys in **Platform console → AI**.
  Every academy's AI features use these keys (owner decision 2026-11-26:
  platform only, not per academy).
- **Fixed providers only**: Groq, Google Gemini (AI Studio key, its
  OpenAI-compatible API) and OpenRouter (`AI_PROVIDERS` in
  `@nexa-chess/types` `ai-providers.ts`). The server only ever calls their
  base URLs; there is no custom URL.
- **A model per feature**, with a **fallback**: each built AI feature
  (`AI_FEATURE_IDS`) has a main model and a fallback used when the main one
  fails (out of free quota 429, overloaded 503, a timeout, a revoked key).
  Left on **Auto** (the default), a feature uses the first model of its
  `auto` list whose provider is connected; the Auto fallback prefers another
  provider. **`resolveAiFeatureRoute` is the one rule.**
- Model lists come live from each provider (`GET <baseUrl>/models`, cached 10
  minutes, speech/embedding/image models left out); OpenRouter's free models
  are marked "(free)" and listed first.

| Feature | Auto order |
|---|---|
| `CLASS_RECAP` — AI class recaps (academies that chose the outside AI) | Groq `qwen/qwen3.8-27b` → Gemini `gemini-3.1-flash-lite` → OpenRouter `nvidia/nemotron-3.5-super-vl:free` → Groq `openai/gpt-oss-120b` |
| `PLAY_REVIEW_COMMENT` — AI play review comments (consenting students only) | Groq `qwen/qwen3.8-27b` → Gemini `gemini-3.1-flash-lite` → OpenRouter `nvidia/nemotron-3.5-super-vl:free` |

Gemini 3.5 / 3.8 Flash (20 free requests a day, often overloaded) and
`gpt-oss-20b` (wrong facts, JSON-mode refusals) are left out of Auto on
purpose; an operator can still pick any listed model.

**A new AI feature** = an `AI_FEATURE_IDS` entry + its `AI_FEATURES` row
(label, description, Auto order), then call `AiProvidersService.routeConfigs(<id>)`
and `completeOnRoute`. The console shows the new row by itself; no migration
(the feature id is stored as text).

## Where things are

| Piece | Path |
|---|---|
| Contract and rule | `packages/types/src/ai-providers.ts` (`AI_PROVIDERS`, `AI_FEATURES`, `resolveAiFeatureRoute`, request schemas); routes `API_ROUTES.platform.ai*` |
| Key store + routes | `apps/api/src/ai/providers/ai-providers.service.ts` (`AiProvidersService`: encrypted keys, reload every 60 s on every process, `route`, `routeConfigs`, `listModels`) |
| Console API | `apps/api/src/ai/providers/ai-integrations.{controller,service}.ts` |
| Model calls | `apps/api/src/ai/chat-model.ts` (`callChatModel`, `completeOnRoute`, `OUTSIDE_THINKING_TOKENS`) |
| Web | `apps/web/src/features/ai-providers/` → the **AI** tab of `/admin/platform` |
| Tables | `ai_provider_credentials`, `ai_feature_models` (platform tables, no `tenantId`); `ai_review_consents.providers`; migration `20261126061847_ai_providers` (class A) |

## Rules

- **Keys**: AES-256-GCM with a key derived from `CREDENTIALS_ENCRYPTION_KEY`
  (else `MFA_ENCRYPTION_KEY`), like the payment gateway keys. Never returned
  or logged; the console shows the last 4 characters only. A key is checked
  against the provider (`GET /models`) before it is stored, so a refused key
  is never saved. Every change writes `PlatformAuditLog` (`ai.provider.*`,
  `ai.feature.mapped`), never the key.
- **Calls** (`callChatModel`): outside models get `OUTSIDE_THINKING_TOKENS`
  (4,000) on top of the feature's own limit (thinking models spend tokens
  before the answer) and no `seed` (Gemini refuses it). Groq's JSON-mode
  refusal (400 `json_validate_failed`) is retried once without JSON mode;
  answers are read with `parseModelJson`. Nothing else is retried on the same
  model — an overload or quota answer goes to the fallback, because Gemini
  counts overload answers against its daily cap. One call times out after
  `AI_OUTSIDE_CALL_TIMEOUT_MS` (120 s).
- **Consent (play review)**: a student's consent row stores the providers it
  named; play goes only to those (`aiConsentCoveredProviders`), and a newly
  mapped provider means the student is asked again. See
  [AI_PLAY_REVIEW.md](AI_PLAY_REVIEW.md) § 3.
- **Class recaps** read `AI_CLASS_RECAP_OUTSIDE_CHUNK_TOKENS` (5,000) of
  transcript per outside call (our own server keeps 2,500), so a real class
  costs 1–2 requests; the stored recap names the model that answered.
- **Privacy**: only pseudonymised text is ever sent. Free tiers differ in
  what they do with it (Gemini's free tier may use it with human review;
  Groq keeps nothing by default, switch on Zero Data Retention; OpenRouter
  depends on the account's privacy settings). **Name the provider in
  `features/legal/content.ts` before connecting a key on production** (it
  says none is in use yet).

## Free limits (measured 2026-11-25)

| Provider / model | Per minute | Per day |
|---|---|---|
| Groq, each model | 30 requests, 8,000 tokens | 1,000 requests, 200,000 tokens |
| Gemini `gemini-3.1-flash-lite` | 15 requests | 500 requests |
| Gemini 3.5 / 3.8 Flash | — | 20 requests (overload answers count) |
| OpenRouter, all `:free` models together | 20 requests | 50 requests for the account (1,000 after buying 10 credits) |

At medium volume (20 recaps and 64 play reviews a day) the two built
features take about 60% of Groq `qwen3.8-27b`'s free daily tokens
(eval §5: 20 of 44 recaps, 64 of 429 reviews), with Flash-Lite as the fallback.

## Tests

`apps/api/src/ai/providers/ai-providers.spec.ts` (the rule, consent
coverage, model-list parsing, JSON-mode retry, no retry on 503, thinking
room), `ai/outside/outside-ai.spec.ts` (fallback), `class-recap.job.spec.ts`
and `play-review.job.spec.ts` (routes, consent providers).
