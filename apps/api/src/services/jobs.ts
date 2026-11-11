import { clock } from '../lib/clock';
import { endCancelledSubscriptions, expirePendingSubscriptions, generateUpcomingInvoices } from './billing';
import { autoCloseResolvedIssues } from './community';
import { completeDueMoves } from './moves';
import { applyPendingPlanChanges, generateOwnerInvoices, refreshSuspensions } from './plans';

export const JOB_INTERVAL_MS = 15 * 60 * 1000;

/** Every job is idempotent (unique constraints and status guards), so running them twice is harmless. */
export async function runJobs() {
  const today = clock.today();
  const now = clock.now();
  const expiredSubscriptions = await expirePendingSubscriptions(now);
  const moves = await completeDueMoves(today);
  return {
    expiredSubscriptions,
    completedMoves: moves.completed,
    // Moves into a hostel that stopped taking residents, cancelled on their day.
    cancelledMoves: moves.cancelled,
    endedSubscriptions: await endCancelledSubscriptions(today),
    tenantInvoices: await generateUpcomingInvoices(today),
    planChanges: await applyPendingPlanChanges(today),
    ownerInvoices: await generateOwnerInvoices(today),
    suspensions: await refreshSuspensions(today),
    closedIssues: await autoCloseResolvedIssues(now),
  };
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await runJobs();
    const changed = Object.entries(result).filter(([, n]) => n > 0);
    if (changed.length) console.log(`[jobs] ${changed.map(([k, n]) => `${k}=${n}`).join(' ')}`);
  } catch (e) {
    console.error('[jobs] failed', e);
  } finally {
    running = false;
  }
}

/** In-process scheduler: runs on startup and every 15 minutes. */
export function startScheduler() {
  if (timer) return;
  void tick();
  timer = setInterval(tick, JOB_INTERVAL_MS);
}
