import { SubmitButton } from '@/components/SubmitButton';
import { Card, Field, Flash, Input, PageHeader, StatusBadge, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';
import { addFoodPartnerAction, toggleFoodPartnerAction } from '../actions';

export default async function AdminFood({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const q = await searchParams;
  const partners = await (await api()).admin.foodPartners();
  return (
    <>
      <PageHeader title="Food partners" subtitle="Cloud kitchens partner hostels can pick for a meal on their menu." />
      <Flash error={q.error} ok={q.ok} />
      <Card className="mb-6">
        <form action={addFoodPartnerAction} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Field label="Name"><Input name="name" required minLength={2} /></Field>
          <Field label="Cuisine"><Input name="cuisine" placeholder="Andhra meals" /></Field>
          <Field label="Logo URL"><Input name="logoUrl" type="url" /></Field>
          <SubmitButton>Add</SubmitButton>
        </form>
      </Card>
      <Table head={['Name', 'Cuisine', 'Status', '']}>
        {partners.map((p) => (
          <tr key={p.id}>
            <Td className="font-medium">{p.name}</Td>
            <Td>{p.cuisine}</Td>
            <Td><StatusBadge status={p.active ? 'active' : 'ended'} /></Td>
            <Td>
              <form action={toggleFoodPartnerAction}>
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.active ? '0' : '1'} />
                <SubmitButton size="sm" variant="secondary">{p.active ? 'Deactivate' : 'Activate'}</SubmitButton>
              </form>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
