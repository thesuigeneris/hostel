import { type Area, GENDER_LABEL, GENDER_TYPES, type HostelSummary, rupees, SHARING_LABEL, SHARING_TYPES, type Suggestion, suggestionDetail } from '@hostels/shared';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { HostelCard } from '@/components/HostelCard';
import { HostelMap } from '@/components/HostelMap';
import { Button, Card, Chip, Empty, ErrorState, ErrorText, Field, Loading, P, Row, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { activeFilterCount, EMPTY_FILTERS, type Filters, hasMore, parseRent, type Relaxation, RENT_STEPS, relaxations, rentInverted, SORTS, toSearch } from '@/lib/search';
import { applySuggestion, latestOnly, SUGGEST_DEBOUNCE_MS, suggestQuery } from '@/lib/suggest';
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [widen, setWiden] = useState<(Relaxation & { count: number })[]>([]);
  // One counter for searches and "show more", one for suggestions: a slow, older answer never overwrites a newer one.
  const searches = useRef(latestOnly()).current;
  const suggests = useRef(latestOnly()).current;

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  async function load(pull = false) {
    const mine = searches.next();
    if (pull) setRefreshing(true);
    try {
      const r = await api.hostels.search(toSearch(filters));
      if (!searches.isCurrent(mine)) return;
      setResult({ items: r.items, total: r.total, page: r.page });
      setError(null);
    } catch (e) {
      if (searches.isCurrent(mine)) setError(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMore() {
    if (!result) return;
    // A filter change while this page loads starts a new search, and this page belongs to the old one.
    const mine = searches.next();
    setLoadingMore(true);
    try {
      const r = await api.hostels.search(toSearch(filters, result.page + 1));
      if (!searches.isCurrent(mine)) return;
      setResult({ items: [...result.items, ...r.items.filter((h) => !result.items.some((x) => x.id === h.id))], total: r.total, page: r.page });
    } catch (e) {
      if (searches.isCurrent(mine)) setError(errorMessage(e));
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

  // Areas and hostel names for what is typed so far.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the counter is stable
  useEffect(() => {
    const q = suggestQuery(query);
    const mine = suggests.next();
    if (!q) return setSuggestions([]);
    const t = setTimeout(() => {
      api.hostels
        .suggest(q)
        .then((r) => suggests.isCurrent(mine) && setSuggestions(r.items))
        .catch(() => suggests.isCurrent(mine) && setSuggestions([]));
    }, SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Nothing found: count what each single relaxed filter would find, and offer the ones that find something.
  // biome-ignore lint/correctness/useExhaustiveDependencies: recount when the results change
  useEffect(() => {
    setWiden([]);
    if (!result || result.items.length) return;
    const options = relaxations(filters);
    if (!options.length) return;
    let live = true;
    Promise.all(
      options.map((o) =>
        api.hostels
          .search({ ...toSearch({ ...filters, ...o.patch }), limit: 1 })
          .then((r) => ({ ...o, count: r.total }))
          .catch(() => ({ ...o, count: 0 })),
      ),
    ).then((counted) => live && setWiden(counted.filter((c) => c.count > 0).sort((a, b) => b.count - a.count)));
    return () => {
      live = false;
    };
  }, [result]);

  function pick(s: Suggestion) {
    const next = applySuggestion(s, filters);
    setSuggestions([]);
    if ('open' in next) return router.push(next.open as never);
    setQuery('');
    setFilters(next.filters);
  }

  function relax(r: Relaxation) {
    if ('q' in r.patch) setQuery('');
    if ('minRent' in r.patch) setMinText('');
    if ('maxRent' in r.patch) setMaxText('');
    set(r.patch);
  }

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
  const count = activeFilterCount(filters) + (filters.q.trim() ? 1 : 0);
  const extra = [filters.area, filters.minRent, filters.maxRent, filters.sort !== 'recommended'].filter(Boolean).length;
  const showSuggestions = searchFocused && suggestions.length > 0;

  return (
    <Screen refreshing={refreshing} onRefresh={() => load(true)}>
      <View style={{ gap: theme.spacing.xs }}>
        <Field
          label="Search"
          placeholder="Area or hostel name"
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityHint="Suggestions for areas and hostel names appear below as you type"
        />
        {showSuggestions && (
          <Card style={{ padding: theme.spacing.xs, gap: 0 }}>
            {suggestions.map((s) => (
              <Pressable
                key={`${s.kind}-${s.slug}`}
                accessibilityRole="button"
                accessibilityLabel={`${s.label}, ${suggestionDetail(s)}`}
                onPress={() => pick(s)}
                style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.sm, backgroundColor: pressed ? theme.colors.brandSoft : 'transparent' })}
              >
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>{s.label}</Text>
                <Text style={{ fontSize: 12, color: theme.colors.soft }}>{suggestionDetail(s)}</Text>
              </Pressable>
            ))}
          </Card>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.spacing.sm }}>
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
        <View style={{ gap: theme.spacing.md }}>
          <Empty title="No hostels match">
            {rentInverted(filters)
              ? '“From” is higher than “Up to”. Swap them, or clear one.'
              : widen.length
                ? 'Each of these changes finds hostels:'
                : count
                  ? 'Try fewer filters, another area or a wider rent range.'
                  : 'There are no live listings here yet.'}
          </Empty>
          {widen.length > 0 && (
            <Row>
              {widen.map((w) => <Chip key={w.key} label={`${w.label} · ${w.count}`} onPress={() => relax(w)} />)}
            </Row>
          )}
          {count > 0 && <Button variant="secondary" title="Clear all filters" onPress={clear} />}
        </View>
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
