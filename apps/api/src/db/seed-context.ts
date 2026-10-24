import type { schema } from './index';

export type SeedCtx = {
  admin: typeof schema.users.$inferSelect;
  owner: typeof schema.users.$inferSelect;
  tenant: typeof schema.users.$inferSelect;
  owners: (typeof schema.users.$inferSelect)[];
  hostels: (typeof schema.hostels.$inferSelect)[];
  foodPartners: (typeof schema.foodPartners.$inferSelect)[];
};
