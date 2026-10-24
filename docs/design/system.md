# Design system (web)

The source of truth is [`apps/web/lib/tokens.ts`](../../apps/web/lib/tokens.ts). Tailwind classes are generated from it
(`apps/web/tailwind.config.ts`), and the map pins and 3D scene import it directly. Primitives live in
[`apps/web/components/ui.tsx`](../../apps/web/components/ui.tsx). Plan and status: [PRP-12](../../PRPs/12-frontend-design-system-and-visual-upgrade.md).

## Direction

The existing brand is kept and refined: warm off-white, one deep green, one warm food accent (the same as the mobile app).
- **Tone:** calm, residential and food-forward; credible rather than flashy.
- **Typography:** Inter for body and UI. Fraunces only for display headings (`font-display`).
- **Honest copy:** no "real photos" or "live beds" claims. Every label, such as Verified partner, resident reviews or issue record, is explained in plain words where it appears.

## Colour roles and measured contrast (WCAG 2.x)

| Role | Hex | Use | Contrast |
|---|---|---|---|
| `ink` | `#1C2421` | Body text | 14.85:1 on `bg` |
| `ink-soft` | `#4B5550` | Secondary text | 7.24:1 on `bg` |
| `ink-muted` | `#646D68` | Hints and meta | 5.00:1 on `bg`, 5.34:1 on white (was `#7A837E`: 3.66:1, failed) |
| `brand` / `brand-on` | `#1F5C46` / `#FFFFFF` | Primary actions, trust | 7.84:1 |
| `brand` on `brand-soft` | | Badges, current nav | 6.66:1 |
| `food` | `#E08A2E` | **Fills only**, under dark text | `ink` on `food` 5.93:1 (white on `food` 2.68:1, so never) |
| `food-ink` | `#8F4F0C` | Amber text | 5.64:1 on `food-soft`, 6.38:1 on white |
| `food-star` | `#B86A12` | Rating stars (graphics) | 4.11:1 on white |
| `danger` | `#B4382F` | Errors | 5.92:1 on white, 5.05:1 on `danger-soft` |
| `ok` | `#1E6B43` | Success | 5.56:1 on `ok-soft` |
| `info` | `#1F5A80` | Info | 6.36:1 on `info-soft` |
| `control` | `#8C857A` | Input and checkbox boundaries | 3.65:1 on white, 3.42:1 on `bg` (non-text, needs 3:1) |
| `line` | `#E7E1D8` | Decorative dividers only | n/a |
| `ring` | `#1F5C46` | Focus ring, 2 px + 2 px offset | 7.34:1 on `bg` |

## Scales
- **Type:** Tailwind defaults (12 to 60 px). Inputs are 16 px on phones so iOS doesn't zoom, and 14 px from `sm` up.
- **Spacing:** 4 px scale. Containers: `max-w-content` (72 rem) and `max-w-prose` (42 rem).
- **Radius:** 8, 12, 14 (`xl`), 16, 20 (`2xl`) px. **Shadows:** `card`, `raised`, `overlay`.
- **Z-index:** `sticky` 30, `header` 40, `drawer` 50, `toast` 60, `modal` 70.
- **Targets:** buttons are 44 px (`md`) or 36 px (`sm`), above the 24 px minimum in WCAG 2.2.

## Primitives
- **Buttons:** `Button`, `LinkButton` and `buttonClass`, with a focus ring, a pressed scale and a disabled state.
- **Forms:** `Field` (with an "(optional)" marker), `Input`, `Select`, `Textarea`, `Checkbox`.
- **Status:** `Badge` and `StatusBadge` (text plus colour, never colour alone), `VerifiedLabel` (explains itself in its title), `Flash` (`role=alert` or `status`), `Stars` (screen-reader text "out of 5").
- **Layout and data:** `Card`, `Stat`, `Empty` (with an action), `Skeleton`, `Table` (`scope=col`), `Pagination` (windowed, `aria-current`).
- **Media and navigation:** `Photo` (falls back to a placeholder when an image fails, including before hydration), `PhotoGallery` (swipe strip, grid, keyboard lightbox), `NavLinks` (`aria-current`), `OwnerTabs`, `ListingProgress` (`aria-current="step"`), the `<details>` mobile menu, and a skip link.
- **Search:** `SearchFilters` (one GET form), `FilterDrawer` (inline on large screens, a native modal sheet on phones, inline without JavaScript), `AppliedFilters` (removable chips), `SearchViewToggle`, `SearchResults`.
- **Status:** `StatusBadge kind=…` gives plain-language labels per record type, so "pending" reads differently for a payout and a subscription.

## Motion policy

Defined in [`apps/web/components/motion.tsx`](../../apps/web/components/motion.tsx):
- **Section reveal:** `IntersectionObserver` plus CSS (380 ms, ease-out). Only sections that start below the fold are hidden, and they show without JavaScript. No animation library is involved.
- **Drawers and dialogs** (the filter sheet and the photo lightbox): native `<dialog>` elements with a 220 ms CSS entrance (`dialog.sheet` in `globals.css`). Focus trapping, Escape and an inert background come from the browser. The free `motion` package was trialled: mounting it added 38.8 kB gzipped to every route (measured). Once every interaction worked natively, nothing used it, so it was removed rather than shipped unused.
- **Durations:** 150 ms feedback, 220 ms panels, 380 ms sections. Exits run at about 65 % of the entrance.
- **Reduced motion:** a global CSS rule shortens transitions, `usePrefersReducedMotion()` gates reveals, and the 3D scene renders one still frame.
- **Not allowed:** scroll hijacking, custom cursors, magnetic effects on booking or payment controls, stagger over more than 6 items, motion behind dense forms.

## 3D hero

Files: `apps/web/components/hero/{HeroVisual.tsx, hostel-scene.ts, HeroIllustration.tsx}`.
- **What it is:** an original, procedural stylised hostel built from boxes and cylinders. There are no downloaded models or textures, and it's captioned "Illustration, not a real property."
- **Loading:**
  - The static SVG renders first, at the same size, so nothing shifts.
  - `three` loads in its own chunks (dynamic import) only on `/`. The homepage's first load is 108 kB, against 106 kB before the redesign.
- **Fallbacks:**
  - No WebGL, Save-Data, or initialisation failure: the SVG stays.
  - Context lost and not restored within 3 s: back to the SVG.
- **Lifecycle:** it pauses offscreen and in hidden tabs, and disposes of everything on unmount.
- **Rendering:** pixel ratio is capped at 1.75 (1.25 on low-memory devices). There are no shadows or post-processing.
- **Accessibility:** the canvas is `aria-hidden` and not focusable, and all meaning is in HTML.
- **Verified** (`apps/web/e2e/design.spec.ts`): the 3D mode renders and animates; reduced motion draws exactly one frame; without WebGL the static mode shows and search still works; a lost context that isn't restored falls back to the illustration; no other route downloads `three`.

## Sources and licences

| Item | Licence | How it's used |
|---|---|---|
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) @ `d14efff` | MIT | Read as guidance: the retheming method and the priority checklist (accessibility, touch, performance, layout, typography, animation, forms, navigation). No code copied. |
| `motion` 13.5.1 | MIT | Trialled, measured (38.8 kB gzipped per route) and removed; not shipped |
| `three` 0.186.1 | MIT | npm dependency |
| `@fontsource-variable/inter` 5.3.0, `@fontsource-variable/fraunces` 5.3.0 | OFL-1.1 | Self-hosted fonts |
| `@axe-core/playwright` 4.13.0 | MPL-2.0 | Test-only accessibility scans |
| 21st.dev, motionsites.ai, threeui.com, motion.dev docs | n/a | **Not accessible** from the build sandbox (network policy). Nothing was viewed or reused from them. |

No third-party images, 3D assets, logos or testimonials are used. The demo seed's hot-linked Unsplash photos are listing placeholders handled by PRP-06.

## Screenshots

`screenshots/before-*` were taken at commit `57e09cb`; `after-*` after batch 1. Captured with Playwright Chromium against the demo seed. External photo hosts are blocked in the capture sandbox, so property photos show the placeholder.

## Bundle (first-load JS, `next build`)

| Route | Before (`57e09cb`) | After |
|---|---|---|
| `/` | 106 kB | 109 kB (+ `three` in 2 lazy chunks, only with WebGL) |
| `/hostels` | 107 kB | 110 kB |
| `/hostels/[slug]` | 108 kB | 110 kB |
| `/for-owners`, `/owner`, `/admin/*`, `/account` | 106–107 kB | 106–107 kB |
| `/owner/hostels/[id]`, `/owner/hostels/new` | 125 kB | 125 kB (Leaflet pin picker, unchanged) |
