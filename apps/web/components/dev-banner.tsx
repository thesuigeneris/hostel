import { createApiClient } from '@hostels/shared';
import { API_URL } from '@/lib/config';

/** Small banner shown when the API runs with stubbed payments / OTP. */
export async function DevBanner() {
  const health = await createApiClient(API_URL)
    .health()
    .catch(() => null);
  if (!health) return <div className="bg-danger px-4 py-1 text-center text-xs text-white">API unreachable at {API_URL}</div>;
  if (health.razorpay === 'live' && health.msg91 === 'live') return null;
  return (
    <div className="bg-food-soft px-4 py-1 text-center text-xs text-food">
      Dev mode — payments {health.razorpay === 'stub' ? 'simulated' : 'live'}, OTP {health.msg91 === 'stub' ? 'is 123456' : 'sent by SMS'}
    </div>
  );
}
