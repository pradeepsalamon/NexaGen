import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import type { JobLockOutcome } from "./job-lock.service";

/**
 * Test double for JobLockService: runs the job, or reports it as held
 * elsewhere. `runForEachTenant` goes through `runExclusive` (one academy,
 * Nexa), so `runExclusive.mockResolvedValueOnce({ acquired: false })` covers both.
 */
export function createJobLockStub({ acquired = true }: { acquired?: boolean } = {}) {
  const runExclusive = jest.fn(
    async <T>(_name: string, run: (signal: AbortSignal) => Promise<T>): Promise<JobLockOutcome<T>> =>
      acquired ? { acquired: true, result: await run(new AbortController().signal) } : { acquired: false }
  );
  const runForEachTenant = jest.fn(
    async (name: string, run: (signal: AbortSignal, tenantId: string) => Promise<unknown>): Promise<JobLockOutcome<void>> => {
      const outcome = await runExclusive(name, (signal) => run(signal, DEFAULT_TENANT_ID));
      return outcome.acquired ? { acquired: true, result: undefined } : { acquired: false };
    }
  );
  return { runExclusive, runForEachTenant };
}
