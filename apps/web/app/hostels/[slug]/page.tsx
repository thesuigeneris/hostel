import { ApiError, computeBill, FOOD_PLANS, istDate, MEALS, REVIEW_MIN_STAY_DAYS, SKIP_CREDITS } from '@hostels/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientHostelMap } from '@/components/MapLoader';
import { PhotoGallery } from '@/components/PhotoGallery';
import { RecordView } from '@/components/RecordView';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge, buttonClass, Card, Field, Flash, Input, LinkButton, Stars, Textarea, VerifiedLabel } from '@/components/ui';
import { currentUser, publicApi, SITE_URL } from '@/lib/api';
import { dateLabel, GENDER_LABEL, monthLabel, phoneLink, reviewSource, rupees, SHARING_LABEL, timeAgo, weekday, whatsappLink } from '@/lib/format';
import { flagReviewAction, requestVisitAction } from './actions';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string; ok?: string }> };

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
  const minRent = Math.min(...h.roomTypes.map((r) => r.monthlyRent));
  const description = `${h.name} in ${h.area}, Hyderabad. ${GENDER_LABEL[h.genderType]} hostel from ${rupees(minRent)}/month${h.isVerified ? ', no advance' : ''}${h.foodAvailable ? ', food available' : ''}.`;
  return {
    title: `${h.name}, ${h.area}`,
    description,
    alternates: { canonical: `/hostels/${h.slug}` },
    openGraph: { title: h.name, description, images: h.photos[0] ? [{ url: h.photos[0].url }] : [] },
  };
}

/** "Updated 3 d ago", or a plain note when the hostel's bed counts predate this being recorded. */
function bedsFreshness(iso: string | null) {
  return iso ? `Updated ${timeAgo(iso)}` : 'Update time not recorded';
}

export default async function HostelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const q = await searchParams;
  const [h, user] = await Promise.all([load(slug), currentUser()]);
  const [reviews, menu, areas] = await Promise.all([
    publicApi(30).hostels.reviews(slug).catch(() => []),
    h.isVerified ? publicApi(300).hostels.menu(slug).catch(() => null) : Promise.resolve(null),
    publicApi(300).hostels.areas().catch(() => []),
  ]);
  const areaSlug = areas.find((a) => a.area === h.area)?.slug;
  const rooms = [...h.roomTypes].sort((a, b) => a.monthlyRent - b.monthlyRent);
  const minRent = rooms[0]?.monthlyRent ?? 0;
  const bedsFree = rooms.reduce((n, r) => n + r.bedsAvailable, 0);
  const cheapestFree = rooms.find((r) => r.bedsAvailable > 0) ?? rooms[0];
  const examplePlan = h.foodAvailable ? 'full' : 'none';
  const example = cheapestFree ? computeBill({ rent: cheapestFree.monthlyRent, mealPlan: examplePlan, skipCredits: 0 }) : null;
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
    priceRange: `₹${minRent}+ per month`,
    amenityFeature: h.amenities.map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
    ...(h.ratings.reviewCount
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: h.ratings.rating, reviewCount: h.ratings.reviewCount, bestRating: 5 } }
      : {}),
  };
  const whatsapp = whatsappLink(h.whatsappPhone ?? h.contactPhone, `Hi, I found ${h.name} on Hostels.`);
  const contactClass = buttonClass('secondary', 'md', 'w-full');

  return (
    <div className="mx-auto max-w-content px-4 pt-6 lg:pb-10">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD for search engines, built from escaped JSON */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <RecordView slug={h.slug} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-soft">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/hostels">Hostels</Link> <span aria-hidden>/</span></li>
          {areaSlug && <li><Link href={`/hostels-in/${areaSlug}`}>{h.area}</Link> <span aria-hidden>/</span></li>}
          <li aria-current="page" className="min-w-0 truncate">{h.name}</li>
        </ol>
      </nav>
      <Flash error={q.error} ok={q.ok} />
      <PhotoGallery photos={h.photos} name={h.name} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        {/* min-w-0 lets the menu table scroll inside instead of widening the page on phones. */}
        <div className="min-w-0 space-y-10">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {h.isVerified ? <VerifiedLabel /> : <Badge>Free listing</Badge>}
              <Badge>{GENDER_LABEL[h.genderType]}</Badge>
              {h.foodAvailable && <Badge tone="food">Food available</Badge>}
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{h.name}</h1>
            <p className="mt-1 text-ink-soft">{h.address}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Stars value={h.ratings.rating} />
              {h.ratings.reviewCount > 0 && (
                <a href="#reviews" className="text-sm text-ink-soft">
                  {h.ratings.reviewCount} {h.ratings.reviewCount === 1 ? 'review' : 'reviews'} from residents
                </a>
              )}
            </div>
            {h.description && <p className="mt-4 max-w-prose whitespace-pre-line text-ink-soft">{h.description}</p>}
          </div>

          <section aria-labelledby="rooms-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="rooms-heading" className="text-xl font-semibold">Rooms and prices</h2>
              <p className="text-sm text-ink-muted">{bedsFree > 0 ? `${bedsFree} ${bedsFree === 1 ? 'bed' : 'beds'} free in total` : 'Full right now'}</p>
            </div>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {rooms.map((r) => (
                <li key={r.id}>
                  <Card className="h-full p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium">{SHARING_LABEL[r.sharing]}</h3>
                      <span className={r.bedsAvailable > 0 ? 'text-sm font-medium text-brand' : 'text-sm text-ink-muted'}>
                        {r.bedsAvailable > 0 ? `${r.bedsAvailable} of ${r.totalBeds} beds free` : 'Full'}
                      </span>
                    </div>
                    <div className="mt-2 text-xl font-semibold tabular-nums">
                      {rupees(r.monthlyRent)}<span className="text-sm font-normal text-ink-muted"> per bed, per month</span>
                    </div>
                    <dl className="mt-2 space-y-0.5 text-sm text-ink-soft">
                      <div className="flex gap-1"><dt>Advance / deposit:</dt><dd className="font-medium text-ink">{r.advanceAmount ? rupees(r.advanceAmount) : 'None'}</dd></div>
                      <div className="flex gap-1 text-xs text-ink-muted"><dt className="sr-only">Bed count</dt><dd>{bedsFreshness(r.bedsUpdatedAt)}</dd></div>
                    </dl>
                  </Card>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">
              {h.isVerified
                ? 'Free beds change automatically when residents subscribe or leave through Hostels, and when the hostel edits its rooms.'
                : 'Free beds are entered by the hostel. Call to confirm before you visit.'}
            </p>
          </section>

          <section aria-labelledby="trust-heading">
            <h2 id="trust-heading" className="text-xl font-semibold">{h.isVerified ? 'What “Verified partner” means here' : 'About free listings'}</h2>
            {h.isVerified ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Card className="p-4">
                  <h3 className="font-medium">Checked</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                    <li>The listing was reviewed by the Hostels team before going live.</li>
                    <li>Partners are verified after an in-person visit: photos match, rooms are clean, the kitchen is safe.</li>
                    <li>Rent and food are billed through Hostels: one monthly bill, no advance.</li>
                  </ul>
                </Card>
                <Card className="p-4">
                  <h3 className="font-medium">Not covered</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                    <li>It is not a government licence or safety certificate.</li>
                    <li>House rules and amenities are written by the hostel.</li>
                    <li>Visit before you move in if you can.</li>
                  </ul>
                </Card>
              </div>
            ) : (
              <p className="mt-2 max-w-prose text-sm text-ink-soft">
                The Hostels team reviewed this listing before it went live, but the hostel is not a verified partner. Rent, advance and terms are
                agreed directly with the owner, and payments do not go through Hostels.
              </p>
            )}
          </section>

          <section className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 className="text-xl font-semibold">Amenities</h2>
              {h.amenities.length ? (
                <ul className="mt-3 flex flex-wrap gap-2">{h.amenities.map((a) => <li key={a}><Badge>{a}</Badge></li>)}</ul>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">Not listed by the hostel.</p>
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold">House rules</h2>
              {h.rules.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">{h.rules.map((r) => <li key={r}>{r}</li>)}</ul>
              ) : (
                <p className="mt-2 text-sm text-ink-muted">Not listed by the hostel.</p>
              )}
            </div>
          </section>

          {menu && (
            <section aria-labelledby="menu-heading">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 id="menu-heading" className="text-xl font-semibold">This week&apos;s menu</h2>
                <Badge tone="food">{menu.theme}</Badge>
              </div>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="sr-only">Meals for each day this week; today is highlighted</caption>
                  <thead className="bg-food-soft text-left text-xs uppercase tracking-wide text-food-ink">
                    <tr>
                      <th scope="col" className="px-3 py-2">Day</th>
                      {MEALS.map((m) => <th key={m} scope="col" className="px-3 py-2">{m}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...new Set(menu.items.map((i) => i.date))].map((date) => (
                      <tr key={date} className={date === today ? 'bg-brand-soft/50' : ''} aria-current={date === today ? 'date' : undefined}>
                        <th scope="row" className="px-3 py-2 text-left font-medium">{weekday(date)}{date === today && <span className="sr-only"> (today)</span>}</th>
                        {MEALS.map((meal) => {
                          const item = menu.items.find((i) => i.date === date && i.meal === meal);
                          return (
                            <td key={meal} className="px-3 py-2 text-ink-soft">
                              {item?.vegDish ?? '—'}
                              {item?.nonVegDish && <div className="text-xs text-danger">Non-veg: {item.nonVegDish}</div>}
                              {item?.foodPartnerId && <div className="text-xs text-food-ink">Partner meal</div>}
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

          <section aria-labelledby="location-heading">
            <h2 id="location-heading" className="text-xl font-semibold">Location</h2>
            <p className="mt-1 text-sm text-ink-soft">{h.address}</p>
            <div className="mt-3"><ClientHostelMap points={[{ id: h.id, lat: h.lat, lng: h.lng, label: h.name, verified: h.isVerified }]} height={300} zoom={15} /></div>
            <a href={`https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lng}#map=17/${h.lat}/${h.lng}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm">
              Open in OpenStreetMap
            </a>
          </section>

          <section id="reviews" aria-labelledby="reviews-heading">
            <h2 id="reviews-heading" className="text-xl font-semibold">How residents rate it</h2>
            {h.ratings.reviewCount ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['Overall', h.ratings.rating],
                  ['Cleanliness', h.ratings.cleanliness],
                  ['Food', h.ratings.food],
                  ['Safety', h.ratings.safety],
                  ['Owner response', h.ratings.responsiveness],
                ].map(([label, v]) => (
                  <div key={label as string} className="flex flex-col-reverse rounded-xl border border-line bg-surface p-3 text-center">
                    <dt className="text-xs text-ink-muted">{label}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{v ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">No reviews yet. Only people who have lived here for at least {REVIEW_MIN_STAY_DAYS} days can review.</p>
            )}

            {h.transparency && (
              <Card className="mt-4 bg-brand-soft/40">
                <h3 className="font-medium">Issue record, last {h.transparency.windowDays} days</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="flex flex-col-reverse"><dt className="text-ink-muted">issues reported</dt><dd className="text-lg font-semibold tabular-nums">{h.transparency.reported}</dd></div>
                  <div className="flex flex-col-reverse"><dt className="text-ink-muted">resolved</dt><dd className="text-lg font-semibold tabular-nums">{h.transparency.resolvedPct}%</dd></div>
                  <div className="flex flex-col-reverse"><dt className="text-ink-muted">median first response</dt><dd className="text-lg font-semibold tabular-nums">{h.transparency.medianHoursToFirstResponse ?? '—'} h</dd></div>
                  <div className="flex flex-col-reverse"><dt className="text-ink-muted">median time to fix</dt><dd className="text-lg font-semibold tabular-nums">{h.transparency.medianHoursToResolve ?? '—'} h</dd></div>
                </dl>
                <p className="mt-3 text-xs text-ink-muted">Reported by residents in the Hostels app. Issue details stay private to residents and the hostel.</p>
              </Card>
            )}

            <ul className="mt-4 space-y-3">
              {reviews.map((r) => (
                <li key={r.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{r.author}</span>
                        <Badge tone={reviewSource(r.verifiedVia).strong ? 'green' : 'gray'}>{reviewSource(r.verifiedVia).label}</Badge>
                        {r.stay && <span className="text-xs text-ink-muted">Lived here {monthLabel(r.stay.from)} – {r.stay.to ? monthLabel(r.stay.to) : 'now'}</span>}
                      </div>
                      <Stars value={r.rating} />
                    </div>
                    <p className="mt-2 text-sm text-ink-soft">{r.body}</p>
                    {r.ownerReply && <div className="mt-3 rounded-xl bg-bg p-3 text-sm"><span className="font-medium">Reply from the hostel:</span> {r.ownerReply}</div>}
                    {user && (
                      <form action={flagReviewAction} className="mt-2">
                        <input type="hidden" name="slug" value={h.slug} />
                        <input type="hidden" name="reviewId" value={r.id} />
                        <input type="hidden" name="reason" value="Reported from the hostel page" />
                        <button type="submit" className="min-h-6 text-xs text-ink-muted underline-offset-2 hover:text-danger hover:underline">Report this review</button>
                      </form>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside aria-label="Price and contact" className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <div className="text-sm text-ink-muted">From</div>
            <div className="text-3xl font-semibold tabular-nums">{rupees(minRent)}<span className="text-base font-normal text-ink-muted"> /month</span></div>
            {h.isVerified ? (
              <>
                {example && cheapestFree && (
                  <div className="mt-4 border-t border-line pt-4 text-sm">
                  <p className="mb-2 font-medium text-ink">Example monthly bill</p>
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-3"><dt className="text-ink-soft">Bed, {SHARING_LABEL[cheapestFree.sharing].toLowerCase()}</dt><dd className="tabular-nums">{rupees(example.rentAmount)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-ink-soft">Food, {FOOD_PLANS[examplePlan].label.toLowerCase()}</dt><dd className="tabular-nums">{example.foodAmount ? rupees(example.foodAmount) : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-ink-soft">Advance / deposit</dt><dd className="tabular-nums">₹0</dd></div>
                    <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold"><dt>Total per month</dt><dd className="tabular-nums">{rupees(example.totalAmount)}</dd></div>
                  </dl>
                  </div>
                )}
                <p className="mt-3 text-xs text-ink-muted">
                  {h.foodAvailable
                    ? `Food is your choice: ${FOOD_PLANS['two-meals'].label.toLowerCase()} is ${rupees(FOOD_PLANS['two-meals'].price)}, or bed only. Meals you skip before the cutoff come off the next bill (${rupees(SKIP_CREDITS.breakfast)} breakfast, ${rupees(SKIP_CREDITS.lunch)} lunch or dinner).`
                    : 'This hostel does not offer food plans.'}{' '}
                  Move or cancel anytime.
                </p>
                <LinkButton href={`/subscribe/${h.slug}`} size="lg" className="mt-4 w-full">Subscribe</LinkButton>
              </>
            ) : (
              <form id="visit" action={requestVisitAction} className="mt-4 space-y-3 border-t border-line pt-4">
                <input type="hidden" name="hostelId" value={h.id} />
                <input type="hidden" name="slug" value={h.slug} />
                <h2 className="font-medium">Request a visit</h2>
                <p className="text-xs text-ink-muted">The hostel gets your request and calls you to confirm a time. Nothing is booked or paid yet.</p>
                <Field label="Preferred date"><Input type="date" name="preferredDate" min={today} defaultValue={today} required /></Field>
                <Field label="Note for the owner" optional><Textarea name="message" maxLength={500} placeholder="Evening after 6 works best" /></Field>
                {user ? <SubmitButton className="w-full">Request visit</SubmitButton> : <LinkButton href={`/login?next=/hostels/${h.slug}`} className="w-full">Log in to request a visit</LinkButton>}
              </form>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={phoneLink(h.contactPhone)} className={contactClass}>Call</a>
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={contactClass}>WhatsApp</a>
            </div>
          </Card>
          <p className="px-1 text-xs text-ink-muted">
            Listed {dateLabel(h.createdAt)}. <Link href="/for-owners">Own this hostel?</Link>
          </p>
        </aside>
      </div>

      {/* Phones: the price and main action stay in reach while reading. Sticky, not fixed, so it stops above the footer. */}
      <div data-sticky-actions className="sticky bottom-0 z-sticky -mx-4 mt-10 border-t border-line bg-surface/95 px-4 py-3 shadow-overlay backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-content items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold tabular-nums leading-tight">{rupees(minRent)}<span className="text-sm font-normal text-ink-muted"> /month</span></div>
            <div className="truncate text-xs text-ink-muted">{h.isVerified ? 'No advance · one monthly bill' : bedsFree > 0 ? `${bedsFree} beds free` : 'Full right now'}</div>
          </div>
          <a href={phoneLink(h.contactPhone)} className={buttonClass('secondary', 'md')}>Call</a>
          {h.isVerified ? (
            <Link href={`/subscribe/${h.slug}`} className={buttonClass('primary', 'md')}>Subscribe</Link>
          ) : (
            <a href="#visit" className={buttonClass('primary', 'md')}>Request visit</a>
          )}
        </div>
      </div>
    </div>
  );
}
