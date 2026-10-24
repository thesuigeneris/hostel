import type { schema } from '../db';

export type UserRow = typeof schema.users.$inferSelect;
export type AppEnv = { Variables: { user: UserRow | null } };
