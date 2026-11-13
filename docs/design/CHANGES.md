# Frontend upgrade: change summary (PRP-12)

Branch `claude/hostels-best-of-both`. Commits:
- `fe6fdbe`: batch 1, tokens, shell, homepage, 3D.
- `cfee867`: batch 2, search and property.
- `f7a6aea`: batch 3, owners.
- `1390dbb`: batch 4, workspaces.
- Batch 5 (this one): `motion` removed, bundle measured, this summary.

Backend logic, authorization and API contracts are unchanged, with one additive field: `RoomType.bedsUpdatedAt`, from migration `0005`. Nothing was merged or deployed, and nothing was bought.

## Deliverables

| | Deliverable | Status | Where / evidence |
|---|---|---|---|
| A | Design-system source of truth | **Implemented and verified** | `apps/web/lib/tokens.ts` feeds `tailwind.config.ts`; `docs/design/system.md` has the measured contrast table. axe finds no serious or critical issues on every swept route. |
| B | Reference and component sources, licence notes | **Implemented and verified** for what was reachable. **Blocked by external access** for 21st.dev, MotionSites, ThreeUI and the motion.dev docs: the sandbox network policy blocks them, so nothing was viewed or reused from them. | `docs/design/system.md` › Sources and licences |
| C | Shared motion policy | **Implemented and verified** | `components/motion.tsx` and `globals.css`. Reduced motion is tested (the 3D scene draws exactly one frame). The `motion` library was measured, then removed as unused. |
| D | Working 3D scene and fallback | **Implemented and verified** | `components/hero/*`. Tests cover: renders and animates; reduced motion; no WebGL; lost context falls back; `three` is never downloaded off `/`. |
| E | Upgraded public pages | **Implemented and verified** | Pages: `/`, `/hostels`, `/hostels-in/[area]`, `/hostels/[slug]`, `/for-owners`. Tests: `design.spec.ts`, `search.spec.ts`, `owners.spec.ts`. |
| F | Upgraded owner, resident and admin interfaces | **Implemented and verified** for the states the demo seed produces. **Implemented, verification incomplete** for states it doesn't (a rejected listing, an overdue resident, an empty owner account). | Owner onboarding (`ListingProgress`, `OwnerTabs`, bed freshness), status labels on 20 call sites, labelled controls, display headings. `workspaces.spec.ts` covers 26 routes. |
| G | Responsive and accessibility fixes | **Implemented and verified** | See the list below. Overflow is checked at 360, 390, 768, 1024 and 1440 on 4 public routes plus 26 signed-in routes; axe (WCAG 2.2 AA) runs on all of them. |
| H | Regression tests | **Implemented and verified** | 36 Playwright tests pass on a fresh database. API: 99, including bed-freshness, mutation-checked. Shared: 28. Typecheck 4/4. Lint clean. |
| I | Before/after screenshots | **Implemented and verified** where captured | `docs/design/screenshots/`: home, search, property, account, owner, admin (before at `57e09cb`), plus the filter sheet and no-results state. Listing photos are blocked in the capture sandbox, so they show the placeholder. |
| J | Measured performance notes | **Implemented and verified** for bundle size | `docs/design/system.md` › Bundle. No Lighthouse or field metrics were run (no public deployment). |
| K | Remaining limitations | See below | |

## Responsive and accessibility fixes found by the checks

- **Overflow** on `/account` at 360 and 390 px (527 px), and on the property page review header at 360 px.
- **Contrast**:
  - `ink-muted` was 3.66:1.
  - Amber text everywhere (2.36–2.68:1).
  - White-on-amber "Pay now" (2.67:1).
  - Hero buttons whose colour overrides lost to Tailwind's stylesheet order.
- **Names and labels**:
  - Leaflet pins had no accessible name.
  - Map attribution links were told apart by colour only.
  - 7 unlabeled form controls in the workspaces.
  - The menu table had no header scope.
- **Target size**: map pins were 18 px; now 28 px. Pins that overlap at the fitted zoom are covered by the text list under the map, under WCAG 2.5.8's equivalent-control rule.
- **Semantics**:
  - Review and stat figures are now `dt`/`dd` pairs.
  - Search uses `<search>`.
  - Breadcrumbs and `aria-current` on navigation, tabs, pagination and steps.
  - Cards are one link named after the hostel.

## Product bugs found along the way (fixed)

- **Stale public pages**: public pages kept showing old data for up to 30 s after an admin approved or verified a listing. Every successful mutation now clears a `public-data` cache tag.
- **Lost photo errors**: images that failed before hydration never showed their fallback.
- **Dropped clicks**: Next's client router dropped a filter-chip click that raced its own prefetch (seen in a trace). Search-state links are now plain links, like the GET form.
- **Unbacked copy**, removed or corrected against the code:
  - "real photos", "live beds", "thousands of students";
  - review and fee wording.

## Remaining limitations

- **References**: 21st.dev, MotionSites, ThreeUI and the motion.dev docs were not reachable, so none of them shaped this work.
- **Listing photos**: demo listing photos are hot-linked Unsplash URLs. Local demo photos are planned in PRP-06.
- **Untested states**: workspace states the seed doesn't create were not swept (see F).
- **Mobile app**: not restyled here. Its runtime check is PRP-08.
- **Performance**: no real-device or Lighthouse measurements. The public site isn't deployed.
- **Fonts**: Fraunces as the display font is a design choice to confirm (open question in PRP-12).

## Next

The remaining core PRPs, in master-index order:
1. 02: authorization and invite links.
2. 03: bed allocation (the `updateRoomType` lost update).
3. 04: payment modes.
4. 05: workflows.
5. 06: uploads.
6. 07: the rest of accessibility.
7. 08: mobile runtime.
8. 09: deploy config.
9. 10: backup.
10. 11: hardening.
