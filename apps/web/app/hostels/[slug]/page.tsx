import { ApiError, FOOD_PLANS, istDate, MEALS } from '@hostels/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientHostelMap } from '@/components/MapLoader';
import { ReviewCard } from '@/components/Reviews';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge, Card, Field, Flash, Input, LinkButton, Stars, Textarea } from '@/components/ui';
import { api, currentUser, publicApi, SITE_URL } from '@/lib/api';
import { dateLabel, GENDER_LABEL, phoneLink, rupees, SHARING_LABEL, weekday, whatsappLink } from '@/lib/format';
import { requestVisitAction } from './actions';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; ok?: string; reviews?: string }> };

const REVIEWS_PER_PAGE = 20;

/** Median response and fix times read better as "under 1 h" or days than as raw hours. */
function hoursLabel(h: number | null) {
  if (h === null) return '—';
  if (h < 1) return 'under 1 h';
  return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
}

/** The cheapest bed, or null for a listing whose rooms were all removed. */
const cheapest = (rooms: { monthlyRent: number }[]) => (rooms.length ? Math.min(...rooms.map((r) => r.monthlyRent)) : null);

async function load(slug: string) {
  try {
    return await publicApi(30).hostels.get(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const h = await load((await params).slug);
  const minRent = cheapest(h.roomTypes);
  const rating = h.ratings.reviewCount ? ` Rated ${h.ratings.rating}/5 by ${h.ratings.reviewCount} verified residents.` : '';
  const description = `${h.name} in ${h.area}, Hyderabad. ${GENDER_LABEL[h.genderType]} hostel${minRent ? ` from ${rupees(minRent)}/month` : ''}${h.isVerified ? ', no advance' : ''}${h.foodAvailable ? ', food available' : ''}.${rating}`;
  return {
    title: `${h.name}, ${h.area}`,
    description,
    alternates: { canonical: `/hostels/${h.slug}` },
    openGraph: { title: h.name, description, images: h.photos[0] ? [{ url: h.photos[0].url }] : [] },
  };
}

export default async function HostelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const q = await searchParams;
  const [h, user] = await Promise.all([load(slug), currentUser()]);
  const reviewPages = Math.max(1, Math.ceil(h.ratings.reviewCount / REVIEWS_PER_PAGE));
  const reviewPage = Math.min(Math.max(1, Number(q.reviews) || 1), reviewPages);
  const client = user ? await api() : null;
  const [reviews, menu, stays, visits] = await Promise.all([
    publicApi(30).hostels.reviews(slug, reviewPage).catch(() => null),
    h.isVerified ? publicApi(300).hostels.menu(slug).catch(() => null) : Promise.resolve(null),
    client ? client.me.residencies().catch(() => []) : Promise.resolve([]),
    client ? client.me.visits().catch(() => []) : Promise.resolve([]),
  ]);
  const myStay = stays.find((s) => s.hostel.id === h.id && (s.status === 'active' || s.status === 'ended'));
  const openVisit = visits.find((v) => v.hostelId === h.id && v.status === 'new');
  const minRent = cheapest(h.roomTypes);
  const today = istDate();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: h.name,
    description: h.description,
    url: `${SITE_URL}/hostels/${h.slug}`,
    image: h.photos.map((p) => p.url),
    telephone: `+91${h.contactPhone}`,
    address: { '@type': 'PostalAddress', streetAddress: h.address, addressLocality: h.area, addressRegion: 'Telangana', addressCountry: 'IN' },
    geo: { '@type': 'GeoCoordinates', latitude: h.lat, longitude: h.lng },
    ...(minRent ? { priceRange: `₹${minRent}+ per month` } : {}),
    amenityFeature: h.amenities.map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
    ...(h.ratings.reviewCount
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: h.ratings.rating, reviewCount: h.ratings.reviewCount, bestRating: 5 } }
      : {}),
    ...(reviews?.length
      ? {
          review: reviews.slice(0, 5).map((r) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: r.author },
            datePublished: r.createdAt.slice(0, 10),
            reviewBody: r.body,
            reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
          })),
        }
      : {}),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD for search engines, built from escaped JSON */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Flash error={q.error} ok={q.ok} />
      {myStay && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-brand bg-brand-soft/40 p-4">
          <div className="text-sm">{myStay.status === 'active' ? 'You live here.' : 'You lived here.'} Residents can report issues, talk to neighbours and review their stay.</div>
          <LinkButton href={`/stay/${h.id}`} size="sm">{myStay.status === 'active' ? 'Open my hostel' : 'Review your stay'}</LinkButton>
        </Card>
      )}
      {h.photos.length > 0 ? (
        <div className="grid gap-2 overflow-hidden rounded-2xl sm:grid-cols-3 sm:grid-rows-2">
          {h.photos.slice(0, 3).map((p, i) => (
            <img key={p.id} src={p.url} alt={`${h.name}, view ${i + 1}`} className={`h-full w-full object-cover ${i === 0 ? 'aspect-[4/3] sm:col-span-2 sm:row-span-2' : 'hidden aspect-[4/3] sm:block'}`} />
          ))}
        </div>
      ) : (
        <div className="grid aspect-[3/1] place-items-center rounded-2xl bg-brand-soft text-sm text-ink-muted">No photos yet</div>
      )}
      {h.photos.length > 1 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-brand">See all {h.photos.length} photos</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {h.photos.map((p, i) => (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer">
                <img src={p.url} alt={`${h.name}, view ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
              </a>
            ))}
          </div>
        </details>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {h.isVerified ? <Badge tone="green">✓ Verified partner · No advance</Badge> : <Badge>Free listing</Badge>}
              <Badge>{GENDER_LABEL[h.genderType]}</Badge>
              {h.foodAvailable && <Badge tone="food">Food available</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{h.name}</h1>
            <p className="mt-1 text-ink-soft">{h.address}</p>
            <div className="mt-2"><Stars value={h.ratings.rating} /> {h.ratings.reviewCount > 0 && <span className="text-sm text-ink-muted">({h.ratings.reviewCount} verified reviews)</span>}</div>
            <p className="mt-4 whitespace-pre-line text-ink-soft">{h.description}</p>
          </div>

          <section>
            <h2 className="text-xl font-semibold">Rooms</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {h.roomTypes.map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="font-medium">{SHARING_LABEL[r.sharing]}</div>
                    <div className={r.bedsAvailable > 0 ? 'text-sm text-brand' : 'text-sm text-ink-muted'}>{r.bedsAvailable > 0 ? `${r.bedsAvailable} of ${r.totalBeds} beds free` : 'Full'}</div>
                  </div>
                  <div className="mt-2 text-xl font-semibold">{rupees(r.monthlyRent)}<span className="text-sm font-normal text-ink-muted"> /bed /month</span></div>
                  <div className="text-sm text-ink-soft">{r.advanceAmount ? `Advance ${rupees(r.advanceAmount)}` : 'No advance'}</div>
                </Card>
              ))}
            </div>
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-xl font-semibold">Amenities</h2>
              <ul className="mt-3 flex flex-wrap gap-2">{h.amenities.map((a) => <li key={a}><Badge>{a}</Badge></li>)}</ul>
            </div>
            <div>
              <h2 className="text-xl font-semibold">House rules</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">{h.rules.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          </section>

          {menu && (
            <section>
              <div className="flex items-end justify-between">
                <h2 className="text-xl font-semibold">This week&apos;s menu</h2>
                <Badge tone="food">{menu.theme}</Badge>
              </div>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-food-soft text-left text-xs uppercase tracking-wide text-food">
                    <tr><th className="px-3 py-2">Day</th>{MEALS.map((m) => <th key={m} className="px-3 py-2">{m}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...new Set(menu.items.map((i) => i.date))].map((date) => (
                      <tr key={date} className={date === today ? 'bg-brand-soft/50' : ''}>
                        <td className="px-3 py-2 font-medium">{weekday(date)}</td>
                        {MEALS.map((meal) => {
                          const item = menu.items.find((i) => i.date === date && i.meal === meal);
                          return (
                            <td key={meal} className="px-3 py-2 text-ink-soft">
                              {item?.vegDish ?? '—'}
                              {item?.nonVegDish && <div className="text-xs text-danger">Non-veg: {item.nonVegDish}</div>}
                              {item?.foodPartnerId && <div className="text-xs text-food">Partner meal</div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xl font-semibold">Location</h2>
            <div className="mt-3"><ClientHostelMap points={[{ id: h.id, lat: h.lat, lng: h.lng, label: h.name, verified: h.isVerified }]} height={300} zoom={15} /></div>
          </section>

          <section>
            <h2 className="text-xl font-semibold">How residents rate it</h2>
            {h.ratings.reviewCount ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-5">
                {[
                  ['Overall', h.ratings.rating],
                  ['Cleanliness', h.ratings.cleanliness],
                  ['Food', h.ratings.food],
                  ['Safety', h.ratings.safety],
                  ['Owner response', h.ratings.responsiveness],
                ].map(([label, v]) => (
                  <div key={label as string} className="rounded-xl bg-surface p-3 text-center">
                    <div className="text-xl font-semibold">{v ?? '—'}</div>
                    <div className="text-xs text-ink-muted">{label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">No reviews yet. Only people who have lived here for at least two weeks can review.</p>
            )}

            {!h.transparency && (
              <p className="mt-4 rounded-xl bg-bg p-3 text-xs text-ink-muted">
                Issue record: fewer than 3 issues were reported by residents here in the last 90 days, so there is no record to show yet.
              </p>
            )}
            {h.transparency && (
              <Card className="mt-4 bg-brand-soft/40">
                <div className="font-medium">Issue record, last {h.transparency.windowDays} days</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><div className="text-lg font-semibold">{h.transparency.reported}</div><div className="text-ink-muted">issues reported</div></div>
                  <div><div className="text-lg font-semibold">{h.transparency.resolvedPct}%</div><div className="text-ink-muted">resolved</div></div>
                  <div><div className="text-lg font-semibold">{hoursLabel(h.transparency.medianHoursToFirstResponse)}</div><div className="text-ink-muted">median first response</div></div>
                  <div><div className="text-lg font-semibold">{hoursLabel(h.transparency.medianHoursToResolve)}</div><div className="text-ink-muted">median time to fix</div></div>
                </div>
                <p className="mt-3 text-xs text-ink-muted">Reported by residents in the Hostels app. Issue details stay private to residents and the hostel.</p>
              </Card>
            )}

            <div id="reviews" className="mt-4 space-y-3">
              {reviews === null && <p className="text-sm text-danger">Reviews could not be loaded right now. Refresh to try again.</p>}
              {reviews?.map((r) => <ReviewCard key={r.id} r={r} slug={h.slug} canFlag={!!user} />)}
            </div>
            {reviewPages > 1 && (
              <nav aria-label="Review pages" className="mt-4 flex justify-center gap-2">
                {Array.from({ length: reviewPages }, (_, i) => i + 1).map((p) => (
                  <Link key={p} href={`/hostels/${h.slug}?reviews=${p}#reviews`} className={`grid h-9 w-9 place-items-center rounded-lg text-sm no-underline ${p === reviewPage ? 'bg-brand text-white' : 'bg-surface text-ink-soft'}`}>
                    {p}
                  </Link>
                ))}
              </nav>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            {minRent ? (
              <>
                <div className="text-sm text-ink-muted">From</div>
                <div className="text-3xl font-semibold">{rupees(minRent)}<span className="text-base font-normal text-ink-muted"> /month</span></div>
              </>
            ) : (
              <div className="text-sm text-ink-muted">Rooms and rent not listed yet. Call the hostel to ask.</div>
            )}
            {h.isVerified ? (
              <>
                <p className="mt-2 text-sm text-ink-soft">
                  One bill for bed and food. Food plans from {rupees(FOOD_PLANS['two-meals'].price)}. No advance. Move or cancel anytime.
                </p>
                <LinkButton href={`/subscribe/${h.slug}`} size="lg" className="mt-4 w-full">Subscribe</LinkButton>
              </>
            ) : openVisit ? (
              <div className="mt-4 rounded-xl bg-brand-soft p-3 text-sm">
                <div className="font-medium">Visit requested for {dateLabel(openVisit.preferredDate)}</div>
                <p className="mt-1 text-ink-soft">The hostel will call you to confirm. You can withdraw it from <Link href="/account">your account</Link>.</p>
              </div>
            ) : (
              <form action={requestVisitAction} className="mt-4 space-y-3">
                <input type="hidden" name="hostelId" value={h.id} />
                <input type="hidden" name="slug" value={h.slug} />
                <div className="font-medium">Request a visit</div>
                <Field label="Preferred date"><Input type="date" name="preferredDate" min={today} defaultValue={today} required /></Field>
                <Field label="Note for the owner"><Textarea name="message" maxLength={500} placeholder="Evening after 6 works best" /></Field>
                {user ? <SubmitButton className="w-full">Request visit</SubmitButton> : <LinkButton href={`/login?next=/hostels/${h.slug}`} className="w-full">Log in to request a visit</LinkButton>}
              </form>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={phoneLink(h.contactPhone)} className="rounded-xl border border-line py-2 text-center text-sm text-ink no-underline hover:border-brand">Call</a>
              <a href={whatsappLink(h.whatsappPhone ?? h.contactPhone, `Hi, I found ${h.name} on Hostels.`)} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-line py-2 text-center text-sm text-ink no-underline hover:border-brand">WhatsApp</a>
            </div>
          </Card>
          <p className="px-1 text-xs text-ink-muted">
            Listed {dateLabel(h.createdAt)}. {h.isVerified ? 'Verified by the Hostels team.' : 'Free listing: terms and advance are set by the owner.'}{' '}
            <Link href="/for-owners">Own this hostel?</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
