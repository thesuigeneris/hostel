import {
  dateLabel,
  EDITED_AFTER_REPLY,
  FOOD_PLANS,
  GENDER_LABEL,
  type HostelDetail,
  hoursLabel,
  istDate,
  MEALS,
  type MenuWeek,
  monthLabel,
  type MyResidency,
  type MyVisit,
  newRatingLabel,
  PARTNER_STANDARDS,
  RATING_NEW_NOTE,
  ratingView,
  REVIEW_FLAG_REASONS,
  REVIEW_MIN_STAY_DAYS,
  type Review,
  reviewEdits,
  reviewSource,
  rupees,
  SHARING_LABEL,
  timeAgo,
  TRANSPARENCY_HIDDEN_NOTE,
  weekday,
} from '@hostels/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { DateChips } from '@/components/DateChips';
import { Gallery } from '@/components/Gallery';
import { HostelMap } from '@/components/HostelMap';
import { Rating } from '@/components/Rating';
import { Badge, Button, Card, Chip, Empty, ErrorState, ErrorText, Field, H1, H2, Loading, Notice, P, Row, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateProblem } from '@/lib/dates';
import { theme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Data = { h: HostelDetail; reviews: Review[]; menu: MenuWeek | null; stay: MyResidency | null; openVisit: MyVisit | null };
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
    const [reviews, menu, stays, visits] = await Promise.all([
      api.hostels.reviews(slug).catch(() => []),
      h.isVerified ? api.hostels.menu(slug).catch(() => null) : null,
      user ? api.me.residencies().catch(() => []) : [],
      user ? api.me.visits().catch(() => []) : [],
    ]);
    return {
      h,
      reviews,
      menu,
      stay: stays.find((s) => s.hostel.id === h.id && s.status !== 'declined') ?? null,
      // One waiting request per hostel: when there is one, it replaces the form.
      openVisit: visits.find((v) => v.hostelId === h.id && v.status === 'new') ?? null,
    };
  }, [slug, user?.id]);
  const today = istDate();
  const [visitDate, setVisitDate] = useState(today);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moreReviews, setMoreReviews] = useState(true);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState<string>(REVIEW_FLAG_REASONS[0]);

  if (loading) return <Loading />;
  if (!data) return <Screen onRefresh={refresh} refreshing={refreshing}><ErrorState message={error} onRetry={reload} title="Couldn't load this hostel" /></Screen>;
  const { h, reviews, menu, stay, openVisit } = data;
  const minRent = h.roomTypes.length ? Math.min(...h.roomTypes.map((r) => r.monthlyRent)) : null;
  const days = menu ? [...new Set(menu.items.map((i) => i.date))] : [];
  // Reviews come 20 to a page; a full last page means there may be more.
  const canMoreReviews = moreReviews && reviews.length > 0 && reviews.length % REVIEW_PAGE === 0;
  const login = (next: string, role?: 'owner') => router.push({ pathname: '/login', params: role ? { next, role } : { next } });
  const isOwn = !!user && user.id === h.ownerId;
  const rated = ratingView(h.ratings.rating, h.ratings.reviewCount);
  const checks = PARTNER_STANDARDS.filter((s) => h.partnerCheck?.checks.includes(s.id));

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
      const v = await api.hostels.requestVisit(h.id, { preferredDate: visitDate, message: note.trim() });
      setOk(`Visit requested for ${dateLabel(visitDate)}. The hostel will call you to confirm.`);
      setData({ ...data, openVisit: { ...v, hostel: { name: h.name, slug: h.slug } } });
    });
  };

  const loadMoreReviews = () =>
    run('reviews', async () => {
      const next = await api.hostels.reviews(slug, reviews.length / REVIEW_PAGE + 1);
      if (next.length < REVIEW_PAGE) setMoreReviews(false);
      setData({ ...data, reviews: [...reviews, ...next.filter((n) => !reviews.some((r) => r.id === n.id))] });
    });

  const sendReport = (r: Review) =>
    run(`flag${r.id}`, async () => {
      await api.hostels.flagReview(r.id, reason);
      setReporting(null);
      setOk('Thanks, our team will take a look.');
    });

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
          <Row><Rating rating={h.ratings.rating} count={h.ratings.reviewCount} />{rated.kind === 'rated' && <P muted>verified reviews</P>}</Row>
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
          {minRent === null ? (
            <P>Rooms and rent are not listed yet. Call the hostel to ask.</P>
          ) : (
            <>
              <P muted>From</P>
              <Text style={{ fontSize: 26, fontWeight: '700', color: theme.colors.text }}>{rupees(minRent)}<Text style={{ fontSize: 14, fontWeight: '400', color: theme.colors.muted }}> /month</Text></Text>
            </>
          )}
          {h.isVerified ? (
            <>
              <P>One bill for bed and food. Food plans from {rupees(FOOD_PLANS['two-meals'].price)}. No advance. Move or cancel anytime.</P>
              {isOwn ? (
                // Owners can take a plan anywhere except at their own hostel; the API refuses it too.
                <Notice>You own this hostel, so you can’t take a plan here.</Notice>
              ) : (
                <Button title="Subscribe" onPress={() => (user ? router.push(`/subscribe/${slug}`) : login(`/subscribe/${slug}`))} />
              )}
            </>
          ) : isOwn ? (
            <Notice>This is your hostel. Visitors request visits here, and you answer them from your visit inbox.</Notice>
          ) : openVisit ? (
            <Notice>{`Visit requested for ${dateLabel(openVisit.preferredDate)}. The hostel will call you to confirm. You can withdraw it under Profile.`}</Notice>
          ) : user ? (
            <>
              <Text style={{ fontWeight: '700', color: theme.colors.text }}>Request a visit</Text>
              <P muted>The hostel gets your request and calls you to confirm a time. Nothing is booked or paid yet.</P>
              <DateChips label="Preferred date" from={today} value={visitDate} onChange={setVisitDate} />
              <Field label="Note for the owner" value={note} onChangeText={setNote} placeholder="Evening after 6 works best" maxLength={500} multiline />
              <Button title="Request visit" onPress={requestVisit} busy={busy === 'visit'} />
            </>
          ) : (
            <Button title="Log in to request a visit" onPress={() => login(`/hostel/${slug}`)} />
          )}
          <Row>
            <Button small variant="secondary" title="Call" onPress={() => Linking.openURL(`tel:+91${h.contactPhone}`)} />
            <Button small variant="secondary" title="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/91${h.whatsappPhone ?? h.contactPhone}?text=${encodeURIComponent(`Hi, I found ${h.name} on Hostels.`)}`)} />
          </Row>
        </Card>

        <H2>Rooms</H2>
        {h.roomTypes.length === 0 && <P muted>The hostel hasn't listed its rooms and rent yet. Call or message them to ask.</P>}
        {h.roomTypes.map((r) => (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', color: theme.colors.text }}>{SHARING_LABEL[r.sharing]}</Text>
              <Text style={{ color: r.bedsAvailable ? theme.colors.brand : theme.colors.muted }}>{r.bedsAvailable ? `${r.bedsAvailable} of ${r.totalBeds} beds free` : 'Full'}</Text>
            </Row>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text }}>{rupees(r.monthlyRent)} <Text style={{ fontSize: 13, fontWeight: '400', color: theme.colors.muted }}>/bed /month</Text></Text>
            <P muted>{r.advanceAmount ? `Advance ${rupees(r.advanceAmount)}` : 'No advance'}</P>
            <Text style={{ fontSize: 12, color: theme.colors.muted }}>{r.bedsUpdatedAt ? `Beds updated ${timeAgo(r.bedsUpdatedAt)}` : 'Bed update time not recorded'}</Text>
          </Card>
        ))}
        <P muted>{h.isVerified ? 'Free beds change when residents subscribe or leave through Hostels, and when the hostel edits its rooms.' : 'Free beds are entered by the hostel. Call to confirm before you visit.'}</P>

        {h.isVerified ? (
          <Card>
            <Text style={{ fontWeight: '700', color: theme.colors.text }}>What “Verified partner” means here</Text>
            {checks.length ? (
              <>
                <P>Our team visited{h.partnerCheck?.checkedOn ? ` and verified the hostel on ${dateLabel(h.partnerCheck.checkedOn)}` : ''}. They checked that:</P>
                {checks.map((s) => <P key={s.id}>• {s.label}</P>)}
              </>
            ) : (
              <P>Our team verified this hostel before it could take subscriptions. The item-by-item record isn't available for this check.</P>
            )}
            <P>The listing was reviewed before going live, and rent and food are billed through Hostels with no advance.</P>
            <P muted>Not covered: it isn't a government licence or safety certificate, and house rules are written by the hostel. Visit before you move in if you can.</P>
          </Card>
        ) : (
          <P muted>The Hostels team reviewed this listing before it went live, but the hostel is not a verified partner. Rent, advance and terms are agreed directly with the owner.</P>
        )}

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
                      {it.foodPartnerId ? <Text style={{ color: theme.colors.foodInk, fontSize: 12 }}>Partner meal</Text> : null}
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
        {rated.kind === 'rated' ? (
          <Row>
            {([['Overall', h.ratings.rating], ['Clean', h.ratings.cleanliness], ['Food', h.ratings.food], ['Safety', h.ratings.safety], ['Owner', h.ratings.responsiveness]] as const).map(([label, v]) => (
              <Card key={label} style={{ alignItems: 'center', minWidth: 72, padding: 10 }}>
                <Text style={{ fontWeight: '700', fontSize: 17, color: theme.colors.text }}>{v ?? '—'}</Text>
                <P muted>{label}</P>
              </Card>
            ))}
          </Row>
        ) : rated.kind === 'new' ? (
          <P>{newRatingLabel(rated.count)}. {RATING_NEW_NOTE}</P>
        ) : (
          <P muted>No reviews yet. Only people who lived here for at least {REVIEW_MIN_STAY_DAYS} days can review.</P>
        )}
        {h.transparency ? (
          <Card tone="brand">
            <Text style={{ fontWeight: '600', color: theme.colors.text }}>Issue record, last {h.transparency.windowDays} days</Text>
            <Row style={{ rowGap: theme.spacing.sm }}>
              <Stat value={h.transparency.reported} label="issues reported" />
              <Stat value={`${h.transparency.resolvedPct}%`} label="resolved" />
              <Stat value={hoursLabel(h.transparency.medianHoursToFirstResponse)} label="median first response" />
              <Stat value={hoursLabel(h.transparency.medianHoursToResolve)} label="median time to fix" />
            </Row>
            <P muted>Reported by residents in the Hostels app. Issue details stay private to residents and the hostel.</P>
          </Card>
        ) : (
          <Card>
            <Text style={{ fontWeight: '600', color: theme.colors.text }}>Issue record</Text>
            <P muted>{TRANSPARENCY_HIDDEN_NOTE}</P>
          </Card>
        )}
        {reviews.length === 0 && h.ratings.reviewCount === 0 ? <Empty title="Be the first to review after you move in" /> : null}
        {reviews.map((r) => {
          const src = reviewSource(r.verifiedVia);
          return (
            <Card key={r.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600', color: theme.colors.text }}>{r.author}</Text>
                <Text accessibilityLabel={`${r.rating} out of 5`} style={{ fontWeight: '600', color: theme.colors.text }}>{'★'.repeat(r.rating)} {r.rating}/5</Text>
              </Row>
              <Row>
                <Badge label={src.label} tone={src.strong ? 'green' : 'gray'} />
                {r.stay && <P muted>Lived here {monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'}</P>}
              </Row>
              <P>{r.body}</P>
              {r.ownerReply && (
                <View style={{ backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm, padding: theme.spacing.md }}>
                  <P><Text style={{ fontWeight: '600', color: theme.colors.text }}>Reply from the hostel{r.ownerRepliedAt ? ` · ${dateLabel(r.ownerRepliedAt)}` : ''}:</Text> {r.ownerReply}</P>
                  {/* The reply answers an earlier version of the review; say so, so it isn't read out of context. */}
                  {reviewEdits(r).editedAfterReply && <P muted>{EDITED_AFTER_REPLY}.</P>}
                </View>
              )}
              {user && reporting !== r.id && (
                <Pressable accessibilityRole="button" onPress={() => { setReporting(r.id); setReason(REVIEW_FLAG_REASONS[0]); }} hitSlop={12} style={{ minHeight: 24, justifyContent: 'center' }}>
                  <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Report this review</Text>
                </Pressable>
              )}
              {reporting === r.id && (
                <View style={{ gap: theme.spacing.sm }}>
                  <Text style={{ fontWeight: '600', color: theme.colors.text }}>Why are you reporting this review?</Text>
                  <Row>
                    {REVIEW_FLAG_REASONS.map((x) => <Chip key={x} label={x} active={reason === x} onPress={() => setReason(x)} />)}
                  </Row>
                  <P muted>Our team checks reported reviews and hides ones that break the rules. Nothing is hidden until they do.</P>
                  <Row>
                    <Button small title="Send to our team" busy={busy === `flag${r.id}`} onPress={() => sendReport(r)} />
                    <Button small variant="ghost" title="Cancel" onPress={() => setReporting(null)} />
                  </Row>
                </View>
              )}
            </Card>
          );
        })}
        {!user && reviews.length > 0 && (
          <Button small variant="ghost" title="Log in to report a review" onPress={() => login(`/hostel/${slug}`)} />
        )}
        {canMoreReviews && <Button variant="secondary" title="More reviews" busy={busy === 'reviews'} onPress={loadMoreReviews} />}

        <P muted>
          Listed {dateLabel(h.createdAt)}. {h.isVerified ? 'Verified by the Hostels team.' : 'Free listing: terms and advance are set by the owner.'}
        </P>
        {!user && <Button small variant="ghost" title="Own this hostel? Log in as an owner" onPress={() => login('/', 'owner')} />}
      </View>
    </Screen>
  );
}
