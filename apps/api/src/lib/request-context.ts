import { AsyncLocalStorage } from 'node:async_hooks';

/** What one request did that the audit log has to know about, gathered while it runs. */
export type RequestContext = {
  /** Hostels an admin acted on with the owner's powers (the admin bypass in `ownedHostel` and `requireMember`). */
  actingFor: Map<string, { hostelId: string; ownerId: string; hostelName: string }>;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runInRequestContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

/**
 * Notes that an admin used owner powers on someone else's hostel. Recorded once per hostel per request; the audit
 * middleware writes it only if the request was a change and it succeeded.
 */
export function noteAdminActing(user: { id: string; role: string }, hostel: { id: string; ownerId: string; name: string }) {
  if (user.role !== 'admin' || hostel.ownerId === user.id) return;
  storage.getStore()?.actingFor.set(hostel.id, { hostelId: hostel.id, ownerId: hostel.ownerId, hostelName: hostel.name });
}
