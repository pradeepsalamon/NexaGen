/**
 * Development Environment Information Utility
 * Safe diagnostic helper for Nexa AI Development System
 */

export interface DevEnvironmentInfo {
  isDevelopment: boolean;
  nodeEnv: string;
  timestamp: string;
  uptimeSeconds: number;
}

export function getDevEnvironmentInfo(): DevEnvironmentInfo {
  return {
    isDevelopment: process.env.NODE_ENV !== 'production',
    nodeEnv: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 0)
  };
}

export function getDevExecutionDuration(startTimeMs: number): number {
  if (!startTimeMs || typeof startTimeMs !== 'number') return 0;
  return Math.max(0, Date.now() - startTimeMs);
}
