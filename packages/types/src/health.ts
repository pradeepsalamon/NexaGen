export type HealthCheckStatus = "up" | "down" | "disabled";

export type HealthCheckResult = {
  status: HealthCheckStatus;
  latencyMs?: number;
};

export type LivenessResponse = {
  status: "ok";
  uptimeSeconds: number;
};

/** `degraded` = an optional dependency (Redis) is down; the API still serves. */
export type ReadinessResponse = {
  status: "ok" | "degraded" | "unavailable";
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
  };
};
