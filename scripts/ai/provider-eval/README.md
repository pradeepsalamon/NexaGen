# Outside-AI provider evaluation harness

Runs the small test set in `docs/ai/provider-eval/inputs/` against free-tier
outside models (Groq, Gemini, OpenRouter) and our own local model, and keeps
every request and answer in `docs/ai/provider-eval/runs/`. Results and the
recommendation: [docs/ai/PROVIDER_EVAL.md](../../../docs/ai/PROVIDER_EVAL.md).

| File | What it does |
|---|---|
| `engine-findings.cjs` | Builds `inputs/game-*.json`: two public-domain games scanned with the local Stockfish, in the shape the app sends to the outside AI (`pseudonymisePlay`). |
| `run.cjs` | The runner. Same request shape as the app (`ai/chat-model.ts`), the app's own recap pipeline (`generateRecap`) and play-review prompt; the other tasks have prompts written for this test. Resumable; waits out per-minute limits; stops a model for the day at its daily limit. `--capacity <task>` repeats one task until the daily limit answers. |
| `summarize.cjs` | Reads the run records and prints the token, time and check tables used in the report. |

```bash
# keys (gitignored): GROQ_KEY=… GEMINI_KEY=… OPENROUTER_KEY=…  in .env.outside-ai
# APP_ROOT = a checkout with node_modules and built packages/types + apps/api (npm run build -w apps/api)
APP_ROOT=/path/to/checkout node scripts/ai/provider-eval/run.cjs \
  --models groq:openai/gpt-oss-120b,gemini:gemini-3.1-flash-lite,local:qwen2.5:3b [--tasks recap,support-pick]
APP_ROOT=… node scripts/ai/provider-eval/run.cjs --capacity support-pick --models groq:openai/gpt-oss-20b
node scripts/ai/provider-eval/summarize.cjs
```

The local model is the `compose.ai.yml` Ollama image run by hand on
`127.0.0.1:11437` (`LOCAL_URL` to change), only at night while no class is live,
and removed afterwards. Keys are never written to a record (error bodies are
redacted). Test data is synthetic or public domain; no real student data.
