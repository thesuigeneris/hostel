import { ApiError } from '@hostels/shared';
import { Upsell } from '@/components/Upsell';
import { buttonClass, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { BRAND_FILES, type BrandFile, brandSvg } from '@/lib/brand-kit';
import { dateLabel } from '@/lib/format';
import { ownerHostel } from '@/lib/owner';

export default async function BrandKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await ownerHostel(id);
  const kit = await (await api()).owner.brandKit(id).catch((e) =>
    e instanceof ApiError && (e.code === 'plan_required' || e.code === 'not_verified') ? null : Promise.reject(e),
  );
  if (!kit) {
    if (h.plan.effective === 'partner' && h.partnerStatus !== 'verified') {
      return <Card className="text-sm text-ink-soft">The brand kit unlocks once our team has visited and verified this hostel.</Card>;
    }
    return <Upsell hostelId={id} plan="partner" feature="The Hostels brand kit" suspended={h.plan.suspended} />;
  }
  const base = `/owner/hostels/${id}/brand`;

  return (
    <div className="space-y-6">
      <Card className="bg-brand-soft/40">
        <div className="font-medium">Show tenants you are a verified Hostels partner</div>
        <p className="mt-1 text-sm text-ink-soft">
          Print these at any flex or print shop. They are vector files, so they stay sharp at any size.
          {kit.partnerSince && ` Verified since ${dateLabel(kit.partnerSince)}.`} Keep the board up only while the hostel is on the Partner plan.
        </p>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {(Object.keys(BRAND_FILES) as BrandFile[]).map((f) => (
          <Card key={f} className={f === 'signboard' ? 'lg:col-span-2' : ''}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{BRAND_FILES[f].label}</div>
                <div className="text-xs text-ink-muted">{BRAND_FILES[f].size}</div>
              </div>
              <div className="flex gap-2">
                <a href={`${base}/${f}.svg`} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'sm', 'no-underline')}>Open to print</a>
                <a href={`${base}/${f}.svg?download=1`} className={buttonClass('secondary', 'sm', 'no-underline')}>Download SVG</a>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-line bg-bg p-3">
              {/* The SVG is built from escaped text on the server. */}
              <div
                className="mx-auto [&>svg]:h-auto [&>svg]:w-full"
                style={{ maxWidth: f === 'sticker' ? 320 : f === 'poster' ? 360 : undefined }}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: server-built SVG, all text escaped in brandSvg
                dangerouslySetInnerHTML={{ __html: brandSvg(kit, f) }}
              />
            </div>
          </Card>
        ))}
      </div>
      <Card className="text-sm text-ink-soft">
        Your listing link for WhatsApp groups and Google Maps: <a href={kit.listingUrl}>{kit.listingUrl}</a>
      </Card>
    </div>
  );
}
