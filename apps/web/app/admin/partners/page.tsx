import { DEFAULT_PLATFORM_FEE_PCT } from '@hostels/shared';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Back, Card, Empty, Flash, Input, PageHeader, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { rupees } from '@/lib/format';
import { rejectPartnerAction, setFeeAction, verifyPartnerAction } from '../actions';

export default async function AdminPartners({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const q = await searchParams;
  const client = await api();
  const [applied, verified] = await Promise.all([client.admin.hostels({ partnerStatus: 'applied' }), client.admin.hostels({ partnerStatus: 'verified' })]);
  const path = '/admin/partners';
  return (
    <>
      <PageHeader title="Partners" subtitle="Visit in person before verifying: photos match, rooms are clean, the kitchen is safe." />
      <Flash error={q.error} ok={q.ok} />
      <h2 className="mb-3 text-lg font-semibold">Applications</h2>
      {applied.length === 0 ? <Empty title="No pending applications" /> : (
        <div className="space-y-3">
          {applied.map((h) => (
            <Card key={h.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{h.name}</div>
                  <div className="text-sm text-ink-soft">{h.area} · +91 {h.contactPhone} · {h.status}</div>
                </div>
                {h.status === 'live' && <Link href={`/hostels/${h.slug}`} className="text-sm">Public page</Link>}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <form action={verifyPartnerAction} className="flex items-center gap-2">
                  <Back to={path} /><input type="hidden" name="hostelId" value={h.id} />
                  <span className="text-sm">Fee %</span>
                  <Input type="number" name="platformFeePct" min={0} max={50} step="0.5" defaultValue={DEFAULT_PLATFORM_FEE_PCT} className="w-20" aria-label="Platform fee percent" />
                  <SubmitButton>Verify</SubmitButton>
                </form>
                <form action={rejectPartnerAction} className="flex flex-1 gap-2">
                  <Back to={path} /><input type="hidden" name="hostelId" value={h.id} />
                  <Input name="reason" aria-label="Reason for not approving (the owner sees this)" required minLength={3} placeholder="Reason (the owner sees this)" />
                  <SubmitButton variant="danger">Decline</SubmitButton>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Verified partners</h2>
      {verified.length === 0 ? <p className="text-sm text-ink-soft">None yet.</p> : (
        <Table head={['Hostel', 'Area', 'Platform fee', '']}>
          {verified.map((h) => (
            <tr key={h.id}>
              <Td className="font-medium"><Link href={`/hostels/${h.slug}`}>{h.name}</Link></Td>
              <Td>{h.area}</Td>
              <Td colSpan={2}>
                <form action={setFeeAction} className="flex items-center gap-2">
                  <Back to={path} /><input type="hidden" name="hostelId" value={h.id} />
                  <Input type="number" name="platformFeePct" min={0} max={50} step="0.5" defaultValue={h.platformFeePct} className="h-8 w-20" aria-label={`Platform fee percent for ${h.name}`} />
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
