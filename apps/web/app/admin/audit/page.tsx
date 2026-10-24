import { AUDIT_ACTIONS, type AuditAction } from '@hostels/shared';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { Empty, Input, PageHeader, Select, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { titleCase } from '@/lib/format';

type Props = { searchParams: Promise<{ action?: string; q?: string; before?: string }> };

const PAGE = 50;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default async function AdminAudit({ searchParams }: Props) {
  const q = await searchParams;
  const action = AUDIT_ACTIONS.includes(q.action as AuditAction) ? (q.action as AuditAction) : undefined;
  const before = q.before && !Number.isNaN(Date.parse(q.before)) ? q.before : undefined;
  const events = await (await api()).admin.audit({ action, q: q.q || undefined, before, limit: PAGE });
  const last = events.at(-1);
  const more = new URLSearchParams(Object.entries({ action, q: q.q, before: last?.createdAt }).filter((e): e is [string, string] => !!e[1]));

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every approval, verification, fee change, payout, moderation and waived bill, with who did it." />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <span className="w-52 flex-none"><Select name="action" defaultValue={action ?? ''} className="h-9" aria-label="Action">
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{titleCase(a.replace('.', ' '))}</option>)}
        </Select></span>
        <span className="w-64 flex-none"><Input name="q" defaultValue={q.q} placeholder="Search text, id or admin name" className="h-9" aria-label="Search" /></span>
        <SubmitButton size="sm" variant="secondary">Filter</SubmitButton>
        {(action || q.q || before) && <Link href="/admin/audit" className="text-sm">Clear</Link>}
      </form>
      {events.length === 0 ? <Empty title="Nothing logged yet" /> : (
        <>
          <Table head={['When', 'Who', 'Action', 'What']}>
            {events.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-ink-soft">{when(e.createdAt)}</Td>
                <Td>{e.actor ? <><div>{e.actor.name || 'Admin'}</div><div className="text-xs text-ink-muted">+91 {e.actor.phone}</div></> : '—'}</Td>
                <Td className="whitespace-nowrap">{titleCase(e.action.replace('.', ' '))}</Td>
                <Td><div>{e.summary}</div><div className="text-xs text-ink-muted">{e.targetType} {e.targetId}</div></Td>
              </tr>
            ))}
          </Table>
          {events.length === PAGE && <div className="mt-4 text-sm"><Link href={`/admin/audit?${more}`}>Older entries →</Link></div>}
        </>
      )}
    </>
  );
}
