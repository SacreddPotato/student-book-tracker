# Single-Cell Excel Logo Design

## Scope

Replace the logo reservation in both React Excel exports with one unmerged middle-row header cell. The selected cell is 128 by 128 pixels, and the JPEG logo is centered vertically inside it while preserving its `1080:1063` aspect ratio. Equal-height rows above and below place the logo's center on the full three-row header's vertical centerline.

## Layout

- Student export: use the final printable column's row-2 cell for the logo; remove the former multi-column, three-row logo merge and extend the centered grade/year block through the column immediately before the logo.
- Book-inventory export: use `E2` only; remove the `E1:E3` merge.
- Set the logo column to 128 pixels and row 2 to 128 pixels. Keep rows 1 and 3 at the existing 24-point header height.
- Draw a thin border around only the logo cell. Keep the logo within that cell, centered vertically, with a 128-pixel width and proportional height.

## Compatibility

Workbook-builder signatures, data filtering, Arabic RTL behavior, table layout, print areas, and download filenames remain unchanged. The implementation changes only header geometry and drawing placement.

## Verification

Tests must reopen both workbooks and prove the single-cell geometry, proportional 128-pixel drawing, and absence of the old merged logo spans. Representative Arabic student and inventory workbooks must be rendered and visually inspected before release.
