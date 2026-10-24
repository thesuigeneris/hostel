import { dateLabel, FOOD_PLANS, GENDER_LABEL, type HostelDetail, istDate, MEALS, type MenuWeek, monthLabel, type MyResidency, type Review, reviewSource, rupees, SHARING_LABEL, weekday } from '@hostels/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { DateChips } from '@/components/DateChips';
import { Gallery } from '@/components/Gallery';
import { HostelMap } from '@/components/HostelMap';
import { Badge, Button, Card, Empty, ErrorState, ErrorText, Field, H1, H2, Loading, Notice, P, Row, Screen, Stars } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { dateProblem } from '@/lib/dates';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Data = { h: HostelDetail; reviews: Review[]; menu: MenuWeek | null; stay: MyResidency | null };
const REVIEW_PAGE = 20;

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ minWidth: '45%', flexGrow: 1 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text }}>{value}</Text>
      <P muted>{label}</P>
    </View>
  );
}

export default function HostelScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const { data, error, loading, refreshing, refresh, reload, setData } = useLoad<Data>(async () => {
    const h = await api.hostels.get(slug);
    const [reviews, menu, stays] = await Promise.all([
      api.hostels.reviews(slug).catch(() => []),
      h.isVerified ? api.hostels.menu(slug).catch(() => null) : null,
      user ? api.me.residencies().catch(() => []) : [],
    ]);
    return { h, reviews, menu, stay: stays.find((s) => s.hostel.id === h.id && s.status !== 'declined') ?? null };
  }, [slug, user?.id]);
  const today = istDate();
  const [visitDate, setVisitDate] = useState(today);
  const [note, setNote] = useState('');
  const [visitMsg, setVisitMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moreReviews, setMoreReviews] = useState(true);

  if (loading) return <Loading />;
  if (!data) return <Screen onRefresh={refresh} refreshing={refreshing}><ErrorState message={error} onRetry={reload} title="Couldn't load this hostel" /></Screen>;
  const { h, reviews, menu, stay } = data;
  const minRent = h.roomTypes.length ? Math.min(...h.roomTypes.map((r) => r.monthlyRent)) : null;
  const days = menu ? [...new Set(menu.items.map((i) => i.date))] : [];
  // Reviews come 20 to a page; a full last page means there may be more.
  const canMoreReviews = moreReviews && reviews.length > 0 && reviews.length % REVIEW_PAGE === 0;
  const login = (next: string, role?: 'owner') => router.push({ pathname: '/login', params: role ? { next, role } : { next } });

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setErr(null);
    setOk(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const requestVisit = () => {
    if (!user) return login(`/hostel/${slug}`);
    const problem = dateProblem(visitDate, today);
    if (problem) return setErr(problem);
    run('visit', async () => {
      await api.hostels.requestVisit(h.id, { preferredDate: visitDate, message: note.trim() });
      setVisitMsg(`Visit requested for ${dateLabel(visitDate)}. The hostel will call you to confirm. You can see it under Profile.`);
    });
  };

  const loadMoreReviews = () =>
    run('reviews', async () => {
      const next = await api.hostels.reviews(slug, reviews.length / REVIEW_PAGE + 1);
      if (next.length < REVIEW_PAGE) setMoreReviews(false);
      setData({ ...data, reviews: [...reviews, ...next.filter((n) => !reviews.some((r) => r.id === n.id))] });
    });

  const flag = (r: Review) =>
    confirm('Report this review?', 'Our team checks reported reviews and hides ones that are abusive, share personal details or are off-topic.', () =>
      run(`flag${r.id}`, async () => {
        await api.hostels.flagReview(r.id, 'Reported from the app');
        setOk('Thanks, our team will take a look.');
      }), 'Report');

  return (
    <Screen refreshing={refreshing} onRefresh={() => { setMoreReviews(true); refresh(); }} padded={false}>
      <Stack.Screen options={{ title: h.name }} />
      <Gallery photos={h.photos} name={h.name} />
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.sm }}>
          <Row>
            {h.isVerified ? <Badge label="✓ Verified partner · No advance" tone="green" /> : <Badge label="Free listing" />}
            <Badge label={GENDER_LABEL[h.genderType]} />
            {h.foodAvailable && <Badge label="Food available" tone="food" />}
          </Row>
          <H1>{h.name}</H1>
          <P muted>{h.address || h.area}</P>
          <Row><Stars value={h.ratings.rating} />{h.ratings.reviewCount > 0 && <P muted>({h.ratings.reviewCount} verified reviews)</P>}</Row>
          {h.description ? <P>{h.description}</P> : null}
        </View>

        <ErrorText>{err}</ErrorText>
        <Notice>{ok}</Notice>

        {stay && (
          <Card tone="brand">
            <P>{stay.status === 'invited' ? 'This hostel added you as a resident.' : stay.status === 'active' ? 'You live here.' : 'You lived here.'}</P>
            <Row>
              <Button small title={stay.status === 'invited' ? 'Answer the invite' : 'Hostel life'} onPress={() => router.push(`/home/${h.id}`)} />
              {stay.canReview && <Button small variant="secondary" title={stay.hasReview ? 'Edit your review' : 'Write a review'} onPress={() => router.push({ pathname: '/home/[hostelId]', params: { hostelId: h.id, tab: 'review' } })} />}
            </Row>
          </Card>
        )}

        <Card>
          <P muted>From</P>
          <Text style={{ fontSize: 26, fontWeight: '700', color: theme.colors.text }}>{rupees(minRent)}<Text style={{ fontSize: 14, fontWeight: '400', color: theme.colors.muted }}> /month</Text></Text>
          {h.isVerified ? (
            <>
              <P>One bill for bed and food. Food plans from {rupees(FOOD_PLANS['two-meals'].price)}. No advance. Move or cancel anytime.</P>
              <Button title="Subscribe" onPress={() => (user ? router.push(`/subscribe/${slug}`) : login(`/subscribe/${slug}`))} />
            </>
          ) : visitMsg ? (
            <Notice>{visitMsg}</Notice>
          ) : (
            <>
              <Text style={{ fontWeight: '700', color: theme.colors.text }}>Request a visit</Text>
              <DateChips label="Preferred date" from={today} value={visitDate} onChange={setVisitDate} />
              <Field label="Note for the owner" value={note} onChangeText={setNote} placeholder="Evening after 6 works best" maxLength={500} multiline />
              <Button title={user ? 'Request visit' : 'Log in to request a visit'} onPress={requestVisit} busy={busy === 'visit'} />
            </>
          )}
          <Row>
            <Button small variant="secondary" title="Call" onPress={() => Linking.openURL(`tel:+91${h.contactPhone}`)} />
            <Button small variant="secondary" title="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/91${h.whatsappPhone ?? h.contactPhone}?text=${encodeURIComponent(`Hi, I found ${h.name} on Hostels.`)}`)} />
          </Row>
        </Card>

        <H2>Rooms</H2>
        {h.roomTypes.length === 0 && <P muted>The owner hasn't added rooms yet.</P>}
        {h.roomTypes.map((r) => (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{SHARING_LABEL[r.sharing]}</Text>
              <Text style={{ color: r.bedsAvailable ? theme.colors.brand : theme.colors.muted }}>{r.bedsAvailable ? `${r.bedsAvailable} of ${r.totalBeds} beds free` : 'Full'}</Text>
            </Row>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text }}>{rupees(r.monthlyRent)} <Text style={{ fontSize: 13, fontWeight: '400', color: theme.colors.muted }}>/bed /month</Text></Text>
            <P muted>{r.advanceAmount ? `Advance ${rupees(r.advanceAmount)}` : 'No advance'}</P>
          </Card>
        ))}

        {h.amenities.length > 0 && (<><H2>Amenities</H2><Row>{h.amenities.map((a) => <Badge key={a} label={a} />)}</Row></>)}
        {h.rules.length > 0 && (<><H2>House rules</H2>{h.rules.map((r) => <P key={r}>• {r}</P>)}</>)}

        {menu && (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <H2>This week's menu</H2>
              {menu.theme ? <Badge label={menu.theme} tone="food" /> : null}
            </Row>
            {days.map((d) => (
              <Card key={d} tone={d === today ? 'brand' : undefined}>
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>{weekday(d)}{d === today ? ' · today' : ''}</Text>
                {MEALS.map((m) => {
                  const it = menu.items.find((i) => i.date === d && i.meal === m);
                  return it ? (
                    <View key={m}>
                      <P><Text style={{ textTransform: 'capitalize', fontWeight: '600' }}>{m}</Text>: {it.vegDish}</P>
                      {it.nonVegDish ? <Text style={{ color: theme.colors.danger, fontSize: 12 }}>Non-veg: {it.nonVegDish}</Text> : null}
                      {it.foodPartnerId ? <Text style={{ color: theme.colors.food, fontSize: 12 }}>Partner meal</Text> : null}
                    </View>
                  ) : null;
                })}
              </Card>
            ))}
          </>
        )}

        <H2>Location</H2>
        <HostelMap hostels={[{ id: h.id, slug: h.slug, name: h.name, lat: h.lat, lng: h.lng, isVerified: h.isVerified, minRent }]} height={220} />
        <Button small variant="secondary" title="Directions" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`)} />

        <H2>How residents rate it</H2>
        {h.ratings.reviewCount ? (
          <Row>
            {([['Overall', h.ratings.rating], ['Clean', h.ratings.cleanliness], ['Food', h.ratings.food], ['Safety', h.ratings.safety], ['Owner', h.ratings.responsiveness]] as const).map(([label, v]) => (
              <Card key={label} style={{ alignItems: 'center', minWidth: 72, padding: 10 }}>
                <Text style={{ fontWeight: '700', fontSize: 17, color: theme.colors.text }}>{v ?? '—'}</Text>
                <P muted>{label}</P>
              </Card>
            ))}
          </Row>
        ) : (
          <P muted>No reviews yet. Only people who lived here for at least two weeks can review.</P>
        )}
        {h.transparency && (
          <Card tone="brand">
            <Text style={{ fontWeight: '600', color: theme.colors.text }}>Issue record, last {h.transparency.windowDays} days</Text>
            <Row style={{ rowGap: theme.spacing.sm }}>
              <Stat value={h.transparency.reported} label="issues reported" />
              <Stat value={`${h.transparency.resolvedPct}%`} label="resolved" />
              <Stat value={`${h.transparency.medianHoursToFirstResponse ?? '—'} h`} label="median first response" />
              <Stat value={`${h.transparency.medianHoursToResolve ?? '—'} h`} label="median time to fix" />
            </Row>
            <P muted>Reported by residents in the Hostels app. Issue details stay private to residents and the hostel.</P>
          </Card>
        )}
        {reviews.length === 0 && h.ratings.reviewCount === 0 ? <Empty title="Be the first to review after you move in" /> : null}
        {reviews.map((r) => {
          const src = reviewSource(r.verifiedVia);
          return (
            <Card key={r.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>{r.author}</Text>
                <Stars value={r.rating} />
              </Row>
              <Row>
                <Badge label={src.label} tone={src.strong ? 'green' : 'gray'} />
                {r.stay && <P muted>Lived here {monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'}</P>}
              </Row>
              <P>{r.body}</P>
              {r.ownerReply && (
                <View style={{ backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm, padding: theme.spacing.md }}>
                  <P><Text style={{ fontWeight: '600', color: theme.colors.text }}>Reply from the hostel:</Text> {r.ownerReply}</P>
                </View>
              )}
              {user && (
                <Pressable accessibilityRole="button" onPress={() => flag(r)} hitSlop={8} disabled={busy === `flag${r.id}`}>
                  <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Report this review</Text>
                </Pressable>
              )}
            </Card>
          );
        })}
        {canMoreReviews && <Button variant="secondary" title="More reviews" busy={busy === 'reviews'} onPress={loadMoreReviews} />}

        <P muted>
          Listed {dateLabel(h.createdAt)}. {h.isVerified ? 'Verified by the Hostels team.' : 'Free listing: terms and advance are set by the owner.'}
        </P>
        {!user && <Button small variant="ghost" title="Own this hostel? Log in as an owner" onPress={() => login('/', 'owner')} />}
      </View>
    </Screen>
  );
}
