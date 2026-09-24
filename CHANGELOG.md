# Changelog

All notable changes to the YieldVault frontend are documented here. This
project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Restrictive CSP + dependency audit gate** — production hosting headers
  (`public/_headers`, `vercel.json`), Vite preview parity, documented CSP
  exceptions for Stellar wallet/RPC origins, and a CI gate that fails on
  critical `npm audit` findings / disallowed licenses (`npm run audit:deps`).
- **Idle-session auto-lock** — monitors user activity and warns 1 minute
  before auto-disconnecting the wallet after 15 minutes of inactivity.
  Includes a `SessionTimeoutModal` countdown with a "Stay Connected"
  button, the `useIdleTimer` hook, and visual urgency pulse under 30 s.
- Multi-step form wizard (`FormWizard`) — a reusable component with step
  indicator, animated panel transitions, per-step validation, progress bar,
  keyboard support, and customizable submit labels.
- `DepositWizard` — multi-step deposit flow (Amount → Review → Confirm)
  replacing the single-step deposit form on vault detail pages.
- `WithdrawWizard` — multi-step withdraw flow (Amount → Review → Confirm)
  replacing the single-step withdraw form on vault detail pages.
- `WizardDemo` page at `/wizard-demo` showcasing the wizard with a
  four-step "Create Vault" form (Basics → Strategy → Review → Deploy).
- Reusable UI components: `Tag`, `ProgressBar`, `CopyButton`, `Alert`,
  `Modal`, `Tooltip`, `Avatar`, `StatGrid`, `Pagination` and `ThemeToggle`.
- Hooks: `useToggle`, `usePrevious`, `useInterval`, `useOnClickOutside`,
  `useWindowSize` and `useKeyPress`.
- Formatting helpers for APY, projected yield and signed amounts.
- Validators for Stellar addresses and percentage ranges.
- Vault metadata and risk-tier constants under `src/constants/vaults.js`.
- Opt-in light theme via a persisted `data-theme` attribute.
- `prefers-contrast` media query support — automatic high-contrast mode
  with stronger borders and improved text readability, plus a low-contrast
  mode with softer visuals for light-sensitive users.
- Converted all `src/lib/` utility modules from CommonJS to ES module
  syntax (`export default`) and migrated `test/lib/` suites from
  `node:test` to `vitest` for consistency.

### Changed

- Added precision loss protection for large amounts in deposit/withdraw flows
  by implementing `safeParseNumber` helper that validates against
  `Number.MAX_SAFE_INTEGER` before parsing numeric values.

## [0.1.0]

### Added

- Initial React + Vite frontend with routing, mock services and core pages
  (Home, Dashboard, VaultDetail, Positions).
