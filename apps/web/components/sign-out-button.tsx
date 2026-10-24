'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui/button';

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await fetch('/api/session', { method: 'DELETE' });
        router.push('/');
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
