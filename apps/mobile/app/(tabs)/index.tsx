import { GENDER_LABEL, GENDER_TYPES, rupees, SHARING_LABEL, SHARING_TYPES, type SearchResult } from '@hostels/shared';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { HostelCard } from '@/components/HostelCard';
import { HostelMap } from '@/components/HostelMap';
import { Chip, Empty, ErrorText, Field, Loading, P, Row, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { activeFilterCount, EMPTY_FILTERS, type Filters, RENT_STEPS, toSearch } from '@/lib/search';
import { theme } from '@/lib/theme';

export default function Explore() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  async function load(pull = false) {
    if (pull) setRefreshing(true);
    try {
      setResult(await api.hostels.search(toSearch(filters)));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload whenever a filter changes
  useEffect(() => {
    load();
  }, [filters]);

  // Debounce typing into the search box.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 350);
    return () => clearTimeout(t);
  }, [query]);

  async function nearMe() {
    if (filters.near) return set({ near: null });
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Allow location access to find hostels near you.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      set({ near: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLocating(false);
    }
  }

  const cycle = <T,>(list: readonly T[], current: T | null): T | null => {
    const i = current === null ? -1 : list.indexOf(current);
    return i + 1 < list.length ? list[i + 1]! : null;
  };

  return (
    <Screen refreshing={refreshing} onRefresh={() => load(true)}>
      <Field label="Search" placeholder="Area or hostel name, e.g. Gachibowli" value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
        <Chip label={locating ? 'Locating…' : 'Near me'} active={!!filters.near} onPress={nearMe} />
        <Chip label="Verified, no advance" active={filters.verified} onPress={() => set({ verified: !filters.verified })} />
        <Chip label="Food" active={filters.food} onPress={() => set({ food: !filters.food })} />
        <Chip label={filters.gender ? GENDER_LABEL[filters.gender] : 'Boys / girls'} active={!!filters.gender} onPress={() => set({ gender: cycle(GENDER_TYPES, filters.gender) })} />
        <Chip label={filters.sharing ? SHARING_LABEL[filters.sharing] : 'Sharing'} active={!!filters.sharing} onPress={() => set({ sharing: cycle(SHARING_TYPES, filters.sharing) })} />
        <Chip label={filters.maxRent ? `Under ${rupees(filters.maxRent)}` : 'Budget'} active={!!filters.maxRent} onPress={() => set({ maxRent: cycle(RENT_STEPS, filters.maxRent as (typeof RENT_STEPS)[number] | null) })} />
        {activeFilterCount(filters) > 0 && <Chip label="Clear" onPress={() => { setFilters(EMPTY_FILTERS); setQuery(''); }} />}
      </ScrollView>
      <Row style={{ justifyContent: 'space-between' }}>
        <P muted>{result ? `${result.total} hostel${result.total === 1 ? '' : 's'}` : ' '}</P>
        <View style={{ width: 160 }}>
          <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />
        </View>
      </Row>
      <ErrorText>{error}</ErrorText>
      {!result ? (
        <Loading />
      ) : result.items.length === 0 ? (
        <Empty title="No hostels match">Try fewer filters or a nearby area.</Empty>
      ) : view === 'map' ? (
        <HostelMap hostels={result.items} center={filters.near ?? undefined} />
      ) : (
        result.items.map((h) => <HostelCard key={h.id} h={h} />)
      )}
    </Screen>
  );
}
