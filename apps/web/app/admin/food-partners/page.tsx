import { FoodPartnersManager } from '@/components/admin/food-partners-manager';
import { PageHeader } from '@/components/ui/states';
import { load } from '@/components/owner/data';
import { LoadError } from '@/components/owner/ui';
import { serverApi } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminFoodPartners() {
  const api = await serverApi();
  const res = await load(() => api.admin.foodPartners());
  return (
    <div>
      <PageHeader title="Food partners" subtitle="Brands partner hostels can schedule into their weekly menus." />
      {res.error !== null ? <LoadError message={res.error} /> : <FoodPartnersManager partners={res.data} />}
    </div>
  );
}
