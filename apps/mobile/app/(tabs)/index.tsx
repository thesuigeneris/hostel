import { type Area, GENDER_LABEL, GENDER_TYPES, type HostelSummary, rupees, SHARING_LABEL, SHARING_TYPES } from '@hostels/shared';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { HostelCard } from '@/components/HostelCard';
import { HostelMap } from '@/components/HostelMap';
import { Button, Card, Chip, Empty, ErrorState, ErrorText, Field, Loading, P, Row, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { activeFilterCount, EMPTY_FILTERS, type Filters, hasMore, parseRent, RENT_STEPS, SORTS, toSearch } from '@/lib/search';
import { theme } from '@/lib/theme';

type Results = { items: HostelSummary[]; total: number; page: number };

const label = (t: string) => <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>{t}</Text>;

export default function Explore() {
  const params = useLocalSearchParams<{ area?: string; verified?: string }>();
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, area: params.area || null, verified: params.verified === 'true' });
  const [query, setQuery] = useState('');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [more, setMore] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  const [result, setResult] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  async function load(pull = false) {
    const mine = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const r = await api.hostels.search(toSearch(filters));
      // A slower, older search must not overwrite a newer one.
      if (mine !== seq.current) return;
      setResult({ items: r.items, total: r.total, page: r.page });
      setError(null);
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMore() {
    if (!result) return;
    setLoadingMore(true);
    try {
      const r = await api.hostels.search(toSearch(filters, result.page + 1));
      setResult({ items: [...result.items, ...r.items.filter((h) => !result.items.some((x) => x.id === h.id))], total: r.total, page: r.page });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload whenever a filter changes
  useEffect(() => {
    load();
  }, [filters]);

  useEffect(() => {
    api.hostels.areas().then(setAreas).catch(() => undefined);
  }, []);

  // A link such as /hostels-in/<area> opens Explore with that area picked.
  useEffect(() => {
    if (params.area === undefined) return;
    const area = params.area || null;
    setFilters((f) => (f.area === area ? f : { ...f, area }));
  }, [params.area]);
  useEffect(() => {
    if (params.verified === 'true') setFilters((f) => (f.verified ? f : { ...f, verified: true }));
  }, [params.verified]);

  // Debounce typing into the search and rent boxes.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => {
      const minRent = parseRent(minText);
      const maxRent = parseRent(maxText);
      return f.q === query && f.minRent === minRent && f.maxRent === maxRent ? f : { ...f, q: query, minRent, maxRent };
    }), 400);
    return () => clearTimeout(t);
  }, [query, minText, maxText]);

  async function nearMe() {
    if (filters.near) return set({ near: null, sort: filters.sort === 'distance' ? 'recommended' : filters.sort });
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
  const clear = () => {
    setFilters(EMPTY_FILTERS);
    setQuery('');
    setMinText('');
    setMaxText('');
  };
  const count = activeFilterCount(filters);
  const extra = [filters.area, filters.minRent, filters.maxRent, filters.sort !== 'recommended'].filter(Boolean).length;

  return (
    <Screen refreshing={refreshing} onRefresh={() => load(true)}>
      <Field label="Search" placeholder="Hostel name or street" value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
        <Chip label={locating ? 'Locating…' : 'Near me'} active={!!filters.near} onPress={nearMe} />
        <Chip label="Verified, no advance" active={filters.verified} onPress={() => set({ verified: !filters.verified })} />
        <Chip label="Food" active={filters.food} onPress={() => set({ food: !filters.food })} />
        <Chip label="4★ and up" active={filters.topRated} onPress={() => set({ topRated: !filters.topRated })} />
        <Chip label={filters.gender ? GENDER_LABEL[filters.gender] : 'Boys / girls'} active={!!filters.gender} onPress={() => set({ gender: cycle(GENDER_TYPES, filters.gender) })} />
        <Chip label={filters.sharing ? SHARING_LABEL[filters.sharing] : 'Sharing'} active={!!filters.sharing} onPress={() => set({ sharing: cycle(SHARING_TYPES, filters.sharing) })} />
        <Chip label={extra ? `More filters · ${extra}` : 'More filters'} active={more || extra > 0} onPress={() => setMore(!more)} />
        {count > 0 && <Chip label="Clear" onPress={clear} />}
      </ScrollView>

      {more && (
        <Card>
          {label('Area')}
          <Row>
            <Chip label="All areas" active={!filters.area} onPress={() => set({ area: null })} />
            {areas.map((a) => <Chip key={a.slug} label={`${a.area} · ${a.count}`} active={filters.area === a.area} onPress={() => set({ area: filters.area === a.area ? null : a.area })} />)}
          </Row>
          {label('Sort by')}
          <Row>
            {SORTS.filter((s) => s.value !== 'distance' || filters.near).map((s) => (
              <Chip key={s.value} label={s.label} active={(filters.near && filters.sort === 'recommended' ? 'distance' : filters.sort) === s.value} onPress={() => set({ sort: s.value })} />
            ))}
          </Row>
          {label('Rent per month')}
          <Row style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}><Field label="From" value={minText} onChangeText={setMinText} keyboardType="number-pad" placeholder="₹" maxLength={6} /></View>
            <View style={{ flex: 1 }}><Field label="Up to" value={maxText} onChangeText={setMaxText} keyboardType="number-pad" placeholder="₹" maxLength={6} /></View>
          </Row>
          <Row>{RENT_STEPS.map((r) => <Chip key={r} label={`Under ${rupees(r)}`} active={filters.maxRent === r} onPress={() => setMaxText(filters.maxRent === r ? '' : String(r))} />)}</Row>
        </Card>
      )}

      <Row style={{ justifyContent: 'space-between' }}>
        <P muted>{result ? `${result.total} hostel${result.total === 1 ? '' : 's'}${filters.area ? ` in ${filters.area}` : ''}` : ' '}</P>
        <View style={{ width: 160 }}>
          <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />
        </View>
      </Row>
      {result && <ErrorText>{error}</ErrorText>}
      {!result ? (
        error ? <ErrorState message={error} onRetry={() => load()} /> : <Loading />
      ) : result.items.length === 0 ? (
        <Empty title="No hostels match">Try fewer filters, another area or a wider rent range.</Empty>
      ) : view === 'map' ? (
        <HostelMap hostels={result.items} center={filters.near ?? undefined} />
      ) : (
        <>
          {result.items.map((h) => <HostelCard key={h.id} h={h} />)}
          {hasMore(result.items.length, result.total) && (
            <Button variant="secondary" title={`Show more (${result.total - result.items.length} left)`} busy={loadingMore} onPress={loadMore} />
          )}
        </>
      )}
    </Screen>
  );
}
