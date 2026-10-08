// Imported first by app.ts: AppModule's decorators read getApiEnv() at import time.
export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_ACCESS_SECRET = "integration-access-secret-0123456789abcdef";

Object.assign(process.env, {
  CORS_ORIGIN: TEST_ORIGIN,
  JWT_ACCESS_SECRET: TEST_ACCESS_SECRET,
  JWT_REFRESH_SECRET: "integration-refresh-secret-0123456789abcdef",
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  REDIS_URL: ""
});
