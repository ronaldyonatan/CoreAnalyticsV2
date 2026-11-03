# Settings, Management, account, onboarding, and shared controls

> Status terbaru: [pemusatan ownership stylesheet selesai](./theme-css-ownership-completion.md). **0 temuan CSS**; 30 temuan logic identitas theme JavaScript masih dicatat. Angka dan dependency di laporan tahap ini adalah riwayat sebelum pemusatan terakhir.

This phase continues from the user-approved working tree, without any Git commit. The full application migration is **not complete**: `theme-ownership-audit.json` reported 651 findings at the end of this historical phase. At that point the old JEC stylesheet still had active consumers.

## Ownership implemented

- Settings and Management material rules now belong to `settings-materials.css` and `management-materials.css`. Theme definitions provide their surfaces, foregrounds, shadows, filters, and state values. Mixed legacy selector groups were split so unrelated Company/Daily/Login consumers retain their rules.
- Registry `surfaceFamily` selects one of four reusable material recipes: holographic, luminous, daylight, clinical. It is independent of environment and performance. The provider and App publish the capability; shared component CSS contains no theme IDs. A new theme can select a recipe and supply values without adding component conditions.
- `clinic-picker.css` owns both healthcare pickers, including selected/idle options, focus, placeholder, hover, and page context. `PanelFilterHealthcare.tsx` and `SciFiDropdown.tsx` no longer read theme identity. Hover retains the original pointer capability gate; selected rows do not inherit idle-row hover styling.
- `voice-registration.css` owns enrollment structure and visual roles; recording behavior is unchanged.
- `company-mobile-grid.css` owns responsive table geometry. Sticky-cell colors use tokens; existing themes intentionally retain their original dark opaque cell surfaces.
- `account.css` owns account forms, alerts, tabs, recorder, and responsive layout. Local `--ma-*` values became root semantic `--account-*` values. Superseded JEC local variable declarations were removed after accounting for the page stylesheet's later cascade.
- `login-tour.css` and `dashboard-tour.css` own guided-tour structure, controls, and motion. Values use tokens. Explicit on+hover and narrow-screen filter roles preserve the original specificity behavior, including the existing Quartz treatment.
- All these modules load through `src/design-system/index.css`; application components no longer import their old page CSS.

## Files removed in this phase

- `src/management/UserVoiceRegistration.css`
- `src/components/CompanyMobileGrid.css`
- `src/components/MyAccount.css`
- `src/onboarding/LoginSpotlightTour.css`
- `src/onboarding/PostLoginSpotlightTour.css`

Their active structures moved to the Design System, and visual values became semantic roles. No unused-class heuristic or filename-only legacy replacement was used. `theme.css` and `jec-brand-themes.css` retain only the portions not yet migrated.

## Main files created or updated

New Design System modules: `settings-materials.css`, `management-materials.css`, `clinic-picker.css`, `voice-registration.css`, `company-mobile-grid.css`, `account.css`, `login-tour.css`, `dashboard-tour.css`.

Updated: `themes.ts`, `ThemeContext.tsx`, App root capability attributes, seven theme definitions, Design System entry/defaults/contract, both picker consumers, enrollment/account/tour imports, and four financial panel imports. The two legacy theme files lost migrated rules. Previous working-tree changes remain intact.

New regression driver: `scripts/verify-clinic-picker.mjs` (`npm run theme:verify-clinic`). It creates baseline/current React fixtures, compares all computed properties, and cleans the temporary files in `finally`. `verify-theme-css.mjs` now accepts an approved working-tree `BASELINE_DIRECTORY`, includes nested form/table/account/tour fixtures, supports forced hover/focus, and freezes pseudo-element animation timing.

## Verification and scope

Builds were run after each significant group, including corrections to focus/hover cascade. TypeScript and Vite pass; the existing large-chunk warning remains. Final production build output: 674.00 kB CSS (90.14 kB gzip), 2,552.08 kB JavaScript (659.40 kB gzip). CSS has grown while semantic values coexist with remaining compatibility ownership; this phase does not claim bundle optimization.

Seven existing themes are checked against the approved baseline with 546–553 nested fixture nodes per theme. Desktop, 390 px hover, and 390 px keyboard focus with reduced motion all have zero computed-property differences. Reports: `theme-material-desktop-verification.json`, `theme-material-mobile-hover-verification.json`, `theme-material-mobile-focus-verification.json`. These compare computed CSS, not screenshots, authentication, microphone recordings, or WebGL frames.

Healthcare pickers: seven themes × three page contexts × three selections (selected/reset/empty) × three pseudo states = **189 comparisons per mode**. Desktop and 390 px touch/reduced-motion both pass with zero computed-property differences. Reports: `theme-clinic-desktop-verification.json`, `theme-clinic-touch-verification.json`.

A temporary green theme was added using only its CSS file and registry metadata, with clinical materials, a technical-grid environment, and static performance. It built and rendered all 17 shell states; explicit assertions verified green Settings surfaces/text. The temporary theme was removed. This proves extensibility of the migrated consumers, not every remaining application surface. See `theme-material-extension-verification.json`.

Final real-shell comparison: seven themes × 17 states = **119 comparisons, zero differences**. See `theme-material-shell-verification.json`. The driver refreshes detached hover handles when React replaces a navigation node; this changes only test synchronization.

The browser uses an isolated Chrome profile and synthetic local data. Shell runtime checks block non-local requests and mock speech recognition. No real account, API mutation, or microphone is involved.

## Remaining work

Current inventory: 14 embedded stylesheets, 30 theme identity findings, three application CSS imports, four stylesheets outside the owner, and 600 named-theme component rules. Counts are findings, not file counts. The audit is not exhaustive for inline/Tailwind/Three.js values.

Active CSS owners still to migrate:

- `src/theme/theme.css`
- `src/theme/jec-brand-themes.css`
- `src/dashboards/financial/company-performance-theme.css`
- `src/executiveIntelligence/components/executive-briefing.css`

Procedural chart palettes/materials, embedded component styles, and the Login Portal gateway/orb still need their own consumer migration and parity checks. Their compatibility rules have not been deleted. No claim of complete application pluggability is made.

## Visual review

Check Settings/Management all themes (including input focus), both healthcare pickers (selected, hover, search, empty, mobile), account password/voice tabs and alerts, voice enrollment screens, both guided tours with audio on/off and mobile overlay, and sticky financial tables. Smoke-test Login Portal/theme chooser, JEC Skywave/Horizon, Solaris/Quartz, Company Performance, Daily Tracking, header/sidebar, and fullscreen/restore. Real voice and authentication flows require normal manual testing.

No Git commit was made.
