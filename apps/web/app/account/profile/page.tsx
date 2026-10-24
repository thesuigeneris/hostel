import { ProfileForm } from '@/components/account/profile-form';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser('/account/profile');
  return (
    <Card className="p-6">
      <ProfileForm user={user} />
    </Card>
  );
}
