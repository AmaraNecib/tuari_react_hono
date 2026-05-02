# Bundle and Route Modularization Notes

Implemented route-level code splitting in `apps/web/src/router.tsx` by lazy-loading `HomeView`, and feature-level splitting in `home-view-page-content-detail-pages.tsx` by lazy-loading heavy detail and inventory pages.

Expected effect:
- The initial router path no longer eagerly imports the full app-shell feature tree.
- Detail pages, invoice pages, inventory pages, debts pages, and edit/create forms load on demand.

Validation commands:
- `pnpm --filter @tuari/web typecheck`
- `pnpm --filter @tuari/web test -- --run`
- `pnpm build`

Future optional tuning:
- Add a bundle visualizer if manual chunking is needed.
- Prefer dynamic imports over manual chunks unless build output shows a specific shared dependency problem.
