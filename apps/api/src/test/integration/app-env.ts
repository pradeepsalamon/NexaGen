// Imported first by app.ts: AppModule's decorators read getApiEnv() at import time.
export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_ACCESS_SECRET = "integration-access-secret-0123456789abcdef";

Object.assign(process.env, {
  // Blank, not unset: Prisma's loader copies apps/api/.env into any unset var, so a
  // box with a real .env would otherwise send these tests' mail to the real admins.
  ADMIN_EMAILS: "",
  CORS_ORIGIN: TEST_ORIGIN,
  // Analyses are only queued; specs drive GameAnalysisWorker.claim/run themselves.
  GAME_ANALYSIS_WORKER: "false",
  JWT_ACCESS_SECRET: TEST_ACCESS_SECRET,
  JWT_REFRESH_SECRET: "integration-refresh-secret-0123456789abcdef",
  // Signs/verifies LiveKit tokens (recorder board read); nothing listens there,
  // so any call that reaches LiveKit answers 503
  LIVEKIT_API_KEY: "integration-key",
  LIVEKIT_API_SECRET: "integration-secret-0123456789abcdef",
  LIVEKIT_URL: "http://127.0.0.1:7880",
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  REDIS_URL: "",
  SMTP_FROM: "",
  SMTP_HOST: "",
  SMTP_PASS: "",
  SMTP_USER: ""
});
