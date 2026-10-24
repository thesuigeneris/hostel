import { Redirect, useLocalSearchParams } from 'expo-router';
import { Empty, ErrorState, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';

/** Same link as the website's area pages (/hostels-in/<area>): opens Explore filtered to that area. */
export default function AreaLink() {
  const { area } = useLocalSearchParams<{ area: string }>();
  const { data: areas, error, loading, reload } = useLoad(() => api.hostels.areas(), [area]);
  if (loading) return <Loading />;
  if (!areas) return <Screen><ErrorState message={error} onRetry={reload} /></Screen>;
  const match = areas.find((a) => a.slug === area);
  if (!match) return <Screen><Empty title="We don't list hostels in this area yet">Try Explore to see every area.</Empty></Screen>;
  return <Redirect href={{ pathname: '/', params: { area: match.area } }} />;
}
