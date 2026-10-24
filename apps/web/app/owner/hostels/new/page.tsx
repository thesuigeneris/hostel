import { createHostelAction } from '@/app/owner/actions';
import { HostelForm } from '@/components/HostelForm';
import { Card, Flash, PageHeader } from '@/components/ui';

export default async function NewHostelPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="List your hostel" subtitle="Free to list. You'll add rooms and photos next, then send it for a quick review." />
      <Flash error={error} />
      <Card><HostelForm action={createHostelAction} submitLabel="Create listing" /></Card>
    </div>
  );
}
