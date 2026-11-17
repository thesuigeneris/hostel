import type { Metadata } from 'next';
import { deleteAccountAction } from '@/app/account/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Card, Field, Flash, Input, LinkButton, PageHeader } from '@/components/ui';
import { api, requireUser } from '@/lib/api';

export const metadata: Metadata = { title: 'Delete my account', robots: { index: false } };

type Props = { searchParams: Promise<{ error?: string }> };

/** Deleting an account (DPDP Act 2023, spec docs/superpowers/specs/2026-11-13-account-deletion-and-export.md). */
export default async function DeleteAccountPage({ searchParams }: Props) {
  const q = await searchParams;
  const user = await requireUser('/account/delete');
  const status = await (await api()).me.deletionStatus();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader title="Delete my account" subtitle="This can't be undone. Download a copy of your data first if you want one." />
      <Flash error={q.error} />
      <Card className="space-y-3 text-sm">
        <h2 className="font-semibold">What happens</h2>
        <ul className="list-disc space-y-1 pl-5 text-ink-soft">
          <li>Your name, phone number, email and password are erased, and you're signed out everywhere.</li>
          <li>Your posts, replies and likes on hostel boards, and your visit requests, are deleted.</li>
          <li>Reviews and issues you wrote stay on the hostel's record, without your name: other residents rely on them.</li>
          <li>Bills and payments are kept, without your name or number, for as long as the law requires.</li>
          <li>You can sign up again with the same number later; it will be a new, empty account.</li>
        </ul>
        <LinkButton href="/account/export" variant="secondary" size="sm">Download my data</LinkButton>
      </Card>

      {status.canDelete ? (
        <form action={deleteAccountAction} className="mt-6">
          <Card className="space-y-4 border-danger">
            <Field label="Type DELETE to confirm">
              <Input name="confirm" required autoComplete="off" pattern="DELETE" maxLength={20} />
            </Field>
            {user.hasPassword && (
              <>
                <input type="hidden" name="username" autoComplete="username" value={user.phone} readOnly />
                <Field label="Your password">
                  <Input type="password" name="password" autoComplete="current-password" required maxLength={128} />
                </Field>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="danger" pendingText="Deleting…">Delete my account</SubmitButton>
              <LinkButton href="/account" variant="ghost">Keep my account</LinkButton>
            </div>
          </Card>
        </form>
      ) : (
        <Card className="mt-6 text-sm">
          <h2 className="font-semibold">You can't delete your account yet</h2>
          <p role="note" className="mt-1 text-ink-soft">{status.reason}</p>
          <LinkButton href="/account" variant="secondary" size="sm" className="mt-3">Back to my account</LinkButton>
        </Card>
      )}
    </div>
  );
}
