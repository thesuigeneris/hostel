import { FOOD_PLANS, type HostelDetail, istDate, MEALS, type MenuWeek, monthLabel, type Review, reviewSource, rupees, SHARING_LABEL, GENDER_LABEL, weekday } from '@hostels/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import { HostelMap } from '@/components/HostelMap';
import { Badge, Button, Card, Empty, ErrorText, Field, H1, H2, Loading, Notice, P, Row, Screen, Stars } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Data = { h: HostelDetail; reviews: Review[]; menu: MenuWeek | null };

export default function HostelScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const { data, error, loading, refreshing, refresh } = useLoad<Data>(async () => {
    const h = await api.hostels.get(slug);
    const [reviews, menu] = await Promise.all([api.hostels.reviews(slug).catch(() => []), h.isVerified ? api.hostels.menu(slug).catch(() => null) : null]);
    return { h, reviews, menu };
  }, [slug]);
  const today = istDate();
  const [visitDate, setVisitDate] = useState(today);
  const [note, setNote] = useState('');
  const [visitMsg, setVisitMsg] = useState<string | null>(null);
  const [visitErr, setVisitErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (!data) return <Screen><ErrorText>{error}</ErrorText></Screen>;
  const { h, reviews, menu } = data;
  const minRent = Math.min(...h.roomTypes.map((r) => r.monthlyRent));
  const days = menu ? [...new Set(menu.items.map((i) => i.date))] : [];

  async function requestVisit() {
    if (!user) return router.push({ pathname: '/login', params: { next: `/hostel/${slug}` } });
    setBusy(true);
    setVisitErr(null);
    try {
      await api.hostels.requestVisit(h.id, { preferredDate: visitDate, message: note });
      setVisitMsg('Visit requested. The hostel will call you to confirm.');
    } catch (e) {
      setVisitErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} padded={false}>
      <Stack.Screen options={{ title: h.name }} />
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {h.photos.map((p) => <Image key={p.id} source={{ uri: p.url }} style={{ width: 360, height: 240 }} accessibilityLabel={h.name} />)}
      </ScrollView>
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

        <Card>
          <P muted>From</P>
          <Text style={{ fontSize: 26, fontWeight: '700', color: theme.colors.text }}>{rupees(minRent)}<Text style={{ fontSize: 14, fontWeight: '400', color: theme.colors.muted }}> /month</Text></Text>
          {h.isVerified ? (
            <>
              <P>One bill for bed and food. Food plans from {rupees(FOOD_PLANS['two-meals'].price)}. No advance. Move or cancel anytime.</P>
              <Button title="Subscribe" onPress={() => (user ? router.push(`/subscribe/${slug}`) : router.push({ pathname: '/login', params: { next: `/subscribe/${slug}` } }))} />
            </>
          ) : visitMsg ? (
            <Notice>{visitMsg}</Notice>
          ) : (
            <>
              <Field label="Visit date (YYYY-MM-DD)" value={visitDate} onChangeText={setVisitDate} autoCapitalize="none" />
              <Field label="Note for the owner" value={note} onChangeText={setNote} placeholder="Evening after 6 works best" maxLength={500} />
              <ErrorText>{visitErr}</ErrorText>
              <Button title={user ? 'Request a visit' : 'Log in to request a visit'} onPress={requestVisit} busy={busy} />
            </>
          )}
          <Row>
            <Button small variant="secondary" title="Call" onPress={() => Linking.openURL(`tel:+91${h.contactPhone}`)} />
            <Button small variant="secondary" title="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/91${h.whatsappPhone ?? h.contactPhone}?text=${encodeURIComponent(`Hi, I found ${h.name} on Hostels.`)}`)} />
          </Row>
        </Card>

        <H2>Rooms</H2>
        {h.roomTypes.map((r) => (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{SHARING_LABEL[r.sharing]}</Text>
              <Text style={{ color: r.bedsAvailable ? theme.colors.brand : theme.colors.muted }}>{r.bedsAvailable ? `${r.bedsAvailable} of ${r.totalBeds} free` : 'Full'}</Text>
            </Row>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text }}>{rupees(r.monthlyRent)} <Text style={{ fontSize: 13, fontWeight: '400', color: theme.colors.muted }}>/bed /month</Text></Text>
            <P muted>{r.advanceAmount ? `Advance ${rupees(r.advanceAmount)}` : 'No advance'}</P>
          </Card>
        ))}

        {h.amenities.length > 0 && (<><H2>Amenities</H2><Row>{h.amenities.map((a) => <Badge key={a} label={a} />)}</Row></>)}
        {h.rules.length > 0 && (<><H2>House rules</H2>{h.rules.map((r) => <P key={r}>• {r}</P>)}</>)}

        {menu && (
          <>
            <H2>This week's menu</H2>
            {menu.theme ? <Badge label={menu.theme} tone="food" /> : null}
            {days.map((d) => (
              <Card key={d} tone={d === today ? 'brand' : undefined}>
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>{weekday(d)}</Text>
                {MEALS.map((m) => {
                  const it = menu.items.find((i) => i.date === d && i.meal === m);
                  return it ? <P key={m}><Text style={{ textTransform: 'capitalize' }}>{m}</Text>: {it.vegDish}{it.nonVegDish ? ` · non-veg: ${it.nonVegDish}` : ''}</P> : null;
                })}
              </Card>
            ))}
          </>
        )}

        <H2>Location</H2>
        <HostelMap hostels={[{ id: h.id, slug: h.slug, name: h.name, lat: h.lat, lng: h.lng, isVerified: h.isVerified, minRent }]} height={220} />

        <H2>How residents rate it</H2>
        {h.ratings.reviewCount ? (
          <Row>
            {([['Clean', h.ratings.cleanliness], ['Food', h.ratings.food], ['Safety', h.ratings.safety], ['Owner', h.ratings.responsiveness]] as const).map(([label, v]) => (
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
            <P>{h.transparency.reported} reported · {h.transparency.resolvedPct}% resolved · first response in {h.transparency.medianHoursToFirstResponse ?? '—'} h (median)</P>
          </Card>
        )}
        {reviews.length === 0 && h.ratings.reviewCount === 0 ? <Empty title="Be the first to review after you move in" /> : null}
        {reviews.map((r) => (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{r.author}</Text>
              <Stars value={r.rating} />
            </Row>
            <Row><Badge label={reviewSource(r.verifiedVia).label} tone={reviewSource(r.verifiedVia).strong ? 'green' : 'gray'} />{r.stay && <P muted>{monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'}</P>}</Row>
            <P>{r.body}</P>
            {r.ownerReply && <P muted>Reply from the hostel: {r.ownerReply}</P>}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
