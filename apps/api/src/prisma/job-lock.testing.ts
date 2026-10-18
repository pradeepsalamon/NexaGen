import type { JobLockOutcome } from "./job-lock.service";

/** Test double for JobLockService: runs the job, or reports it as held elsewhere. */
export function createJobLockStub({ acquired = true }: { acquired?: boolean } = {}) {
  return {
    runExclusive: jest.fn(
      async <T>(_name: string, run: (signal: AbortSignal) => Promise<T>): Promise<JobLockOutcome<T>> =>
        acquired ? { acquired: true, result: await run(new AbortController().signal) } : { acquired: false }
    )
  };
}
