name: "PRP-12: Frontend design system and visual upgrade (web)"
status: executing (batch 1)
confidence: 7/10. The tokens and primitives are mechanical. The 3D scene and motion carry risk to performance and accessibility, which is contained by lazy loading, fallbacks and tests.

## Goal
Upgrade the existing Next.js web frontend into one coherent, accessible, production-quality interface for every
persona, keeping the existing routes, server actions, API contracts and authorization. Add **one** original,
lazy-loaded 3D illustration on the public homepage, with static and no-WebGL fallbacks.

## Non-goals
- No change to API behaviour or authorization for styling's sake. Where the design needs data, such as availability freshness, it is a documented API change with tests (batch 2).
- No 3D outside the homepage hero. No 3D in dashboards or cards.
- No dark mode in this PRP. Tokens are structured so it can be added later.
- Mobile (Expo) visuals: tokens shared in spirit (`apps/mobile/lib/theme.ts`), redesign out of scope.
- **Not invented:** organizations, staff, audit logs and branding settings appear in the brief but don't exist in the product or the approved spec, so no UI is invented for them. Recorded in the completion map as open questions.

## Reference sources (what was actually accessible)

| Source | Access from this sandbox | Used for | Reuse |
|---|---|---|---|
| github.com/nextlevelbuilder/ui-ux-pro-max-skill @ `d14efff` (MIT) | yes, via git | Retheming method (audit → map to semantic tokens → migrate in batches → verify); quick-reference rules for accessibility, touch, performance, layout, typography, animation, forms, navigation; motion timing table | Guidance only; no code copied |
| 21st.dev | **no** (network policy) | none | none |
| motionsites.ai | **no** | none | none |
| threeui.com/browse | **no** | none | none; the 3D scene is original |
| motion.dev/docs/react, …/react-accessibility | **no** (DNS blocked) | API used from the installed package's own type definitions and README (`node_modules/motion`) | MIT package |

## Design direction (one, kept)

The existing brand is strong and consistent: warm off-white `#FAF7F2`, deep green `#1F5C46`, warm food accent `#E08A2E`. It is used on web and mobile, so it is **kept and refined, not replaced**.
- **Feel:** a calm, residential, food-forward marketplace for Hyderabad. Welcoming and credible.
- **Typography:** Inter (body and UI). Fraunces, a soft serif with optical sizes, only for display headings. It gives warmth without luxury cues. Both are self-hosted via Fontsource (OFL-1.1), so there are no runtime calls to Google and no CSP change.
- **Surfaces:** quiet white cards, 1 px warm borders, two shadow levels. No glassmorphism except the sticky header's existing light blur.
- **Colour use:** green for primary actions and trust; amber only for food and highlights; red only for problems. Status colour always comes with text.
- **Copy honesty:** remove "real photos" and "live beds". Say what is true, such as "beds free, as last updated by the hostel" and "verified resident reviews", with the verification scope explained.

## Dependencies added (checked: licence, need, size, age ≥ 2 weeks)

| Package | Version | Licence | Why | Where it loads |
|---|---|---|---|---|
| `motion` | 13.5.1 (2026-10-02) | MIT | Shared motion primitives and the reduced-motion policy. `14.x` was skipped because it's under 2 weeks old. | Only components that use it (client) |
| `three` | 0.186.1 (2026-09-24) | MIT | One procedural scene. Plain three.js, no React Three Fiber or Drei: a single scene doesn't justify a second renderer layer. | Homepage hero chunk only, dynamically imported |
| `@fontsource-variable/inter` | 5.3.0 | OFL-1.1 | Self-hosted body font | All pages (CSS) |
| `@fontsource-variable/fraunces` | 5.3.0 | OFL-1.1 | Self-hosted display font | All pages (CSS), headings only |
| `@axe-core/playwright` (dev) | pinned at install | MPL-2.0 | Automated accessibility checks in browser tests | Tests only |

## Design tokens (single source: `apps/web/tailwind.config.ts`, mirrored in CSS variables in `globals.css`)
- **Colour roles:** `bg`, `surface`, `raised`, `ink` (foreground), `ink-soft`, `ink-muted`, `line`, `brand` (primary), `brand-dark`, `brand-soft`, `on-brand`, `food` (warm accent), `food-ink` (accessible amber text), `ok`, `warn`, `danger`, `info`, `ring` (focus).
- **Contrast** of every text/background pair checked numerically and recorded in `docs/design/system.md`.
- **Type scale:** 12, 14, 16 (body), 18, 20, 24, 30, 36, 48, 60. Display uses Fraunces with a tight leading.
- **Spacing:** Tailwind's 4 px scale. Containers: `content` 72 rem, `prose` 42 rem.
- **Radius:** 8, 12, 16, 20, 9999. **Shadows:** `card`, `raised`, `overlay`.
- **Z-index:** base 0, sticky 30, header 40, drawer 50, toast 60, modal 70.
- **Motion:** durations of 150 ms (feedback), 220 ms (panel), 380 ms (section); ease-out for entering, ease-in for leaving; exits about 65 % of enter time.

## Primitives (refined in place: `components/ui.tsx` and new sibling files; no parallel system)
Button and link-button (with focus ring and pressed state), Input, Select, Textarea, Checkbox, Field with a required/optional marker, error text tied to the field, a fieldset helper, Chip/FilterChip, Tabs (scrollable with edge fade), Card, Badge and StatusBadge (with text), VerifiedLabel with explanation, Dialog/Drawer (native `<dialog>`: focus trap, Escape, focus restore), Toast region (`aria-live`), Table (responsive scroll, sticky header), Pagination (windowed), Skeleton, Empty/Error state with a recovery action, PriceBreakdown, PropertyCard, Gallery (keyboard and touch), Timeline. A skip link and visible focus everywhere.

## Motion policy (`components/motion.tsx`)
- `MotionConfig reducedMotion="user"` at the root: transforms are dropped for people who prefer reduced motion.
- Shared variants: `fadeUp` (section reveal, once per page view, not on every navigation) and `pop` (feedback).
- **Not allowed:** scroll hijacking, custom cursors, magnetic effects on booking or payment buttons, stagger over more than 6 items, animating dense forms.
- CSS transitions are used for hover and focus.

## The 3D scene (`components/hero/HostelScene*.tsx`)
- **Content:**
  - An original, stylised, procedural three-storey hostel cutaway: a block building with warm-lit windows, one open room showing two bunk beds and a desk, a rooftop water tank, and a small tree.
  - Built from boxes and cylinders only. No downloaded models or textures.
  - The visible caption says it's an illustration: "Illustration, not a real property."
- **Behaviour:** slight pointer-responsive rotation (±8°), damped; a slow idle sway only while visible and only without reduced motion.
- **Reliability:**
  - Loads via `next/dynamic` with `ssr:false`, after the hero renders. The search form is plain HTML that works before and without the scene.
  - Checks WebGL availability first; if it's missing or initialisation fails, shows the static SVG illustration.
  - Handles `webglcontextlost` and `webglcontextrestored`.
  - On unmount: cancels the frame loop and disposes geometries, materials and the renderer.
  - Pauses rendering when offscreen (`IntersectionObserver`) and when the tab is hidden.
  - Pixel ratio is capped at 1.75 (1.25 on low-memory devices). Renders on demand when idle.
- **Accessibility:** the canvas is `aria-hidden`, and the meaningful content is HTML. With reduced motion, a single static frame is rendered and pointer motion is off.
- **Layout:** a fixed aspect-ratio box reserved before load, so nothing shifts.

## Batches
1. **Batch 1:** tokens, fonts, focus/skip link, motion policy, primitives (button/link/field/chip/card/badge/verified/dialog/toast/skeleton/pagination), header/nav/footer, homepage with the 3D hero and honest copy, `/account` overflow fix. Tests: homepage search works without WebGL, 3D fallback, reduced motion, axe on home/search/login, 5-width overflow.
2. **Batch 2:** search and listing (filter drawer on mobile, applied chips, clear-all, windowed pagination, no-results recovery), property card and property page (gallery, price breakdown, deposit, verification scope, availability freshness via API `roomTypes.updatedAt`, sticky mobile action bar, menu table containment, explicit visit/booking status).
3. **Batch 3:** owner acquisition (`/for-owners`) and onboarding (stepper with progress, draft state, photo guidance, review before submit, status).
4. **Batch 4:** workspaces. Owner (navigation, property switcher, inventory, residents, visits, issues, payments, meals, plan), resident (`/stay`, `/account`), admin (queues, escalations, moderation, verification, finance), with consistent tables, filters, status and empty/error states.
5. **Batch 5:** accessibility and responsive sweep of every route at 360/390/768/1024/1440, keyboard pass, bundle review, docs and screenshots.

## Validation loop
```bash
bun run typecheck && bunx biome lint .
(cd apps/web && bunx next build)                 # record route sizes vs PRPs/…/bundle-before
(cd apps/web && bun run e2e:fresh)               # existing 9 + new design tests (disposable hostels_e2e)
node <scratch>/baseline.mjs                      # 5 widths × key routes: overflow + page errors
```

## Acceptance criteria (batch 1)
- [ ] Homepage search submits to `/hostels` with WebGL disabled, and with JavaScript-heavy chunks blocked → e2e `design.spec.ts › search works without the 3D scene`
- [ ] No-WebGL shows the static illustration; `/` shows no page errors → `› 3D falls back`
- [ ] Reduced motion: no idle animation (the frame counter doesn't advance) → `› reduced motion renders one frame`
- [ ] No `three` code in non-home routes (build manifest check) → validation step
- [ ] axe: no serious or critical violations on `/`, `/hostels`, `/login` → `› axe`
- [ ] No horizontal overflow at the 5 widths on the batch-1 routes, `/account` included → baseline script
- [ ] All existing e2e tests still pass

## External dependencies and cost
npm packages only (MIT, OFL, MPL). ₹0.

## Open questions
- Should "Fraunces for display" stay? It can be reverted to Inter-only by removing one class mapping.
- Organizations, staff, audit logs and branding settings: not in the spec. Should they be specified as their own PRPs?

## Execution notes

### Batch 1: tokens, primitives, shell, homepage, 3D hero (done)

**What changed**
- **Tokens.**
  - Tokens live in `lib/tokens.ts` and are imported by `tailwind.config.ts`. There are no CSS variables; one source turned out to be enough.
  - `ink-muted` was darkened from `#7A837E` (3.66:1, failed) to `#646D68` (5.00:1).
  - Amber is no longer used for text. `food-ink` and `food-star` were added. Measured ratios are in `docs/design/system.md`.
- **Primitives.**
  - `components/ui.tsx` was refined in place, and every existing export still works.
  - New primitives: `VerifiedLabel`, `Checkbox`, `Skeleton`, `Pagination`, and `Field optional`.
  - New sibling files: `Photo`, `NavLinks`, `motion`, `MotionProvider`.
- **Shell.**
  - Skip link, and `main#main` is focusable.
  - Navigation shows `aria-current`. The mobile menu is a `<details>` element, so it works without JavaScript.
  - The footer is rebuilt with working links only.
- **Homepage.**
  - All 10 sections, all from real data or shared constants: search, trust, featured verified partners (a live search), how it works, food plans, issue timeline, owner plans, and an FAQ.
  - No counts, logos, testimonials or ratings are invented.
  - Search is a plain GET form, so it works before the 3D scene loads and with it disabled.
- **3D.**
  - `components/hero/*`: a procedural three.js scene behind an SVG-first fallback (the spec is in `docs/design/system.md`).
  - Plan change: it is plain three.js rather than react-three-fiber. That means two fewer dependencies, and r3f's reconciler would only add size.
- **Copy.** Removed claims the product can't back: "real photos" and "live beds" in metadata (layout, `/hostels`, area pages, owner plan features). Beds are now described as owner-reported.
- **Fixes found while sweeping.**
  - `/account` overflowed by 527 px at 360 and 390: `min-w-0` on the column.
  - The hostel page overflowed at 360 because of the review header row: it wraps now.

**Deviations from the plan**
- **Motion.** `motion` is not mounted globally. A root `MotionProvider` added 38.8 kB gzipped to every route (measured), so section reveals use CSS plus IntersectionObserver. `motion` is kept for batch 2's drawer and dialogs, through a scoped provider.
- **References.** Only UI UX Pro Max was reachable. 21st.dev, MotionSites, ThreeUI and motion.dev were blocked by the sandbox network policy, and nothing from them was used.

**Validation run**
- Typecheck and lint: `bun run typecheck` (4/4) and `bunx biome lint .` are clean.
- Playwright: `bunx playwright test` passed 20/20 against a fresh `hostels_e2e` database. A 12th design test, for a lost WebGL context, was added afterwards and passes. That includes the new tests in `e2e/design.spec.ts`:
  - search works with WebGL off;
  - 3D renders and animates; reduced motion draws one frame;
  - a lost WebGL context that isn't restored falls back to the illustration;
  - `three` is not downloaded on other routes;
  - skip link and focus;
  - keyboard mobile menu with `aria-current`;
  - no overflow on 4 public routes at 360, 390, 768, 1024 and 1440;
  - axe finds no serious or critical issues on `/`, `/hostels` and `/login`.
- Overflow sweep (scratchpad `baseline.mjs`): 9 routes × 5 widths, including the signed-in owner, resident and admin pages. No overflow and no page errors in all 45.
- Bundle (`next build`): `/` first-load JS went from 106 kB to 108 kB. `three` is 2 lazy chunks (348 kB + 196 kB raw), fetched only on `/` and only when WebGL is available. Other routes stayed within ±1 kB.

**Known open items, carried into batch 2**
- `/hostels/[slug]` has 3 axe findings:
  - the menu table header uses `text-food` (2.36:1);
  - the Leaflet marker has no accessible name;
  - the Leaflet attribution link is distinguished by colour only.
- Listing photos are hot-linked placeholders, and external hosts are blocked in the sandbox, so screenshots show the fallback. This belongs to PRP-06.

### Batch 2: search, listing, property page (done)

- **Search.** One GET form. Search text and area are always visible. The other filters sit inline on large screens and open as a bottom sheet on phones: a native `<dialog>`, so focus is trapped, Escape works and the page behind is inert. With JavaScript off, the fields render inline. Removable chips, "Clear all", a windowed pagination, and recovery for "no results", "past the last page" and "rent from > rent up to". "Distance" is only offered when a location is set.
- **Cards and map.** Each card is one link named after the hostel. Map pins have accessible names and 28 px targets. The OSM attribution links to the copyright page. The map view lists every result as a text link below the map.
- **Property page.**
  - Gallery: swipe on phones, a grid on larger screens, and a keyboard lightbox that returns focus. Failed photos fall back to a placeholder, including images that fail before hydration (a real bug, caught by the test).
  - Rooms: rent, advance, and bed freshness ("Updated 3 d ago").
  - An example monthly bill, computed with `computeBill`.
  - "What Verified partner means here", covering both what is checked and what is not covered.
  - A sticky phone action bar that stops above the footer.
- **API (additive).** `RoomType.bedsUpdatedAt` (nullable; null for rows from before it was recorded). Set by owner bed edits, `reserveBed` and `releaseBed`, and the demo seed. Migration `0005_beds_updated_at`.
- **Found and fixed.**
  - Public data was cached for 30 s even after an admin approved or verified a listing. `run()` now clears a `public-data` cache tag after every successful mutation.
  - Filter chips, the view toggle and pagination are plain links. Next's client router dropped a click that raced its own prefetch, as seen in a trace.
- **Validation.**
  - `bunx playwright test` (fresh DB): 30/30.
  - API tests: 99/99, with a mutation check on `reserveBed`.
  - Typecheck 4/4, lint clean.
  - Axe on property, area, map and empty pages. Pin-only target-size findings are exempt under WCAG 2.5.8's equivalent-control rule: the text list.
