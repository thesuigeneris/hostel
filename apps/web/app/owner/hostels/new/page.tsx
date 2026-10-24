import { HostelForm } from '@/components/owner/hostel-form';
import { PageHeader } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

export default function NewHostelPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="List your hostel" subtitle="Step 1 of 3 — details and location. Next you'll add rooms and photos, then submit for review." />
      <HostelForm />
    </div>
  );
}
