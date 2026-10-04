# YieldVault Frontend

A React + Vite frontend for **YieldVault**, a Soroban DeFi yield vault on the
Stellar network. The app lets users browse vaults, deposit and withdraw, and
track their positions and earned yield.

> This build runs entirely on mock data — no network calls are made — so it
> works offline for development and demos.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

To use custom network settings, copy `.env.example` to `.env.local` and edit
the values. All variables are optional.

## Project structure

```
src/
  components/   reusable UI (Button, StatCard, VaultCard, FormWizard, ...)
  pages/        routed views (Home, Dashboard, VaultDetail, Positions, WizardDemo)
  hooks/        data hooks (useWallet, useVault, useVaults, usePositions)
  context/      AppContext for shared wallet state
  services/     mock api / wallet / vault services
  utils/        formatting, validation and share math
  constants/    assets and app config
  styles/       plain CSS, split by concern
```

## Features

- Landing page with hero and feature highlights
- Dashboard showing protocol TVL, average APY and your aggregate position, plus
  an APY-by-vault trend chart with a clickable legend to show/hide each
  vault's series (`LineChart`/`ChartLegend`)
- Vault detail pages with multi-step deposit/withdraw wizards (Amount → Review → Confirm) and a live shares preview
- Multi-step form wizard (`FormWizard`) for any guided step-by-step flow — reusable component with validation, animated transitions, progress tracking, and keyboard support
- Wizard demo page at `/wizard-demo` showcasing a 4-step "Create Vault" form example
- Positions list with per-vault value and earned yield
- **Resizable table columns** — data tables feature interactive column resize handles for customizing column widths
- **Amount input with thousands separators** — deposit and withdraw forms now display amounts with comma separators for better readability (e.g., 1,000,000)
- **Slippage tolerance setting** — users can configure their maximum acceptable price slippage for transactions with preset options (0.1%, 0.5%, 1.0%) or custom values, persisted to localStorage
- **Asset preference** — remembers the last used asset in the wizard and pre-selects it on subsequent visits, persisted to localStorage
- Mock Stellar wallet (connect/disconnect, balances, signing)
- Loading, error and empty states throughout
- **Browser font scaling** — all font sizes use `rem` units and layout
  constraints scale proportionally, so the UI respects the user's browser
  default font size setting
- **Tablet landscape layout** — a dedicated breakpoint for tablet-class
  devices in landscape orientation (see `TABLET_LANDSCAPE_QUERY` in
  `src/constants/breakpoints.js`) widens the deposit/withdraw panel and the
  form wizard instead of leaving them phone-narrow, and tightens the
  wizard's vertical spacing for the shorter viewport
- **Screen reader support** — route changes are announced to screen readers via an ARIA live region (`RouteAnnouncer` component), providing navigation feedback to users of assistive technologies. All icon-only buttons include descriptive aria-labels for accessibility

## Recovering from page errors

A page render failure leaves the navbar and footer available. Navigating to a
different pathname, including another vault ID, clears the failed route boundary
and displays the destination. The existing Try again, Reload page and Go home
actions remain available where applicable. Query-string and fragment changes
on the same pathname do not automatically retry a failed page.

The navigation reset applies only to a boundary in an error state. It does not
remount a healthy page or the shared application provider, and it preserves the
existing redacted diagnostics and correlation references.

### Vault request ownership

A vault load only updates data, loading state, or diagnostics while it is the
current request. Starting another load supersedes the previous one; changing
vault IDs or unmounting retires pending callbacks. An old response can no longer
replace a healthy destination, display its previous vault's error, or finish
the destination's loading indicator. Current dependency failures retain their
correlation reference and the Retry action.

The maintained `test/integration/errorBoundaries.test.jsx` file exercises the
actual App, router, provider, navbar, pages, hook and diagnostics with deferred
service responses. The same complete 17 cases produced **13 passed / 4 failed**
against the previous hook and **17 passed / 0 failed / 0 pending** after the
repair. Five added cases cover obsolete success and failure, loading while the
new request remains pending, current-failure retry, and failure after unmount.
All 12 existing integration cases remain and passed both times, including
healthy Withdraw-tab preservation and same-path query/fragment behavior.

Source pins: baseline hook `c5b55e35b0e9907bb73331c9ed8524dc21cbd73f` at
`443077d424c47918f8d57f12065068a9a543bba3`; repaired hook
`76c7066ccde6b196fb0e4fcb652ca6959b451fc1`; identical test blob for both
runs `46bfa5d42f18c1c9fb4c976173a494fa73917503`.

Reproduce from the repository with its existing dependencies:

```bash
NODE_OPTIONS=--max-old-space-size=128 node node_modules/vitest/vitest.mjs run \
  test/integration/errorBoundaries.test.jsx \
  --maxWorkers=1 --no-file-parallelism --pool=threads
```

The local run used the unchanged Vite configuration and setup on Linux,
Node 24.19.0, React 18.3.1, React Router DOM 6.30.4, Testing Library 16.3.2,
jsdom 29.1.1 and Vitest 4.1.10 (root Vite 5.4.21, internal Vite 8.1.5).
Retained dependencies were reused without installation or manifest changes.
This is mounted DOM integration evidence; the full suite, production build,
Chromium and live wallet/provider execution were not rerun for this change.

## Design & Typography System

YieldVault uses a structured, standardized design system powered by CSS variables under `:root` in `src/styles/index.css`.

### Typography Scale
- **Font Sizes**:
  - Extra Small (`--fs-xs`): `0.75rem` (12px)
  - Small (`--fs-sm`): `0.875rem` (14px)
  - Base (`--fs-base`): `1rem` (16px)
  - Medium (`--fs-md`): `1.125rem` (18px)
  - Large (`--fs-lg`): `1.25rem` (20px)
  - Extra Large (`--fs-xl`): `1.5rem` (24px)
  - 2X Large (`--fs-2xl`): `1.875rem` (30px)
  - 3X Large (`--fs-3xl`): `2.25rem` (36px)
  - 4X Large (`--fs-4xl`): `2.625rem` (42px)
  - 5X Large (`--fs-5xl`): `3.25rem` (52px)
- **Line Heights**: `--lh-tight` (1.2), `--lh-snug` (1.35), `--lh-normal` (1.5), `--lh-relaxed` (1.625)
- **Font Weights**: `--fw-normal` (400), `--fw-medium` (500), `--fw-semibold` (600), `--fw-bold` (700)

### Utility Classes
To quickly apply standardized font properties, the design system exposes utility classes:
- Sizes: `.text-xs`, `.text-sm`, `.text-base`, `.text-md`, `.text-lg`, `.text-xl`, `.text-2xl`, `.text-3xl`, `.text-4xl`, `.text-5xl`
- Weights: `.fw-normal`, `.fw-medium`, `.fw-semibold`, `.fw-bold`

## Utilities & hooks

Reusable building blocks live under `src/utils` and `src/hooks`:

- `utils/format.js` — currency, percent, share and address formatting
- `utils/positions.js` — portfolio aggregation (`summarizePositions`)
- `utils/shares.js` — vault share-price and deposit/withdraw math
- `utils/chartSeries.js` — build chart series from per-vault APY history, and
  scale the axis domain from only the currently visible series
- `hooks/useApyHistory` — load APY history per vault (one fetch per vault,
  mirroring YieldVault-Backend's `GET /api/vaults/:id/apy-history`)
- `hooks/useMediaQuery` — subscribe to a CSS media query
- `hooks/useClipboard` — copy text with transient "copied" feedback
- `hooks/useDocumentTitle` — set the browser tab title per page

## Scripts

| Command           | Description              |
| ----------------- | ------------------------ |
| `npm run dev`     | Start the dev server     |
| `npm run build`   | Build for production     |
| `npm run test`    | Run the test suite        |
| `npm run preview` | Preview the build        |
| `npm run test`    | Run Vitest tests         |
