# Expandable Book Audit And MVP Release Design

## Scope

Add an inline, cross-academic-year audit trail to each Books table row, replace both semester stock action icons with a simple plus icon, verify the accumulated semester/year work, publish the next demo Windows release, publish `v1.0.0`, and merge the verified `pre-release` branch into `main`.

The development Neon branch migration has already been applied and inspected under redacted target fingerprint `7368381c29be`. It contains the required academic-year, semester quantity, receipt, and semester transaction columns with three Drizzle migration records and empty placeholder application tables. The expandable audit feature uses those existing columns and requires no additional database migration.

## Book Row Interaction

- The main subject row is pointer-clickable across its full width.
- A downward chevron at the row end communicates disclosure; it rotates upward while expanded.
- The chevron is also a native keyboard-accessible button with `aria-expanded` and `aria-controls`.
- Clicking the plus or edit action stops propagation and performs only that action.
- Each semester stock action uses Lucide's simple `Plus` icon and retains a semester-specific accessible label.
- Expanding inserts one full-width detail row immediately below the subject row. Only one subject needs to be expanded at a time.

## Cross-Year Audit Data

The React backend exposes a book-specific history query rather than assembling every academic year's Logs screen in the component. SQLite retrieves transaction items for one book, joins their transactions and optional student, and orders events newest first. The fixture backend projects the same contract for component and rendered tests.

Every history event contains:

- transaction and item IDs;
- academic year;
- operation type: stock addition, student issuance, or reversal;
- semester;
- signed quantity delta and quantity after;
- student name when applicable;
- receipt number and receipt date for stock additions;
- operation timestamp;
- reversal relationships/status.

For stock additions, the prominent date is the receipt date. For issuance and reversal, it is the Cairo-localized operation timestamp. Reversed originals remain visible and clearly marked, and the inverse reversal remains a separate audit event so the balance history is complete.

## Expanded Presentation

The detail row resembles the existing Logs cards but is denser and scoped to one subject. Events are grouped visually by academic year. Each event shows a translated operation label, semester badge, signed quantity, resulting balance, and the relevant metadata:

- addition: receipt number and receipt date;
- issuance: student name and issuance date/time;
- reversal: reversal label and date/time.

Loading, empty, and query-failure states remain inside the expanded row. Expansion is lazy, and successful stock, issuance, or reversal mutations invalidate book-history queries so an open row refreshes without reopening it.

## Accessibility And Responsive Behavior

- The disclosure button has an explicit subject-specific accessible name.
- Pointer activation covers the main row while keyboard activation remains on the native chevron button.
- Nested action buttons do not trigger expansion.
- The expanded history uses semantic lists/articles and does not create nested tables.
- At narrow widths, event metadata wraps into a single-column card without horizontal page overflow.
- Chevron animation is disabled under reduced motion.

## Testing

Test-first coverage will prove:

- the backend returns all years for one book in newest-first order;
- receipt metadata appears only where applicable;
- issuance dates/student names and reversal status are projected correctly;
- clicking the row or chevron expands/collapses the correct detail;
- plus/edit actions do not toggle the row;
- both stock actions use plus icons and retain semester-specific accessible names;
- mutations invalidate and refresh the expanded history;
- Arabic/English dictionary parity and rendered narrow RTL behavior remain valid.

## Verification And Release Sequence

1. Run focused feature tests, then the complete repository tests, rendered Chromium suite, typecheck, lint, build, Rust check, and a real Tauri smoke where feasible.
2. Commit and push `pre-release`.
3. Wait for the Windows CI quality gates and the automatic next `0.1.0-demo.N` signed EXE release; verify the installer, signature, and `latest.json` assets.
4. Pull the CI-authored version commit so local `pre-release` matches the released tag.
5. Set the React desktop version to `1.0.0`, commit, create annotated tag `v1.0.0`, push the branch and tag, and wait for the signed Windows release to pass and publish.
6. Verify the `v1.0.0` installer, signature, updater metadata, and release source.
7. Merge the verified `pre-release` tip into `main` without dropping the preserved legacy frontend, then push `main`.
8. Run a final requirement/evidence audit and update `AGENTS.md` with release and merge results.

No release or merge is considered complete from a local command alone; GitHub check and release state must confirm it.
