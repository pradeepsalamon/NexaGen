// Imported first by app.ts: AppModule's decorators read getApiEnv() at import time.
export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_ACCESS_SECRET = "integration-access-secret-0123456789abcdef";

Object.assign(process.env, {
  CORS_ORIGIN: TEST_ORIGIN,
  JWT_ACCESS_SECRET: TEST_ACCESS_SECRET,
  JWT_REFRESH_SECRET: "integration-refresh-secret-0123456789abcdef",
  // LiveKitService refuses to boot without these; the clients never connect in tests
  LIVEKIT_API_KEY: "integration-key",
  LIVEKIT_API_SECRET: "integration-secret-0123456789abcdef",
  LIVEKIT_URL: "http://127.0.0.1:7880",
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  REDIS_URL: ""
});
