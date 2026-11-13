import type { Metadata } from 'next';
import { Card, LinkButton, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Account deleted', robots: { index: false } };

/** Where deleting an account lands: the person is signed out, so this page needs no session. */
export default function AccountDeletedPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader title="Your account is deleted" subtitle="Thank you for using Hostels." />
      <Card className="text-sm text-ink-soft">
        <p>
          Your name, number and email are erased and you're signed out everywhere. Reviews and issues you wrote stay on the hostels' records
          without your name, and bills are kept as the law requires.
        </p>
        <LinkButton href="/hostels" variant="secondary" size="sm" className="mt-3">Find a hostel</LinkButton>
      </Card>
    </div>
  );
}
