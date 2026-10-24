/**
 * In-process background jobs. Each job must be idempotent (unique constraints + status guards)
 * and return how many rows it changed. `runAllJobs` runs them in order.
 */
export type Job = { name: string; run: (now: Date) => Promise<number> };

export const jobs: Job[] = [];

export async function runAllJobs(now = new Date()): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const job of jobs) {
    try {
      out[job.name] = await job.run(now);
    } catch (e) {
      console.error(`[jobs] ${job.name} failed`, e);
      out[job.name] = -1;
    }
  }
  return out;
}

export function startScheduler(intervalMs = 15 * 60 * 1000) {
  void runAllJobs();
  return setInterval(() => void runAllJobs(), intervalMs);
}
