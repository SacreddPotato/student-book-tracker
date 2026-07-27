# React Frontend Revamp Design

**Date:** 2026-07-10

**Status:** Approved in conversation

**Migration decision:** Staged replacement with the Svelte MVP retained as a rollback source

**Execution decision:** Inline-first implementation, with subagents reserved for narrow independent audits or final review

## Context

The current Windows desktop application is feature-complete for the MVP, but its Svelte frontend feels rigid. Forms appear abruptly in the page, state changes replace content harshly, controls do not share a coherent spacing system, table actions are crowded, dialogs are visually modal without complete keyboard-modal behavior, and fixed sync overlays can obscure workspace content. Styling is split between large shell-level selectors and component-local rules, producing inconsistent colors, radii, padding, and action intent.

The replacement must preserve every existing local-first workflow while moving the frontend to React. The existing `apps/desktop` SvelteKit application remains intact and buildable throughout the migration. The new application is developed independently and becomes the production release target only after parity, accessibility, desktop, and data-continuity gates pass.

## Goals

- Add a complete React/Tauri desktop project under `apps/desktop-react` without deleting or rewriting `apps/desktop`.
- Preserve current SQLite schema, migrations, local-first writes, outbox behavior, sync contracts, updater behavior, bilingual support, Excel export, and audit history.
- Replace fragmented styling with a semantic interaction and visual system.
- Make state changes feel continuous through stable surfaces, intentional motion, retained data during refreshes, and operation-specific feedback.
- Give tables, action groups, selectors, checkboxes, forms, dialogs, filters, and responsive layouts consistent spacing and keyboard behavior.
- Add genuine rendered-UI browser coverage in addition to database/service integration tests.
- Cut the production release workflow over to React only after the new application proves feature parity and can reuse the existing installed identity and data path safely.

## Non-goals

- Do not change the Hono sync API protocol, Neon schema, shared command contracts, or remote authorization model.
- Do not delete the Svelte source or make it depend on React code.
- Do not run the legacy and React production shells concurrently against the same SQLite file.
- Do not introduce accounts, roles, cloud-only workflows, analytics, or unrelated inventory features.
- Do not silently download or install updates.
- Do not package remote database connection URLs, Neon credentials, GitHub tokens, signing keys, or production shared secrets in the frontend.

## Approaches Considered

### Fully custom React controls

This minimizes dependencies and gives complete visual control, but it would require hand-building focus trapping, focus restoration, keyboard navigation, select behavior, checkbox semantics, and dialog inertness. The current audit found those exact areas incomplete, so repeating them is an unnecessary accessibility risk.

### Pre-themed component framework

A framework such as MUI or Mantine would accelerate initial construction, but it would impose a broad visual language and require extensive overrides to achieve the desired calm desktop density, exact RTL behavior, and controlled motion. It would also make the redesign feel like a library skin rather than a product-specific workspace.

### Headless accessible primitives with an owned design system

This is the selected approach. Radix Primitives supplies behavior for dialogs, alert dialogs, selects, checkboxes, tooltips, popovers, and related focus management. The application owns semantic CSS tokens and component styling. Native HTML remains the default for simple buttons, inputs, tables, and forms.

## Technical Baseline

- React 19.2 with the modern JSX transform.
- TypeScript in strict mode.
- Vite 8 as a client-only SPA build, matching Tauri's recommended static frontend model.
- Tauri 2 with the same SQL, opener, updater, and custom Rust transaction capabilities as the legacy shell.
- TanStack Query for asynchronous read caching, retained data, mutation state, and explicit invalidation.
- Radix Primitives as the headless accessibility layer.
- Vitest, React Testing Library, `user-event`, and `jest-dom` for unit and component behavior.
- Playwright for real rendered-UI workflows and `@axe-core/playwright` for automated accessibility checks.
- Plain CSS organized into tokens, primitives, shell, and feature styles; no utility-CSS framework.

The application does not need URL routing. Primary screens are finite desktop workspace states, and update notifications already request a screen programmatically. A typed navigation controller is smaller and keeps unsaved-draft guards explicit.

## Repository and Cutover Architecture

### Parallel development application

`apps/desktop-react` is a complete npm workspace with its own React source, tests, Vite configuration, Tauri shell, icons, capabilities, and package scripts. Root workspace commands include it automatically, so it must implement `build`, `test`, `typecheck`, and `lint` from its first committed segment.

Parallel development uses:

- Package name `@app/desktop-react`.
- Vite port `1430` and HMR port `1431`.
- Vite output directory `dist`.
- Tauri identifier `com.studentbooktracker.reactdev`.
- Product name `Student Book Tracker React Preview`.
- SQLite filename `student-book-tracker-react.db`.
- Updater disabled.

This prevents the legacy and React development shells from racing on one SQLite file or claiming the same installed application identity.

### Production replacement configuration

The React project also contains an explicit production Tauri configuration used only by the release workflow after the parity gate. It restores:

- Product name `Student Book Tracker`.
- Identifier `com.studentbooktracker.app`.
- SQLite filename `student-book-tracker.db`.
- Existing updater public key and GitHub `latest.json` endpoint.
- Passive NSIS install behavior and signed updater artifacts.
- The existing package version source and release-version validation semantics.

The cutover changes the release build target from `apps/desktop` to `apps/desktop-react`; it does not alter the installed identity, data filename, signing boundary, or updater channel. The Svelte project remains in the repository as a rollback source but is no longer the release target after the cutover.

### Runtime configuration contract

The frontend and Tauri shell select one of two explicit build profiles so their database and updater settings cannot drift:

- `preview` is the default for development, browser fixtures, tests, and ordinary local builds. It resolves `sqlite:student-book-tracker-react.db` and reports updater-disabled state.
- `production` is selected only by the dedicated production build/release command. It resolves `sqlite:student-book-tracker.db`, requires the deployed sync API base URL, and enables updater behavior through the production Tauri configuration.

The profile value is validated at startup and fails closed on an unknown value. The SQL preload entry in each Tauri configuration must match the frontend database URL for the same profile, and a contract test asserts that equality. The React app retains the existing `VITE_SYNC_API_BASE_URL` and optional development-only `VITE_SYNC_API_SHARED_SECRET` semantics. All `VITE_*` values are public bundle configuration: production shared secrets, remote database connection URLs, Neon credentials, GitHub tokens, and signing keys are prohibited.

## Internal Architecture

The React project uses focused feature boundaries rather than cross-importing `apps/desktop/src`.

### Runtime ports and adapters

The application depends on typed ports for:

- SQLite database loading and transactional statement execution.
- ID generation, clock, and device identity.
- Sync transport and online state.
- Updater check, download, and install.
- Workbook download/save.
- Browser/Tauri environment detection.

Production adapters use Tauri plugins and browser APIs. Tests and browser preview inject deterministic adapters. This allows genuine UI testing without pretending that a browser-only Vite page can access the Tauri SQL bridge.

### Core modules

Framework-neutral modules inside the React workspace own:

- SQLite schema, migrations, and repositories.
- The serialized local transaction coordinator.
- Student, book, stock, issuance, and reversal use cases.
- Sync API validation, push/pull application, coalesced runs, status derivation, and conflict acknowledgement.
- Excel workbook construction.
- Updater controller state transitions.
- English and Arabic dictionaries, translation keys, and formatting helpers.

These modules may be ported from the legacy implementation, but they must remove Svelte stores, `$lib` aliases, component-declared view types, and direct package-path assumptions.

### React state

- TanStack Query owns cached read models for students, books, issued books, logs, sync conflicts, and settings.
- SQLite remains the source of truth; query data is never persisted separately.
- Local database queries disable network-oriented automatic retries and window-focus refetching.
- Mutations run use cases, preserve the active form or dialog on failure, invalidate only affected queries on success, and request coalesced sync after committed local writes.
- Small external stores expose sync and updater controller snapshots through `useSyncExternalStore`.
- React context owns language, runtime dependencies, navigation, global notices, and the unsaved-draft navigation guard.
- Feature-local state owns filters, sorting, current selection, draft book IDs, and editor visibility.

### Data flow

1. A component invokes a typed feature mutation.
2. The mutation calls a framework-neutral use case.
3. The use case validates and commits repositories/outbox changes inside the serialized transaction coordinator.
4. The mutation invalidates affected query keys while retaining prior rendered data during refresh.
5. The coalesced sync runner pushes pending commands and applies pulled snapshots.
6. Sync completion invalidates changed entity queries and updates the global status snapshot.
7. The UI announces operation-specific success, offline state, conflict state, or failure without discarding user input.

## Visual and Interaction System

### Product character

The application should feel like a calm, durable administrative desktop tool rather than a marketing dashboard. It uses a warm neutral workspace canvas, white layered surfaces, navy primary actions, emerald success/stock-positive states, amber warnings, and red only for destructive or blocking states. Borders carry most hierarchy; shadows remain shallow and reserved for elevated sheets, popovers, and dialogs.

### Tokens

The token layer defines:

- A 4px base spacing scale with named values from 4px through 48px.
- Field and default button height of 40px; prominent actions may use 42px.
- A 20px visual checkbox inside a row with at least 44px interaction height.
- Table cells with 12px block and 16px inline padding.
- Action groups with an 8px gap and wrapping when space is constrained.
- Surface radii of 10px, control radii of 8px, and elevated-panel radii of 14px.
- One high-contrast focus ring shared by every interactive primitive.
- Semantic colors for canvas, surface, surface-subtle, border, text, text-muted, primary, success, warning, danger, and focus.
- Motion durations of 140 to 180ms for direct control feedback and 200 to 240ms for panels, dialogs, and layout transitions.

Every animation is disabled or reduced when `prefers-reduced-motion: reduce` is active.

### Shell and responsive behavior

- At wide desktop widths, a labelled navigation rail and fluid workspace share the window without a fixed content maximum that wastes horizontal space.
- At medium widths, navigation becomes a compact icon-and-short-label rail.
- At narrow widths, navigation becomes a labelled bottom bar; numeric-only navigation is prohibited.
- Workspace padding scales down through breakpoints instead of jumping at one threshold.
- Feature layouts use minmax grids and container-aware wrapping. Nested horizontal scrolling is limited to data tables that truly require it.
- The document root receives the active `lang` and `dir`, and all layout geometry uses logical properties.

### Shared components

The React design system includes:

- Buttons with primary, secondary, quiet, and destructive intent plus small/default sizes.
- Icon buttons with mandatory accessible labels and tooltips where meaning is not visible.
- Text fields, number fields, selects, checkboxes, field messages, and grouped filters.
- Badges for stock, issued, reversed, sync, update, and warning states.
- Data-table shell with toolbar, result count, sticky header, action-cell alignment, empty state, loading overlay, and narrow card rendering.
- Side sheet for create/edit flows.
- Dialog for focused neutral actions and Alert Dialog for destructive/discard confirmation.
- Toast/notice system for concise success and background information; persistent failures remain inline.
- Skeleton, spinner, empty state, error state, and visually hidden utilities.

Dialog primitives must trap focus, move focus to a meaningful initial target, close on Escape when safe, restore trigger focus, make the background inert, and prevent background scrolling. Destructive confirmations use an explicit danger action; positive confirmations never inherit danger styling.

## Screen Designs

### Students

- Header contains title, student count, search, stage filter, grade filter, Export, and Add Student.
- The student table keeps complete desktop columns, comfortable row height, and a separated action group. Rows support visible selection without making the Edit button ambiguous.
- Create and edit open an inline-end side sheet with a descriptive heading. Changing stage immediately constrains grade choices.
- If the currently selected student has unconfirmed book drafts, a stage-changing edit must be blocked behind the same discard confirmation used for navigation; stale cross-stage draft IDs can never be submitted.
- The issuance workspace shows selected-student context, issued count, available books, comfortable checkbox rows, zero-stock/issued statuses, draft count, and an explicit Confirm action.
- Drafts remain local until confirmation and continue to guard student switching, screen navigation, updater-driven navigation, window unload, and incompatible student edits.
- Export requires a concrete grade, has busy/error/success states, prevents duplicate downloads, remains lazy-loaded, and retains bilingual/RTL workbook behavior.

### Books

- Header contains title, total/zero-stock counts, search, stage filter, and Add Book.
- Table columns retain name, stage, quantity, status, and actions with sticky action alignment on desktop.
- Zero stock uses an amber status and subtle row treatment rather than overwhelming the row.
- Create/edit use the shared side sheet.
- Add Stock uses a neutral dialog with positive primary confirmation, a positive-integer field, duplicate-submit prevention, and preserved input on failure.
- Successful stock changes update quantity smoothly and announce the result without rebuilding the whole table surface.

### Logs

- Header and toolbar provide type, entity text, and date filters plus a visible result count.
- Transactions render as expandable groups with clear type, entity, Cairo-localized timestamp, and status.
- Expanded detail shows every book item, signed delta, and resulting quantity in a spaced table/list.
- `Already reversed` is a status badge, not a disabled action.
- Reversal uses Alert Dialog, identifies the transaction impact, prevents duplicate submission, creates the inverse transaction, and refreshes logs and affected stock/issuance queries.

### Settings and updater

- Settings keeps explicit check, download, and install stages and displays current/available versions and operation progress.
- Startup update availability uses the global notice system and can navigate through the unsaved-draft guard.
- Dismissal remains per available version for the running session; a newer version resurfaces.
- Development and browser preview clearly report updater-disabled state without contacting the production feed.

### Sync and conflicts

- A compact shell status button shows syncing, synced, offline, error, pending, or conflict state without covering workspace content.
- Activating it opens a popover or narrow sheet containing last-sync time, pending count, actionable retry, error detail, and conflicts.
- Conflict rows resolve student/book context for insufficient-stock issues and show safe translated summaries for other rejections.
- Acknowledgement persists only the conflict ID; rejected outbox rows remain auditable and never re-enter the pending queue.
- Failure to refresh conflicts cannot incorrectly collapse the visible rejected count to zero.

## Feedback, Error Handling, and Motion

- Initial loads use skeletons that match final geometry.
- Refreshes retain prior content and use a quiet progress indicator or translucent surface overlay.
- Mutations expose `aria-busy`, disable only duplicate-causing controls, and preserve cancel/navigation choices where safe.
- Form validation is field-specific and associated through `aria-describedby`.
- Database, validation, export, sync transport, remote rejection, and updater errors use operation-specific translated copy.
- Persistent failures use `role="alert"`; background status changes use polite live regions.
- Success feedback is concise and does not require dismissal.
- Panel and dialog motion uses opacity plus small logical-axis translation, never large decorative movement.

## Internationalization and Accessibility

- English and Arabic dictionaries maintain exact key parity.
- The active language updates the HTML element's `lang` and `dir`.
- Dates and numbers use language-aware `Intl` formatting while preserving `Africa/Cairo` time.
- RTL mirrors navigation indicators, sheets, action alignment, and directional icons through logical properties or explicit direction variants.
- Every interactive element is keyboard reachable in a sensible order.
- Focus remains visible against every surface.
- Dialog, sheet, checkbox, select, tooltip, and popover keyboard behaviors are covered by automated component tests.
- Desktop and narrow Playwright journeys exercise keyboard-only operation in both language directions.
- Axe scans cover each primary screen and every open modal surface. Automated results supplement, rather than replace, manual keyboard and focus review.

## Testing Strategy

### Core and integration

- Port the Node SQLite harness to the React workspace.
- Verify migrations, repositories, transaction serialization, inventory workflows, sync push/pull, conflicts, updater controller, and Excel workbook output.
- Preserve tests for concurrent stock increases, offline queue retention, rejected command auditability, reversal idempotency, and Arabic RTL export.

### Component behavior

- Test the shell, language/direction, navigation guard, tables, side sheets, dialogs, forms, filters, issuance drafts, reversal, updater, sync status, and conflicts with React Testing Library and realistic `user-event` interactions.
- Assert focus entry, focus trap, Escape, focus restoration, busy states, duplicate prevention, retained input after failures, and success announcements.

### Rendered UI

- Run Playwright against a deterministic browser runtime adapter with seeded data.
- Cover Students, Books, Logs, Settings, sync conflicts, updater notification, English, Arabic RTL, desktop width, narrow width, keyboard journeys, overlay collision, responsive table/card behavior, and export triggering.
- Run Axe against stable screen states and open dialogs/sheets.

### Desktop and regression gates

- Run the React workspace test, typecheck, lint, build, and Playwright suites.
- Run the full monorepo test, typecheck, lint, and build commands, proving the legacy project still works.
- Run Cargo check for the React Tauri shell.
- Smoke the React development shell against its isolated SQLite database.
- Build the production React NSIS target using the production config and verify installer, signature expectation, and updater metadata behavior without exposing the signing private key locally.
- Before release cutover, make a backup of a representative legacy database, launch the production-identity React build against a copy, and verify students, books, issued rows, logs, settings, outbox, and sync cursor continuity.

## Release Cutover Gate

The release workflow switches to React only when all of the following are true:

- Every documented MVP workflow has React component coverage and passes.
- Real rendered-UI Playwright journeys pass in English and Arabic at desktop and narrow widths.
- Automated accessibility scans and manual keyboard/focus review have no unresolved blocking issues.
- React Tauri development smoke proves local migrations and writes through the real SQL bridge.
- Production-identity data continuity is verified on a copied legacy database.
- Root workspace verification remains green with both frontends present.
- The React production build retains the original identifier, database filename, updater public key/feed, and signing-secret boundary.
- The Windows release workflow and runbooks are updated to the React path.
- `AGENTS.md` records the completed migration, commands, environment notes, rollback source, and next starting point.

## Risks and Mitigations

- **Logic drift while both frontends exist:** Treat the legacy tests and behavior inventory as contracts; port one workflow at a time and keep parity tests explicit.
- **Concurrent database access:** Use separate development identifiers and filenames; use the production identity only for controlled cutover verification and releases.
- **Updater collision:** Keep updater disabled in React development and leave the production feed/release workflow on Svelte until the final gate.
- **Browser tests hiding Tauri failures:** Separate rendered-UI adapter tests from Node SQLite integration and real Tauri smoke; do not claim one substitutes for another.
- **Over-animation:** Motion is short, functional, and reduced-motion aware; retained data is preferred over decorative transitions.
- **Large rewrite regressions:** Implement in independently verifiable segments with continuous root regression checks and the legacy source preserved.

## Implementation and Review Strategy

Implementation will follow a detailed TDD-oriented plan. To preserve token usage, the primary agent executes sequential dependent tasks inline using the executing-plans workflow. Subagents are not dispatched per task. They are reserved for cases where an independent audit materially improves confidence, such as a final parity/accessibility review or isolated investigation of unrelated failures. This still satisfies the requested delegation intent without multiplying full-context implementation and review turns.
