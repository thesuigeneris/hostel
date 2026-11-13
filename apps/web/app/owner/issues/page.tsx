import { IssueList } from '@/components/Community';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

export default async function OwnerIssuesPage() {
  const client = await api();
  const [issues, hostels] = await Promise.all([client.owner.issues(), client.owner.hostels()]);
  const name = new Map(hostels.map((h) => [h.id, h.name]));
  const byHostel = [...new Set(issues.map((i) => i.hostelId))];
  return (
    <>
      <PageHeader title="Issues" subtitle="Everything your residents have reported, newest first. Response times show on your public listing." />
      {byHostel.length === 0 && <IssueList issues={[]} />}
      <div className="space-y-8">
        {byHostel.map((hid) => (
          <section key={hid}>
            <h2 className="mb-3 text-lg font-semibold">{name.get(hid) ?? 'Hostel'}</h2>
            <IssueList issues={issues.filter((i) => i.hostelId === hid)} />
          </section>
        ))}
      </div>
    </>
  );
}
