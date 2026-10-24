import { DEFAULT_PLATFORM_FEE_PCT, standardsFor } from '@hostels/shared';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, Empty, Flash, Input, PageHeader, Table, Td, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { dateLabel, rupees } from '@/lib/format';
import { rejectPartnerAction, saveChecklistAction, setFeeAction, verifyPartnerAction } from '../actions';

type Props = { searchParams: Promise<{ q?: string; error?: string; ok?: string }> };

export default async function AdminPartners({ searchParams }: Props) {
  const q = await searchParams;
  const client = await api();
  const [applications, verified] = await Promise.all([
    client.admin.partnerApplications('applied'),
    client.admin.hostels({ partnerStatus: 'verified', q: q.q }),
  ]);
  const path = q.q ? `/admin/partners?q=${encodeURIComponent(q.q)}` : '/admin/partners';
  return (
    <>
      <PageHeader title="Partners" subtitle="Visit in person before verifying. Tick each brand standard as you check it; progress is saved between visits." />
      <Flash error={q.error} ok={q.ok} />
      <h2 className="mb-3 text-lg font-semibold">Applications ({applications.length})</h2>
      {applications.length === 0 ? <Empty title="No pending applications" /> : (
        <div className="space-y-4">
          {applications.map((a) => {
            const standards = standardsFor(a.hostel.foodAvailable);
            const done = standards.filter((s) => a.checklist.includes(s.id)).length;
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{a.hostel.name}</div>
                    <div className="text-sm text-ink-soft">
                      {a.hostel.area} · owner {a.owner.name || '—'} +91 {a.owner.phone} · hostel +91 {a.hostel.contactPhone} · applied {dateLabel(a.appliedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={done === standards.length ? 'text-brand' : 'text-food'}>{done}/{standards.length} checked</span>
                    {a.hostel.status === 'live' && <Link href={`/hostels/${a.hostel.slug}`}>Public page</Link>}
                  </div>
                </div>
                <form action={verifyPartnerAction} className="mt-4 space-y-3">
                  <Back to={path} /><input type="hidden" name="hostelId" value={a.hostelId} />
                  <fieldset className="grid gap-2 sm:grid-cols-2">
                    <legend className="mb-2 text-sm font-medium">Brand standards</legend>
                    {standards.map((s) => (
                      <label key={s.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name="checklist" value={s.id} defaultChecked={a.checklist.includes(s.id)} className="mt-1" />
                        <span>{s.label}</span>
                      </label>
                    ))}
                  </fieldset>
                  <Textarea name="note" rows={2} maxLength={1000} defaultValue={a.note} placeholder="Visit notes (only admins see these)" aria-label="Visit notes" />
                  <div className="flex flex-wrap items-center gap-2">
                    <SubmitButton variant="secondary" formAction={saveChecklistAction}>Save progress</SubmitButton>
                    <span className="ml-auto text-sm">Fee %</span>
                    <span className="w-20"><Input type="number" name="platformFeePct" min={0} max={50} step="0.5" defaultValue={DEFAULT_PLATFORM_FEE_PCT} aria-label="Platform fee percent" /></span>
                    <SubmitButton>Verify</SubmitButton>
                  </div>
                </form>
                <form action={rejectPartnerAction} className="mt-3 flex gap-2 border-t border-line pt-3">
                  <Back to={path} /><input type="hidden" name="hostelId" value={a.hostelId} />
                  <Input name="reason" required minLength={3} placeholder="Reason for declining (the owner sees this)" />
                  <SubmitButton variant="danger">Decline</SubmitButton>
                </form>
              </Card>
            );
          })}
        </div>
      )}
      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">Verified partners ({verified.length})</h2>
        <form className="flex gap-2">
          <span className="w-64 flex-none"><Input name="q" defaultValue={q.q} placeholder="Search name, area or phone" className="h-9" aria-label="Search partners" /></span>
          <SubmitButton size="sm" variant="secondary">Search</SubmitButton>
        </form>
      </div>
      {verified.length === 0 ? <p className="text-sm text-ink-soft">{q.q ? 'No matches.' : 'None yet.'}</p> : (
        <Table head={['Hostel', 'Area', 'Platform fee', '']}>
          {verified.map((h) => (
            <tr key={h.id}>
              <Td className="font-medium"><Link href={`/hostels/${h.slug}`}>{h.name}</Link></Td>
              <Td>{h.area}</Td>
              <Td colSpan={2}>
                <form action={setFeeAction} className="flex items-center gap-2">
                  <Back to={path} /><input type="hidden" name="hostelId" value={h.id} />
                  <span className="w-20 flex-none"><Input type="number" name="platformFeePct" min={0} max={50} step="0.5" defaultValue={h.platformFeePct} className="h-8" aria-label="Platform fee percent" /></span>
                  <span className="text-xs text-ink-muted">% · on {rupees(10000)} rent = {rupees(Math.round(h.platformFeePct * 100))}</span>
                  <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
