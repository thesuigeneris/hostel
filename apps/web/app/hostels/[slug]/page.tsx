import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { createApiClient, istDate, type HostelDetail } from '@hostels/shared';
import { Map } from '@/components/map';
import { Gallery } from '@/components/public/gallery';
import { FALLBACK_PHOTO } from '@/components/public/hostel-card';
import { IssueTransparency } from '@/components/public/issue-transparency';
import { MenuWeekView } from '@/components/public/menu-week';
import { RatingBreakdown, ReviewItem } from '@/components/public/review-list';
import { RecordView } from '@/components/public/record-view';
import { load } from '@/components/public/safe';
import { VisitForm } from '@/components/public/visit-form';
import { Badge, VerifiedBadge } from '@/components/ui/badge';
import { ButtonLink, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Stars } from '@/components/ui/stars';
import { EmptyState } from '@/components/ui/states';
import { API_URL, SITE_URL } from '@/lib/config';
import { GENDER_LABEL, SHARING_LABEL, rupees } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const getHostel = cache(async (slug: string) => load(createApiClient(API_URL).hostels.get(slug), { notFoundOn404: true }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getHostel(slug);
  if (!r.ok) return { title: 'Hostel' };
  const h = r.data;
  const minRent = Math.min(...h.roomTypes.map((rt) => rt.monthlyRent));
  const description = `${h.name} in ${h.area}, ${h.city}. ${GENDER_LABEL[h.genderType]} hostel${h.foodAvailable ? ' with food' : ''}${
    Number.isFinite(minRent) ? ` from ${rupees(minRent)}/month` : ''
  }. ${h.rating.count ? `Rated ${h.rating.overall}/5 by ${h.rating.count} residents.` : ''}`.trim();
  const image = h.photos[0]?.url ?? FALLBACK_PHOTO;
  return {
    title: `${h.name}, ${h.area}`,
    description,
    alternates: { canonical: `/hostels/${h.slug}` },
    openGraph: { title: h.name, description, images: [image], url: `${SITE_URL}/hostels/${h.slug}` },
  };
}

function jsonLd(h: HostelDetail) {
  const rents = h.roomTypes.map((r) => r.monthlyRent);
  return {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: h.name,
    description: h.description,
    url: `${SITE_URL}/hostels/${h.slug}`,
    image: h.photos.map((p) => p.url),
    telephone: h.contactPhone,
    address: { '@type': 'PostalAddress', streetAddress: h.address, addressLocality: h.area, addressRegion: h.city, addressCountry: 'IN' },
    geo: { '@type': 'GeoCoordinates', latitude: h.lat, longitude: h.lng },
    amenityFeature: h.amenities.map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
    ...(rents.length ? { priceRange: `₹${Math.min(...rents)}–₹${Math.max(...rents)} per month` } : {}),
    ...(h.rating.count > 0 && h.rating.overall
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: h.rating.overall, reviewCount: h.rating.count, bestRating: 5, worstRating: 1 } }
      : {}),
  };
}

export default async function HostelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getHostel(slug);
  if (!r.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <EmptyState title="Couldn't load this hostel" action={<ButtonLink href={`/hostels/${slug}`} variant="secondary">Try again</ButtonLink>}>
          {r.message}
        </EmptyState>
      </div>
    );
  }
  const h = r.data;
  const api = createApiClient(API_URL);
  const isPartner = h.partnerStatus === 'verified';
  const [menu, reviews, issues, user] = await Promise.all([
    isPartner ? load(api.hostels.menu(slug)) : Promise.resolve(null),
    load(api.hostels.reviews(slug)),
    load(api.hostels.publicIssues(slug)),
    getCurrentUser().catch(() => null),
  ]);
  const minRent = h.roomTypes.length ? Math.min(...h.roomTypes.map((rt) => rt.monthlyRent)) : null;
  const bedsFree = h.roomTypes.reduce((n, rt) => n + rt.bedsAvailable, 0);
  const wa = h.whatsappPhone ? `https://wa.me/91${h.whatsappPhone}?text=${encodeURIComponent(`Hi, I found ${h.name} on Hostels and would like to know more.`)}` : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <RecordView slug={h.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(h)).replace(/</g, '\\u003c') }} />

      <nav className="mb-4 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/search" className="hover:text-ink">Hostels</Link> ·{' '}
        <Link href={`/hostels-in/${h.area.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="hover:text-ink">{h.area}</Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{h.name}</h1>
            {isPartner && <VerifiedBadge />}
          </div>
          <p className="mt-1 text-muted">
            {h.address} · {GENDER_LABEL[h.genderType]}
          </p>
          {h.rating.count > 0 && (
            <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm">
              <Stars value={h.rating.overall} /> <span className="font-medium">{h.rating.overall?.toFixed(1)}</span>
              <span className="text-muted">· {h.rating.count} verified reviews</span>
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          <Gallery photos={h.photos} name={h.name} />

          {h.description && (
            <section>
              <h2 className="mb-2 text-xl font-semibold">About</h2>
              <p className="whitespace-pre-line text-ink">{h.description}</p>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-xl font-semibold">Rooms</h2>
            {h.roomTypes.length === 0 ? (
              <p className="text-sm text-muted">The owner hasn&apos;t added rooms yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
                <table className="w-full text-sm">
                  <thead className="bg-bg text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3">Room</th>
                      <th className="px-4 py-3">Rent / month</th>
                      <th className="px-4 py-3">Advance</th>
                      <th className="px-4 py-3">Beds free</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.roomTypes.map((rt) => (
                      <tr key={rt.id} className="border-t border-line">
                        <td className="px-4 py-3 font-medium">{SHARING_LABEL[rt.sharing]}</td>
                        <td className="px-4 py-3">{rupees(rt.monthlyRent)}</td>
                        <td className="px-4 py-3">{isPartner ? <span className="text-ok">None when you subscribe</span> : rupees(rt.advanceAmount)}</td>
                        <td className="px-4 py-3">
                          {rt.bedsAvailable > 0 ? <span className="text-ok">{rt.bedsAvailable} of {rt.totalBeds}</span> : <span className="text-danger">Full</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {(h.amenities.length > 0 || h.rules.length > 0) && (
            <section className="grid gap-6 sm:grid-cols-2">
              {h.amenities.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xl font-semibold">Amenities</h2>
                  <div className="flex flex-wrap gap-2">
                    {h.amenities.map((a) => (
                      <Badge key={a}>{a}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {h.rules.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xl font-semibold">House rules</h2>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                    {h.rules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {isPartner && (
            <section>
              <h2 className="mb-3 text-xl font-semibold">This week&apos;s menu</h2>
              {menu && menu.ok && menu.data ? (
                <MenuWeekView menu={menu.data} today={istDate()} />
              ) : (
                <p className="text-sm text-muted">This week&apos;s menu hasn&apos;t been published yet.</p>
              )}
            </section>
          )}

          <section id="reviews" className="scroll-mt-24">
            <h2 className="mb-4 text-xl font-semibold">Reviews from residents</h2>
            {h.rating.count > 0 && (
              <Card className="mb-4 p-5">
                <RatingBreakdown rating={h.rating} />
              </Card>
            )}
            {!reviews.ok ? (
              <p className="text-sm text-muted">Reviews couldn&apos;t be loaded.</p>
            ) : reviews.data.items.length === 0 ? (
              <EmptyState title="No reviews yet">Only verified residents can review. If you live here, join this hostel&apos;s community to write one.</EmptyState>
            ) : (
              <Card className="px-5">
                {reviews.data.items.map((rv) => (
                  <ReviewItem key={rv.id} r={rv} />
                ))}
              </Card>
            )}
          </section>

          <section>
            <IssueTransparency stats={h.issueStats} recent={issues.ok ? issues.data.items.slice(0, 5) : []} />
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Location</h2>
            <div className="h-72">
              <Map markers={[{ id: h.id, lat: h.lat, lng: h.lng, label: h.name, sublabel: h.address }]} center={[h.lat, h.lng]} zoom={15} />
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <div className="text-sm text-muted">From</div>
            <div className="text-3xl font-semibold">
              {rupees(minRent)}
              <span className="text-base font-normal text-muted"> /month</span>
            </div>
            {isPartner ? (
              <p className="mt-1 text-sm text-ok">No advance · food plans from {rupees(4500)}/month</p>
            ) : (
              <p className="mt-1 text-sm text-muted">Advance and terms set by the owner</p>
            )}
            <p className="mt-1 text-sm">{bedsFree > 0 ? <span className="text-ok">{bedsFree} beds free right now</span> : <span className="text-danger">Currently full</span>}</p>
            {isPartner && (
              <ButtonLink href={`/subscribe/${h.slug}`} size="lg" className="mt-4 w-full" aria-disabled={bedsFree === 0}>
                Subscribe, no advance
              </ButtonLink>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={`tel:+91${h.contactPhone}`} className={buttonClass('secondary', 'md')}>Call</a>
              {wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md')}>WhatsApp</a>
              ) : (
                <span className={buttonClass('secondary', 'md', 'pointer-events-none opacity-40')}>WhatsApp</span>
              )}
            </div>
          </Card>
          <Card id="visit" className="scroll-mt-24 p-5">
            <h2 className="mb-3 font-semibold">Visit before you decide</h2>
            <VisitForm hostelId={h.id} slug={h.slug} signedIn={!!user} />
          </Card>
          <Card className="p-5 text-sm">
            <div className="font-medium">Live here?</div>
            <p className="mt-1 text-muted">Join the resident community to report issues, talk to other residents and leave a review.</p>
            <Link href={`/community/join?hostel=${h.id}`} className="mt-2 inline-block font-medium text-brand underline">
              Join {h.name}&apos;s community
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
